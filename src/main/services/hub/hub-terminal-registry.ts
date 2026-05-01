import {
  TerminalMessageRingBuffer,
  TerminalSeqCounter,
  type TerminalServerMsg,
  type TerminalStatus
} from './hub-terminal-protocol'

export interface HubTerminalSubscriber {
  send(data: string): void
  readyState?: number
}

export const WS_OPEN = 1

export interface ActiveTerminalSession {
  worktreeId: string
  terminalId: string
  cwd: string
  shell: string
  buffer: string
  status: TerminalStatus
  seq: TerminalSeqCounter
  ringBuffer: TerminalMessageRingBuffer
  subscribers: Set<HubTerminalSubscriber>
}

export class HubTerminalRegistry {
  private readonly sessions = new Map<string, ActiveTerminalSession>()

  ensureTerminal(
    worktreeId: string,
    init: { terminalId: string; cwd: string; shell: string }
  ): ActiveTerminalSession {
    let session = this.sessions.get(worktreeId)
    if (!session) {
      session = {
        worktreeId,
        terminalId: init.terminalId,
        cwd: init.cwd,
        shell: init.shell,
        buffer: '',
        status: 'connecting',
        seq: new TerminalSeqCounter(),
        ringBuffer: new TerminalMessageRingBuffer(),
        subscribers: new Set()
      }
      this.sessions.set(worktreeId, session)
    }
    return session
  }

  getSession(worktreeId: string): ActiveTerminalSession | null {
    return this.sessions.get(worktreeId) ?? null
  }

  subscribe(worktreeId: string, ws: HubTerminalSubscriber): void {
    const session = this.sessions.get(worktreeId)
    if (!session) return
    session.subscribers.add(ws)
  }

  unsubscribe(worktreeId: string, ws: HubTerminalSubscriber): void {
    this.sessions.get(worktreeId)?.subscribers.delete(ws)
  }

  broadcast(worktreeId: string, frame: TerminalServerMsg): void {
    const session = this.sessions.get(worktreeId)
    if (!session) return
    if (frame.type === 'terminal/status') {
      session.status = frame.status
    } else if (frame.type === 'terminal/exit') {
      session.status = 'closed'
    } else if (frame.type === 'terminal/output') {
      session.buffer += frame.data
      if (session.buffer.length > 64 * 1024) {
        session.buffer = session.buffer.slice(-64 * 1024)
      }
    }
    session.ringBuffer.push(frame)
    const payload = JSON.stringify(frame)
    for (const ws of session.subscribers) {
      if (ws.readyState !== undefined && ws.readyState !== WS_OPEN) {
        session.subscribers.delete(ws)
        continue
      }
      try {
        ws.send(payload)
      } catch {
        session.subscribers.delete(ws)
      }
    }
  }

  replayAfter(worktreeId: string, lastSeq: number): { ok: true; frames: TerminalServerMsg[] } {
    return this.sessions.get(worktreeId)?.ringBuffer.replayAfter(lastSeq) ?? { ok: true, frames: [] }
  }
}
