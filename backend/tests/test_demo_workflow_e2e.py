import pytest
from backend.app.models.cluster import NodeRole, NodeStatus, AuditEventType

def test_e2e_demo_lifecycle_workflow(client):
    """
    End-to-End Regression Test for the Full Demo Walkthrough:
    1. Initial cluster startup & health inspection
    2. Primary writes & LSN generation
    3. Asynchronous delay & stale replica read observation
    4. Replication catch-up & 100% sync alignment
    5. Primary failure simulation & watchdog detection
    6. Candidate election & automatic promotion to Epoch 2
    7. Former primary fencing & HTTP 409 split-brain write rejection
    8. Post-failover write continuity on new primary
    9. Former primary recovery preserving fencing immunity
    """
    # -------------------------------------------------------------------------
    # Step 1: Initial Cluster Health & Topology
    # -------------------------------------------------------------------------
    status_res = client.get("/api/cluster/status")
    assert status_res.status_code == 200
    state = status_res.json()
    assert state["primary_node_id"] == "primary"
    assert state["current_epoch"] == 1
    assert state["is_healthy"] is True
    assert len(state["nodes"]) == 3

    # Check initial replication stream
    repl_res = client.get("/api/cluster/replication")
    assert repl_res.status_code == 200
    repl_data = repl_res.json()
    assert repl_data["primary_lsn"] == 0
    assert len(repl_data["replicas"]) == 2

    # -------------------------------------------------------------------------
    # Step 2: Configure Replication Delay & Commit Write
    # -------------------------------------------------------------------------
    client.post("/api/simulation/delay", json={"node_id": "replica-1", "delay_ms": 300})
    client.post("/api/simulation/delay", json={"node_id": "replica-2", "delay_ms": 1500})

    write_payload = {"key": "user:demo", "value": '{"name": "Alice", "plan": "pro"}'}
    write_res = client.post("/api/data/write", json=write_payload)
    assert write_res.status_code == 201
    w_data = write_res.json()
    assert w_data["key"] == "user:demo"
    assert w_data["version"] == 1
    assert w_data["node_id"] == "primary"
    assert w_data["lsn"] == 1

    # -------------------------------------------------------------------------
    # Step 3: Immediate Stale Read on Lagging Replica vs Primary
    # -------------------------------------------------------------------------
    read_pri = client.get("/api/data/read?node=primary&key=user:demo")
    assert read_pri.status_code == 200
    assert read_pri.json()["data"]["value"] == '{"name": "Alice", "plan": "pro"}'
    assert read_pri.json()["is_stale_possible"] is False

    read_rep = client.get("/api/data/read?node=replica-2&key=user:demo")
    assert read_rep.status_code == 200
    assert read_rep.json()["data"] is None  # Stale / not yet applied
    assert read_rep.json()["is_stale_possible"] is True

    # -------------------------------------------------------------------------
    # Step 4: Synchronize & Observe Catch-up
    # -------------------------------------------------------------------------
    from backend.app.core.cluster_manager import cluster
    cluster.replication_manager.flush_replica("replica-1")
    cluster.replication_manager.flush_replica("replica-2")

    read_rep_synced = client.get("/api/data/read?node=replica-2&key=user:demo")
    assert read_rep_synced.status_code == 200
    assert read_rep_synced.json()["data"]["value"] == '{"name": "Alice", "plan": "pro"}'
    assert read_rep_synced.json()["data"]["lsn"] == 1

    repl_synced = client.get("/api/cluster/replication").json()
    for rep in repl_synced["replicas"]:
      assert rep["applied_lsn"] == 1
      assert rep["lag_lsn"] == 0
      assert rep["sync_percentage"] == 100.0
      assert rep["is_caught_up"] is True

    # -------------------------------------------------------------------------
    # Step 5 & 6: Simulate Primary Failure & Watchdog Auto-Failover
    # -------------------------------------------------------------------------
    fail_res = client.post("/api/simulation/node/fail", json={"node_id": "primary"})
    assert fail_res.status_code == 200

    # 3 consecutive watchdog probes trigger DOWN transition and auto-failover
    for _ in range(3):
      cluster.heartbeat_watchdog.check_nodes_once()

    status_post_fail = client.get("/api/cluster/status").json()
    new_primary_id = status_post_fail["primary_node_id"]
    assert new_primary_id in ["replica-1", "replica-2"]
    assert status_post_fail["current_epoch"] == 2

    old_pri_node = next(n for n in status_post_fail["nodes"] if n["id"] == "primary")
    assert old_pri_node["role"] == "REPLICA"
    assert old_pri_node["is_fenced"] is True

    # -------------------------------------------------------------------------
    # Step 7: Fencing Split-Brain Write Rejection (HTTP 409 Conflict)
    # -------------------------------------------------------------------------
    fenced_write = client.post(
        "/api/data/write?target_node=primary",
        json={"key": "split_brain:test", "value": "rogue_value"}
    )
    assert fenced_write.status_code == 409
    assert "has been fenced" in fenced_write.json()["detail"]

    # -------------------------------------------------------------------------
    # Step 8: Write Continuity on New Primary
    # -------------------------------------------------------------------------
    write2_res = client.post("/api/data/write", json={"key": "order:1002", "value": "paid"})
    assert write2_res.status_code == 201
    assert write2_res.json()["node_id"] == new_primary_id
    assert write2_res.json()["lsn"] == 2

    # -------------------------------------------------------------------------
    # Step 9: Recovery of Former Primary (Remains Fenced Replica)
    # -------------------------------------------------------------------------
    rec_res = client.post("/api/simulation/node/recover", json={"node_id": "primary"})
    assert rec_res.status_code == 200

    cluster.heartbeat_watchdog.check_nodes_once()
    recovered_node = cluster.get_node("primary")
    assert recovered_node.status == NodeStatus.HEALTHY
    assert recovered_node.is_fenced is True
    assert recovered_node.role == NodeRole.REPLICA

    # Rejection persists after recovery
    fenced_write_after_rec = client.post(
        "/api/data/write",
        json={"key": "bad:write", "value": "data", "target_node_id": "primary"}
    )
    assert fenced_write_after_rec.status_code == 409
    assert "has been fenced" in fenced_write_after_rec.json()["detail"]

def test_e2e_manual_failover_and_audit_event_logging(client):
    """
    Verify manual failover workflow, dynamic delay adjustments,
    and end-to-end event trail logging.
    """
    # 1. Update delay via API
    delay_res = client.post("/api/simulation/delay", json={"node_id": "replica-1", "delay_ms": 750})
    assert delay_res.status_code == 200
    assert delay_res.json()["delay_ms"] == 750

    # 2. Execute manual failover targeting replica-1
    failover_res = client.post("/api/cluster/failover", json={"target_node_id": "replica-1"})
    assert failover_res.status_code == 200
    assert failover_res.json()["promoted_node_id"] == "replica-1"
    assert failover_res.json()["new_epoch"] == 2

    # 3. Audit trail verification
    events_res = client.get("/api/cluster/events?limit=20")
    assert events_res.status_code == 200
    events = events_res.json()["events"]
    event_types = [e["event_type"] for e in events]

    assert "REPLICATION_DELAY_UPDATED" in event_types
    assert "FAILOVER_STARTED" in event_types
    assert "OLD_PRIMARY_FENCED" in event_types
    assert "EPOCH_INCREMENTED" in event_types
    assert "NODE_PROMOTED" in event_types
