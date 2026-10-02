/**
 * ClusterTopology.tsx
 *
 * Live cluster topology visualization derived entirely from real backend data.
 * No mock state is introduced here. All node roles, statuses, LSN values,
 * lag counts, fencing state, and replication delays come from the ClusterProvider
 * polling cycle established in Stage 4B.
 *
 * Layout (desktop):
 *
 *          ┌─────────────┐
 *          │   PRIMARY   │
 *          └──────┬──────┘
 *          ╌╌╌╌╌╌┴╌╌╌╌╌╌
 *       ┌──────────┐   ┌──────────┐
 *       │ REPLICA  │   │ REPLICA  │
 *       └──────────┘   └──────────┘
 *
 * Mobile: nodes stack vertically with connecting line preserved.
 *
 * PRIMARY is determined by node.role === 'PRIMARY' from real backend state.
 * LSN, lag, delay, status, fencing all come directly from NodeInfo / ReplicaLagInfo.
 */

import React from 'react'
import { Database, ArrowDown, AlertTriangle, WifiOff, Inbox } from 'lucide-react'
import type { NodeInfo, ReplicaLagInfo, ClusterStatus, ReplicationStatus } from '../types'

// ---------------------------------------------------------------------------
// Status-derived helpers
// ---------------------------------------------------------------------------

function getStatusRing(status: NodeInfo['status'], isFenced: boolean): string {
  if (isFenced) return 'ring-2 ring-red-700/80'
  switch (status) {
    case 'HEALTHY':   return 'ring-1 ring-emerald-600/60'
    case 'DEGRADED':  return 'ring-2 ring-amber-500/70'
    case 'DOWN':      return 'ring-2 ring-rose-600/80'
    case 'ISOLATED':  return 'ring-2 ring-purple-600/70'
    default:          return 'ring-1 ring-[#30363d]'
  }
}

function getStatusDot(status: NodeInfo['status'], isFenced: boolean): string {
  if (isFenced) return 'bg-red-500'
  switch (status) {
    case 'HEALTHY':   return 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
    case 'DEGRADED':  return 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
    case 'DOWN':      return 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
    case 'ISOLATED':  return 'bg-purple-500'
    default:          return 'bg-[#484f58]'
  }
}

/** True when the link from primary to this replica should look active/flowing */
function isLinkActive(status: NodeInfo['status'], isFenced: boolean): boolean {
  return status === 'HEALTHY' && !isFenced
}

// ---------------------------------------------------------------------------
// Enriched node type: NodeInfo + optional ReplicaLagInfo overlay
// ---------------------------------------------------------------------------

interface EnrichedNode {
  node: NodeInfo
  lag: ReplicaLagInfo | null
}

// ---------------------------------------------------------------------------
// Single node card
// ---------------------------------------------------------------------------

interface NodeCardProps {
  enriched: EnrichedNode
  isPrimary: boolean
  primaryLsn: number
}

const NodeCard: React.FC<NodeCardProps> = ({ enriched, isPrimary, primaryLsn }) => {
  const { node, lag } = enriched

  const statusRing  = getStatusRing(node.status, node.is_fenced)
  const statusDot   = getStatusDot(node.status, node.is_fenced)
  const isDown      = node.status === 'DOWN'
  const isDegraded  = node.status === 'DEGRADED'
  const isIsolated  = node.status === 'ISOLATED'
  const isFenced    = node.is_fenced

  // Applied LSN: for primary use cluster.current_primary_lsn (more authoritative);
  // for replicas prefer the ReplicaLagInfo.applied_lsn if available.
  const appliedLsn = isPrimary
    ? primaryLsn
    : (lag?.applied_lsn ?? node.last_applied_lsn)

  const lagCount = isPrimary ? null : (lag?.lag_lsn ?? node.replication_lag_records)
  const delayMs  = isPrimary ? null : (lag?.configured_delay_ms ?? node.replication_delay_ms)
  const pending  = isPrimary ? null : (lag?.pending_queue_count ?? null)

  // Base card color scheme
  const cardBg = isPrimary
    ? 'bg-gradient-to-b from-blue-950/30 to-[#161b22] border-blue-500/40'
    : isDown
    ? 'bg-rose-950/10 border-rose-800/50'
    : isDegraded
    ? 'bg-amber-950/10 border-amber-700/40'
    : isIsolated
    ? 'bg-purple-950/10 border-purple-700/40'
    : isFenced
    ? 'bg-red-950/20 border-red-800/60'
    : 'bg-[#161b22] border-[#30363d]'

  const idDisplay = node.id.replace('replica-', 'R').replace('primary', 'PRI').toUpperCase()

  return (
    <div
      className={`
        relative rounded-xl border p-4 transition-all duration-300 select-none
        ${cardBg} ${statusRing}
        ${isDown ? 'opacity-60' : ''}
      `}
      role="region"
      aria-label={`Node ${node.id} — ${node.role} ${node.status}${isFenced ? ' FENCED' : ''}`}
    >
      {/* Fenced banner */}
      {isFenced && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-red-900 border border-red-600/70 text-red-200">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            FENCED
          </span>
        </div>
      )}

      {/* Down overlay text */}
      {isDown && !isFenced && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-rose-900 border border-rose-600/70 text-rose-200">
            <WifiOff className="w-2.5 h-2.5" />
            DOWN
          </span>
        </div>
      )}

      {/* Degraded banner */}
      {isDegraded && !isFenced && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-900 border border-amber-600/70 text-amber-200">
            <AlertTriangle className="w-2.5 h-2.5" />
            DEGRADED
          </span>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-3">
        {/* Icon + node id */}
        <div className="flex items-center gap-2">
          <div className={`
            w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border
            ${isPrimary
              ? 'bg-blue-950/60 border-blue-600/50 text-blue-300'
              : isDown || isFenced
              ? 'bg-[#1c2128] border-[#30363d] text-[#484f58]'
              : 'bg-[#1c2128] border-[#30363d] text-[#7d8590]'}
          `}>
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="font-mono text-xs font-bold text-[#7d8590] tracking-widest">{idDisplay}</div>
            <div
              className={`text-[11px] font-medium truncate max-w-[120px] ${
                isDown || isFenced ? 'text-[#484f58]' : 'text-[#e6edf3]'
              }`}
              title={node.name}
            >
              {node.name}
            </div>
          </div>
        </div>

        {/* Status dot */}
        <div className="flex-shrink-0 mt-0.5">
          <span className={`block w-2.5 h-2.5 rounded-full ${statusDot}`} aria-hidden="true" />
        </div>
      </div>

      {/* Role badge */}
      <div className="mb-3">
        <span className={`
          inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest border
          ${isPrimary
            ? 'bg-blue-950/60 border-blue-700/60 text-blue-300'
            : isFenced
            ? 'bg-red-950/40 border-red-800/60 text-red-400'
            : isDown
            ? 'bg-[#161b22] border-[#30363d] text-[#484f58]'
            : 'bg-purple-950/40 border-purple-700/50 text-purple-300'}
        `}>
          {isFenced ? 'FENCED' : node.role}
        </span>
      </div>

      {/* Status line */}
      <div className="text-[11px] text-[#7d8590] mb-2 flex items-center gap-1.5">
        <span className={`
          px-1.5 py-0.5 rounded font-medium uppercase text-[10px] tracking-wider
          ${node.status === 'HEALTHY'   ? 'text-emerald-300 bg-emerald-950/40'
          : node.status === 'DEGRADED'  ? 'text-amber-300 bg-amber-950/40'
          : node.status === 'DOWN'      ? 'text-rose-300 bg-rose-950/40'
          : node.status === 'ISOLATED'  ? 'text-purple-300 bg-purple-950/40'
          : 'text-[#7d8590] bg-[#1c2128]'}
        `}>
          {node.status}
        </span>
        <span className="font-mono text-[#484f58]">Epoch {node.leadership_epoch}</span>
      </div>

      {/* Divider */}
      <div className="border-t border-[#21262d] my-2.5" />

      {/* LSN metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
        <div>
          <div className="text-[#7d8590] mb-0.5">{isPrimary ? 'WAL Head' : 'Applied LSN'}</div>
          <div
            className={`font-mono font-semibold ${
              isDown || isFenced ? 'text-[#484f58]' : 'text-[#e6edf3]'
            }`}
          >
            {appliedLsn}
          </div>
        </div>

        {!isPrimary && lagCount !== null && (
          <div>
            <div className="text-[#7d8590] mb-0.5">Lag</div>
            <div
              className={`font-mono font-semibold ${
                lagCount > 0 ? 'text-amber-400' : isDown ? 'text-[#484f58]' : 'text-emerald-400'
              }`}
            >
              {lagCount > 0 ? `${lagCount} rec` : '0 (sync)'}
            </div>
          </div>
        )}

        {!isPrimary && delayMs !== null && (
          <div>
            <div className="text-[#7d8590] mb-0.5">Delay</div>
            <div className={`font-mono ${isDown || isFenced ? 'text-[#484f58]' : 'text-[#7d8590]'}`}>
              {delayMs}ms
            </div>
          </div>
        )}

        {!isPrimary && pending !== null && (
          <div>
            <div className="text-[#7d8590] mb-0.5">Queue</div>
            <div
              className={`font-mono ${
                pending > 0 ? 'text-amber-400' : isDown ? 'text-[#484f58]' : 'text-[#7d8590]'
              }`}
            >
              {pending}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Replication link between primary and a replica
// ---------------------------------------------------------------------------

interface ReplicationLinkProps {
  active: boolean   // healthy and not fenced
  hasLag: boolean
}

const ReplicationLink: React.FC<ReplicationLinkProps> = ({ active, hasLag }) => {
  if (!active) {
    // Severed/dashed line for down/fenced replicas
    return (
      <div className="flex flex-col items-center py-1" aria-hidden="true">
        <div className="flex flex-col items-center gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="block w-px h-1.5 bg-rose-800/60 rounded-full" />
          ))}
        </div>
        <ArrowDown className="w-3 h-3 text-rose-700/60 mt-0.5" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-1" aria-hidden="true">
      {/* Animated dots suggesting WAL record flow */}
      <div className="relative w-px h-8 bg-[#30363d] overflow-hidden">
        {/* Flowing dot — represents WAL propagation, not fabricated data */}
        <span
          className={`
            absolute left-1/2 -translate-x-1/2 w-1 h-1 rounded-full
            ${hasLag ? 'bg-amber-400' : 'bg-emerald-400'}
            animate-[flowDown_1.6s_ease-in-out_infinite]
          `}
          style={{ top: '-4px' }}
        />
      </div>
      <ArrowDown
        className={`w-3 h-3 mt-0.5 ${hasLag ? 'text-amber-500/70' : 'text-emerald-600/70'}`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main ClusterTopology component
// ---------------------------------------------------------------------------

interface ClusterTopologyProps {
  cluster: ClusterStatus | null
  replication: ReplicationStatus | null
  isLoading: boolean
  isBackendConnected: boolean
  /** Optional label shown above the diagram */
  title?: string
}

export const ClusterTopology: React.FC<ClusterTopologyProps> = ({
  cluster,
  replication,
  isLoading,
  isBackendConnected,
  title = 'Live Cluster Topology',
}) => {
  // ── Derive from real backend data ──────────────────────────────────────────

  const nodes = cluster?.nodes ?? []
  const primaryLsn = cluster?.current_primary_lsn ?? 0
  const replicaLagMap = new Map<string, ReplicaLagInfo>(
    (replication?.replicas ?? []).map((r) => [r.node_id, r])
  )

  // PRIMARY is determined purely by node.role === 'PRIMARY' from the backend.
  // After a promotion the previous node's role changes in the backend;
  // the component will reflect that automatically on the next poll.
  const primaryNode = nodes.find((n) => n.role === 'PRIMARY') ?? null

  // Replicas are all non-primary nodes (REPLICA or STANDBY)
  const replicaNodes = nodes.filter((n) => n.role !== 'PRIMARY')

  const enrichedPrimary: EnrichedNode | null = primaryNode
    ? { node: primaryNode, lag: null }
    : null

  const enrichedReplicas: EnrichedNode[] = replicaNodes.map((n) => ({
    node: n,
    lag: replicaLagMap.get(n.id) ?? null,
  }))

  // ── Loading / offline states ───────────────────────────────────────────────

  if (!isBackendConnected && nodes.length === 0) {
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-center">
        <WifiOff className="w-8 h-8 mx-auto mb-3 text-[#484f58]" />
        <p className="text-sm font-semibold text-[#e6edf3]">Backend Offline</p>
        <p className="text-xs text-[#7d8590] mt-1">
          Waiting for connection to <span className="font-mono">localhost:8000</span>
        </p>
      </div>
    )
  }

  if (isLoading && nodes.length === 0) {
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-center">
        <Inbox className="w-8 h-8 mx-auto mb-3 text-[#484f58] animate-pulse" />
        <p className="text-sm text-[#7d8590]">Fetching cluster topology…</p>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-8 text-center">
        <Inbox className="w-8 h-8 mx-auto mb-3 text-[#484f58]" />
        <p className="text-sm text-[#7d8590]">No nodes reported by cluster backend.</p>
      </div>
    )
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-5">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-semibold text-[#e6edf3]">{title}</h3>
          <p className="text-xs text-[#7d8590] mt-0.5">
            Derived from live backend telemetry · {nodes.length} node{nodes.length !== 1 ? 's' : ''}
            {cluster ? ` · Epoch ${cluster.current_epoch} · ${cluster.replication_mode}` : ''}
          </p>
        </div>
        {/* Cluster health indicator */}
        {cluster && (
          <span
            className={`
              inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border
              ${cluster.is_healthy
                ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                : 'bg-amber-950/50 border-amber-800/60 text-amber-300'}
            `}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                cluster.is_healthy ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {cluster.is_healthy ? 'HEALTHY' : 'DEGRADED'}
          </span>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Topology diagram                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col items-center gap-0">

        {/* PRIMARY row */}
        {enrichedPrimary ? (
          <div className="w-full max-w-xs sm:max-w-sm">
            <NodeCard
              enriched={enrichedPrimary}
              isPrimary
              primaryLsn={primaryLsn}
            />
          </div>
        ) : (
          /* No primary — e.g. election in progress */
          <div className="w-full max-w-xs sm:max-w-sm rounded-xl border border-dashed border-amber-700/60 bg-amber-950/10 p-5 text-center">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-500" />
            <p className="text-xs font-semibold text-amber-300 uppercase tracking-wide">No Primary</p>
            <p className="text-[11px] text-[#7d8590] mt-1">Election may be in progress</p>
          </div>
        )}

        {/* Connector from primary down to replica row */}
        {enrichedReplicas.length > 0 && (
          <div className="flex flex-col items-center py-1" aria-hidden="true">
            <div className="w-px h-4 bg-[#30363d]" />
            {/* Fan-out horizontal line only on wider screens; on mobile we skip it */}
            <div className="hidden sm:block w-px h-1 bg-[#30363d]" />
          </div>
        )}

        {/* REPLICAS row — horizontal on desktop, stacked on mobile */}
        {enrichedReplicas.length > 0 && (
          <>
            {/*
              Mobile: single vertical column of replica cards with individual links.
              Desktop (sm+): horizontal flex row.
              We use two separate layouts to avoid flex overflow on narrow screens.
            */}

            {/* ── Mobile layout ─────────────────────────────────────────── */}
            <div className="sm:hidden flex flex-col items-center gap-0 w-full">
              {enrichedReplicas.map((enriched) => {
                const active = isLinkActive(enriched.node.status, enriched.node.is_fenced)
                const hasLag = (enriched.lag?.lag_lsn ?? enriched.node.replication_lag_records) > 0
                return (
                  <div key={enriched.node.id} className="flex flex-col items-center w-full max-w-xs">
                    <ReplicationLink active={active} hasLag={hasLag} />
                    <NodeCard enriched={enriched} isPrimary={false} primaryLsn={primaryLsn} />
                  </div>
                )
              })}
            </div>

            {/* ── Desktop layout ────────────────────────────────────────── */}
            <div className="hidden sm:flex flex-row items-start justify-center gap-0">
              {enrichedReplicas.map((enriched, i) => {
                const active = isLinkActive(enriched.node.status, enriched.node.is_fenced)
                const hasLag = (enriched.lag?.lag_lsn ?? enriched.node.replication_lag_records) > 0
                const isFirst = i === 0
                const isLast  = i === enrichedReplicas.length - 1

                return (
                  <div key={enriched.node.id} className="flex flex-col items-center">
                    {/* Horizontal connector at top of each replica column */}
                    <div className="flex items-center w-full" aria-hidden="true">
                      {/* Left segment — connects to centre */}
                      <div
                        className={`h-px flex-1 ${isFirst ? 'bg-transparent' : 'bg-[#30363d]'}`}
                      />
                      {/* Vertical drop */}
                      <ReplicationLink active={active} hasLag={hasLag} />
                      {/* Right segment — connects to centre */}
                      <div
                        className={`h-px flex-1 ${isLast ? 'bg-transparent' : 'bg-[#30363d]'}`}
                      />
                    </div>

                    {/* Node card */}
                    <div className="px-3 pb-2">
                      <div
                        className="w-full"
                        style={{ minWidth: '180px', maxWidth: '240px' }}
                      >
                        <NodeCard
                          enriched={enriched}
                          isPrimary={false}
                          primaryLsn={primaryLsn}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="mt-5 pt-4 border-t border-[#21262d] flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-[#7d8590]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]" />
          HEALTHY
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          DEGRADED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          DOWN
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          FENCED
        </span>
        <span className="flex items-center gap-1.5 ml-auto text-[#484f58]">
          Polling every 2.5 s · no mock data
        </span>
      </div>
    </div>
  )
}
