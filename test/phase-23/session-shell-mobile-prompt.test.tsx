import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TimelineMessage } from '../../src/shared/lib/timeline-types'
import { SessionShell } from '../../src/renderer/src/components/session-hq/SessionShell'
import { useSessionStore } from '../../src/renderer/src/stores/useSessionStore'
import { useWorktreeStore } from '../../src/renderer/src/stores/useWorktreeStore'
import {
  resetStreamingBuffersForTests,
  useSessionRuntimeStore
} from '../../src/renderer/src/stores/useSessionRuntimeStore'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}))

vi.mock('../../src/renderer/src/components/session-hq/SessionHeader', () => ({
  SessionHeader: () => <div data-testid="session-header" />
}))

vi.mock('../../src/renderer/src/components/session-hq/MissionControl', () => ({
  MissionControl: () => <div data-testid="mission-control" />
}))

vi.mock('../../src/renderer/src/components/session-hq/InterruptDock', () => ({
  InterruptDock: () => <div data-testid="interrupt-dock" />
}))

vi.mock('../../src/renderer/src/components/session-hq/ComposerBar', () => ({
  ComposerBar: () => <div data-testid="composer-bar" />
}))

vi.mock('../../src/renderer/src/components/sessions/FieldContextDebug', () => ({
  FieldContextDebug: () => <div data-testid="field-context-debug" />
}))

vi.mock('../../src/renderer/src/components/session-hq/ForkFromMessageConfirmDialog', () => ({
  ForkFromMessageConfirmDialog: () => <div data-testid="fork-confirm-dialog" />
}))

vi.mock('../../src/renderer/src/components/sessions/PlanReadyImplementFab', () => ({
  PlanReadyImplementFab: () => <div data-testid="plan-ready-implement-fab" />
}))

vi.mock('../../src/renderer/src/components/sessions/ScrollToBottomFab', () => ({
  ScrollToBottomFab: () => <div data-testid="scroll-to-bottom-fab" />
}))

vi.mock('../../src/renderer/src/hooks/useSessionSmartScroll', () => ({
  useSessionSmartScroll: () => ({
    scrollContainerRef: { current: null },
    handleScroll: vi.fn(),
    handleScrollWheel: vi.fn(),
    handleScrollPointerDown: vi.fn(),
    handleScrollPointerUp: vi.fn(),
    handleScrollPointerCancel: vi.fn(),
    handleScrollToBottomClick: vi.fn(),
    showScrollFab: false,
    scrollFabCount: 0,
    scrollFabBottomOffset: 16,
    bottomFloatingHeight: 0
  })
}))

vi.mock('../../src/renderer/src/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key
  })
}))

vi.mock('../../src/renderer/src/components/session-hq/AgentTimeline', () => ({
  AgentTimeline: ({
    timelineMessages,
    ephemeralStatusRows
  }: {
    timelineMessages: TimelineMessage[]
    ephemeralStatusRows?: Array<{ id: string; kind: string }>
  }) => (
    <div data-testid="agent-timeline">
      {timelineMessages.map((message) => (
        <div key={message.id} data-testid={`timeline-message-${message.id}`}>
          {message.content}
        </div>
      ))}
      {(ephemeralStatusRows ?? []).map((row) => (
        <div key={row.id} data-testid={`timeline-status-${row.kind}`}>
          {row.kind}
        </div>
      ))}
    </div>
  )
}))

function makeSession(overrides: Partial<ReturnType<typeof baseSession>> = {}) {
  return { ...baseSession(), ...overrides }
}

function baseSession() {
  const now = '2026-05-10T12:00:00.000Z'
  return {
    id: 'session-hq-1',
    worktree_id: 'wt-1',
    project_id: 'proj-1',
    connection_id: null,
    name: 'HQ Session',
    status: 'active' as const,
    opencode_session_id: 'agent-session-1',
    agent_sdk: 'opencode' as const,
    mode: 'build' as const,
    model_provider_id: null,
    model_id: null,
    model_variant: null,
    first_message_at: null,
    created_at: now,
    updated_at: now,
    completed_at: null
  }
}

function installWindowMocks(initialTimeline: TimelineMessage[]) {
  Object.defineProperty(window, 'agentOps', {
    configurable: true,
    writable: true,
    value: {
      getTimeline: vi.fn().mockResolvedValue({
        messages: initialTimeline,
        compactionMarkers: [],
        revertBoundary: null
      }),
      reconnect: vi.fn().mockResolvedValue({ success: true }),
      connect: vi.fn().mockResolvedValue({ success: true, sessionId: 'agent-session-1' }),
      capabilities: vi.fn().mockResolvedValue({
        success: true,
        capabilities: { supportsSteer: true }
      }),
      getMessages: vi.fn().mockResolvedValue({ success: true, messages: [] }),
      prompt: vi.fn().mockResolvedValue({ success: true }),
      steer: vi.fn().mockResolvedValue({ success: true }),
      abort: vi.fn().mockResolvedValue({ success: true }),
      fork: vi.fn().mockResolvedValue({ success: true, sessionId: 'forked-agent-session' }),
      planApprove: vi.fn().mockResolvedValue({ success: true }),
      planReject: vi.fn().mockResolvedValue({ success: true }),
      commands: vi.fn().mockResolvedValue({ success: true, commands: [] })
    }
  })

  Object.defineProperty(window, 'db', {
    configurable: true,
    writable: true,
    value: {
      session: {
        get: vi.fn().mockResolvedValue(makeSession()),
        update: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(makeSession({ id: 'forked-session' }))
      }
    }
  })

  Object.defineProperty(window, 'usageAnalyticsOps', {
    configurable: true,
    writable: true,
    value: {
      fetchSessionSummary: vi.fn().mockResolvedValue({ success: false })
    }
  })
}

function setStoreState() {
  useSessionStore.setState({
    sessionsByWorktree: new Map([['wt-1', [makeSession()]]]),
    tabOrderByWorktree: new Map([['wt-1', ['session-hq-1']]]),
    modeBySession: new Map([['session-hq-1', 'build']]),
    pendingMessages: new Map(),
    pendingPlans: new Map(),
    pendingFollowUpMessages: new Map(),
    isLoading: false,
    error: null,
    activeSessionId: 'session-hq-1',
    activeWorktreeId: 'wt-1',
    activeSessionByWorktree: { 'wt-1': 'session-hq-1' },
    sessionsByConnection: new Map(),
    tabOrderByConnection: new Map(),
    activeSessionByConnection: {},
    activeConnectionId: null,
    inlineConnectionSessionId: null,
    closedTerminalSessionIds: new Set()
  })

  useWorktreeStore.setState({
    worktreesByProject: new Map([
      [
        'proj-1',
        [
          {
            id: 'wt-1',
            project_id: 'proj-1',
            name: 'Worktree',
            branch_name: 'main',
            path: '/tmp/xuanpu-worktree',
            status: 'active',
            is_default: true,
            branch_renamed: 0,
            last_message_at: null,
            session_titles: '[]',
            last_model_provider_id: null,
            last_model_id: null,
            last_model_variant: null,
            created_at: '2026-05-10T12:00:00.000Z',
            last_accessed_at: '2026-05-10T12:00:00.000Z',
            github_pr_number: null,
            github_pr_url: null,
            model_profile_id: null
          }
        ]
      ]
    ])
  })
}

describe('SessionShell mobile-originated prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStreamingBuffersForTests()
    useSessionRuntimeStore.getState().clearSession('session-hq-1')
    setStoreState()
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps existing HQ timeline history visible while appending the mobile prompt echo', async () => {
    installWindowMocks([
      {
        id: 'history-user-1',
        role: 'user',
        content: '之前的历史问题',
        timestamp: '2026-05-10T11:58:00.000Z'
      },
      {
        id: 'history-assistant-1',
        role: 'assistant',
        content: '之前的历史回答',
        timestamp: '2026-05-10T11:59:00.000Z'
      }
    ])

    render(<SessionShell sessionId="session-hq-1" />)

    await waitFor(() => {
      expect(screen.getByText('之前的历史问题')).toBeInTheDocument()
      expect(screen.getByText('之前的历史回答')).toBeInTheDocument()
    })

    act(() => {
      useSessionRuntimeStore.getState().dispatchToSession('session-hq-1', {
        eventId: 'evt-mobile-hq',
        sessionSequence: 1,
        runEpoch: 1,
        sessionId: 'session-hq-1',
        type: 'message.updated',
        data: {
          id: 'mobile-cm-1',
          role: 'user',
          content: '手机发来的新问题',
          parts: [{ type: 'text', text: '手机发来的新问题' }],
          info: {
            origin: 'hub-mobile',
            timestamp: '2026-05-10T12:00:00.000Z'
          }
        }
      })
      useSessionRuntimeStore.getState().dispatchToSession('session-hq-1', {
        eventId: 'evt-busy',
        sessionSequence: 2,
        runEpoch: 1,
        sessionId: 'session-hq-1',
        type: 'session.status',
        data: { status: { type: 'busy' } }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('之前的历史问题')).toBeInTheDocument()
      expect(screen.getByText('之前的历史回答')).toBeInTheDocument()
      expect(screen.getByText('手机发来的新问题')).toBeInTheDocument()
    })
  })
})
