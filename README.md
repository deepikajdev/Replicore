# Replicore — Database Replication & High Availability Simulator

An educational and portfolio-grade simulator demonstrating how distributed database clusters manage primary/replica nodes, Write-Ahead Logging (WAL), replication lag, node failure detection, and replica promotion.

> **Note**: This application is a technical simulation built with FastAPI, PostgreSQL / SQLite multi-engine abstraction, and React + TypeScript. It demonstrates replication mechanics and high-availability consensus patterns cleanly without claiming production-grade distributed consensus engines (such as etcd or Patroni).

---

## Architecture Overview

```
                      +-----------------------------------+
                      |      FastAPI Cluster Gateway      |
                      +-----------------------------------+
                                   |         |
                      Writes & WAL |         | Reads (Load Balanced)
                                   v         v
                         +--------------------+
                         |    Primary Node    |
                         |     (Leader)       |
                         +--------------------+
                                |         |
          Async WAL Stream      |         | Async WAL Stream
          (Simulated Delay)     v         v (Simulated Delay)
                  +------------------+   +------------------+
                  |  Replica Node 1  |   |  Replica Node 2  |
                  |   (Follower)     |   |   (Follower)     |
                  +------------------+   +------------------+
```

---

## Features Built

### Stage 1: Foundation & Clustering
1. **Multi-Engine Cluster Topology**: Primary Node + 2 Replica Nodes with dual-mode support (Docker Compose PostgreSQL or local SQLite multi-instance mode).
2. **Write-Ahead Log (WAL) Engine**: Monotonically increasing Log Sequence Number (LSN) counter with transaction history.
3. **Strict Role Protection**: Replicas reject direct writes with `ReadOnlyReplicaError`; offline nodes fail honestly with `NodeUnreachableError`.

### Stage 2: Replication Engine & Delay Simulator
1. **Asynchronous Replication Pipeline**: [ReplicationManager](file:///backend/app/core/replication_manager.py) worker continuously syncs missing WAL records from the primary to replicas.
2. **Configurable Replication Lag**:
   - `replica-1`: default 500ms delay (`REPLICA_1_DELAY_MS`)
   - `replica-2`: default 2000ms delay (`REPLICA_2_DELAY_MS`)
   - Tunable at runtime via `/api/simulation/delay`
3. **Write Path (`POST /api/data/write`)**: Directs writes strictly to the Primary, increments WAL LSN, commits mutation, and triggers replication streaming.
4. **Read Path (`GET /api/data/read?node=<node_id>&key=<key>`)**: Reads from the specified node without silent fallback; demonstrates stale reads during the replica delay window.
5. **Replication Status (`GET /api/cluster/replication`)**: Exposes primary LSN, each replica's applied LSN, lag count, configured delay, and pending queue size.

### Stage 3: Heartbeats & Failure Detection
1. **Background Watchdog Worker**: [HeartbeatWatchdog](file:///backend/app/core/heartbeat_watchdog.py) checks node health periodically without blocking the event loop.
2. **Consecutive Failure Threshold**: Tracks consecutive missed pings per node; transitions node to `DOWN` only upon reaching threshold (default: 3 misses).
3. **Automatic Recovery Detection**: Probes offline nodes and restores them to `HEALTHY` once genuine connectivity returns.
4. **Audit Logging**: Emits `HEARTBEAT_MISSED` warnings, `NODE_HEALTH_CHANGED` for outages, and `NODE_RECOVERED` on restoration.
5. **Simulation Endpoints**: `POST /api/simulation/node/fail` and `POST /api/simulation/node/recover` for injecting network/hardware failure scenarios.

---

## Running and Verifying

### 1. Run Automated Test Suite (20 tests)
```powershell
.\.venv\Scripts\pytest.exe -v
```

### 2. Start the Backend API Server
```powershell
.\.venv\Scripts\uvicorn.exe backend.app.main:app --reload --port 8000
```
- **Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Replication Lag Status**: [http://localhost:8000/api/cluster/replication](http://localhost:8000/api/cluster/replication)
- **Write Data (Primary)**: `POST http://localhost:8000/api/data/write`
- **Read Data (Specific Node)**: `GET http://localhost:8000/api/data/read?node=replica-1&key=my_key`
- **Tune Lag**: `POST http://localhost:8000/api/simulation/delay`

