import { getApiBase } from './client'

export type TerminalConnectionState = 'connecting' | 'open' | 'closed'

export interface TerminalServerFrame {
  type: string
  seq?: number
  [key: string]: unknown
}

export interface TerminalClientFrame {
  type: string
  [key: string]: unknown
}

export type TerminalFrameListener = (frame: TerminalServerFrame) => void
export type TerminalStateListener = (state: TerminalConnectionState) => void

const MAX_BACKOFF_MS = 10_000

function terminalWsUrl(deviceId: string, worktreeId: string): string {
  const base = getApiBase()
  const u = new URL(base)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = `/ws/terminal/${encodeURIComponent(deviceId)}/${encodeURIComponent(worktreeId)}`
  u.search = ''
  return u.toString()
}

export class TerminalWebSocket {
  private ws: WebSocket | null = null
  private lastSeq = 0
  private backoff = 1000
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private destroyed = false
  private _state: TerminalConnectionState = 'closed'
  private readonly frameListeners = new Set<TerminalFrameListener>()
  private readonly stateListeners = new Set<TerminalStateListener>()

  constructor(
    private readonly deviceId: string,
    private readonly worktreeId: string
  ) {}

  get state(): TerminalConnectionState {
    return this._state
  }

  connect(): void {
    if (this.destroyed) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    this.setState('connecting')
    let ws: WebSocket
    try {
      ws = new WebSocket(terminalWsUrl(this.deviceId, this.worktreeId))
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 1000
      this.setState('open')
      if (this.lastSeq > 0) {
        this.send({ type: 'terminal/resume', lastSeq: this.lastSeq })
      }
    }
    ws.onmessage = (e) => {
      let frame: TerminalServerFrame
      try {
        frame = JSON.parse(e.data as string) as TerminalServerFrame
      } catch {
        return
      }
      if (typeof frame.seq === 'number' && frame.seq > this.lastSeq) {
        this.lastSeq = frame.seq
      }
      for (const listener of this.frameListeners) {
        listener(frame)
      }
    }
    ws.onclose = () => {
      this.ws = null
      this.setState('closed')
      this.scheduleReconnect()
    }
  }

  send(frame: TerminalClientFrame): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    try {
      this.ws.send(JSON.stringify(frame))
      return true
    } catch {
      return false
    }
  }

  destroy(): void {
    this.destroyed = true
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
  }

  onFrame(cb: TerminalFrameListener): () => void {
    this.frameListeners.add(cb)
    return () => this.frameListeners.delete(cb)
  }

  onState(cb: TerminalStateListener): () => void {
    this.stateListeners.add(cb)
    cb(this._state)
    return () => this.stateListeners.delete(cb)
  }

  private setState(state: TerminalConnectionState): void {
    if (this._state === state) return
    this._state = state
    for (const listener of this.stateListeners) {
      listener(state)
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return
    if (this.retryTimer) return
    const delay = this.backoff
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
  }
}
