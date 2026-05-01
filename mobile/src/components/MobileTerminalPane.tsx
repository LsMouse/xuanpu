import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useEffect, useMemo, useRef } from 'react'

export function MobileTerminalPane(props: {
  state: {
    buffer: string
    status: 'connecting' | 'open' | 'closed' | 'error'
    connection: 'connecting' | 'open' | 'closed'
    cwd: string | null
    shell: string | null
    terminalId: string | null
  }
  sendInput: (data: string) => void
  resize: (cols: number, rows: number) => void
  restart: () => void
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

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
      props.sendInput(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        props.resize(terminal.cols, terminal.rows)
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
  }, [props])

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
      <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden px-3 py-3" />
      <div className="flex flex-wrap gap-2 border-t border-zinc-900 px-3 py-3">
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
  )
}
