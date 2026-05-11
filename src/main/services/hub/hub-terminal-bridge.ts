import { createLogger } from '../logger'
import {
  TerminalClientMsgSchema,
  type TerminalClientMsg,
  type TerminalServerMsg
} from './hub-terminal-protocol'
import {
  HubTerminalRegistry,
  type HubTerminalSubscriber
} from './hub-terminal-registry'

const log = createLogger({ component: 'HubTerminalBridge' })

interface TerminalPtyService {
  has(id: string): boolean
  create(id: string, opts: { cwd: string; shell?: string }): { cols: number; rows: number }
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  destroy(id: string): void
  onData(id: string, cb: (data: string) => void): () => void
  onExit(id: string, cb: (code: number, signal: number) => void): () => void
}

export class HubTerminalBridge {
  private readonly terminalListenerCleanups = new Map<
    string,
    { removeData: () => void; removeExit: () => void }
  >()

  constructor(
    private readonly deps: {
      registry: HubTerminalRegistry
      ptyService: TerminalPtyService
    }
  ) {}

  attachClient(ws: HubTerminalSubscriber, _deviceId: string, worktreeId: string): void {
    this.deps.registry.subscribe(worktreeId, ws)
  }

  detachClient(ws: HubTerminalSubscriber, worktreeId: string): void {
    this.deps.registry.unsubscribe(worktreeId, ws)
  }

  async handleClientMessage(
    ws: HubTerminalSubscriber,
    worktreeId: string,
    raw: unknown
  ): Promise<void> {
    let msg: TerminalClientMsg
    try {
      msg = TerminalClientMsgSchema.parse(raw)
    } catch (err) {
      this.emitError(
        ws,
        'BAD_REQUEST',
        err instanceof Error ? err.message : 'invalid terminal message'
      )
      return
    }

    switch (msg.type) {
      case 'terminal/attach': {
        const terminalId = msg.terminalId ?? worktreeId
        const shell = msg.shell ?? '/bin/zsh'
        const session = this.deps.registry.ensureTerminal(worktreeId, {
          terminalId,
          cwd: msg.cwd,
          shell
        })
        this.deps.registry.subscribe(worktreeId, ws)

        if (!this.deps.ptyService.has(terminalId)) {
          this.deps.ptyService.create(terminalId, {
            cwd: msg.cwd,
            shell
          })
        }
        this.wirePtyListeners(worktreeId, terminalId, session)

        ws.send(
          JSON.stringify({
            type: 'terminal/snapshot',
            seq: session.seq.current(),
            worktreeId,
            terminalId,
            cwd: msg.cwd,
            shell,
            status: session.status,
            buffer: session.buffer
          } satisfies TerminalServerMsg)
        )
        return
      }
      case 'terminal/input': {
        const terminalId = this.deps.registry.getSession(worktreeId)?.terminalId ?? worktreeId
        this.deps.ptyService.write(terminalId, msg.data)
        return
      }
      case 'terminal/resize': {
        const terminalId = this.deps.registry.getSession(worktreeId)?.terminalId ?? worktreeId
        this.deps.ptyService.resize(terminalId, msg.cols, msg.rows)
        return
      }
      case 'terminal/restart': {
        const session = this.deps.registry.getSession(worktreeId)
        const terminalId = session?.terminalId ?? worktreeId
        this.deps.ptyService.destroy(terminalId)
        this.removePtyListeners(terminalId)
        if (session) {
          session.buffer = ''
          session.status = 'connecting'
          this.deps.ptyService.create(terminalId, {
            cwd: session.cwd,
            shell: session.shell
          })
          this.wirePtyListeners(worktreeId, terminalId, session)
        }
        return
      }
      case 'terminal/kill': {
        const terminalId = this.deps.registry.getSession(worktreeId)?.terminalId ?? worktreeId
        this.deps.ptyService.destroy(terminalId)
        this.removePtyListeners(terminalId)
        return
      }
      case 'terminal/resume': {
        const replay = this.deps.registry.replayAfter(worktreeId, msg.lastSeq)
        for (const frame of replay.frames) {
          ws.send(JSON.stringify(frame))
        }
        return
      }
      default:
        return
    }
  }

  private emitError(
    ws: HubTerminalSubscriber,
    code: 'BAD_REQUEST' | 'INTERNAL',
    message?: string
  ): void {
    try {
      ws.send(JSON.stringify({ type: 'terminal/error', code, message }))
    } catch {
      log.warn('failed to send terminal error', { code, message })
    }
  }

  private wirePtyListeners(
    worktreeId: string,
    terminalId: string,
    session: ReturnType<HubTerminalRegistry['ensureTerminal']>
  ): void {
    if (this.terminalListenerCleanups.has(terminalId)) return

    const removeData = this.deps.ptyService.onData(terminalId, (data) => {
      const statusFrame: TerminalServerMsg = {
        type: 'terminal/status',
        seq: session.seq.next(),
        status: 'open'
      }
      if (session.status !== 'open') {
        session.status = 'open'
        this.deps.registry.broadcast(worktreeId, statusFrame)
      }
      const outputFrame: TerminalServerMsg = {
        type: 'terminal/output',
        seq: session.seq.next(),
        data
      }
      this.deps.registry.broadcast(worktreeId, outputFrame)
    })
    const removeExit = this.deps.ptyService.onExit(terminalId, (code, signal) => {
      const exitFrame: TerminalServerMsg = {
        type: 'terminal/exit',
        seq: session.seq.next(),
        exitCode: code,
        signal
      }
      this.deps.registry.broadcast(worktreeId, exitFrame)
      this.terminalListenerCleanups.delete(terminalId)
    })
    this.terminalListenerCleanups.set(terminalId, { removeData, removeExit })
  }

  private removePtyListeners(terminalId: string): void {
    const cleanup = this.terminalListenerCleanups.get(terminalId)
    if (!cleanup) return
    cleanup.removeData()
    cleanup.removeExit()
    this.terminalListenerCleanups.delete(terminalId)
  }
}
