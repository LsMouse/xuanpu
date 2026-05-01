import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSessions, type HubSessionListItem } from '../stores/useSessions'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { formatRelativeTime } from '../lib/time'
import {
  PullIndicator,
  SkeletonRows,
  EmptyState,
  ErrorBanner
} from './Devices'

interface Group {
  projectId: string
  projectName: string
  sessions: HubSessionListItem[]
}

const PROJECT_BADGE_STYLES = [
  {
    badge: 'bg-[linear-gradient(135deg,#fef3c7,#f59e0b_52%,#b45309)] text-amber-950',
    glow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(245,158,11,0.28)]'
  },
  {
    badge: 'bg-[linear-gradient(135deg,#dbeafe,#3b82f6_52%,#1d4ed8)] text-blue-950',
    glow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(59,130,246,0.28)]'
  },
  {
    badge: 'bg-[linear-gradient(135deg,#dcfce7,#22c55e_52%,#15803d)] text-emerald-950',
    glow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(34,197,94,0.28)]'
  },
  {
    badge: 'bg-[linear-gradient(135deg,#fce7f3,#ec4899_52%,#be185d)] text-pink-950',
    glow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(236,72,153,0.28)]'
  },
  {
    badge: 'bg-[linear-gradient(135deg,#ede9fe,#8b5cf6_52%,#6d28d9)] text-violet-950',
    glow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(139,92,246,0.28)]'
  },
  {
    badge: 'bg-[linear-gradient(135deg,#cffafe,#06b6d4_52%,#0f766e)] text-cyan-950',
    glow: 'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_10px_24px_rgba(6,182,212,0.28)]'
  }
] as const

function groupSessions(sessions: HubSessionListItem[]): Group[] {
  const map = new Map<string, Group>()
  for (const s of sessions) {
    const key = s.project.id
    let g = map.get(key)
    if (!g) {
      g = {
        projectId: s.project.id,
        projectName: s.project.name,
        sessions: []
      }
      map.set(key, g)
    }
    g.sessions.push(s)
  }
  return Array.from(map.values())
    .map((group) => ({
      ...group,
      sessions: [...group.sessions].sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    }))
    .sort((a, b) => {
      const aTime = new Date(a.sessions[0]?.updatedAt ?? 0).getTime()
      const bTime = new Date(b.sessions[0]?.updatedAt ?? 0).getTime()
      return bTime - aTime
    })
}

function getProjectInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s/_-]+/)
    .filter(Boolean)

  if (words.length === 0) return 'PJ'

  const initials = words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

  return initials || name.slice(0, 2).toUpperCase()
}

function getProjectBadgeStyle(name: string): (typeof PROJECT_BADGE_STYLES)[number] {
  const seed = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return PROJECT_BADGE_STYLES[seed % PROJECT_BADGE_STYLES.length]
}

export function Sessions(): React.JSX.Element {
  const { deviceId } = useParams<{ deviceId: string }>()
  const {
    byDevice,
    loadingSessionsFor,
    sessionsErrorFor,
    refreshSessions
  } = useSessions()

  const sessions = deviceId ? byDevice[deviceId] : undefined
  const loading = loadingSessionsFor === deviceId
  const error = deviceId ? sessionsErrorFor[deviceId] : null

  const visibleSessions = useMemo(
    () => sessions?.filter((s) => s.status !== 'archived') ?? [],
    [sessions]
  )
  const groups = useMemo(
    () => (visibleSessions.length > 0 ? groupSessions(visibleSessions) : []),
    [visibleSessions]
  )
  const { ref, pulling, refreshing } = usePullToRefresh(async () => {
    if (deviceId) await refreshSessions(deviceId)
  })

  useEffect(() => {
    if (deviceId) refreshSessions(deviceId)
  }, [deviceId, refreshSessions])

  return (
    <div
      ref={ref}
      className="mobile-page mobile-scroll h-dvh overflow-y-auto safe-pad-top safe-pad-bottom"
    >
      <header className="mobile-header px-4 py-3.5">
        <div className="flex items-center gap-3">
        <Link
          to="/devices"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zinc-900 text-xl text-zinc-300 active:bg-zinc-800"
          aria-label="返回"
        >
          ←
        </Link>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Sessions</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">会话</h1>
          </div>
        </div>
      </header>

      <PullIndicator pulling={pulling} refreshing={refreshing || loading} />

      <div className="space-y-4 px-4 py-4">
        {loading && !sessions && <SkeletonRows />}

        {error && <ErrorBanner message={error} onRetry={() => refreshSessions(deviceId!)} />}

        {!loading && !error && groups.length === 0 && (
          <EmptyState
            title="没有活跃会话"
            hint="在桌面端打开一个 Claude Code 会话。"
          />
        )}

        {groups.map((g) => (
          <GroupSection key={g.projectId} group={g} deviceId={deviceId!} />
        ))}
      </div>
    </div>
  )
}

function GroupSection({
  group,
  deviceId
}: {
  group: Group
  deviceId: string
}): React.JSX.Element {
  const badgeStyle = getProjectBadgeStyle(group.projectName)

  return (
    <section className="mobile-card rounded-[30px] p-3.5">
      <div className="mb-3 flex items-center gap-3 rounded-[22px] border border-zinc-800/70 bg-zinc-950/45 px-3 py-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] text-sm font-black tracking-[0.14em] ${badgeStyle.badge} ${badgeStyle.glow}`}
        >
          {getProjectInitials(group.projectName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-zinc-100">
            {group.projectName}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {group.sessions.length} 个会话
          </p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {group.sessions.map((s) => (
          <li key={s.hiveSessionId}>
            <Link
              to={`/session/${encodeURIComponent(deviceId)}/${encodeURIComponent(s.hiveSessionId)}`}
              className="block rounded-[22px] border border-zinc-800/70 bg-zinc-950/42 px-3.5 py-3.5 transition active:scale-[0.99] active:bg-zinc-800/80"
            >
              <div className="flex items-center gap-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-100">
                  {s.name ?? `会话 ${s.hiveSessionId.slice(0, 8)}`}
                </span>
                {s.runtimeStatus === 'busy' && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_9px_rgba(239,68,68,0.8)]"
                    title="运行中"
                  />
                )}
                {s.runtimeStatus === 'error' && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500"
                    title="出错"
                  />
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-sm text-zinc-500">
                <span className="min-w-0 truncate">
                  {s.worktree?.name || s.worktree?.path?.split('/').pop() || '未关联 worktree'}
                </span>
                <span className="shrink-0 text-xs">{formatRelativeTime(s.updatedAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
