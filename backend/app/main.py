from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import settings
from backend.app.core.cluster_manager import cluster
from backend.app.core.node import NodeUnreachableError, ReadOnlyReplicaError, FencedLeaderError
from backend.app.models.cluster import (
    ClusterState,
    ReplicationStatusResponse,
    SetDelayRequest,
    NodeSimulationRequest,
    ManualFailoverRequest,
    PromotionResult,
)
from backend.app.models.data_record import RecordWriteRequest, RecordResponse

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Cluster startup initialization & background workers
    print(f"[Replicore] Starting cluster simulator in '{settings.REPLICORE_CLUSTER_MODE}' mode...")
    cluster.replication_manager.start()
    cluster.heartbeat_watchdog.start()
    yield
    print("[Replicore] Shutting down cluster simulator...")
    await cluster.heartbeat_watchdog.stop()
    await cluster.replication_manager.stop()

app = FastAPI(
    title="Replicore — Database Replication & High Availability Simulator",
    version=settings.APP_VERSION,
    description=(
        "An educational and portfolio simulator demonstrating database clustering, "
        "asynchronous replication lag, node failure detection, replica promotion, "
        "and data consistency analysis. NOTE: This system uses application-level simulated "
        "consensus and WAL replication pipelines for demonstration, not production etcd/Patroni consensus."
    ),
    lifespan=lifespan
)

# Enable CORS for frontend clients (configurable via CORS_ALLOWED_ORIGINS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health", tags=["System"])
def health_check():
    """Returns basic service health and operational mode."""
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "cluster_mode": settings.REPLICORE_CLUSTER_MODE,
        "is_simulation": True
    }

@app.get("/api/cluster/status", response_model=ClusterState, tags=["Cluster"])
def get_cluster_status():
    """Returns the current cluster topology, node roles, health statuses, and LSN counters."""
    return cluster.get_cluster_state()

@app.get("/api/cluster/events", tags=["Cluster"])
def get_cluster_events(limit: int = 50):
    """Returns recent cluster audit logs and state transition events."""
    return {
        "total": len(cluster.audit_events),
        "events": list(reversed(cluster.audit_events[-limit:]))
    }

@app.post("/api/cluster/failover", response_model=PromotionResult, tags=["Cluster"])
def manual_failover(request: ManualFailoverRequest):
    """
    Manually triggers failover / promotion of an eligible replica to PRIMARY.
    Validates:
    - Target exists
    - Target is a REPLICA
    - Target is HEALTHY and reachable
    - Target is not fenced
    Demotes and fences the current primary, increments the cluster leadership epoch,
    promotes the target replica, and reconfigures the replication pipeline.
    """
    try:
        old_primary = cluster.get_primary()
        old_primary_id = old_primary.node_id if old_primary else None
        promoted_node = cluster.promote_replica(request.target_node_id)
        return PromotionResult(
            promoted_node_id=promoted_node.node_id,
            previous_primary_id=old_primary_id,
            new_epoch=promoted_node.leadership_epoch,
            message=(
                f"Node '{promoted_node.node_id}' successfully promoted to PRIMARY at epoch {promoted_node.leadership_epoch}. "
                f"Previous primary '{old_primary_id}' fenced."
            )
        )
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        if "already in progress" in str(e):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.get("/api/cluster/replication", response_model=ReplicationStatusResponse, tags=["Replication"])
def get_replication_status():
    """
    Returns replication status including:
    - primary current LSN
    - each replica's applied LSN
    - lag in LSNs
    - configured artificial delay
    - node status
    """
    return cluster.replication_manager.get_replication_status()

@app.post("/api/data/write", response_model=RecordResponse, status_code=status.HTTP_201_CREATED, tags=["Data Operations"])
def write_data(
    request: RecordWriteRequest,
    target_node: Optional[str] = Query(None, description="Optional target node for split-brain / direct write testing")
):
    """
    Writes data strictly to the Primary database node (or specified target node).
    Generates a monotonically increasing WAL record with a new LSN.
    Returns the created/updated record and its committed LSN.
    Rejects writes to fenced or demoted nodes with HTTP 409 Conflict.
    """
    try:
        node_id = target_node or request.target_node_id
        result = cluster.execute_write(key=request.key, value=request.value, target_node_id=node_id)
        return RecordResponse(**result)
    except FencedLeaderError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e)
        )
    except ReadOnlyReplicaError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except NodeUnreachableError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )
    except KeyError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Write transaction failed: {str(e)}"
        )

@app.get("/api/data/read", tags=["Data Operations"])
def read_data(
    node: Optional[str] = Query(None, description="Specific node to read from (e.g. primary, replica-1, replica-2)"),
    key: Optional[str] = Query(None, description="Key of the record to fetch. If omitted, returns all records on that node.")
):
    """
    Reads data from the requested node.
    - Demonstrates eventual consistency: a lagging replica will temporarily return older data (or None).
    - Preserves honesty: does NOT silently fallback to another node if the requested node is down.
    """
    try:
        data = cluster.execute_read(node_id=node, key=key)
        return {
            "requested_node": node or "auto-routed",
            "key": key,
            "data": data,
            "is_stale_possible": node is not None and node != "primary"
        }
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except NodeUnreachableError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@app.post("/api/simulation/delay", tags=["Simulation Controls"])
def set_replication_delay(request: SetDelayRequest):
    """
    Configures the artificial replication delay for a replica node at runtime.
    """
    try:
        cluster.set_node_delay(node_id=request.node_id, delay_ms=request.delay_ms)
        return {
            "message": f"Updated replication delay for {request.node_id} to {request.delay_ms}ms",
            "node_id": request.node_id,
            "delay_ms": request.delay_ms
        }
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@app.post("/api/simulation/node/fail", tags=["Simulation Controls"])
def simulate_node_failure(request: NodeSimulationRequest):
    """
    Simulates a network outage or hardware crash on the specified node.
    The heartbeat watchdog will detect missed heartbeats and transition the node to DOWN
    once the failure threshold is reached.
    """
    try:
        cluster.simulate_node_failure(request.node_id)
        return {
            "message": f"Injected simulated failure on node '{request.node_id}'.",
            "node_id": request.node_id,
            "status": "unreachable_injected"
        }
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@app.post("/api/simulation/node/recover", tags=["Simulation Controls"])
def recover_node(request: NodeSimulationRequest):
    """
    Restores network connectivity or service to a previously failed node.
    The heartbeat watchdog will verify health on the next probe and restore the node to HEALTHY.
    """
    try:
        cluster.recover_node(request.node_id)
        return {
            "message": f"Recovered connectivity for node '{request.node_id}'.",
            "node_id": request.node_id,
            "status": "connectivity_restored"
        }
    except KeyError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
