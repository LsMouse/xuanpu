import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSessions } from '../stores/useSessions'
import { useAuth } from '../stores/useAuth'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { formatRelativeTime } from '../lib/time'

export function Devices(): React.JSX.Element {
  const { devices, loadingDevices, devicesError, refreshDevices } = useSessions()
  const { logout, username } = useAuth()
  const { ref, pulling, refreshing } = usePullToRefresh(refreshDevices)

  useEffect(() => {
    refreshDevices()
  }, [refreshDevices])

  return (
    <div
      ref={ref}
      className="mobile-page mobile-scroll h-dvh overflow-y-auto safe-pad-top safe-pad-bottom"
    >
      <header className="mobile-header px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Xuanpu Hub</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">设备</h1>
          </div>
        <button
          onClick={() => logout()}
          className="shrink-0 rounded-full border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-300 active:bg-zinc-800"
        >
          {username ? `${username} · 登出` : '登出'}
        </button>
        </div>
      </header>

      <PullIndicator pulling={pulling} refreshing={refreshing || loadingDevices} />

      <div className="space-y-3 px-4 py-4">
        {loadingDevices && devices.length === 0 && <SkeletonRows />}

        {devicesError && (
          <ErrorBanner message={devicesError} onRetry={refreshDevices} />
        )}

        {!loadingDevices && !devicesError && devices.length === 0 && (
          <EmptyState
            title="没有设备"
            hint="请确认桌面端 Hub 已开启。"
          />
        )}

        {devices.map((d) => (
          <Link
            key={d.id}
            to={`/sessions/${encodeURIComponent(d.id)}`}
            className="mobile-card block rounded-[26px] p-4 transition active:scale-[0.99] active:bg-zinc-800"
          >
            <div className="flex items-center gap-3">
              <span
                className={
                  d.online
                    ? 'h-3 w-3 shrink-0 rounded-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.65)]'
                    : 'h-3 w-3 shrink-0 rounded-full bg-zinc-600'
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-semibold text-zinc-100">{d.name}</p>
                <p className="mt-1 truncate text-sm text-zinc-500">
                  {d.hostname}
                  {!d.online && d.lastSeen
                    ? ` · 最后在线 ${formatRelativeTime(d.lastSeen)}`
                    : ''}
                </p>
              </div>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-800 text-lg text-zinc-400">›</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

// ─── shared bits ──────────────────────────────────────────────────────────

function PullIndicator({
  pulling,
  refreshing
}: {
  pulling: number
  refreshing: boolean
}): React.JSX.Element | null {
  if (!refreshing && pulling === 0) return null
  return (
    <div className="flex items-center justify-center py-2 text-sm text-zinc-500">
      {refreshing ? (
        <span>刷新中…</span>
      ) : (
        <span style={{ opacity: pulling }}>下拉刷新…</span>
      )}
    </div>
  )
}

function SkeletonRows(): React.JSX.Element {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-20 rounded-[26px] border border-zinc-800 bg-zinc-900 animate-pulse"
        />
      ))}
    </>
  )
}

function EmptyState({
  title,
  hint
}: {
  title: string
  hint: string
}): React.JSX.Element {
  return (
    <div className="mobile-card rounded-[28px] px-5 py-12 text-center text-zinc-500">
      <p className="text-lg font-semibold text-zinc-200">{title}</p>
      <p className="mt-2 text-sm leading-6">{hint}</p>
    </div>
  )
}

function ErrorBanner({
  message,
  onRetry
}: {
  message: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="rounded-[24px] border border-red-900/60 bg-red-950/35 p-4">
      <p className="text-base font-semibold text-red-200">加载失败</p>
      <p className="mt-1.5 break-words text-sm leading-6 text-red-300/80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 h-10 rounded-full bg-red-900/50 px-4 text-sm font-medium text-red-100 active:bg-red-800"
      >
        重试
      </button>
    </div>
  )
}

export { PullIndicator, SkeletonRows, EmptyState, ErrorBanner }
