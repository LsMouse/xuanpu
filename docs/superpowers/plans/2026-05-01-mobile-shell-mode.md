# Mobile Shell Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a worktree-scoped full terminal mode to the mobile session page, while keeping model chat as the default mode.

**Architecture:** Keep Hub chat and terminal traffic on separate websocket protocols. Implement a dedicated Hub terminal bridge and registry on the main side, then add a mobile terminal pane with a local `model | shell` mode switch in the session page.

**Tech Stack:** Electron main IPC, node-pty, ws, React 19, TypeScript, Zustand, xterm.js, Vitest

---

## File Map

### New files

- `src/main/services/hub/hub-terminal-protocol.ts`
  - Terminal websocket protocol types, schemas, ring buffer types, and helpers.
- `src/main/services/hub/hub-terminal-registry.ts`
  - Worktree-scoped terminal instances, subscribers, sequence counters, and replay state.
- `src/main/services/hub/hub-terminal-bridge.ts`
  - Bridges mobile terminal websocket messages to `ptyService`.
- `mobile/src/api/terminal-ws.ts`
  - Mobile websocket client for terminal traffic.
- `mobile/src/hooks/useTerminalStream.ts`
  - Mobile terminal state, reconnect, and actions.
- `mobile/src/components/MobileTerminalPane.tsx`
  - Full terminal rendering and control strip for mobile shell mode.
- `test/server/hub-terminal-registry.test.ts`
  - Backend unit tests for terminal registry behavior.
- `test/server/hub-terminal-bridge.test.ts`
  - Backend unit tests for attach/input/resize/restart/replay.
- `test/mobile/use-terminal-stream.test.ts`
  - Mobile hook tests for terminal frame handling.
- `test/mobile/mobile-terminal-pane.test.tsx`
  - Mobile terminal UI tests.
- `test/mobile/session-shell-mode.test.tsx`
  - Session page mode-switch behavior tests.

### Modified files

- `src/main/services/hub/hub-server.ts`
  - Add `/ws/terminal/:deviceId/:worktreeId` upgrade path.
- `src/main/services/hub/hub-controller.ts`
  - Construct terminal bridge alongside chat bridge.
- `src/main/services/pty-service.ts`
  - Add lightweight helpers for output replay bootstrap if needed.
- `mobile/src/routes/SessionDetail.tsx`
  - Add local mode state and conditional model/shell rendering.
- `mobile/src/components/PromptComposer.tsx`
  - Add mode switch and shell-mode control presentation.
- `mobile/src/stores/useSessions.ts`
  - Ensure worktree metadata is available/consumable for shell eligibility.
- `mobile/src/styles.css`
  - Add shell-pane and mobile terminal styling.

---

### Task 1: Add backend terminal protocol and registry

**Files:**
- Create: `src/main/services/hub/hub-terminal-protocol.ts`
- Create: `src/main/services/hub/hub-terminal-registry.ts`
- Test: `test/server/hub-terminal-registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
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
    registry.ensureTerminal('wt-1', {
      terminalId: 'term-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })

    registry.broadcast('wt-1', { type: 'terminal/status', seq: 1, status: 'open' })
    registry.broadcast('wt-1', { type: 'terminal/output', seq: 2, data: 'hello' })

    const replay = registry.replayAfter('wt-1', 1)
    expect(replay.ok).toBe(true)
    if (replay.ok) expect(replay.frames).toHaveLength(1)
  })

  it('subscribes and broadcasts to multiple clients', () => {
    const registry = new HubTerminalRegistry()
    registry.ensureTerminal('wt-1', {
      terminalId: 'term-1',
      cwd: '/tmp/project',
      shell: '/bin/zsh'
    })
    const a = makeWs()
    const b = makeWs()

    registry.subscribe('wt-1', a)
    registry.subscribe('wt-1', b)
    registry.broadcast('wt-1', { type: 'terminal/status', seq: 1, status: 'open' })

    expect(a.sent).toHaveLength(1)
    expect(b.sent).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/server/hub-terminal-registry.test.ts`

Expected: FAIL with missing files or missing exports for `HubTerminalRegistry`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/services/hub/hub-terminal-protocol.ts
import { z } from 'zod'

export const TerminalStatusSchema = z.enum(['connecting', 'open', 'closed', 'error'])
export type TerminalStatus = z.infer<typeof TerminalStatusSchema>

export const TerminalServerMsgSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('terminal/snapshot'),
    seq: z.number().int().nonnegative(),
    worktreeId: z.string(),
    terminalId: z.string(),
    cwd: z.string(),
    shell: z.string(),
    status: TerminalStatusSchema,
    buffer: z.string()
  }),
  z.object({
    type: z.literal('terminal/output'),
    seq: z.number().int().nonnegative(),
    data: z.string()
  }),
  z.object({
    type: z.literal('terminal/status'),
    seq: z.number().int().nonnegative(),
    status: TerminalStatusSchema
  }),
  z.object({
    type: z.literal('terminal/exit'),
    seq: z.number().int().nonnegative(),
    exitCode: z.number().int().nullable(),
    signal: z.number().int().nullable().optional()
  }),
  z.object({
    type: z.literal('terminal/error'),
    seq: z.number().int().nonnegative().optional(),
    code: z.string(),
    message: z.string().optional()
  })
])
export type TerminalServerMsg = z.infer<typeof TerminalServerMsgSchema>

export class TerminalSeqCounter {
  private cur = 0
  next(): number {
    this.cur += 1
    return this.cur
  }
  current(): number {
    return this.cur
  }
}

export class TerminalMessageRingBuffer {
  private readonly frames: TerminalServerMsg[] = []
  push(frame: TerminalServerMsg): void {
    this.frames.push(frame)
    if (this.frames.length > 500) this.frames.shift()
  }
  replayAfter(lastSeq: number): { ok: true; frames: TerminalServerMsg[] } {
    return { ok: true, frames: this.frames.filter((frame) => (frame.seq ?? -1) > lastSeq) }
  }
}
```

```ts
// src/main/services/hub/hub-terminal-registry.ts
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
        status: 'connecting',
        seq: new TerminalSeqCounter(),
        ringBuffer: new TerminalMessageRingBuffer(),
        subscribers: new Set()
      }
      this.sessions.set(worktreeId, session)
    }
    return session
  }

  subscribe(worktreeId: string, ws: HubTerminalSubscriber): void {
    this.sessions.get(worktreeId)?.subscribers.add(ws)
  }

  unsubscribe(worktreeId: string, ws: HubTerminalSubscriber): void {
    this.sessions.get(worktreeId)?.subscribers.delete(ws)
  }

  broadcast(worktreeId: string, frame: TerminalServerMsg): void {
    const session = this.sessions.get(worktreeId)
    if (!session) return
    session.ringBuffer.push(frame)
    const payload = JSON.stringify(frame)
    for (const ws of session.subscribers) {
      if (ws.readyState !== undefined && ws.readyState !== WS_OPEN) continue
      ws.send(payload)
    }
  }

  replayAfter(worktreeId: string, lastSeq: number): { ok: true; frames: TerminalServerMsg[] } {
    return this.sessions.get(worktreeId)?.ringBuffer.replayAfter(lastSeq) ?? { ok: true, frames: [] }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/server/hub-terminal-registry.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/hub/hub-terminal-protocol.ts src/main/services/hub/hub-terminal-registry.ts test/server/hub-terminal-registry.test.ts
git commit -m "feat: add hub terminal protocol registry"
```

### Task 2: Add terminal bridge between mobile websocket and PTY

**Files:**
- Create: `src/main/services/hub/hub-terminal-bridge.ts`
- Modify: `src/main/services/pty-service.ts`
- Test: `test/server/hub-terminal-bridge.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

  beforeEach(() => {
    registry = new HubTerminalRegistry()
    pty = {
      has: vi.fn(() => false),
      create: vi.fn(() => ({ cols: 80, rows: 24 })),
      write: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
      onData: vi.fn((_id, cb) => {
        cb('hello')
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run test/server/hub-terminal-bridge.test.ts`

Expected: FAIL with missing module or missing `HubTerminalBridge`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/main/services/hub/hub-terminal-bridge.ts
import { createLogger } from '../logger'
import { HubTerminalRegistry, type HubTerminalSubscriber } from './hub-terminal-registry'
import type { TerminalServerMsg } from './hub-terminal-protocol'

const log = createLogger({ component: 'HubTerminalBridge' })

export class HubTerminalBridge {
  constructor(
    private readonly deps: {
      registry: HubTerminalRegistry
      ptyService: {
        has(id: string): boolean
        create(id: string, opts: { cwd: string; shell?: string }): { cols: number; rows: number }
        write(id: string, data: string): void
        resize(id: string, cols: number, rows: number): void
        destroy(id: string): void
        onData(id: string, cb: (data: string) => void): () => void
        onExit(id: string, cb: (code: number) => void): () => void
      }
    }
  ) {}

  async handleClientMessage(
    ws: HubTerminalSubscriber,
    worktreeId: string,
    msg: Record<string, unknown>
  ): Promise<void> {
    switch (msg.type) {
      case 'terminal/attach': {
        const terminalId = String(msg.terminalId ?? worktreeId)
        const cwd = String(msg.cwd ?? '')
        const shell = String(msg.shell ?? '/bin/zsh')
        const session = this.deps.registry.ensureTerminal(worktreeId, {
          terminalId,
          cwd,
          shell
        })
        this.deps.registry.subscribe(worktreeId, ws)
        if (!this.deps.ptyService.has(terminalId)) {
          this.deps.ptyService.create(terminalId, { cwd, shell })
          this.deps.ptyService.onData(terminalId, (data) => {
            const frame: TerminalServerMsg = {
              type: 'terminal/output',
              seq: session.seq.next(),
              data
            }
            session.status = 'open'
            this.deps.registry.broadcast(worktreeId, frame)
          })
          this.deps.ptyService.onExit(terminalId, (code) => {
            const frame: TerminalServerMsg = {
              type: 'terminal/exit',
              seq: session.seq.next(),
              exitCode: code,
              signal: null
            }
            session.status = 'closed'
            this.deps.registry.broadcast(worktreeId, frame)
          })
        }
        ws.send(
          JSON.stringify({
            type: 'terminal/snapshot',
            seq: session.seq.current(),
            worktreeId,
            terminalId,
            cwd,
            shell,
            status: session.status,
            buffer: ''
          })
        )
        return
      }
      case 'terminal/input':
        this.deps.ptyService.write(worktreeId, String(msg.data ?? ''))
        return
      case 'terminal/resize':
        this.deps.ptyService.resize(
          worktreeId,
          Number(msg.cols ?? 80),
          Number(msg.rows ?? 24)
        )
        return
      case 'terminal/restart':
        this.deps.ptyService.destroy(worktreeId)
        return
      case 'terminal/kill':
        this.deps.ptyService.destroy(worktreeId)
        return
      default:
        log.warn('unknown terminal client message', { worktreeId, type: msg.type })
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run test/server/hub-terminal-bridge.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/services/hub/hub-terminal-bridge.ts test/server/hub-terminal-bridge.test.ts
git commit -m "feat: add hub terminal bridge"
```

### Task 3: Expose terminal websocket route through Hub server

**Files:**
- Modify: `src/main/services/hub/hub-server.ts`
- Modify: `src/main/services/hub/hub-controller.ts`
- Test: `test/server/hub-server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { IncomingMessage } from 'http'
import { describe, expect, it, vi } from 'vitest'
import {
  createHubServer
} from '../../src/main/services/hub/hub-server'
import { HubRegistry } from '../../src/main/services/hub/hub-registry'

it('routes terminal websocket upgrades to the terminal bridge', async () => {
  const db = makeDb()
  const registry = new HubRegistry({ localDeviceId: 'dev-local', localDeviceName: 'laptop' })
  const terminalAttach = vi.fn()
  const server = createHubServer({
    db,
    registry,
    bridge: {
      getHistorySnapshot: vi.fn(() => []),
      handleClientMessage: vi.fn(async () => undefined)
    } as never,
    terminalBridge: {
      attachClient: terminalAttach
    } as never
  })

  const attachClient = (
    server as unknown as {
      attachTerminalClient: (
        ws: { send(data: string): void; on(event: string, cb: (...args: unknown[]) => void): void; readyState: number },
        deviceId: string,
        worktreeId: string,
        terminalBridge: { attachClient: (...args: unknown[]) => void }
      ) => void
    }
  ).attachTerminalClient

  const ws = {
    readyState: 1,
    send: vi.fn(),
    on: vi.fn()
  }

  attachClient(ws, 'dev-local', 'wt-1', { attachClient: terminalAttach })

  expect(terminalAttach).toHaveBeenCalledWith(ws, 'dev-local', 'wt-1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/server/hub-server.test.ts`

Expected: FAIL because no terminal websocket route exists.

- [ ] **Step 3: Write minimal implementation**

```ts
// In hub-server.ts add:
export interface HubServerOptions {
  db: Database
  registry: HubRegistry
  bridge?: HubBridge
  terminalBridge?: HubTerminalBridge
  getMobileDistRoot?: () => string | null
  now?: () => number
  rateLimiter?: LoginRateLimiter
}

private handleUpgrade(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  wss: WebSocketServer
): void {
  const url = req.url ?? ''
  const chatMatch = url.match(/^\/ws\/ui\/([^/?]+)\/([^/?]+)/)
  const terminalMatch = url.match(/^\/ws\/terminal\/([^/?]+)\/([^/?]+)/)
  if (!chatMatch && !terminalMatch) {
    this.rejectUpgrade(socket, '404 Not Found')
    return
  }
  if (!isOriginAllowed(req.headers, this.allowedOrigins())) {
    this.rejectUpgrade(socket, '403 Forbidden')
    return
  }
  const user = resolveAuth(this.db, req, this.now())
  if (!user) {
    this.rejectUpgrade(socket, '401 Unauthorized')
    return
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (chatMatch) {
      const deviceId = decodeURIComponent(chatMatch[1]!)
      const hiveSessionId = decodeURIComponent(chatMatch[2]!)
      if (!this.bridge) return this.rejectUpgrade(socket, '503 Service Unavailable')
      this.attachClient(ws, deviceId, hiveSessionId, this.bridge)
      return
    }
    const deviceId = decodeURIComponent(terminalMatch![1]!)
    const worktreeId = decodeURIComponent(terminalMatch![2]!)
    if (!this.terminalBridge) return this.rejectUpgrade(socket, '503 Service Unavailable')
    this.attachTerminalClient(ws, deviceId, worktreeId, this.terminalBridge)
  })
}

private attachTerminalClient(
  ws: WebSocket,
  deviceId: string,
  worktreeId: string,
  terminalBridge: HubTerminalBridge
): void {
  terminalBridge.attachClient(ws, deviceId, worktreeId)
}
```

```ts
// In hub-controller.ts construct and pass:
import { HubTerminalBridge } from './hub-terminal-bridge'
import { ptyService } from '../pty-service'

readonly terminalBridge: HubTerminalBridge

this.terminalBridge = new HubTerminalBridge({
  registry: this.registry,
  ptyService
})

this.server = createHubServer({
  db: getDatabase().getDb(),
  registry: this.registry,
  bridge: this.bridge,
  terminalBridge: this.terminalBridge,
  getMobileDistRoot: defaultMobileDistRoot
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/server/hub-server.test.ts test/server/hub-terminal-bridge.test.ts`

Expected: PASS for terminal websocket route coverage.

- [ ] **Step 5: Commit**

```bash
git add src/main/services/hub/hub-server.ts src/main/services/hub/hub-controller.ts test/server/hub-server.test.ts
git commit -m "feat: expose hub terminal websocket route"
```

### Task 4: Add mobile terminal websocket client and hook

**Files:**
- Create: `mobile/src/api/terminal-ws.ts`
- Create: `mobile/src/hooks/useTerminalStream.ts`
- Test: `test/mobile/use-terminal-stream.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
        buffer: 'boot\\n'
      })
      socket?.emitFrame({ type: 'terminal/output', seq: 2, data: 'next\\n' })
    })

    expect(result.current.state.buffer).toBe('boot\nnext\n')
    expect(result.current.state.status).toBe('open')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/mobile/use-terminal-stream.test.ts`

Expected: FAIL because `useTerminalStream` and `TerminalWebSocket` do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// terminal-ws.ts
import { getApiBase } from './client'

export type TerminalConnectionState = 'connecting' | 'open' | 'closed'

function terminalWsUrl(deviceId: string, worktreeId: string): string {
  const base = getApiBase()
  const u = new URL(base)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.pathname = `/ws/terminal/${encodeURIComponent(deviceId)}/${encodeURIComponent(worktreeId)}`
  return u.toString()
}

export class TerminalWebSocket {
  // Mirror HubWebSocket implementation shape for consistency
}
```

```ts
// useTerminalStream.ts
import { useEffect, useReducer, useRef } from 'react'
import { TerminalWebSocket, type TerminalConnectionState } from '../api/terminal-ws'

interface TerminalState {
  buffer: string
  status: 'connecting' | 'open' | 'closed' | 'error'
  connection: TerminalConnectionState
  cwd: string | null
  shell: string | null
  terminalId: string | null
}

// reducer handles terminal/snapshot, terminal/output, terminal/status, terminal/exit, terminal/error
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/mobile/use-terminal-stream.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/api/terminal-ws.ts mobile/src/hooks/useTerminalStream.ts test/mobile/use-terminal-stream.test.ts
git commit -m "feat: add mobile terminal websocket hook"
```

### Task 5: Add mobile terminal pane UI

**Files:**
- Create: `mobile/src/components/MobileTerminalPane.tsx`
- Test: `test/mobile/mobile-terminal-pane.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileTerminalPane } from '../../mobile/src/components/MobileTerminalPane'

describe('MobileTerminalPane', () => {
  it('shows control keys and forwards control input', () => {
    const sendInput = vi.fn()

    render(
      <MobileTerminalPane
        state={{
          buffer: 'hello\n',
          status: 'open',
          connection: 'open',
          cwd: '/tmp/project',
          shell: '/bin/zsh',
          terminalId: 'wt-1'
        }}
        sendInput={sendInput}
        resize={vi.fn()}
        restart={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ctrl-C' }))
    expect(sendInput).toHaveBeenCalledWith('\u0003')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/mobile/mobile-terminal-pane.test.tsx`

Expected: FAIL because `MobileTerminalPane` does not exist.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { useMemo } from 'react'

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 py-2 text-xs text-zinc-500">
        {props.state.cwd ?? '未连接'} · {props.state.shell ?? 'shell'}
      </div>
      <pre className="min-h-0 flex-1 overflow-auto px-3 py-3 text-sm text-zinc-100">
        {props.state.buffer}
      </pre>
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
        <button type="button" onClick={props.restart} className="rounded-full bg-zinc-800 px-3 py-2 text-xs text-zinc-100">
          重启 Shell
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/mobile/mobile-terminal-pane.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/MobileTerminalPane.tsx test/mobile/mobile-terminal-pane.test.tsx
git commit -m "feat: add mobile terminal pane"
```

### Task 6: Add session page mode switch and shell integration

**Files:**
- Modify: `mobile/src/components/PromptComposer.tsx`
- Modify: `mobile/src/routes/SessionDetail.tsx`
- Modify: `mobile/src/styles.css`
- Test: `test/mobile/session-shell-mode.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../mobile/src/hooks/useSessionStream', () => ({
  useSessionStream: () => ({
    state: {
      messages: [],
      connection: 'open',
      status: 'idle',
      permission: null,
      question: null,
      plan: null,
      commandApproval: null,
      notices: [],
      error: null
    },
    dismissNotice: vi.fn(),
    clearAllNotices: vi.fn(),
    prompt: vi.fn(),
    interrupt: vi.fn()
  })
}))

vi.mock('../../mobile/src/hooks/useTerminalStream', () => ({
  useTerminalStream: () => ({
    state: {
      buffer: 'shell\n',
      status: 'open',
      connection: 'open',
      cwd: '/tmp/project',
      shell: '/bin/zsh',
      terminalId: 'wt-1'
    },
    sendInput: vi.fn(),
    resize: vi.fn(),
    restart: vi.fn()
  })
}))

describe('Session shell mode', () => {
  it('defaults to model mode and switches to shell mode', async () => {
    render(
      <MemoryRouter initialEntries={['/session/device-1/hive-1']}>
        <Routes>
          <Route path="/session/:deviceId/:hiveId" element={<SessionDetail />} />
        </Routes>
      </MemoryRouter>
    )

    expect(screen.getByPlaceholderText('输入消息…')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Shell' }))
    expect(screen.getByText('/tmp/project · /bin/zsh')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run test/mobile/session-shell-mode.test.tsx`

Expected: FAIL because no mode switch or shell pane exists.

- [ ] **Step 3: Write minimal implementation**

```tsx
// PromptComposer.tsx
// - accept mode + onModeChange props
// - render two toggle buttons: 模型 / Shell
// - only render textarea/send button in model mode
// - render helper hint in shell mode
```

```tsx
// SessionDetail.tsx
// - derive current session worktree metadata
// - keep local mode state defaulted to 'model'
// - disable Shell button if no worktree is available
// - render Message timeline when mode === 'model'
// - render <MobileTerminalPane /> when mode === 'shell'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run test/mobile/session-shell-mode.test.tsx test/mobile/use-terminal-stream.test.ts test/mobile/mobile-terminal-pane.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/PromptComposer.tsx mobile/src/routes/SessionDetail.tsx mobile/src/styles.css test/mobile/session-shell-mode.test.tsx
git commit -m "feat: add mobile shell mode switch"
```

### Task 7: Run focused verification and sync docs

**Files:**
- Modify: `docs/superpowers/specs/2026-05-01-mobile-shell-mode-design.md` (only if implementation diverged)

- [ ] **Step 1: Run focused backend and mobile tests**

Run: `pnpm vitest run test/server/hub-terminal-registry.test.ts test/server/hub-terminal-bridge.test.ts test/server/hub-controller.test.ts test/mobile/use-terminal-stream.test.ts test/mobile/mobile-terminal-pane.test.tsx test/mobile/session-shell-mode.test.tsx`

Expected: PASS

- [ ] **Step 2: Run mobile build**

Run: `pnpm -C mobile build`

Expected: PASS

- [ ] **Step 3: Run targeted app build validation if backend protocol changed**

Run: `pnpm build`

Expected: PASS, or if blocked by the local `better-sqlite3` ABI mismatch, capture that exact blocker in handoff.

- [ ] **Step 4: Update spec if necessary**

If implementation details changed, sync `docs/superpowers/specs/2026-05-01-mobile-shell-mode-design.md` with the final naming and behavior before handoff.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-01-mobile-shell-mode-design.md
git commit -m "docs: sync mobile shell mode design"
```
