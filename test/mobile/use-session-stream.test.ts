import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const wsMock = vi.hoisted(() => {
  let latestSocket: {
    sent: unknown[]
    emitFrame: (frame: unknown) => void
  } | null = null

  class MockHubWebSocket {
    readonly sent: unknown[] = []
    private frameListeners = new Set<(frame: unknown) => void>()
    private stateListeners = new Set<(state: 'connecting' | 'open' | 'closed') => void>()

    constructor(
      _deviceId: string,
      _hiveSessionId: string
    ) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      latestSocket = this
    }

    connect(): void {
      this.emitState('open')
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

    private emitState(state: 'connecting' | 'open' | 'closed'): void {
      for (const listener of this.stateListeners) listener(state)
    }
  }

  return {
    getLatestSocket: () => latestSocket,
    reset: () => {
      latestSocket = null
    },
    MockHubWebSocket
  }
})

vi.mock('../../mobile/src/api/ws', () => ({
  HubWebSocket: wsMock.MockHubWebSocket
}))

import { useSessionStream } from '../../mobile/src/hooks/useSessionStream'

describe('useSessionStream', () => {
  beforeEach(() => {
    wsMock.reset()
  })

  it('clears pending plan and command approval cards on session snapshot', () => {
    const { result } = renderHook(() => useSessionStream('device-1', 'hive-1'))
    const latestSocket = wsMock.getLatestSocket()
    expect(latestSocket).not.toBeNull()

    act(() => {
      latestSocket?.emitFrame({
        type: 'plan/request',
        seq: 1,
        requestId: 'plan-1',
        planText: 'Do the thing'
      })
      latestSocket?.emitFrame({
        type: 'command_approval/request',
        seq: 2,
        requestId: 'cmd-1',
        command: 'rm -rf /tmp/foo'
      })
    })

    expect(result.current.state.plan?.requestId).toBe('plan-1')
    expect(result.current.state.commandApproval?.requestId).toBe('cmd-1')

    act(() => {
      latestSocket?.emitFrame({
        type: 'session/snapshot',
        seq: 3,
        status: 'idle',
        lastSeq: 3,
        messages: []
      })
    })

    expect(result.current.state.plan).toBeNull()
    expect(result.current.state.commandApproval).toBeNull()
  })

  it('ignores duplicate message/append frames for the same message id', () => {
    const { result } = renderHook(() => useSessionStream('device-1', 'hive-1'))
    const latestSocket = wsMock.getLatestSocket()
    expect(latestSocket).not.toBeNull()

    const message = {
      id: 'msg-1',
      role: 'assistant' as const,
      ts: 1_700_000_000_000,
      seq: 1,
      parts: [{ type: 'text' as const, text: 'hello' }]
    }

    act(() => {
      latestSocket?.emitFrame({
        type: 'message/append',
        seq: 1,
        message
      })
      latestSocket?.emitFrame({
        type: 'message/append',
        seq: 2,
        message
      })
    })

    expect(result.current.state.messages).toEqual([message])
  })

  it('appends an optimistic user bubble immediately when prompt is sent', () => {
    const { result } = renderHook(() => useSessionStream('device-1', 'hive-1'))
    const latestSocket = wsMock.getLatestSocket()
    expect(latestSocket).not.toBeNull()

    act(() => {
      result.current.prompt('hello from phone')
    })

    expect(latestSocket?.sent[0]).toMatchObject({
      type: 'prompt',
      text: 'hello from phone'
    })
    expect(result.current.state.messages).toHaveLength(1)
    expect(result.current.state.messages[0]).toMatchObject({
      id: expect.stringMatching(/^local-cm-/),
      role: 'user',
      parts: [{ type: 'text', text: 'hello from phone' }]
    })
  })

  it('replaces the local optimistic bubble when the server echoes the mobile prompt', () => {
    const { result } = renderHook(() => useSessionStream('device-1', 'hive-1'))
    const latestSocket = wsMock.getLatestSocket()
    expect(latestSocket).not.toBeNull()

    act(() => {
      result.current.prompt('hello from phone')
    })

    const promptFrame = latestSocket?.sent[0] as { clientMsgId: string }
    expect(result.current.state.messages[0]?.id).toBe(`local-${promptFrame.clientMsgId}`)

    act(() => {
      latestSocket?.emitFrame({
        type: 'message/append',
        seq: 1,
        message: {
          id: `mobile-${promptFrame.clientMsgId}`,
          role: 'user',
          ts: 1_700_000_000_000,
          seq: 1,
          parts: [{ type: 'text', text: 'hello from phone' }]
        }
      })
    })

    expect(result.current.state.messages).toHaveLength(1)
    expect(result.current.state.messages[0]).toMatchObject({
      id: `mobile-${promptFrame.clientMsgId}`,
      role: 'user',
      parts: [{ type: 'text', text: 'hello from phone' }]
    })
  })
})
