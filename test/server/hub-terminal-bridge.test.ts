import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/services/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

import { HubTerminalBridge } from '../../src/main/services/hub/hub-terminal-bridge'
import { HubTerminalRegistry, WS_OPEN, type HubTerminalSubscriber } from '../../src/main/services/hub/hub-terminal-registry'

function makeWs(): HubTerminalSubscriber & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    sent,
    readyState: WS_OPEN,
    send(data: string) {
      sent.push(JSON.parse(data))
    }
  }
}

describe('hub-terminal-bridge', () => {
  let registry: HubTerminalRegistry
  let pty: {
    has: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    onExit: ReturnType<typeof vi.fn>
  }
  let emitData: ((data: string) => void) | null

  beforeEach(() => {
    registry = new HubTerminalRegistry()
    emitData = null
    pty = {
      has: vi.fn(() => false),
      create: vi.fn(() => ({ cols: 80, rows: 24 })),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      onData: vi.fn((_id, cb) => {
        emitData = cb
        return () => {}
      }),
      onExit: vi.fn((_id, _cb) => () => {})
    }
  })

  it('attaches and creates a terminal when missing', async () => {
    const bridge = new HubTerminalBridge({ registry, ptyService: pty as never })
    const ws = makeWs()

    await bridge.handleClientMessage(ws, 'wt-1', {
      type: 'terminal/attach',
      terminalId: 'wt-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })

    expect(pty.create).toHaveBeenCalledWith('wt-1', {
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })
    expect(ws.sent[0]).toMatchObject({ type: 'terminal/snapshot', worktreeId: 'wt-1' })
    emitData?.('hello')
    expect(ws.sent[1]).toMatchObject({ type: 'terminal/status', status: 'open' })
    expect(ws.sent[2]).toMatchObject({ type: 'terminal/output', data: 'hello' })
  })

  it('wires terminal output when attaching to an existing PTY', async () => {
    pty.has.mockReturnValue(true)
    const bridge = new HubTerminalBridge({ registry, ptyService: pty as never })
    const ws = makeWs()

    await bridge.handleClientMessage(ws, 'wt-1', {
      type: 'terminal/attach',
      terminalId: 'wt-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })

    expect(pty.create).not.toHaveBeenCalled()
    expect(pty.onData).toHaveBeenCalledWith('wt-1', expect.any(Function))
    emitData?.('ready\n')
    expect(ws.sent.at(-1)).toMatchObject({ type: 'terminal/output', data: 'ready\n' })
  })

  it('writes terminal input to the PTY', async () => {
    const bridge = new HubTerminalBridge({ registry, ptyService: pty as never })
    const ws = makeWs()
    registry.ensureTerminal('wt-1', {
      terminalId: 'wt-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })

    await bridge.handleClientMessage(ws, 'wt-1', { type: 'terminal/input', data: 'ls\n' })
    expect(pty.write).toHaveBeenCalledWith('wt-1', 'ls\n')
  })
})
