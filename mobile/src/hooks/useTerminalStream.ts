import { useCallback, useEffect, useReducer, useRef } from 'react'
import {
  TerminalWebSocket,
  type TerminalClientFrame,
  type TerminalConnectionState,
  type TerminalServerFrame
} from '../api/terminal-ws'

interface TerminalState {
  buffer: string
  status: 'connecting' | 'open' | 'closed' | 'error'
  connection: TerminalConnectionState
  cwd: string | null
  shell: string | null
  terminalId: string | null
}

const INITIAL: TerminalState = {
  buffer: '',
  status: 'connecting',
  connection: 'connecting',
  cwd: null,
  shell: null,
  terminalId: null
}

type Action =
  | { type: 'frame'; frame: TerminalServerFrame }
  | { type: 'connection'; value: TerminalConnectionState }

function reducer(state: TerminalState, action: Action): TerminalState {
  if (action.type === 'connection') {
    return {
      ...state,
      connection: action.value
    }
  }

  const frame = action.frame
  switch (frame.type) {
    case 'terminal/snapshot':
      return {
        ...state,
        buffer: String(frame.buffer ?? ''),
        status: String(frame.status ?? 'connecting') as TerminalState['status'],
        cwd: typeof frame.cwd === 'string' ? frame.cwd : null,
        shell: typeof frame.shell === 'string' ? frame.shell : null,
        terminalId: typeof frame.terminalId === 'string' ? frame.terminalId : null
      }
    case 'terminal/output':
      return {
        ...state,
        buffer: state.buffer + String(frame.data ?? '')
      }
    case 'terminal/status':
      return {
        ...state,
        status: String(frame.status ?? 'connecting') as TerminalState['status']
      }
    case 'terminal/exit':
      return {
        ...state,
        status: 'closed'
      }
    case 'terminal/error':
      return {
        ...state,
        status: 'error'
      }
    default:
      return state
  }
}

export function useTerminalStream(deviceId: string, worktreeId: string): {
  state: TerminalState
  attach: (cwd: string, shell?: string, terminalId?: string) => void
  sendInput: (data: string) => boolean
  resize: (cols: number, rows: number) => boolean
  restart: () => boolean
  kill: () => boolean
} {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const wsRef = useRef<TerminalWebSocket | null>(null)
  const attachFrameRef = useRef<TerminalClientFrame | null>(null)

  useEffect(() => {
    attachFrameRef.current = null
    const ws = new TerminalWebSocket(deviceId, worktreeId)
    wsRef.current = ws
    const offFrame = ws.onFrame((frame) => dispatch({ type: 'frame', frame }))
    const offState = ws.onState((value) => dispatch({ type: 'connection', value }))
    ws.connect()
    return () => {
      offFrame()
      offState()
      ws.destroy()
      wsRef.current = null
      attachFrameRef.current = null
    }
  }, [deviceId, worktreeId])

  const flushAttach = useCallback((): boolean => {
    const frame = attachFrameRef.current
    if (!frame) return false
    return wsRef.current?.send(frame) ?? false
  }, [])

  useEffect(() => {
    if (state.connection === 'open') {
      flushAttach()
    }
  }, [flushAttach, state.connection])

  const attach = useCallback(
    (cwd: string, shell?: string, terminalId?: string): void => {
      attachFrameRef.current = {
        type: 'terminal/attach',
        cwd,
        ...(shell ? { shell } : {}),
        ...(terminalId ? { terminalId } : {})
      }
      flushAttach()
    },
    [flushAttach]
  )

  const sendInput = useCallback(
    (data: string): boolean => wsRef.current?.send({ type: 'terminal/input', data }) ?? false,
    []
  )
  const resize = useCallback(
    (cols: number, rows: number): boolean =>
      wsRef.current?.send({ type: 'terminal/resize', cols, rows }) ?? false,
    []
  )
  const restart = useCallback(
    (): boolean => wsRef.current?.send({ type: 'terminal/restart' }) ?? false,
    []
  )
  const kill = useCallback(
    (): boolean => wsRef.current?.send({ type: 'terminal/kill' }) ?? false,
    []
  )

  return {
    state,
    attach,
    sendInput,
    resize,
    restart,
    kill
  }
}
