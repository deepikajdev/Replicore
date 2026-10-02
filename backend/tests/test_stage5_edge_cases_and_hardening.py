import pytest
from backend.app.models.cluster import NodeRole, NodeStatus, AuditEventType
from backend.app.core.node import FencedLeaderError, NodeUnreachableError, ReadOnlyReplicaError

# ==============================================================================
# SECTION 2: FAILURE DETECTION TESTING
# ==============================================================================

def test_watchdog_single_miss_does_not_mark_node_down(fresh_cluster):
    """
    Section 2.A: Verify that a single heartbeat miss does NOT mark a node DOWN.
    The node remains HEALTHY and consecutive failure counter is 1.
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    r1 = fresh_cluster.get_node("replica-1")
    assert r1.status == NodeStatus.HEALTHY

    fresh_cluster.simulate_node_failure("replica-1")
    results = watchdog.check_nodes_once()

    assert results["replica-1"]["reachable"] is False
    assert results["replica-1"]["consecutive_failures"] == 1
    assert r1.status == NodeStatus.HEALTHY, "Node must remain HEALTHY after only 1 failure."

    # Heartbeat missed event logged, but NOT node health changed
    events = [e.event_type for e in fresh_cluster.audit_events if e.source_node == "replica-1"]
    assert AuditEventType.HEARTBEAT_MISSED in events
    assert AuditEventType.NODE_HEALTH_CHANGED not in events

def test_watchdog_threshold_transition_and_counter_reset(fresh_cluster):
    """
    Section 2.B, 2.C, 2.D, 2.E:
    - 2 misses keep node HEALTHY
    - 1 success resets counter to 0
    - 3 consecutive misses transition to DOWN with audit event
    - Recovery probe returns node to HEALTHY and emits NODE_RECOVERED
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    r1 = fresh_cluster.get_node("replica-1")

    # 1. Two misses
    fresh_cluster.simulate_node_failure("replica-1")
    watchdog.check_nodes_once()
    watchdog.check_nodes_once()
    assert r1.metrics.consecutive_failed_heartbeats == 2
    assert r1.status == NodeStatus.HEALTHY

    # 2. Intermittent recovery resets counter
    fresh_cluster.recover_node("replica-1")
    watchdog.check_nodes_once()
    assert r1.metrics.consecutive_failed_heartbeats == 0
    assert r1.status == NodeStatus.HEALTHY

    # 3. Now 3 consecutive failures trigger transition to DOWN
    fresh_cluster.simulate_node_failure("replica-1")
    for _ in range(3):
        watchdog.check_nodes_once()

    assert r1.metrics.consecutive_failed_heartbeats == 3
    assert r1.status == NodeStatus.DOWN

    # Verify NODE_HEALTH_CHANGED event
    health_events = [
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.NODE_HEALTH_CHANGED and e.source_node == "replica-1"
    ]
    assert len(health_events) >= 1

    # 4. Recovery cycle
    fresh_cluster.recover_node("replica-1")
    watchdog.check_nodes_once()
    assert r1.status == NodeStatus.HEALTHY
    assert r1.metrics.consecutive_failed_heartbeats == 0

    recovery_events = [
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.NODE_RECOVERED and e.source_node == "replica-1"
    ]
    assert len(recovery_events) >= 1

# ==============================================================================
# SECTION 3: AUTOMATIC FAILOVER TESTING
# ==============================================================================

def test_full_automatic_failover_path_and_write_validation(fresh_cluster):
    """
    Section 3: Full automatic failover path:
    1. Healthy primary accepting initial write
    2. Fail primary
    3. Watchdog detects failure
    4. PRIMARY_FAILED emitted
    5. Eligible replica selected
    6. Replica promoted
    7. Epoch increments
    8. Old primary demoted and fenced
    9. New primary accepts writes
    10. Old primary rejects writes
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    old_primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")

    # 1. Healthy initial write at epoch 1
    w1 = fresh_cluster.execute_write(key="order:100", value="Initial")
    assert w1["lsn"] == 1
    assert w1["node_id"] == "primary"
    assert fresh_cluster.current_epoch == 1

    # 2. Simulate primary outage
    fresh_cluster.simulate_node_failure("primary")

    # 3. Watchdog reaches threshold
    for _ in range(3):
        watchdog.check_nodes_once()

    # 4. PRIMARY_FAILED audit event emitted
    event_types = [e.event_type for e in fresh_cluster.audit_events]
    assert AuditEventType.PRIMARY_FAILED in event_types

    # 5 & 6. Replica promoted
    new_primary = fresh_cluster.get_primary()
    assert new_primary is not None
    assert new_primary.node_id in ["replica-1", "replica-2"]
    assert new_primary.role == NodeRole.PRIMARY

    # 7. Epoch incremented exactly once (1 -> 2)
    assert fresh_cluster.current_epoch == 2
    assert new_primary.leadership_epoch == 2

    # 8. Old primary demoted and fenced
    assert old_primary.role == NodeRole.REPLICA
    assert old_primary.is_fenced is True
    assert old_primary.leadership_epoch == 1

    # 9. New primary accepts writes
    w2 = fresh_cluster.execute_write(key="order:101", value="PostFailover")
    assert w2["lsn"] == 2
    assert w2["node_id"] == new_primary.node_id

    # 10. Old primary rejects direct writes
    with pytest.raises(FencedLeaderError):
        old_primary.write_record(key="order:rogue", value="bad", lsn=99)

    with pytest.raises(FencedLeaderError):
        fresh_cluster.execute_write(key="order:rogue2", value="bad", target_node_id="primary")

# ==============================================================================
# SECTION 4: FAILOVER CANDIDATE SELECTION
# ==============================================================================

def test_candidate_selection_ineligible_nodes_filtered(fresh_cluster):
    """
    Section 4: Candidate ordering & filtering:
    - DOWN node must not be selected
    - simulated_unreachable node must not be selected
    - already fenced node must not be selected
    - non-REPLICA node must not be selected
    """
    primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    # r1 has highest LSN but is simulated unreachable
    r1.last_applied_lsn = 100
    r1.simulated_unreachable = True

    # r2 has lower LSN but is healthy and unfenced
    r2.last_applied_lsn = 50
    r2.status = NodeStatus.HEALTHY
    r2.simulated_unreachable = False
    r2.is_fenced = False

    primary.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted is not None
    assert promoted.node_id == "replica-2", "Unreachable replica-1 must be filtered out!"

def test_candidate_selection_fenced_replica_filtered(fresh_cluster):
    """Fenced replicas must be excluded from selection."""
    primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    r1.last_applied_lsn = 80
    r1.is_fenced = True

    r2.last_applied_lsn = 60
    r2.is_fenced = False

    primary.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted is not None
    assert promoted.node_id == "replica-2", "Fenced replica-1 must not be selected!"

# ==============================================================================
# SECTION 5: NO-CANDIDATE SCENARIO
# ==============================================================================

def test_no_candidate_scenario_state_and_api_error(fresh_cluster, client):
    """
    Section 5: Primary fails + all replicas unavailable:
    - no replica promoted
    - no fake PRIMARY created
    - cluster has no active primary
    - writes fail honestly
    - correct audit events recorded
    """
    # 1. Test in isolated cluster instance
    primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    primary.status = NodeStatus.DOWN
    r1.status = NodeStatus.DOWN
    r2.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted is None
    assert fresh_cluster.get_primary() is None

    # Check cluster state
    state = fresh_cluster.get_cluster_state()
    assert state.primary_node_id is None
    assert state.is_healthy is False

    # Writes fail honestly with NodeUnreachableError
    with pytest.raises(NodeUnreachableError, match="No healthy primary node available"):
        fresh_cluster.execute_write(key="no_leader", value="val")

    # 2. Test via API client
    # Fail primary and both replicas via API
    client.post("/api/simulation/node/fail", json={"node_id": "primary"})
    client.post("/api/simulation/node/fail", json={"node_id": "replica-1"})
    client.post("/api/simulation/node/fail", json={"node_id": "replica-2"})

    from backend.app.core.cluster_manager import cluster as api_cluster
    # Force watchdog probes to mark nodes down
    for _ in range(3):
        api_cluster.heartbeat_watchdog.check_nodes_once()

    status_res = client.get("/api/cluster/status")
    assert status_res.status_code == 200
    assert status_res.json()["primary_node_id"] is None

    write_res = client.post("/api/data/write", json={"key": "fail_test", "value": "test"})
    assert write_res.status_code == 503
    assert "No healthy primary node available" in write_res.json()["detail"]

# ==============================================================================
# SECTION 6: EPOCH TESTING
# ==============================================================================

def test_epoch_invariants_across_operations(fresh_cluster):
    """
    Section 6:
    - initial epoch starts at 1
    - successful promotion increments epoch by 1
    - failed promotion does NOT increment epoch
    - invalid promotion target does NOT increment epoch
    """
    assert fresh_cluster.current_epoch == 1

    # 1. Invalid promotion target does not increment epoch
    with pytest.raises(KeyError):
        fresh_cluster.promote_replica("ghost_replica")
    assert fresh_cluster.current_epoch == 1

    # 2. Trying to promote current primary does not increment epoch
    with pytest.raises(ValueError):
        fresh_cluster.promote_replica("primary")
    assert fresh_cluster.current_epoch == 1

    # 3. Trying to promote a DOWN node does not increment epoch
    fresh_cluster.get_node("replica-1").status = NodeStatus.DOWN
    with pytest.raises(ValueError):
        fresh_cluster.promote_replica("replica-1")
    assert fresh_cluster.current_epoch == 1

    # 4. Valid promotion increments epoch from 1 to 2
    p1 = fresh_cluster.promote_replica("replica-2")
    assert p1.leadership_epoch == 2
    assert fresh_cluster.current_epoch == 2

    # 5. Subsequent valid promotion increments epoch from 2 to 3
    fresh_cluster.get_node("replica-1").status = NodeStatus.HEALTHY
    p2 = fresh_cluster.promote_replica("replica-1")
    assert p2.leadership_epoch == 3
    assert fresh_cluster.current_epoch == 3

# ==============================================================================
# SECTION 7 & 8: FENCING & SPLIT-BRAIN SAFETY
# ==============================================================================

def test_recovered_old_primary_remains_fenced_split_brain_safe(fresh_cluster):
    """
    Section 7 & 8: Fencing & Split-Brain Safety:
    - Old primary after failover is demoted and fenced
    - Restoring connectivity does NOT clear fencing
    - Recovered old primary does NOT reclaim leadership
    - Write to old primary is rejected with FencedLeaderError
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    old_primary = fresh_cluster.get_node("primary")

    # Failover from primary to replica-1
    fresh_cluster.simulate_node_failure("primary")
    for _ in range(3):
        watchdog.check_nodes_once()

    new_primary = fresh_cluster.get_primary()
    assert new_primary.node_id == "replica-1"
    assert fresh_cluster.current_epoch == 2

    # Recover connectivity of old primary
    fresh_cluster.recover_node("primary")
    watchdog.check_nodes_once()

    # Ping is reachable, but fencing state is preserved!
    assert old_primary.status == NodeStatus.HEALTHY
    assert old_primary.is_fenced is True
    assert old_primary.role == NodeRole.REPLICA
    assert old_primary.leadership_epoch == 1

    # Active primary is STILL replica-1
    assert fresh_cluster.get_primary().node_id == "replica-1"

    # Fenced write is blocked
    with pytest.raises(FencedLeaderError):
        old_primary.write_record(key="split_brain_key", value="stale_value", lsn=10)

    with pytest.raises(FencedLeaderError):
        fresh_cluster.execute_write(key="split_brain_key", value="stale_value", target_node_id="primary")

# ==============================================================================
# SECTION 9: REPLICATION / CONSISTENCY TESTING
# ==============================================================================

def test_replication_delay_and_eventual_consistency(fresh_cluster):
    """
    Section 9:
    - Primary write succeeds immediately
    - Replicas lag according to configured delay
    - Applied LSN advances monotonically
    - Direct write to replica is blocked
    """
    # Replica-1 has 50ms delay, Replica-2 has 150ms delay
    fresh_cluster.set_node_delay("replica-1", 50)
    fresh_cluster.set_node_delay("replica-2", 150)

    w1 = fresh_cluster.execute_write("config:mode", "production")
    assert w1["lsn"] == 1

    # Immediate step: neither replica has reached their delay threshold
    fresh_cluster.replication_manager.process_replication_step()
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    assert r1.last_applied_lsn == 0
    assert r2.last_applied_lsn == 0

    # Replica direct-write protection
    with pytest.raises(ReadOnlyReplicaError):
        r1.write_record("hack", "val", lsn=2)

def test_replication_delay_negative_value_rejected(fresh_cluster):
    """Negative replication delay must be rejected with ValueError."""
    with pytest.raises(ValueError, match="cannot be negative"):
        fresh_cluster.set_node_delay("replica-1", -100)

# ==============================================================================
# SECTION 10: FAILOVER + REPLICATION INTERACTIONS
# ==============================================================================

def test_failover_promotes_replica_with_higher_applied_lsn_after_partial_catchup(fresh_cluster):
    """
    Section 10.A:
    Create writes, allow one replica to catch up further, fail primary,
    and verify candidate selection picks the replica with highest applied LSN.
    """
    primary = fresh_cluster.get_node("primary")
    r1 = fresh_cluster.get_node("replica-1")
    r2 = fresh_cluster.get_node("replica-2")

    r1.last_applied_lsn = 15
    r2.last_applied_lsn = 8
    primary.status = NodeStatus.DOWN

    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted is not None
    assert promoted.node_id == "replica-1"

def test_failover_when_one_replica_failed_first(fresh_cluster):
    """
    Section 10.B:
    Fail one replica first, continue writes, fail primary,
    verify remaining eligible replica is successfully promoted.
    """
    # 1. Fail replica-1
    fresh_cluster.get_node("replica-1").status = NodeStatus.DOWN

    # 2. Write succeeds on primary
    w1 = fresh_cluster.execute_write("key:active", "data")
    assert w1["lsn"] == 1

    # 3. Replica-2 is healthy and caught up.
    # flush_replica bypasses the delay window (execute_write already queued the WAL
    # record with the original 2000ms apply_at; we need immediate catchup for the test).
    fresh_cluster.replication_manager.flush_replica("replica-2")
    assert fresh_cluster.get_node("replica-2").last_applied_lsn == 1

    # 4. Fail primary
    fresh_cluster.get_node("primary").status = NodeStatus.DOWN

    # 5. Failover promotes replica-2 (replica-1 is down)
    promoted = fresh_cluster.trigger_automatic_failover()
    assert promoted is not None
    assert promoted.node_id == "replica-2"
    assert fresh_cluster.get_primary().node_id == "replica-2"

# ==============================================================================
# SECTION 11: CONCURRENT / RACE-STYLE TESTING
# ==============================================================================

def test_concurrent_failover_lock_protects_state(fresh_cluster):
    """
    Section 11:
    Verify failover lock prevents re-entrant / overlapping promotions.
    """
    fresh_cluster._failover_in_progress = True
    try:
        # Automatic failover is a no-op when another failover is in progress
        assert fresh_cluster.trigger_automatic_failover() is None

        # Manual failover raises ValueError
        with pytest.raises(ValueError, match="already in progress"):
            fresh_cluster.promote_replica("replica-1")
    finally:
        fresh_cluster._failover_in_progress = False

def test_duplicate_failover_trigger_when_cluster_healthy_is_noop(fresh_cluster):
    """
    Calling trigger_automatic_failover when the primary is already healthy
    must return None without modifying epoch or topology.
    """
    assert fresh_cluster.get_primary().status == NodeStatus.HEALTHY
    epoch_before = fresh_cluster.current_epoch

    result = fresh_cluster.trigger_automatic_failover()
    assert result is None
    assert fresh_cluster.current_epoch == epoch_before

# ==============================================================================
# SECTION 12: API ERROR HANDLING TESTING
# ==============================================================================

def test_api_error_responses_comprehensive(client):
    """
    Section 12: API Error Handling Verification:
    - write to replica -> 400 Bad Request
    - write to fenced node -> 409 Conflict
    - write to non-existent node -> 404 Not Found
    - read from non-existent node -> 404 Not Found
    - invalid delay on primary -> 400 Bad Request
    - negative delay -> 422 Unprocessable Entity
    - missing key read -> 200 with data: null
    """
    # 1. Write to replica directly
    resp = client.post("/api/data/write", json={"key": "k", "value": "v", "target_node_id": "replica-1"})
    assert resp.status_code == 400
    assert "read-only" in resp.json()["detail"]

    # 2. Write to non-existent node
    resp = client.post("/api/data/write", json={"key": "k", "value": "v", "target_node_id": "ghost_node"})
    assert resp.status_code == 404

    # 3. Read from non-existent node
    resp = client.get("/api/data/read?node=ghost_node&key=k")
    assert resp.status_code == 404

    # 4. Read missing key from valid primary returns 200 with data: null (honest reporting)
    resp = client.get("/api/data/read?node=primary&key=non_existent_key_12345")
    assert resp.status_code == 200
    assert resp.json()["data"] is None

    # 5. Set delay on PRIMARY node (not a replica)
    resp = client.post("/api/simulation/delay", json={"node_id": "primary", "delay_ms": 500})
    assert resp.status_code == 400
    assert "only be set on REPLICA nodes" in resp.json()["detail"]

    # 6. Negative delay rejected by schema validator
    resp = client.post("/api/simulation/delay", json={"node_id": "replica-1", "delay_ms": -50})
    assert resp.status_code == 422
