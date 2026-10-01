import pytest
from backend.app.models.cluster import NodeRole, NodeStatus, AuditEventType
from backend.app.core.node import FencedLeaderError, NodeUnreachableError, ReadOnlyReplicaError

def test_primary_failure_triggers_automatic_failover(fresh_cluster):
    """
    1. Primary failure triggers failover.
    2. Healthy replica is promoted.
    Verifies that when the primary reaches failure threshold and transitions to DOWN,
    automatic failover selects and promotes an eligible replica to PRIMARY.
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    old_primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    # Give replicas some applied LSN
    r1.last_applied_lsn = 10
    r2.last_applied_lsn = 5

    # Simulate outage on primary
    fresh_cluster.simulate_node_failure("primary")

    # Execute probes to reach threshold (3)
    watchdog.check_nodes_once()
    watchdog.check_nodes_once()
    results = watchdog.check_nodes_once()

    assert results["primary"]["status"] == NodeStatus.DOWN.value
    assert old_primary.status == NodeStatus.DOWN

    # The cluster must now have a new primary promoted (replica-1 with LSN 10)
    current_primary = fresh_cluster.get_primary()
    assert current_primary is not None
    assert current_primary.node_id == "replica-1"
    assert current_primary.role == NodeRole.PRIMARY
    assert current_primary.leadership_epoch == 2
    assert current_primary.is_fenced is False

    # Old primary must be demoted and fenced
    assert old_primary.role == NodeRole.REPLICA
    assert old_primary.is_fenced is True

    # Verify audit events emitted
    event_types = [e.event_type for e in fresh_cluster.audit_events]
    assert AuditEventType.PRIMARY_FAILED in event_types
    assert AuditEventType.FAILOVER_STARTED in event_types
    assert AuditEventType.REPLICA_SELECTED in event_types
    assert AuditEventType.OLD_PRIMARY_FENCED in event_types
    assert AuditEventType.EPOCH_INCREMENTED in event_types
    assert AuditEventType.NODE_PROMOTED in event_types

def test_replica_with_highest_applied_lsn_is_selected(fresh_cluster):
    """
    3. Replica with highest applied LSN is selected.
    Example from requirement:
    Primary: LSN 50 -> DOWN
    Replica 1: LSN 48 -> eligible
    Replica 2: LSN 43 -> eligible
    Replica 1 must be selected.
    """
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")
    primary = fresh_cluster.get_node("primary")

    r1.last_applied_lsn = 48
    r2.last_applied_lsn = 43
    primary.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()

    assert promoted is not None
    assert promoted.node_id == "replica-1", "Replica with highest applied LSN (48) must be selected!"
    assert fresh_cluster.get_primary().node_id == "replica-1"

    # Verify audit log details
    select_event = next(
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.REPLICA_SELECTED
    )
    assert select_event.source_node == "replica-1"
    assert select_event.details["applied_lsn"] == 48

def test_equal_highest_lsn_deterministic_tie_breaker(fresh_cluster):
    """
    Safety/Edge Case:
    When two replicas have the identical highest applied LSN (e.g. 50 vs 50),
    selection must be deterministic using lexicographical order of node_id ('replica-1' before 'replica-2').
    """
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")
    primary = fresh_cluster.get_node("primary")

    r1.last_applied_lsn = 50
    r2.last_applied_lsn = 50
    primary.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()

    assert promoted is not None
    assert promoted.node_id == "replica-1", "Tie-breaker must deterministically select 'replica-1'!"

def test_down_replicas_are_not_selected(fresh_cluster):
    """
    4. DOWN replicas are not selected.
    Even if a replica has the highest LSN, if it is DOWN or unreachable,
    it must be ignored and the next eligible healthy replica selected.
    """
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")
    primary = fresh_cluster.get_node("primary")

    # Replica 1 has higher LSN but is DOWN
    r1.last_applied_lsn = 99
    r1.status = NodeStatus.DOWN

    # Replica 2 has lower LSN but is HEALTHY
    r2.last_applied_lsn = 30
    r2.status = NodeStatus.HEALTHY

    primary.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()

    assert promoted is not None
    assert promoted.node_id == "replica-2", "DOWN replica must NOT be selected even with higher LSN!"
    assert fresh_cluster.get_primary().node_id == "replica-2"

def test_no_eligible_replicas_leaves_cluster_without_primary(fresh_cluster):
    """
    Safety/Edge Case:
    If every replica is DOWN, the cluster must NOT invent a primary.
    Failover aborts, old primary is fenced, cluster has no primary, and writes fail honestly.
    """
    primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    primary.status = NodeStatus.DOWN
    r1.status = NodeStatus.DOWN
    r2.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted is None
    assert fresh_cluster.get_primary() is None

    # Old primary is fenced
    assert primary.is_fenced is True

    # Writes to cluster must fail honestly with NodeUnreachableError
    with pytest.raises(NodeUnreachableError):
        fresh_cluster.execute_write("k", "v")

def test_manual_promotion_works_for_eligible_replica(fresh_cluster):
    """
    5. Manual promotion works for an eligible replica.
    7. Epoch increments on promotion.
    """
    assert fresh_cluster.current_epoch == 1
    old_primary = fresh_cluster.get_primary()
    assert old_primary.node_id == "primary"

    # Manually promote replica-2
    promoted = fresh_cluster.promote_replica("replica-2")

    assert promoted.node_id == "replica-2"
    assert promoted.role == NodeRole.PRIMARY
    assert promoted.leadership_epoch == 2
    assert fresh_cluster.current_epoch == 2
    assert fresh_cluster.get_primary().node_id == "replica-2"

    # Old primary fenced
    assert old_primary.role == NodeRole.REPLICA
    assert old_primary.is_fenced is True

def test_manual_promotion_rejects_invalid_or_down_nodes(fresh_cluster):
    """
    6. Manual promotion rejects invalid/DOWN replicas.
    """
    r1 = fresh_cluster.get_node("replica-1")

    # 1. Non-existent node
    with pytest.raises(KeyError):
        fresh_cluster.promote_replica("ghost_node")

    # 2. Node that is already PRIMARY
    with pytest.raises(ValueError, match="already PRIMARY"):
        fresh_cluster.promote_replica("primary")

    # 3. DOWN replica
    r1.status = NodeStatus.DOWN
    with pytest.raises(ValueError, match="not eligible"):
        fresh_cluster.promote_replica("replica-1")

    # 4. Fenced replica
    r1.status = NodeStatus.HEALTHY
    r1.is_fenced = True
    with pytest.raises(ValueError, match="fenced"):
        fresh_cluster.promote_replica("replica-1")

def test_epoch_increments_monotonically_across_multiple_failovers(fresh_cluster):
    """
    7. Epoch increments on promotion.
    Epoch starts at 1, increments to 2 on first failover, then to 3 on second failover.
    """
    assert fresh_cluster.current_epoch == 1

    # Promotion 1: primary -> replica-1
    fresh_cluster.get_node("primary").status = NodeStatus.DOWN
    p1 = fresh_cluster.trigger_automatic_failover()
    assert p1.node_id == "replica-1"
    assert fresh_cluster.current_epoch == 2
    assert p1.leadership_epoch == 2

    # Promotion 2: replica-1 -> replica-2
    p1.status = NodeStatus.DOWN
    p2 = fresh_cluster.trigger_automatic_failover()
    assert p2.node_id == "replica-2"
    assert fresh_cluster.current_epoch == 3
    assert p2.leadership_epoch == 3

def test_new_primary_accepts_writes_and_increments_lsn(fresh_cluster):
    """
    8. New primary accepts writes.
    9. New primary continues generating increasing LSNs.
    """
    # Writes before promotion
    w1 = fresh_cluster.execute_write("user:1", "Bob")
    assert w1["lsn"] == 1
    assert w1["node_id"] == "primary"

    w2 = fresh_cluster.execute_write("user:2", "Charlie")
    assert w2["lsn"] == 2
    assert w2["node_id"] == "primary"

    # Failover to replica-1
    fresh_cluster.get_node("primary").status = NodeStatus.DOWN
    new_primary = fresh_cluster.trigger_automatic_failover()
    assert new_primary.node_id == "replica-1"

    # Writes after promotion go to replica-1 with continuing monotonic LSNs
    w3 = fresh_cluster.execute_write("user:3", "David")
    assert w3["lsn"] == 3
    assert w3["node_id"] == "replica-1"

    w4 = fresh_cluster.execute_write("user:4", "Eve")
    assert w4["lsn"] == 4
    assert w4["node_id"] == "replica-1"

    assert fresh_cluster.wal_manager.current_lsn == 4

def test_old_primary_fencing_and_direct_write_rejection(fresh_cluster):
    """
    10. Old primary is fenced.
    11. Direct write against old primary is rejected with FencedLeaderError.
    """
    old_primary = fresh_cluster.get_node("primary")

    # Failover to replica-1
    old_primary.status = NodeStatus.DOWN
    fresh_cluster.trigger_automatic_failover()

    assert old_primary.is_fenced is True
    assert old_primary.role == NodeRole.REPLICA

    # Direct write on old primary must be REJECTED via FencedLeaderError
    with pytest.raises(FencedLeaderError) as exc_info:
        old_primary.write_record(key="rogue:1", value="stale_write", lsn=99)
    assert "has been fenced" in str(exc_info.value)

    # Calling execute_write targeting the fenced node must also be REJECTED
    with pytest.raises(FencedLeaderError):
        fresh_cluster.execute_write(key="rogue:2", value="stale_write", target_node_id="primary")

    # Verify audit event for rejected fenced write
    fenced_events = [
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.FENCED_WRITE_REJECTED
    ]
    assert len(fenced_events) >= 1
    assert fenced_events[-1].source_node == "primary"

def test_recovered_old_primary_does_not_automatically_become_primary(fresh_cluster):
    """
    12. Recovered old primary does not automatically become primary.
    13. Split-brain scenario is prevented.
    Node A (primary, epoch 1) goes down.
    Node B promoted (epoch 2).
    Node A recovers. Node A must NOT become primary again automatically.
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    old_primary = fresh_cluster.get_node("primary")

    # 1. Primary goes down and failover occurs
    fresh_cluster.simulate_node_failure("primary")
    for _ in range(3):
        watchdog.check_nodes_once()

    assert fresh_cluster.get_primary().node_id == "replica-1"
    assert fresh_cluster.current_epoch == 2
    assert old_primary.is_fenced is True

    # 2. Old primary recovers network connectivity
    fresh_cluster.recover_node("primary")
    watchdog.check_nodes_once()

    # Old primary is now HEALTHY in terms of ping, BUT remains a fenced REPLICA
    assert old_primary.status == NodeStatus.HEALTHY
    assert old_primary.role == NodeRole.REPLICA
    assert old_primary.is_fenced is True

    # Active cluster primary MUST remain replica-1
    assert fresh_cluster.get_primary().node_id == "replica-1"

    # Writes directly to old primary are rejected
    with pytest.raises(FencedLeaderError):
        old_primary.write_record(key="split:1", value="bad", lsn=100)

    # Cluster writes go to the active leader replica-1
    res = fresh_cluster.execute_write(key="cluster:key", value="good")
    assert res["node_id"] == "replica-1"

def test_replication_continues_from_new_primary_to_remaining_replicas(fresh_cluster):
    """
    7. Replication after promotion.
    After replica-1 is promoted, writes to replica-1 are replicated to replica-2.
    Old primary remains fenced and does not participate.
    """
    # Configure 0 delay on replica-2 for test speed
    fresh_cluster.set_node_delay("replica-2", 0)

    # Promote replica-1
    fresh_cluster.get_node("primary").status = NodeStatus.DOWN
    fresh_cluster.trigger_automatic_failover()

    # Write to new primary
    fresh_cluster.execute_write("sync:test", "val_promoted")
    fresh_cluster.replication_manager.process_replication_step()

    # Replica-2 receives the replicated record
    rec_r2 = fresh_cluster.execute_read("replica-2", "sync:test")
    assert rec_r2 is not None
    assert rec_r2["value"] == "val_promoted"
    assert rec_r2["lsn"] == 1

def test_cluster_status_exposes_epoch_and_fencing_state(fresh_cluster):
    """
    8. Cluster status clearly shows:
    - current primary
    - each node role
    - node status
    - applied LSN
    - current cluster epoch/generation
    - fenced/demoted state
    """
    fresh_cluster.get_node("primary").status = NodeStatus.DOWN
    fresh_cluster.trigger_automatic_failover()

    state = fresh_cluster.get_cluster_state()
    assert state.primary_node_id == "replica-1"
    assert state.current_epoch == 2

    p_node = next(n for n in state.nodes if n.id == "primary")
    r1_node = next(n for n in state.nodes if n.id == "replica-1")

    assert p_node.role == NodeRole.REPLICA
    assert p_node.is_fenced is True
    assert p_node.leadership_epoch == 1

    assert r1_node.role == NodeRole.PRIMARY
    assert r1_node.is_fenced is False
    assert r1_node.leadership_epoch == 2

def test_api_failover_and_fenced_write_endpoints(client):
    """
    Integration tests for:
    - POST /api/cluster/failover
    - GET /api/cluster/status
    - POST /api/data/write (with fencing rejection)
    """
    # 1. Manual failover to replica-1
    resp = client.post("/api/cluster/failover", json={"target_node_id": "replica-1"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["promoted_node_id"] == "replica-1"
    assert data["previous_primary_id"] == "primary"
    assert data["new_epoch"] == 2

    # 2. Check cluster status via API
    status_resp = client.get("/api/cluster/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert status_data["primary_node_id"] == "replica-1"
    assert status_data["current_epoch"] == 2

    p_info = next(n for n in status_data["nodes"] if n["id"] == "primary")
    assert p_info["is_fenced"] is True

    # 3. Attempting write to fenced old primary returns HTTP 409 Conflict
    fenced_write_resp = client.post(
        "/api/data/write",
        json={"key": "hack:1", "value": "stale", "target_node_id": "primary"}
    )
    assert fenced_write_resp.status_code == 409
    assert "fenced" in fenced_write_resp.json()["detail"]

    # 4. Standard write routes to new primary (replica-1)
    write_resp = client.post("/api/data/write", json={"key": "valid:1", "value": "hello"})
    assert write_resp.status_code == 201
    assert write_resp.json()["node_id"] == "replica-1"

    # 5. Invalid manual failover: trying to promote already-primary node returns 400
    bad_resp = client.post("/api/cluster/failover", json={"target_node_id": "replica-1"})
    assert bad_resp.status_code == 400

    # 6. Invalid manual failover: non-existent node returns 404
    missing_resp = client.post("/api/cluster/failover", json={"target_node_id": "nonexistent"})
    assert missing_resp.status_code == 404

def test_duplicate_failover_trigger_when_already_healthy(fresh_cluster):
    """
    Safety/Edge Case:
    If failover is called when the cluster already has a healthy primary (e.g. after replica-1 is promoted),
    subsequent auto-failover triggers must return None and perform no duplicate promotions.
    """
    fresh_cluster.get_node("primary").status = NodeStatus.DOWN
    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted.node_id == "replica-1"
    assert fresh_cluster.current_epoch == 2

    # Second trigger when replica-1 is healthy
    second_promoted = fresh_cluster.trigger_automatic_failover()
    assert second_promoted is None
    assert fresh_cluster.current_epoch == 2
    assert fresh_cluster.get_primary().node_id == "replica-1"

def test_failover_lock_rejects_concurrent_promotions(fresh_cluster):
    """
    Safety/Edge Case:
    What happens if a manual promotion is requested while another failover is occurring?
    The internal concurrency lock rejects concurrent promotions with ValueError.
    """
    fresh_cluster._failover_in_progress = True
    try:
        # Automatic failover returns None
        assert fresh_cluster.trigger_automatic_failover() is None

        # Manual promotion raises ValueError
        with pytest.raises(ValueError, match="already in progress"):
            fresh_cluster.promote_replica("replica-1")
    finally:
        fresh_cluster._failover_in_progress = False
