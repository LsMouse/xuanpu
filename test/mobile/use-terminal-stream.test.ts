import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wsMock = vi.hoisted(() => {
  let latestSocket: { emitFrame: (frame: unknown) => void; sent: unknown[] } | null = null

  class MockTerminalWebSocket {
    private frameListeners = new Set<(frame: unknown) => void>()
    private stateListeners = new Set<(state: 'connecting' | 'open' | 'closed') => void>()
    sent: unknown[] = []

    constructor(_deviceId: string, _worktreeId: string) {
      latestSocket = this
    }

    connect(): void {
      for (const listener of this.stateListeners) listener('open')
    }

    destroy(): void {}

    send(frame: unknown): boolean {
      this.sent.push(frame)
      return true
    }

    onFrame(cb: (frame: unknown) => void): () => void {
      this.frameListeners.add(cb)
      return () => this.frameListeners.delete(cb)
    }

    onState(cb: (state: 'connecting' | 'open' | 'closed') => void): () => void {
      this.stateListeners.add(cb)
      cb('connecting')
      return () => this.stateListeners.delete(cb)
    }

    emitFrame(frame: unknown): void {
      for (const listener of this.frameListeners) listener(frame)
    }
  }

  return {
    MockTerminalWebSocket,
    getLatestSocket: () => latestSocket,
    reset: () => {
      latestSocket = null
    }
  }
})

vi.mock('../../mobile/src/api/terminal-ws', () => ({
  TerminalWebSocket: wsMock.MockTerminalWebSocket
}))

import { useTerminalStream } from '../../mobile/src/hooks/useTerminalStream'

describe('useTerminalStream', () => {
  beforeEach(() => {
    wsMock.reset()
  })

  it('hydrates snapshot and appends terminal output', () => {
    const { result } = renderHook(() => useTerminalStream('device-1', 'wt-1'))
    const socket = wsMock.getLatestSocket()

    act(() => {
      socket?.emitFrame({
        type: 'terminal/snapshot',
        seq: 1,
        worktreeId: 'wt-1',
        terminalId: 'wt-1',
        cwd: '/tmp/project',
        shell: '/bin/zsh',
        status: 'open',
        buffer: 'boot\n'
      })
      socket?.emitFrame({ type: 'terminal/output', seq: 2, data: 'next\n' })
    })

    expect(result.current.state.buffer).toBe('boot\nnext\n')
    expect(result.current.state.status).toBe('open')
  })
})
