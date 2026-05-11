import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useMemo, useRef, useState } from 'react'

export function MobileTerminalPane(props: {
  state: {
    buffer: string
    status: 'connecting' | 'open' | 'closed' | 'error'
    connection: 'connecting' | 'open' | 'closed'
    cwd: string | null
    shell: string | null
    terminalId: string | null
  }
  sendInput: (data: string) => boolean | void
  resize: (cols: number, rows: number) => void
  restart: () => void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const sendInputRef = useRef(props.sendInput)
  const resizeRef = useRef(props.resize)
  const [commandDraft, setCommandDraft] = useState('')

  useEffect(() => {
    sendInputRef.current = props.sendInput
  }, [props.sendInput])

  useEffect(() => {
    resizeRef.current = props.resize
  }, [props.resize])

  const controls = useMemo(
    () => [
      { label: 'Ctrl-C', value: '\u0003' },
      { label: 'Esc', value: '\u001b' },
      { label: 'Tab', value: '\t' },
      { label: '↑', value: '\u001b[A' },
      { label: '↓', value: '\u001b[B' },
      { label: '←', value: '\u001b[D' },
      { label: '→', value: '\u001b[C' }
    ],
    []
  )
  const canSendCommand =
    props.state.connection === 'open' &&
    props.state.status !== 'closed' &&
    props.state.status !== 'error' &&
    commandDraft.trim().length > 0

  const submitCommand = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!canSendCommand) return
    const sent = props.sendInput(`${commandDraft}\n`)
    if (sent !== false) setCommandDraft('')
  }

  useEffect(() => {
    if (!hostRef.current || terminalRef.current) return
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
    if (typeof ResizeObserver === 'undefined') return

    const terminal = new Terminal({
      fontFamily: 'Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      theme: {
        background: '#050507',
        foreground: '#f4f4f5',
        cursor: '#f4f4f5'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(hostRef.current)
    try {
      fitAddon.fit()
    } catch {
      /* ignore */
    }

    terminal.onData((data) => {
      sendInputRef.current(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        resizeRef.current(terminal.cols, terminal.rows)
      } catch {
        /* ignore */
      }
    })
    resizeObserver.observe(hostRef.current)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    terminal.reset()
    terminal.write(props.state.buffer)
  }, [props.state.buffer])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-zinc-900 px-3 py-2 text-xs text-zinc-500">
        {(props.state.cwd ?? '未连接') + ' · ' + (props.state.shell ?? 'shell')}
      </div>
      <div
        ref={hostRef}
        className="min-h-0 flex-1 overflow-hidden px-3 py-3"
        onPointerDown={() => terminalRef.current?.focus()}
      />
      <div className="border-t border-zinc-900 px-3 py-3">
        <form onSubmit={submitCommand} className="flex gap-2">
          <input
            value={commandDraft}
            onChange={(event) => setCommandDraft(event.target.value)}
            placeholder="输入 Shell 命令…"
            disabled={props.state.connection !== 'open'}
            className="min-w-0 flex-1 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-3 text-[16px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-600 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!canSendCommand}
            className="h-12 shrink-0 rounded-full bg-zinc-100 px-5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
          >
            发送
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {controls.map((control) => (
            <button
              key={control.label}
              type="button"
              onClick={() => props.sendInput(control.value)}
              className="rounded-full border border-zinc-800 px-3 py-2 text-xs text-zinc-200"
            >
              {control.label}
            </button>
          ))}
          <button
            type="button"
            onClick={props.restart}
            className="rounded-full bg-zinc-800 px-3 py-2 text-xs text-zinc-100"
          >
            重启 Shell
          </button>
        </div>
      </div>
    </div>
  )
}
