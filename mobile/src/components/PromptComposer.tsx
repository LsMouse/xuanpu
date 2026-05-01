import { useEffect, useRef, useState } from 'react'
import type { SessionStream } from '../hooks/useSessionStream'

export function PromptComposer({
  stream,
  mode = 'model',
  onModeChange,
  shellDisabled = false
}: {
  stream: SessionStream
  mode?: 'model' | 'shell'
  onModeChange?: (mode: 'model' | 'shell') => void
  shellDisabled?: boolean
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const busy = stream.state.status === 'busy'
  const connected = stream.state.connection === 'open'

  // Auto-size textarea (1..6 lines).
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'
  }, [draft])

  const canSend = connected && !busy && draft.trim().length > 0

  const onSend = (): void => {
    if (!canSend) return
    stream.prompt(draft.trim())
    setDraft('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Desktop browsers: Enter to send, Shift+Enter for newline.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      onSend()
    }
  }

  return (
    <div className="border-t border-zinc-900/90 bg-zinc-950/92 backdrop-blur-xl safe-pad-bottom">
      <div className="p-2.5">
        <div className="rounded-[30px] border border-zinc-800/80 bg-zinc-900/88 shadow-[0_-12px_40px_rgba(0,0,0,0.3)]">
          <div className="flex items-center gap-2 px-3 pt-3">
            <button
              type="button"
              onClick={() => onModeChange?.('model')}
              className={
                'rounded-full px-3 py-1.5 text-xs transition ' +
                (mode === 'model'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'border border-zinc-800 text-zinc-400')
              }
            >
              模型
            </button>
            <button
              type="button"
              onClick={() => !shellDisabled && onModeChange?.('shell')}
              disabled={shellDisabled}
              className={
                'rounded-full px-3 py-1.5 text-xs transition ' +
                (mode === 'shell'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'border border-zinc-800 text-zinc-400') +
                (shellDisabled ? ' opacity-40' : '')
              }
            >
              Shell
            </button>
          </div>

          <div className="px-3 pt-3 pb-2">
            {mode === 'model' ? (
              <textarea
                ref={taRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={connected ? '输入消息…' : '连接中…'}
                disabled={!connected}
                rows={1}
                className="min-h-[48px] max-h-[32svh] w-full resize-none rounded-[22px] border border-zinc-800 bg-zinc-950 px-4 py-3.5 text-[16px] leading-6 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-600 disabled:opacity-60"
              />
            ) : (
              <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
                Shell 模式已启用，使用下方控制键与终端交互。
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-3 pb-3">
            <div className="min-w-0 text-xs leading-4 text-zinc-500">
              {mode === 'shell'
                ? shellDisabled
                  ? '当前会话未关联 worktree，无法使用 Shell'
                  : 'Shell 绑定当前 worktree'
                : busy
                  ? '正在生成回复，可随时中断'
                  : connected
                    ? 'Shift + Enter 换行'
                    : '等待连接恢复'}
            </div>

            {mode === 'shell' ? (
              <div className="inline-flex h-12 min-w-[92px] shrink-0 items-center justify-center rounded-full bg-zinc-800 px-5 text-sm font-semibold text-zinc-100">
                Shell
              </div>
            ) : busy ? (
              <button
                onClick={() => stream.interrupt()}
                className="inline-flex h-12 min-w-[92px] shrink-0 items-center justify-center rounded-full bg-red-900/70 px-5 text-sm font-semibold text-red-100 shadow-sm transition active:scale-[0.98] active:bg-red-900"
                title="中断"
              >
                中断
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!canSend}
                className="inline-flex h-12 min-w-[92px] shrink-0 items-center justify-center rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 shadow-sm transition active:scale-[0.98] active:bg-white disabled:opacity-40 disabled:active:scale-100"
              >
                发送
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
