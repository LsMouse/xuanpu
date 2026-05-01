import { describe, expect, it } from 'vitest'
import {
  HubTerminalRegistry,
  WS_OPEN,
  type HubTerminalSubscriber
} from '../../src/main/services/hub/hub-terminal-registry'

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

describe('hub-terminal-registry', () => {
  it('creates a worktree terminal session and tracks status', () => {
    const registry = new HubTerminalRegistry()

    const session = registry.ensureTerminal('wt-1', {
      terminalId: 'term-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })

    expect(session.worktreeId).toBe('wt-1')
    expect(session.status).toBe('connecting')
    expect(session.terminalId).toBe('term-1')
  })

  it('replays frames newer than lastSeq to reconnecting clients', () => {
    const registry = new HubTerminalRegistry()
    const session = registry.ensureTerminal('wt-1', {
      terminalId: 'term-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })

    registry.broadcast('wt-1', { type: 'terminal/status', seq: session.seq.next(), status: 'open' })
    registry.broadcast('wt-1', { type: 'terminal/output', seq: session.seq.next(), data: 'hello' })

    const replay = registry.replayAfter('wt-1', 1)
    expect(replay.ok).toBe(true)
    if (replay.ok) expect(replay.frames).toHaveLength(1)
  })

  it('subscribes and broadcasts to multiple clients', () => {
    const registry = new HubTerminalRegistry()
    const session = registry.ensureTerminal('wt-1', {
      terminalId: 'term-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })
    const a = makeWs()
    const b = makeWs()

    registry.subscribe('wt-1', a)
    registry.subscribe('wt-1', b)
    registry.broadcast('wt-1', { type: 'terminal/status', seq: session.seq.next(), status: 'open' })

    expect(a.sent).toHaveLength(1)
    expect(b.sent).toHaveLength(1)
  })
})
