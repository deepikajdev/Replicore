import pytest
from backend.app.models.cluster import NodeStatus, AuditEventType
from backend.app.core.heartbeat_watchdog import HeartbeatWatchdog

def test_healthy_node_heartbeat(fresh_cluster):
    """Proves that reachable nodes respond to heartbeat probes and remain HEALTHY."""
    watchdog = fresh_cluster.heartbeat_watchdog
    results = watchdog.check_nodes_once()

    for node_id in ["primary", "replica-1", "replica-2"]:
        assert results[node_id]["reachable"] is True
        assert results[node_id]["status"] == NodeStatus.HEALTHY.value
        assert results[node_id]["consecutive_failures"] == 0
        node = fresh_cluster.get_node(node_id)
        assert node.status == NodeStatus.HEALTHY
        assert node.metrics.consecutive_failed_heartbeats == 0
        assert node.metrics.last_ping_latency_ms > 0

def test_single_failed_heartbeat_does_not_mark_node_down(fresh_cluster):
    """
    Proves that a single missed heartbeat does NOT immediately mark the node DOWN.
    Threshold is 3; with 1 or 2 failures, the node must remain HEALTHY.
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    assert watchdog.failure_threshold == 3

    # Inject failure on replica-1
    fresh_cluster.simulate_node_failure("replica-1")
    r1 = fresh_cluster.get_node("replica-1")

    # Pass 1: 1 failure
    results_1 = watchdog.check_nodes_once()
    assert results_1["replica-1"]["reachable"] is False
    assert results_1["replica-1"]["consecutive_failures"] == 1
    assert r1.status == NodeStatus.HEALTHY, "Node must NOT be marked DOWN after only 1 failure!"

    # Pass 2: 2 failures
    results_2 = watchdog.check_nodes_once()
    assert results_2["replica-1"]["reachable"] is False
    assert results_2["replica-1"]["consecutive_failures"] == 2
    assert r1.status == NodeStatus.HEALTHY, "Node must NOT be marked DOWN after 2 failures (threshold=3)!"

def test_consecutive_failures_reaching_threshold_marks_node_down(fresh_cluster):
    """
    Proves that once consecutive missed heartbeats reach the threshold,
    the node status transitions to DOWN and an audit event is recorded.
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    fresh_cluster.simulate_node_failure("replica-2")
    r2 = fresh_cluster.get_node("replica-2")

    # 1st failure
    watchdog.check_nodes_once()
    assert r2.status == NodeStatus.HEALTHY

    # 2nd failure
    watchdog.check_nodes_once()
    assert r2.status == NodeStatus.HEALTHY

    # 3rd failure (reaches threshold of 3)
    results_3 = watchdog.check_nodes_once()
    assert results_3["replica-2"]["consecutive_failures"] == 3
    assert r2.status == NodeStatus.DOWN, "Node MUST transition to DOWN upon reaching threshold!"

    # Verify audit event for health state transition
    health_events = [
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.NODE_HEALTH_CHANGED and e.source_node == "replica-2"
    ]
    assert len(health_events) >= 1
    assert "marked DOWN after reaching failure threshold" in health_events[-1].description

def test_successful_heartbeat_resets_failure_counter(fresh_cluster):
    """Proves that a successful heartbeat resets the consecutive failure counter back to 0."""
    watchdog = fresh_cluster.heartbeat_watchdog
    r1 = fresh_cluster.get_node("replica-1")

    # 1. Fail twice
    fresh_cluster.simulate_node_failure("replica-1")
    watchdog.check_nodes_once()
    watchdog.check_nodes_once()
    assert r1.metrics.consecutive_failed_heartbeats == 2

    # 2. Recover before threshold
    fresh_cluster.recover_node("replica-1")
    results = watchdog.check_nodes_once()

    assert results["replica-1"]["reachable"] is True
    assert results["replica-1"]["consecutive_failures"] == 0
    assert r1.metrics.consecutive_failed_heartbeats == 0
    assert r1.status == NodeStatus.HEALTHY

def test_node_recovery_from_down_state(fresh_cluster):
    """
    Proves that a node marked DOWN can recover on subsequent successful heartbeats,
    transitioning back to HEALTHY and emitting a NODE_RECOVERED audit event.
    """
    watchdog = fresh_cluster.heartbeat_watchdog
    r1 = fresh_cluster.get_node("replica-1")

    # 1. Force node to reach failure threshold
    fresh_cluster.simulate_node_failure("replica-1")
    for _ in range(3):
        watchdog.check_nodes_once()
    assert r1.status == NodeStatus.DOWN

    # 2. Restore node connectivity
    fresh_cluster.recover_node("replica-1")

    # 3. Next probe detects recovery
    watchdog.check_nodes_once()
    assert r1.status == NodeStatus.HEALTHY
    assert r1.metrics.consecutive_failed_heartbeats == 0

    # 4. Verify NODE_RECOVERED audit event
    recovery_events = [
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.NODE_RECOVERED and e.source_node == "replica-1"
    ]
    assert len(recovery_events) >= 1
    assert "has recovered and is now HEALTHY" in recovery_events[-1].description

def test_audit_events_for_missed_heartbeats(fresh_cluster):
    """Proves that intermittent misses produce HEARTBEAT_MISSED audit events."""
    watchdog = fresh_cluster.heartbeat_watchdog
    fresh_cluster.simulate_node_failure("replica-1")

    # Single miss
    watchdog.check_nodes_once()

    missed_events = [
        e for e in fresh_cluster.audit_events
        if e.event_type == AuditEventType.HEARTBEAT_MISSED and e.source_node == "replica-1"
    ]
    assert len(missed_events) >= 1
    assert "Heartbeat probe failed for replica-1 (1/3 misses)" in missed_events[0].description

def test_simulation_api_endpoints_and_status_visibility(client):
    """Integration test verifying API endpoints for node failure simulation and recovery."""
    # 1. Simulate failure on replica-2
    fail_resp = client.post("/api/simulation/node/fail", json={"node_id": "replica-2"})
    assert fail_resp.status_code == 200
    assert fail_resp.json()["status"] == "unreachable_injected"

    # 2. Read status via API - metrics should exist
    status_resp = client.get("/api/cluster/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    r2_node = next(n for n in status_data["nodes"] if n["id"] == "replica-2")
    assert "metrics" in r2_node
    assert "consecutive_failed_heartbeats" in r2_node["metrics"]

    # 3. Recover node via API
    recover_resp = client.post("/api/simulation/node/recover", json={"node_id": "replica-2"})
    assert recover_resp.status_code == 200
    assert recover_resp.json()["status"] == "connectivity_restored"
