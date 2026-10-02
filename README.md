# Replicore — Database Replication & High Availability Simulator

> An interactive, full-stack simulator demonstrating replication lag, failure detection, automatic failover, epoch-based leader versioning, and application-level fencing across a three-node database cluster.

---

## Table of Contents

1. [Problem](#problem)
2. [Solution Overview](#solution-overview)
3. [Key Features](#key-features)
4. [Architecture](#architecture)
5. [Failover Flow](#failover-flow)
6. [Consistency Demonstration](#consistency-demonstration)
7. [Tech Stack](#tech-stack)
8. [Project Structure](#project-structure)
9. [How to Run](#how-to-run)
10. [API Reference](#api-reference)
11. [Testing](#testing)
12. [Demo Workflow](#demo-workflow)
13. [Screenshots](#screenshots)
14. [Limitations](#limitations)
15. [Why This Project Is Interesting](#why-this-project-is-interesting)

---

## Problem

Distributed database systems must solve several hard problems simultaneously:

- **Replication lag**: Writes committed to the primary node are not instantly visible on replicas. A read on a replica immediately after a write may return stale or missing data — this is expected behavior in asynchronous replication, not a bug.
- **Failure detection**: Nodes crash or become unreachable. A monitoring component must distinguish transient network blips from genuine node failures before taking action.
- **Leader selection**: When a primary fails, the cluster must elect a new leader. The best candidate is the replica with the most up-to-date data (highest applied Log Sequence Number).
- **Stale leader fencing**: After a failover, the old primary may come back online. If it is allowed to accept writes, the cluster will have two leaders writing divergent data — a split-brain scenario. The old leader must be fenced and its writes rejected.

Replicore demonstrates all of these behaviors in a runnable, observable application.

---

## Solution Overview

Replicore implements a three-node cluster (1 Primary + 2 Replicas) with a full write-to-read pipeline:

```
Client Write
  → POST /api/data/write
  → ClusterManager.execute_write()
  → WALManager appends record, increments LSN (monotonic)
  → Primary DatabaseNode persists the record
  → ReplicationManager.process_replication_step()
      → Each replica's queue receives delayed WAL entries
      → apply_at = now + configured_delay_ms
  → Background loop applies eligible records to replica DatabaseNodes
  → Replica last_applied_lsn advances
  → Frontend polls /api/cluster/replication every ~3s
      → Lag charts, LSN progress, pending queue counts update live

Client Read (Replica)
  → GET /api/data/read?node=replica-2&key=<key>
  → May return stale or missing data during delay window → eventual consistency

Primary Failure
  → HeartbeatWatchdog detects consecutive missed pings (threshold: 3)
  → Node transitions to DOWN
  → trigger_automatic_failover() selects candidate by highest last_applied_lsn
  → promote_replica(): epoch++, old primary demoted + fenced, new primary set
  → ReplicationManager.reconfigure_topology() adjusts queues
  → New primary accepts writes; fenced old primary returns HTTP 409 on write
```

---

## Key Features

### Cluster & Replication
| Feature | Detail |
|---|---|
| Primary + 2 Replica topology | `ClusterManager` owns node registry; roles enforced per node |
| Write-Ahead Log (WAL) | Monotonically increasing LSN via `WALManager`; full record history |
| Configurable replication delay | `replica-1`: 500 ms default, `replica-2`: 2000 ms default; tunable at runtime |
| Eventual consistency demo | Read from lagging replica returns stale/missing value; later returns committed value |
| Node-specific reads | `GET /api/data/read?node=<id>&key=<key>` — no silent fallback to another node |
| Replica write rejection | `ReadOnlyReplicaError` → HTTP 400 on direct replica writes |

### Failure Detection & Recovery
| Feature | Detail |
|---|---|
| Heartbeat watchdog | `HeartbeatWatchdog` pings each node every 2 s (configurable) |
| Consecutive miss threshold | 3 consecutive failures required before marking node DOWN |
| Automatic recovery | Watchdog restores node to HEALTHY when pings succeed again |
| Fault injection | `POST /api/simulation/node/fail` and `POST /api/simulation/node/recover` |
| Audit event log | `HEARTBEAT_MISSED`, `NODE_HEALTH_CHANGED`, `NODE_RECOVERED` events stored in memory |

### Failover & Fencing
| Feature | Detail |
|---|---|
| Automatic failover | Triggered by watchdog when primary is marked DOWN |
| Manual promotion | `POST /api/cluster/failover` with explicit `target_node_id` |
| Candidate selection | Highest `last_applied_lsn`; DOWN/ISOLATED/fenced nodes excluded |
| Deterministic tie-breaking | Node ID alphabetical order when LSNs are equal |
| Epoch tracking | `current_epoch` incremented on every promotion; visible on dashboard |
| Application-level fencing | Old primary `is_fenced = True`; `FencedLeaderError` → HTTP 409 on any write |
| Concurrency guard | `_failover_in_progress` flag prevents overlapping promotions |

### Observability & Dashboard
| Feature | Detail |
|---|---|
| Live topology view | `ClusterTopology` component shows node roles, health badges, LSN, delay |
| Real-time LSN progress chart | `LsnProgressChart` — per-node LSN over time (Recharts) |
| Replication lag bar chart | `ReplicaLagBarChart` — lag in LSNs per replica |
| Replication lag line chart | `ReplicationLagChart` — lag trend over time |
| Telemetry cards | `ClusterTelemetryCard` — write throughput, replication queue depth |
| Node health summary | `NodeHealthSummary` — per-node status with health indicator |
| Failover event timeline | `FailoverEventTimeline` — ordered list of promotion/fencing events |
| Audit event log page | Full audit trail with event type, source node, description |
| Frontend polling | `usePolling` hook drives all live data; configurable interval; exponential backoff on error |
| Metrics history | `useMetricsHistory` accumulates time-series data client-side |

### Simulation Controls
| Feature | Detail |
|---|---|
| Fail a node | Marks node as simulated-unreachable so watchdog detects it naturally |
| Recover a node | Clears the unreachable flag; watchdog restores health on next probe |
| Adjust replication delay | Live slider/form updates `replication_delay_ms` on any replica |
| Read test panel | `ReadTestControl` — write a key, then read from each node to observe staleness |
| Demo workflow guide | `DemoWorkflowGuide` — step-by-step interactive checklist in UI |
| Failover confirmation modal | `FailoverConfirmationModal` — two-step confirmation before manual promotion |

### Frontend Engineering
| Feature | Detail |
|---|---|
| React 19 + TypeScript | Strict typed throughout |
| Vite 8 + Tailwind CSS v4 | Fast dev server, utility-first styling |
| Code splitting | `React.lazy` + `Suspense` for secondary pages |
| Manual chunks | `recharts` and `lucide-react` split into separate vendor bundles |
| Skeleton loading | `PageSkeleton` placeholder during lazy-load |
| Responsive layout | Mobile-friendly sidebar, collapsible nav, fluid grid |
| Accessibility | ARIA labels on interactive elements, role attributes on alerts |

### Backend & Testing
| Feature | Detail |
|---|---|
| FastAPI + Pydantic v2 | Typed request/response models, OpenAPI auto-docs |
| SQLAlchemy 2.0 | Sync Core API; per-node engine per mode |
| Dual cluster mode | `local` (SQLite, zero-dependency) or `postgres` (Docker Compose, 3 containers) |
| 51 automated tests | `pytest` across 5 test files covering all major subsystems |

---

## Architecture

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                      React Dashboard (port 5173)                │
│  OverviewPage  │  ClusterNodesPage  │  ReplicationPage          │
│  SimulationPage  │  EventLogsPage                               │
│                                                                  │
│  ClusterProvider (context)                                       │
│    └─ usePolling hook → fetch every ~3s                          │
│         ├── fetchClusterStatus  → /api/cluster/status           │
│         ├── fetchReplicationStatus → /api/cluster/replication   │
│         └── fetchClusterEvents → /api/cluster/events            │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP (fetch / CORS)
┌────────────────────────▼────────────────────────────────────────┐
│                   FastAPI (port 8000)                            │
│  main.py  →  routes  →  ClusterManager (singleton: cluster)     │
│                                                                  │
│  ClusterManager                                                  │
│    ├── nodes: Dict[str, DatabaseNode]                            │
│    │     ├── primary    (NodeRole.PRIMARY)                       │
│    │     ├── replica-1  (NodeRole.REPLICA, delay=500ms)         │
│    │     └── replica-2  (NodeRole.REPLICA, delay=2000ms)        │
│    ├── WALManager  (append_record, get_records_since)            │
│    ├── ReplicationManager  (background loop, per-replica queues) │
│    │     └── DelayedWALItem queue per replica                    │
│    ├── HeartbeatWatchdog  (background loop, 2s interval)         │
│    ├── current_epoch  (incremented on every promotion)           │
│    └── audit_events  (in-memory list)                            │
└─────────────────────┬──────────────────────────────────────────-┘
                      │ SQLAlchemy Core (sync)
         ┌────────────┼──────────────┐
         ▼            ▼              ▼
    primary.db   replica_1.db   replica_2.db
   (SQLite local mode)        or PostgreSQL
                               containers on
                               ports 5432/5433/5434
```

### Module Map

| Module | Responsibility |
|---|---|
| `backend/app/core/cluster_manager.py` | Owns node registry, write/read dispatch, failover orchestration, epoch |
| `backend/app/core/node.py` | `DatabaseNode` — SQLAlchemy persistence, WAL apply, role/status/fencing state |
| `backend/app/core/wal.py` | `WALManager` + `WALRecord` — monotonic LSN, thread-safe append, record retrieval |
| `backend/app/core/replication_manager.py` | `ReplicationManager` — async background loop, per-replica delay queues, `flush_replica` |
| `backend/app/core/heartbeat_watchdog.py` | `HeartbeatWatchdog` — async background loop, consecutive miss counter, auto-failover trigger |
| `backend/app/config.py` | `Settings` (pydantic-settings) — reads `.env`, exposes all tunables |
| `backend/app/main.py` | FastAPI app, all route handlers, CORS, lifespan startup/shutdown |
| `frontend/src/context/ClusterContext.tsx` | `ClusterProvider` — shared cluster state, polling orchestration |
| `frontend/src/hooks/usePolling.ts` | Generic polling hook with interval, backoff, abort on unmount |
| `frontend/src/hooks/useMetricsHistory.ts` | Accumulates time-series metrics for Recharts |
| `frontend/src/services/api.ts` | All `fetch` calls typed against backend response models |

---

## Failover Flow

### Sequence (Automatic)

```
1. Primary node goes down (crash or simulated via POST /api/simulation/node/fail)
2. HeartbeatWatchdog.check_node_health("primary"):
     ping fails → consecutive_failures["primary"]++
     repeat until consecutive_failures >= MISSED_HEARTBEAT_THRESHOLD (default: 3)
     → node.status = NodeStatus.DOWN
     → AuditEvent: NODE_HEALTH_CHANGED
3. Watchdog calls cluster.trigger_automatic_failover()
4. ClusterManager._failover_in_progress = True  (concurrency guard)
5. Candidate selection:
     candidates = [n for n in nodes if n.role == REPLICA
                                    and n.status == HEALTHY
                                    and not n.is_fenced]
     winner = max(candidates, key=lambda n: (n.last_applied_lsn, n.node_id reversed))
6. promote_replica(winner.node_id):
     a. Old primary: node.role = REPLICA, node.is_fenced = True
        → AuditEvent: PRIMARY_DEMOTED
     b. current_epoch += 1
     c. winner.role = PRIMARY, winner.leadership_epoch = current_epoch
        → AuditEvent: REPLICA_PROMOTED
     d. ReplicationManager.reconfigure_topology()
        → winner removed from replica queues
        → remaining replicas keep their queues, now sourcing from new primary WAL
7. _failover_in_progress = False
8. New primary accepts writes via execute_write()
9. Old primary (fenced):
     → POST /api/data/write targeting old primary → FencedLeaderError → HTTP 409
     → Can be recovered via POST /api/simulation/node/recover
     → After recovery, rejoins as REPLICA (queue re-added by reconfigure_topology)
```

### Why Epoch and Fencing Exist

**Epoch** is a monotonically increasing generation counter. Any component that reads the epoch can determine whether its view of "who is primary" is current. A stale primary that was isolated and then reconnects has an older epoch — it knows it is no longer the leader.

**Fencing** (application-level) ensures the old primary cannot write even if it comes back before its epoch is verified. `DatabaseNode.is_fenced = True` causes `execute_write` to raise `FencedLeaderError` immediately, before touching the database. This prevents a split-brain write window during the reconnect interval.

---

## Consistency Demonstration

### Scenario

```
1. POST /api/data/write  {"key": "user:1", "value": "alice"}
   → Committed to primary at LSN=7
   → replica-1 queued: apply_at = now + 0.5s
   → replica-2 queued: apply_at = now + 2.0s

2. GET /api/data/read?node=replica-2&key=user:1   (immediately)
   → Response: {"data": null, "is_stale_possible": true}
   → replica-2 has not yet applied LSN=7

3. GET /api/data/read?node=replica-2&key=user:1   (after 2s)
   → Response: {"data": {"key": "user:1", "value": "alice"}, "is_stale_possible": true}
   → Replication caught up; replica returns the committed value
```

This demonstrates **eventual consistency** under asynchronous replication. The replica is not wrong during the lag window — it is correctly returning the latest value it has applied. The `is_stale_possible: true` flag in the response communicates this to the client.

---

## Tech Stack

### Backend

| Technology | Version | Role |
|---|---|---|
| Python | 3.12+ | Runtime |
| FastAPI | ≥ 0.115 | API framework, OpenAPI docs |
| Pydantic v2 | ≥ 2.8 | Request/response models, settings |
| pydantic-settings | ≥ 2.4 | `.env` configuration |
| SQLAlchemy | ≥ 2.0 | Sync Core API, per-node DB engine |
| psycopg (v3) | ≥ 3.2 | PostgreSQL driver (postgres mode) |
| aiosqlite | ≥ 0.20 | SQLite async support (local mode) |
| uvicorn | ≥ 0.30 | ASGI server |
| pytest | ≥ 8.3 | Test framework |
| pytest-asyncio | ≥ 0.23 | Async test support |
| httpx | ≥ 0.27 | HTTP client for integration tests |
| python-dotenv | ≥ 1.0 | `.env` loading |

### Frontend

| Technology | Version | Role |
|---|---|---|
| React | 19 | UI framework |
| TypeScript | ~6.0 | Type safety |
| Vite | 8 | Build tool and dev server |
| Tailwind CSS | v4 | Utility-first styling (via `@tailwindcss/vite`) |
| Recharts | 3 | Line, bar, and area charts |
| Lucide React | 1.49 | Icon library |

### Infrastructure

| Technology | Role |
|---|---|
| Docker Compose | Orchestrates 3 PostgreSQL 16 containers (`postgres` mode) |
| PostgreSQL 16 | Database engine in `postgres` cluster mode |
| SQLite | Zero-dependency database in `local` cluster mode (default) |

---

## Project Structure

```
Replicore/
├── .env                        # Active environment config (not committed)
├── .env.example                # Template with all available settings
├── .gitignore
├── docker-compose.yml          # 3-container PostgreSQL cluster
├── pytest.ini                  # Test discovery config
├── requirements.txt            # Backend Python dependencies
│
├── docker/
│   ├── init-primary.sql        # Schema + seed for primary container
│   └── init-replica.sql        # Schema for replica containers
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app, all route handlers
│   │   ├── config.py           # Settings (pydantic-settings, reads .env)
│   │   ├── core/
│   │   │   ├── cluster_manager.py     # Cluster orchestration, failover, write/read
│   │   │   ├── node.py                # DatabaseNode: persistence, WAL apply, fencing
│   │   │   ├── wal.py                 # WALManager + WALRecord: monotonic LSN
│   │   │   ├── replication_manager.py # Async replication loop, delay queues
│   │   │   └── heartbeat_watchdog.py  # Async watchdog, failure detection
│   │   └── models/
│   │       ├── cluster.py             # Pydantic models: ClusterState, AuditEvent, etc.
│   │       └── data_record.py         # RecordWriteRequest, RecordResponse
│   └── tests/
│       ├── conftest.py                        # fixtures: fresh_cluster, client
│       ├── test_cluster_topology.py           # topology, health, WAL basics (5 tests)
│       ├── test_replication_delay.py          # lag, staleness, catch-up (8 tests)
│       ├── test_heartbeat_watchdog.py         # watchdog, miss counter, recovery (7 tests)
│       ├── test_failover_epoch_fencing.py     # failover, epoch, fencing, API (16 tests)
│       └── test_stage5_edge_cases_and_hardening.py  # edge cases, concurrency (15 tests)
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.ts              # Vite config: port 5173, API proxy, manual chunks
    ├── tsconfig.app.json
    └── src/
        ├── App.tsx                 # Root: routing, lazy page loading, ClusterProvider
        ├── main.tsx
        ├── index.css               # Global styles, design tokens
        ├── types/                  # Shared TypeScript types (mirrors backend models)
        ├── services/
        │   ├── api.ts              # All fetch calls, typed responses
        │   └── errors.ts           # ApiError class
        ├── context/
        │   └── ClusterContext.tsx  # ClusterProvider: shared state, polling
        ├── hooks/
        │   ├── useCluster.ts       # Consumes ClusterContext
        │   ├── usePolling.ts       # Generic interval poller with backoff
        │   └── useMetricsHistory.ts # Client-side time-series accumulator
        ├── layouts/
        │   ├── AppShell.tsx        # Top nav, header bar, connection banner
        │   └── Sidebar.tsx         # Navigation sidebar
        ├── pages/
        │   ├── OverviewPage.tsx    # Cluster summary, quick stats, topology
        │   ├── ClusterNodesPage.tsx # Per-node detail cards
        │   ├── ReplicationPage.tsx  # LSN charts, lag bars, replication metrics
        │   ├── SimulationPage.tsx   # Fail/recover, delay slider, read test, failover
        │   └── EventLogsPage.tsx    # Audit event log table
        └── components/
            ├── ClusterTopology.tsx       # Visual topology diagram
            ├── ClusterTelemetryCard.tsx  # Write/queue telemetry
            ├── DemoWorkflowGuide.tsx     # Step-by-step demo checklist
            ├── FailoverConfirmationModal.tsx
            ├── FailoverEventTimeline.tsx
            ├── LsnProgressChart.tsx
            ├── NodeHealthSummary.tsx
            ├── PageSkeleton.tsx
            ├── ReadTestControl.tsx
            ├── ReplicaLagBarChart.tsx
            ├── ReplicationLagChart.tsx
            ├── SectionHeader.tsx
            ├── StatCard.tsx
            └── StatusBadge.tsx
```

---

## How to Run

### Prerequisites

- Python 3.12 or newer
- Node.js 20 or newer and npm
- (Optional, for `postgres` mode) Docker Desktop

### 1. Clone and Set Up Python Environment

```powershell
git clone https://github.com/deepikajdev/Replicore.git
cd Replicore

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

### 2. Configure Environment

```powershell
copy .env.example .env
```

The default `.env` uses `local` mode (SQLite, no Docker required). Key settings:

| Variable | Default | Description |
|---|---|---|
| `REPLICORE_CLUSTER_MODE` | `local` | `local` = SQLite, `postgres` = Docker containers |
| `REPLICA_1_DELAY_MS` | `500` | Replication delay for replica-1 (ms) |
| `REPLICA_2_DELAY_MS` | `2000` | Replication delay for replica-2 (ms) |
| `MISSED_HEARTBEAT_THRESHOLD` | `3` | Consecutive missed pings before marking node DOWN |
| `HEARTBEAT_INTERVAL_SECONDS` | `2` | Seconds between watchdog health checks |
| `AUTO_FAILOVER_ENABLED` | `true` | Triggers automatic failover when primary is DOWN |

### 3. Start the Backend

```powershell
.\.venv\Scripts\uvicorn.exe backend.app.main:app --reload --port 8000
```

- **Swagger UI**: http://localhost:8000/docs
- **Cluster status**: http://localhost:8000/api/cluster/status
- **Replication lag**: http://localhost:8000/api/cluster/replication

### 4. Start the Frontend

In a separate terminal:

```powershell
cd frontend
npm install
npm run dev
```

- **Dashboard**: http://localhost:5173

The Vite dev server proxies all `/api/*` requests to `http://localhost:8000`.

### 5. (Optional) PostgreSQL Mode with Docker

```powershell
# In .env, set:
# REPLICORE_CLUSTER_MODE=postgres

docker compose up -d
# Wait for containers to be healthy, then start the backend as above
```

Containers:
| Container | Port |
|---|---|
| `replicore-primary` | 5432 |
| `replicore-replica-1` | 5433 |
| `replicore-replica-2` | 5434 |

### 6. Run the Test Suite

```powershell
# From the project root with .venv active
.\.venv\Scripts\pytest.exe -v
```

---

## API Reference

All endpoints are documented interactively at **http://localhost:8000/docs**.

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health, version, cluster mode |

### Cluster

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cluster/status` | Node topology, roles, health, LSN, epoch, fencing state |
| `GET` | `/api/cluster/events?limit=50` | Recent audit log events |
| `GET` | `/api/cluster/replication` | Primary LSN, replica applied LSN, lag, delay, queue depth |
| `POST` | `/api/cluster/failover` | Manual promotion: `{"target_node_id": "replica-1"}` |

### Data Operations

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/data/write` | Write record to primary: `{"key": "...", "value": "..."}` |
| `GET` | `/api/data/read?node=<id>&key=<key>` | Read from specific node; demonstrates stale reads |

### Simulation Controls

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/simulation/node/fail` | Inject node failure: `{"node_id": "primary"}` |
| `POST` | `/api/simulation/node/recover` | Restore node: `{"node_id": "primary"}` |
| `POST` | `/api/simulation/delay` | Set replication delay: `{"node_id": "replica-2", "delay_ms": 5000}` |

### Error Codes

| Code | Meaning |
|---|---|
| `400 Bad Request` | Write to read-only replica; invalid delay value |
| `404 Not Found` | Unknown `node_id` |
| `409 Conflict` | Write to fenced node; failover already in progress |
| `503 Service Unavailable` | Target node is DOWN |

---

## Testing

### Run All Tests

```powershell
.\.venv\Scripts\pytest.exe -v
```

**Current result: 51 tests, 51 passed.**

### Test Files

| File | Tests | Coverage Area |
|---|---|---|
| `test_cluster_topology.py` | 5 | Health endpoint, cluster status, replica write rejection, honest error on offline node, WAL monotonic LSN |
| `test_replication_delay.py` | 8 | Write reaches primary immediately, stale replica reads, eventual catchup, LSN monotonicity, offline replica does not block primary |
| `test_heartbeat_watchdog.py` | 7 | Healthy heartbeat, single miss does not mark DOWN, threshold transition, counter reset on success, audit events |
| `test_failover_epoch_fencing.py` | 16 | Automatic failover trigger, highest-LSN candidate selection, tie-breaking, filtered candidates, no-candidate scenario, manual promotion, epoch increment, fencing, write rejection on fenced node, recovered old primary stays replica, replication from new primary, API endpoints |
| `test_stage5_edge_cases_and_hardening.py` | 15 | Watchdog miss counter edge cases, full failover path, candidate filtering (fenced/down), epoch invariants across bad inputs, split-brain fencing after recovery, replication delay boundary, LSN-based promotion ordering, one-replica-pre-failed failover, concurrent failover lock, duplicate trigger no-op, comprehensive API error responses |

---

## Demo Workflow

A built-in **Demo Workflow Guide** is available in the Simulation page of the dashboard. The steps below mirror it:

### Step 1 — Start the Cluster
Start backend and frontend as described in [How to Run](#how-to-run). Open the dashboard at `http://localhost:5173`. Confirm all three nodes show HEALTHY in the Overview page.

### Step 2 — Write Data
In the **Simulation** page → **Write & Read Test** panel:
- Enter a key (e.g. `user:demo`) and a value (e.g. `hello-world`)
- Click **Write to Primary**
- Confirm the response shows `lsn: 1` (or the current sequence number)

### Step 3 — Read from Primary
- Read from `primary` — value is immediately visible

### Step 4 — Read from replica-2 (observe staleness)
- Read from `replica-2` immediately after writing
- Response will show `null` or the old value — **this is correct behavior**
- `replica-2` has a 2000 ms replication delay and has not yet applied the WAL record

### Step 5 — Watch Replication Catch Up
- Switch to the **Replication** page
- Observe `replica-2 lag` decreasing on the lag charts
- After ~2 seconds, read from `replica-2` again — the value is now visible

### Step 6 — Fail the Primary
- In the **Simulation** page → **Node Control** panel
- Click **Fail Node** on `primary`
- Watch the **Cluster Overview** page: primary transitions to DOWN after 3 watchdog cycles (~6 seconds)

### Step 7 — Observe Automatic Failover
- A replica is automatically promoted to PRIMARY
- The epoch counter in the top navigation bar increments
- The old primary shows as FENCED in the topology view
- `FailoverEventTimeline` and `EventLogsPage` record the sequence

### Step 8 — Attempt Write to Fenced Node
- Use Swagger UI at `http://localhost:8000/docs`
- `POST /api/data/write` with `target_node=primary`
- Response: `HTTP 409 Conflict` — `FencedLeaderError`

### Step 9 — Write Through New Primary
- In the Simulation page, write new data — it goes to the new primary
- Replicas continue to receive WAL records from the new leader

### Step 10 — Recover Old Primary
- Click **Recover Node** on the old primary
- Watchdog detects health on next ping cycle
- Node transitions back to HEALTHY as a REPLICA
- It begins catching up WAL records from the new primary

---

## Screenshots

> The following sections are reserved for screenshots. To add them, save images to `docs/screenshots/` and update the paths below.

### Overview Dashboard
```
[ screenshot: docs/screenshots/overview.png ]
```

### Cluster Topology
```
[ screenshot: docs/screenshots/topology.png ]
```

### Replication Monitoring
```
[ screenshot: docs/screenshots/replication.png ]
```

### Simulation Console
```
[ screenshot: docs/screenshots/simulation.png ]
```

### Failover Event Timeline
```
[ screenshot: docs/screenshots/failover_timeline.png ]
```

---

## Limitations

The following limitations are inherent to the design and should be understood before drawing conclusions about production applicability:

| Limitation | Detail |
|---|---|
| Application-level replication | WAL streaming is simulated in-process by `ReplicationManager`. This is not PostgreSQL native streaming replication (`pg_wal`, `primary_conninfo`). |
| Application-level fencing | Fencing is a flag (`is_fenced`) on `DatabaseNode`. It is enforced by the same process that performs the write. In a real multi-process cluster, fencing requires an external mechanism (STONITH, SCSI reservation, lease expiry). |
| Single-process cluster | In `local` mode, all three nodes and all background workers run in the same Python process and share memory. Node isolation is logical, not physical. |
| In-memory audit log | `cluster.audit_events` is a Python list. It does not persist across server restarts. |
| No consensus protocol | Leader election is determined by a single-threaded Python function in `ClusterManager`. It does not implement Raft, Paxos, or any quorum-based consensus. |
| No network partitions | The `local` mode cannot simulate network partitions between nodes. Failures are injected by setting `simulated_unreachable = True` on the node object. |
| `postgres` mode is independent storage, not streaming | In `postgres` mode, each PostgreSQL container holds its own independent data. The application layer replicates between them — PostgreSQL's native replication is not configured. |
| No durability guarantees beyond SQLite/PostgreSQL defaults | There is no WAL pre-flush or `fsync` guarantee at the application layer beyond what each database engine provides natively. |
| Concurrent write safety | `ClusterManager.execute_write` is not protected by a write mutex beyond SQLAlchemy's connection handling. High-throughput concurrent writes are not a design target of this simulator. |

---

## Why This Project Is Interesting

Replicore is a self-contained demonstration of several distributed systems concepts that are easy to describe but hard to see in action:

**Replication lag and eventual consistency** are not abstract — in the Read Test panel, you can write a value and immediately read `null` from a slow replica, then watch the lag chart close to zero and read the value seconds later. The delay is configurable, so you can compress or expand the observation window.

**Failure detection thresholds** show why a watchdog cannot act on a single missed heartbeat — transient latency would cause constant false failovers. The three-miss threshold is observable: inject a failure and watch the counter in the audit log climb before the node is declared DOWN.

**Leader epoch and fencing** demonstrate why simply promoting a new primary is not enough. The old leader's `is_fenced` flag and the epoch counter are visible in the cluster status response. The `HTTP 409` on a write to a fenced node is a concrete answer to "what stops the old leader from writing?"

**Candidate selection by LSN** shows that the replica chosen for promotion is not arbitrary — it is the one with the most up-to-date data. The test `test_failover_promotes_replica_with_higher_applied_lsn_after_partial_catchup` exercises this directly.

**Observability** is first-class: every state transition emits an audit event. The dashboard is live, not a mock — all charts and status badges reflect real data from the FastAPI cluster state.

The project is deliberately honest about what it simulates versus what production HA systems like Patroni, Galera, or CockroachDB implement. That honesty is part of its value as a learning and portfolio artifact.

---

*Replicore v0.1.0 — 51 backend tests passing — [github.com/deepikajdev/Replicore](https://github.com/deepikajdev/Replicore)*
