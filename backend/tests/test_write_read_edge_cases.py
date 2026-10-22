import pytest
from backend.app.models.cluster import NodeRole, NodeStatus

def test_write_empty_key_rejected(client):
    """Writing a record with an empty key must be rejected with HTTP 422."""
    res = client.post("/api/data/write", json={"key": "", "value": "test_val"})
    assert res.status_code == 422

def test_write_missing_key_field_rejected(client):
    """Writing a payload without the required 'key' field must be rejected with HTTP 422."""
    res = client.post("/api/data/write", json={"value": "test_val"})
    assert res.status_code == 422

def test_write_missing_value_field_rejected(client):
    """Writing a payload without the required 'value' field must be rejected with HTTP 422."""
    res = client.post("/api/data/write", json={"key": "test_key"})
    assert res.status_code == 422

def test_write_null_value_rejected(client):
    """Writing a payload with null value must be rejected with HTTP 422."""
    res = client.post("/api/data/write", json={"key": "test_key", "value": None})
    assert res.status_code == 422

def test_write_exceeding_max_key_length(client):
    """Writing a key exceeding the 255 character limit must be rejected with HTTP 422."""
    long_key = "k" * 256
    res = client.post("/api/data/write", json={"key": long_key, "value": "test_val"})
    assert res.status_code == 422

def test_write_special_characters_and_json_payload(client):
    """Writing keys with colons/paths and structured JSON payloads should succeed."""
    key = "user:session:101/auth#token"
    val = '{"session_id": "abc-123", "active": true, "roles": ["admin"]}'
    res = client.post("/api/data/write", json={"key": key, "value": val})
    assert res.status_code == 201
    body = res.json()
    assert body["key"] == key
    assert body["value"] == val
    assert body["version"] == 1
    assert body["lsn"] >= 1

def test_write_upsert_increments_version_and_lsn(client):
    """Writing to an existing key updates the value and increments version and LSN."""
    k = "counter:hits"
    res1 = client.post("/api/data/write", json={"key": k, "value": "1"})
    assert res1.status_code == 201
    lsn1 = res1.json()["lsn"]
    assert res1.json()["version"] == 1

    res2 = client.post("/api/data/write", json={"key": k, "value": "2"})
    assert res2.status_code == 201
    assert res2.json()["version"] == 2
    assert res2.json()["lsn"] > lsn1

    read_res = client.get(f"/api/data/read?node=primary&key={k}")
    assert read_res.status_code == 200
    assert read_res.json()["data"]["value"] == "2"
    assert read_res.json()["data"]["version"] == 2

def test_read_missing_record_returns_null_data(client):
    """Reading a non-existent key returns HTTP 200 with data: null (honest reporting)."""
    res = client.get("/api/data/read?node=primary&key=ghost_record_xyz")
    assert res.status_code == 200
    body = res.json()
    assert body["requested_node"] == "primary"
    assert body["key"] == "ghost_record_xyz"
    assert body["data"] is None
    assert body["is_stale_possible"] is False

def test_read_empty_database_returns_empty_list(client):
    """Reading all records without key filter from an empty node returns an empty list."""
    res = client.get("/api/data/read?node=primary")
    assert res.status_code == 200
    body = res.json()
    assert body["data"] == []
    assert body["is_stale_possible"] is False

def test_read_nonexistent_node_returns_404(client):
    """Reading from an invalid node ID returns HTTP 404."""
    res = client.get("/api/data/read?node=unknown_cluster_node")
    assert res.status_code == 404
    assert "does not exist in cluster" in res.json()["detail"]

def test_read_from_unreachable_node_returns_503(client):
    """Reading from a DOWN node returns HTTP 503 with honest error and no silent fallback."""
    from backend.app.core.cluster_manager import cluster
    node = cluster.get_node("replica-1")
    node.status = NodeStatus.DOWN

    res = client.get("/api/data/read?node=replica-1")
    assert res.status_code == 503
    assert "Node replica-1 is DOWN" in res.json()["detail"]

def test_stale_read_flag_accuracy_after_failover(client):
    """
    Verify is_stale_possible accurately tracks node role:
    - Primary node: is_stale_possible == False
    - Replica node: is_stale_possible == True
    - Promoted replica: is_stale_possible == False
    - Fenced former primary: is_stale_possible == True
    """
    # Initially reading from primary is not stale
    res1 = client.get("/api/data/read?node=primary")
    assert res1.status_code == 200
    assert res1.json()["is_stale_possible"] is False

    # Reading from replica-1 initially is stale-possible
    res2 = client.get("/api/data/read?node=replica-1")
    assert res2.status_code == 200
    assert res2.json()["is_stale_possible"] is True

    # Promote replica-1
    failover_res = client.post("/api/cluster/failover", json={"target_node_id": "replica-1"})
    assert failover_res.status_code == 200

    # Now replica-1 is PRIMARY -> is_stale_possible must be False
    res3 = client.get("/api/data/read?node=replica-1")
    assert res3.status_code == 200
    assert res3.json()["is_stale_possible"] is False

    # Old 'primary' is now a fenced REPLICA -> is_stale_possible must be True
    res4 = client.get("/api/data/read?node=primary")
    assert res4.status_code == 200
    assert res4.json()["is_stale_possible"] is True

def test_write_target_node_query_param_validation(client):
    """Directing a write to a replica via query parameter target_node is rejected with HTTP 400."""
    res = client.post("/api/data/write?target_node=replica-2", json={"key": "test_k", "value": "val"})
    assert res.status_code == 400
    assert "read-only" in res.json()["detail"]
