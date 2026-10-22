# Replicore — Replication & Failover Interactive Demo Guide

This guide walks through reproducing the core distributed database lifecycle phenomena demonstrated by **Replicore**:
1. Transactional writes & monotonic WAL sequence progression
2. Configurable asynchronous replication lag & eventual consistency (stale reads)
3. Replica catch-up and log sequence number alignment
4. Heartbeat watchdog failure detection & consensus thresholding
5. Replica candidate selection by highest applied LSN
6. Epoch advancement & split-brain fencing (HTTP 409 Conflict rejection)
7. Restoring former leaders as non-voting follower replicas

---

## 1. Prerequisites & Setup

### Start the Backend (FastAPI Simulator)
In terminal 1:
```powershell
# From repository root
.venv\Scripts\activate
uvicorn backend.app.main:app --reload --port 8000
```
Verify the API is online:
```powershell
curl http://localhost:8000/api/health
```
Expected response:
```json
{
  "status": "online",
  "service": "replicore",
  "version": "0.1.0",
  "cluster_mode": "local",
  "is_simulation": true
}
```

### Start the Frontend (Vite + React Dashboard)
In terminal 2:
```powershell
cd frontend
npm run dev
```
Navigate your browser to `http://localhost:5173`.

---

## 2. Step-by-Step Demo Scenarios

### Step 1: Initial Cluster Topology Inspection
Query the initial topology to verify 1 Primary (`primary`) at Epoch 1 and 2 Replicas (`replica-1`, `replica-2`):
```powershell
curl http://localhost:8000/api/cluster/status
```
* Dashboard Observation: Open the **Overview** page (`/`). Observe the cluster topology card showing `primary` in blue as Leader, `replica-1` (500ms delay), and `replica-2` (2000ms delay).

---

### Step 2: Committing Transactional Writes
Execute a transactional write through the primary leader:
```powershell
curl -X POST http://localhost:8000/api/data/write `
  -H "Content-Type: application/json" `
  -d '{"key": "order:1001", "value": "{\"customer\": \"Alice\", \"total\": 249.50}"}'
```
Expected response (`HTTP 201 Created`):
```json
{
  "key": "order:1001",
  "value": "{\"customer\": \"Alice\", \"total\": 249.50}",
  "version": 1,
  "node_id": "primary",
  "node_role": "PRIMARY",
  "lsn": 1
}
```
Primary commits to its local WAL and database immediately at `LSN 1`.

---

### Step 3: Demonstrating Replication Delay & Stale Reads
Immediately query both `primary` and `replica-2` before the 2000ms delay window expires:

**Read from Primary:**
```powershell
curl "http://localhost:8000/api/data/read?node=primary&key=order:1001"
```
Result: Returns committed record immediately (`data.value` present, `is_stale_possible: false`).

**Read from Lagging Replica (`replica-2`):**
```powershell
curl "http://localhost:8000/api/data/read?node=replica-2&key=order:1001"
```
Result: Returns `data: null` with `is_stale_possible: true`.
> **Educational Insight**: In asynchronous replication, reads on follower replicas are eventually consistent. Lag is not a failure; it is a fundamental property of asynchronous replication buffers.

---

### Step 4: Observing Catch-Up & Alignment
After 2 seconds elapse, inspect the replication stream:
```powershell
curl http://localhost:8000/api/cluster/replication
```
Expected response:
```json
{
  "primary_node_id": "primary",
  "primary_lsn": 1,
  "replication_mode": "ASYNC",
  "replicas": [
    {
      "node_id": "replica-1",
      "applied_lsn": 1,
      "lag_lsn": 0,
      "configured_delay_ms": 500,
      "pending_queue_count": 0,
      "sync_percentage": 100.0,
      "is_caught_up": true
    },
    {
      "node_id": "replica-2",
      "applied_lsn": 1,
      "lag_lsn": 0,
      "configured_delay_ms": 2000,
      "pending_queue_count": 0,
      "sync_percentage": 100.0,
      "is_caught_up": true
    }
  ]
}
```
Querying `replica-2` now returns the committed record with version 1 and LSN 1.

---

### Step 5: Adjusting Replication Delay at Runtime
Configure `replica-1` with a custom delay via the API or the UI delay slider:
```powershell
curl -X POST http://localhost:8000/api/simulation/delay `
  -H "Content-Type: application/json" `
  -d '{"node_id": "replica-1", "delay_ms": 3000}'
```

---

### Step 6: Simulating Primary Outage
Inject a simulated hardware failure or network crash on the primary node:
```powershell
curl -X POST http://localhost:8000/api/simulation/node/fail `
  -H "Content-Type: application/json" `
  -d '{"node_id": "primary"}'
```
* Dashboard Observation: Watch the heartbeat watchdog probe `primary`.
  - Pings 1 and 2 miss (`HEARTBEAT_MISSED` emitted, status stays `HEALTHY`).
  - Ping 3 misses (`NODE_HEALTH_CHANGED` emitted, status transitions to `DOWN`).
  - Automatic failover triggers (`PRIMARY_FAILED` → `REPLICA_SELECTED` → `EPOCH_INCREMENTED` → `NODE_PROMOTED`).

---

### Step 7: Verifying Promotion & Epoch Advancement
Query cluster status after failover:
```powershell
curl http://localhost:8000/api/cluster/status
```
Verify:
1. `primary_node_id` is now `replica-1` (or whichever replica had the highest applied LSN).
2. `current_epoch` has advanced from `1` to `2`.
3. The previous leader `primary` has role `REPLICA` and `is_fenced: true`.

---

### Step 8: Verifying Split-Brain Fencing (HTTP 409 Conflict)
Attempt to force a write directly to the fenced former primary:
```powershell
curl -i -X POST "http://localhost:8000/api/data/write?target_node=primary" `
  -H "Content-Type: application/json" `
  -d '{"key": "split_brain:key", "value": "rogue_write"}'
```
Expected response:
```http
HTTP/1.1 409 Conflict
Content-Type: application/json

{
  "detail": "Write REJECTED: Node 'primary' has been fenced and is no longer the active PRIMARY. It was operating at epoch 1. All writes must go to the current leader."
}
```
* Even if connectivity is restored via `/api/simulation/node/recover`, fencing is preserved: the recovered node rejoins as a read-only follower at epoch 1 and cannot reclaim leadership or accept split-brain writes.

---

### Step 9: Writing to the New Primary
Write through normal cluster routing:
```powershell
curl -X POST http://localhost:8000/api/data/write `
  -H "Content-Type: application/json" `
  -d '{"key": "order:1002", "value": "{\"status\": \"CONFIRMED\"}"}'
```
The write commits successfully to `replica-1` with `lsn: 2`.

---

## 3. Simulator Architecture & Limitations

| Aspect | Replicore Simulator Implementation | Production HA (e.g. Patroni / Raft / Galera) |
|---|---|---|
| **Consensus & Election** | Monotonic LSN candidate selection in Python `ClusterManager` | Distributed consensus (etcd, Consul, Raft, Paxos) |
| **Fencing Mechanism** | Logical `is_fenced` flag checked by write handler (HTTP 409) | Hardware STONITH, watchdog timers, lease expirations |
| **Replication Transport** | In-process asynchronous delayed queue buffer | Kernel TCP streaming, native PostgreSQL `pg_wal` |
| **Audit Persistence** | In-memory circular buffer (last 500 events) | Durable append-only write logs, SIEM syslog |
| **Node Isolation** | In-memory boolean flag `simulated_unreachable` | Real kernel network namespaces / firewall iptables drop |
