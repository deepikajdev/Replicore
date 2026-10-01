import time
import pytest
from backend.app.models.cluster import NodeRole, NodeStatus
from backend.app.core.node import ReadOnlyReplicaError, NodeUnreachableError

def test_write_reaches_primary_immediately(fresh_cluster):
    """Proves that a write is committed immediately on the primary node."""
    res = fresh_cluster.execute_write(key="order:1", value="Pending")

    assert res["key"] == "order:1"
    assert res["value"] == "Pending"
    assert res["version"] == 1
    assert res["lsn"] == 1
    assert res["node_id"] == "primary"

    # Immediate read from primary returns the written record
    primary_record = fresh_cluster.execute_read(node_id="primary", key="order:1")
    assert primary_record is not None
    assert primary_record["value"] == "Pending"
    assert primary_record["lsn"] == 1

def test_replicas_initially_lag_and_stale_reads_observed(fresh_cluster):
    """
    Proves:
    1. Replicas initially remain behind when delay is configured.
    2. Stale reads (or missing records) can be observed on lagging replicas.
    """
    # Configure 1000ms delay on replica-1 and 2000ms on replica-2
    fresh_cluster.set_node_delay("replica-1", 1000)
    fresh_cluster.set_node_delay("replica-2", 2000)

    # Commit write to primary
    write_res = fresh_cluster.execute_write(key="account:42", value="Balance: $500")
    assert write_res["lsn"] == 1

    # Check immediate replication status
    status = fresh_cluster.replication_manager.get_replication_status()
    assert status.primary_lsn == 1

    r1_info = next(r for r in status.replicas if r.node_id == "replica-1")
    r2_info = next(r for r in status.replicas if r.node_id == "replica-2")

    # Both replicas should still have applied_lsn == 0 and lag_lsn == 1
    assert r1_info.applied_lsn == 0
    assert r1_info.lag_lsn == 1
    assert r2_info.applied_lsn == 0
    assert r2_info.lag_lsn == 1

    # Stale read observation: key is not yet present on replica-1 or replica-2
    r1_record = fresh_cluster.execute_read(node_id="replica-1", key="account:42")
    r2_record = fresh_cluster.execute_read(node_id="replica-2", key="account:42")
    assert r1_record is None
    assert r2_record is None

def test_replicas_eventually_catch_up(fresh_cluster):
    """Proves that after the delay window elapses, the replication worker synchronizes replicas."""
    # Use short delays for fast unit test
    fresh_cluster.set_node_delay("replica-1", 100)
    fresh_cluster.set_node_delay("replica-2", 200)

    fresh_cluster.execute_write(key="config:theme", value="dark")

    # Before delay: replicas have not applied it
    fresh_cluster.replication_manager.process_replication_step()
    assert fresh_cluster.get_node("replica-1").last_applied_lsn == 0

    # Wait for replica-1 delay (100ms) to pass
    time.sleep(0.15)
    fresh_cluster.replication_manager.process_replication_step()

    r1_record = fresh_cluster.execute_read(node_id="replica-1", key="config:theme")
    assert r1_record is not None
    assert r1_record["value"] == "dark"
    assert fresh_cluster.get_node("replica-1").last_applied_lsn == 1

    # Replica-2 (200ms) may still be pending or ready
    time.sleep(0.15)
    fresh_cluster.replication_manager.process_replication_step()

    r2_record = fresh_cluster.execute_read(node_id="replica-2", key="config:theme")
    assert r2_record is not None
    assert r2_record["value"] == "dark"
    assert fresh_cluster.get_node("replica-2").last_applied_lsn == 1

def test_stale_data_update_overwrite(fresh_cluster):
    """
    Demonstrates updating an existing key:
    Primary has the new value, while lagging replica still returns the older version!
    """
    # Initial write with zero delay
    fresh_cluster.set_node_delay("replica-1", 0)
    fresh_cluster.execute_write(key="item:10", value="Version 1")
    fresh_cluster.replication_manager.process_replication_step()

    # Verify both have Version 1
    assert fresh_cluster.execute_read("primary", "item:10")["value"] == "Version 1"
    assert fresh_cluster.execute_read("replica-1", "item:10")["value"] == "Version 1"

    # Now introduce 1000ms delay on replica-1
    fresh_cluster.set_node_delay("replica-1", 1000)

    # Update to Version 2 on primary
    fresh_cluster.execute_write(key="item:10", value="Version 2")

    # Primary immediately has Version 2
    assert fresh_cluster.execute_read("primary", "item:10")["value"] == "Version 2"
    assert fresh_cluster.execute_read("primary", "item:10")["version"] == 2

    # Replica-1 STILL HAS Version 1 (STALE READ observed!)
    stale_read = fresh_cluster.execute_read("replica-1", "item:10")
    assert stale_read["value"] == "Version 1"
    assert stale_read["version"] == 1

def test_lsn_monotonic_increment(fresh_cluster):
    """Verifies that multiple writes yield strictly increasing sequential LSNs."""
    lsns = []
    for i in range(5):
        res = fresh_cluster.execute_write(key=f"seq:{i}", value=f"val_{i}")
        lsns.append(res["lsn"])

    assert lsns == [1, 2, 3, 4, 5]
    assert fresh_cluster.wal_manager.current_lsn == 5

def test_replica_direct_write_rejection_preserved(fresh_cluster):
    """Verifies that attempting a direct write on replica-1 or replica-2 raises ReadOnlyReplicaError."""
    replica_1 = fresh_cluster.get_node("replica-1")
    replica_2 = fresh_cluster.get_node("replica-2")

    with pytest.raises(ReadOnlyReplicaError):
        replica_1.write_record(key="hack:1", value="bad", lsn=99)

    with pytest.raises(ReadOnlyReplicaError):
        replica_2.write_record(key="hack:2", value="bad", lsn=99)

def test_offline_replica_does_not_block_primary(fresh_cluster):
    """
    If replica-1 is DOWN, primary can still accept writes.
    Replication to replica-1 pauses, while replica-2 still receives updates.
    """
    fresh_cluster.set_node_delay("replica-1", 0)
    fresh_cluster.set_node_delay("replica-2", 0)

    # Take replica-1 down
    r1 = fresh_cluster.get_node("replica-1")
    r1.status = NodeStatus.DOWN

    # Write to primary succeeds
    write_res = fresh_cluster.execute_write(key="job:status", value="Active")
    assert write_res["lsn"] == 1

    # Run replication step
    fresh_cluster.replication_manager.process_replication_step()

    # Replica-2 (healthy) caught up
    r2_record = fresh_cluster.execute_read(node_id="replica-2", key="job:status")
    assert r2_record is not None
    assert r2_record["value"] == "Active"

    # Replica-1 (down) read fails honestly with NodeUnreachableError (no silent fallback!)
    with pytest.raises(NodeUnreachableError):
        fresh_cluster.execute_read(node_id="replica-1", key="job:status")

    # Bring replica-1 back up and recover
    r1.status = NodeStatus.HEALTHY
    fresh_cluster.replication_manager.process_replication_step()
    recovered_record = fresh_cluster.execute_read(node_id="replica-1", key="job:status")
    assert recovered_record is not None
    assert recovered_record["value"] == "Active"

def test_api_write_and_read_endpoints(client):
    """Integration test for POST /api/data/write and GET /api/data/read."""
    # 1. Write via API
    write_resp = client.post("/api/data/write", json={"key": "api_test:1", "value": "Initial"})
    assert write_resp.status_code == 201
    write_data = write_resp.json()
    assert write_data["key"] == "api_test:1"
    assert write_data["value"] == "Initial"
    assert write_data["lsn"] >= 1

    # 2. Read from primary via API
    read_resp = client.get("/api/data/read?node=primary&key=api_test:1")
    assert read_resp.status_code == 200
    read_json = read_resp.json()
    assert read_json["requested_node"] == "primary"
    assert read_json["data"]["value"] == "Initial"

    # 3. Read with invalid node returns 404
    bad_node_resp = client.get("/api/data/read?node=ghost_node&key=api_test:1")
    assert bad_node_resp.status_code == 404

    # 4. Replication status endpoint returns valid structure
    repl_resp = client.get("/api/cluster/replication")
    assert repl_resp.status_code == 200
    repl_data = repl_resp.json()
    assert repl_data["primary_node_id"] == "primary"
    assert len(repl_data["replicas"]) == 2

    # 5. Update delay via API
    delay_resp = client.post("/api/simulation/delay", json={"node_id": "replica-1", "delay_ms": 750})
    assert delay_resp.status_code == 200
    assert delay_resp.json()["delay_ms"] == 750
