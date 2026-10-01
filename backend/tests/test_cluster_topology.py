import pytest
from backend.app.models.cluster import NodeRole, NodeStatus
from backend.app.core.node import ReadOnlyReplicaError, NodeUnreachableError

def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["service"] == "Replicore"
    assert data["is_simulation"] is True

def test_cluster_status_endpoint(client):
    response = client.get("/api/cluster/status")
    assert response.status_code == 200
    data = response.json()
    assert data["cluster_name"] == "Replicore HA Cluster"
    assert data["primary_node_id"] == "primary"
    assert len(data["nodes"]) == 3

    # Check node identities and roles
    roles = {node["id"]: node["role"] for node in data["nodes"]}
    assert roles["primary"] == NodeRole.PRIMARY.value
    assert roles["replica-1"] == NodeRole.REPLICA.value
    assert roles["replica-2"] == NodeRole.REPLICA.value

def test_primary_write_and_replica_read_only_protection(fresh_cluster):
    primary = fresh_cluster.get_primary()
    replica = fresh_cluster.get_node("replica-1")

    assert primary is not None
    assert replica is not None

    # 1. Primary write succeeds
    write_result = primary.write_record(key="user:101", value="Alice", lsn=1)
    assert write_result["key"] == "user:101"
    assert write_result["value"] == "Alice"
    assert write_result["version"] == 1
    assert write_result["lsn"] == 1

    # 2. Reading back from primary
    read_result = primary.read_record("user:101")
    assert read_result is not None
    assert read_result["value"] == "Alice"

    # 3. Direct write to replica MUST raise ReadOnlyReplicaError (Read-only protection)
    with pytest.raises(ReadOnlyReplicaError):
        replica.write_record(key="user:102", value="Bob", lsn=2)

def test_offline_node_honest_failure(fresh_cluster):
    primary = fresh_cluster.get_primary()
    assert primary is not None

    # Simulate primary failure
    primary.status = NodeStatus.DOWN

    # Operation must fail honestly with NodeUnreachableError (no fake success!)
    with pytest.raises(NodeUnreachableError):
        primary.write_record(key="user:103", value="Charlie", lsn=3)

    with pytest.raises(NodeUnreachableError):
        primary.read_record("user:101")

def test_wal_monotonically_increasing_lsn(fresh_cluster):
    wal = fresh_cluster.wal_manager
    r1 = wal.append_record("INSERT", "test:1", {"value": "v1"}, "primary")
    r2 = wal.append_record("INSERT", "test:2", {"value": "v2"}, "primary")

    assert r1.lsn == 1
    assert r2.lsn == 2
    assert r2.lsn > r1.lsn

    records_since_r1 = wal.get_records_since(1)
    assert len(records_since_r1) == 1
    assert records_since_r1[0].lsn == 2
