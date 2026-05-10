import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ComposerBar } from '../../src/renderer/src/components/session-hq/ComposerBar'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  Object.defineProperty(window, 'db', {
    writable: true,
    configurable: true,
    value: {
      session: {
        getDraft: vi.fn().mockResolvedValue(null),
        updateDraft: vi.fn().mockResolvedValue(undefined)
      }
    }
  })

  Object.defineProperty(window, 'agentOps', {
    writable: true,
    configurable: true,
    value: {
      commands: vi.fn().mockResolvedValue({ success: true, commands: [] })
    }
  })
})

type SpeechEventHandler = ((event?: unknown) => void) | null

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []

  continuous = false
  interimResults = false
  lang = ''
  onend: SpeechEventHandler = null
  onerror: SpeechEventHandler = null
  onresult: SpeechEventHandler = null
  start = vi.fn()
  stop = vi.fn(() => {
    this.onend?.()
  })

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }
}

function emitResult(instance: FakeSpeechRecognition, text: string, isFinal: boolean): void {
  instance.onresult?.({
    resultIndex: 0,
    results: [
      {
        isFinal,
        0: { transcript: text }
      }
    ]
  })
}

describe('ComposerBar', () => {
  beforeEach(() => {
    FakeSpeechRecognition.instances = []
    Reflect.deleteProperty(window, 'SpeechRecognition')
    Reflect.deleteProperty(window, 'webkitSpeechRecognition')
  })

  it('uses queue as the primary action while busy when draft content exists', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(
      <ComposerBar
        sessionId="sess-1"
        lifecycle="busy"
        pendingCount={0}
        firstInterrupt={null}
        onAction={onAction}
        isConnected={true}
      />
    )

    await user.type(screen.getByRole('textbox'), 'Follow up after this run')
    await user.click(screen.getByTestId('composer-primary-action'))

    expect(onAction).toHaveBeenCalledWith(
      'queue',
      'Follow up after this run',
      expect.any(Array)
    )
  })

  it('shows steer and stop actions in the busy-state action menu', async () => {
    const user = userEvent.setup()

    render(
      <ComposerBar
        sessionId="sess-1"
        lifecycle="busy"
        pendingCount={0}
        firstInterrupt={null}
        onAction={vi.fn()}
        isConnected={true}
        supportsSteer={true}
      />
    )

    await user.type(screen.getByRole('textbox'), 'Need to redirect now')
    await act(async () => {
      await user.click(screen.getByTestId('composer-action-menu-trigger'))
    })

    expect(await screen.findByTestId('composer-action-steer')).toBeInTheDocument()
    expect(screen.getByTestId('composer-action-stop_and_send')).toBeInTheDocument()
  })

  it('dispatches steer from the busy-state action menu', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()

    render(
      <ComposerBar
        sessionId="sess-1"
        lifecycle="busy"
        pendingCount={0}
        firstInterrupt={null}
        onAction={onAction}
        isConnected={true}
        supportsSteer={true}
      />
    )

    await user.type(screen.getByRole('textbox'), 'Switch to investigating the failing test')
    await act(async () => {
      await user.click(screen.getByTestId('composer-action-menu-trigger'))
    })
    await act(async () => {
      await user.click(await screen.findByTestId('composer-action-steer'))
    })

    expect(onAction).toHaveBeenCalledWith(
      'steer',
      'Switch to investigating the failing test',
      expect.any(Array)
    )
  })

  it('renders a disabled voice button when speech recognition is unavailable', () => {
    render(
      <ComposerBar
        sessionId="sess-1"
        lifecycle="idle"
        pendingCount={0}
        firstInterrupt={null}
        onAction={vi.fn()}
        isConnected={true}
      />
    )

    expect(screen.getByTestId('composer-voice-input')).toBeDisabled()
  })

  it('appends final voice transcript into the textarea', async () => {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      writable: true,
      configurable: true,
      value: FakeSpeechRecognition
    })

    const user = userEvent.setup()
    render(
      <ComposerBar
        sessionId="sess-1"
        lifecycle="idle"
        pendingCount={0}
        firstInterrupt={null}
        onAction={vi.fn()}
        isConnected={true}
      />
    )

    await user.type(screen.getByRole('textbox'), 'Hello')
    await user.click(screen.getByTestId('composer-voice-input'))

    const instance = FakeSpeechRecognition.instances[0]
    act(() => {
      emitResult(instance, 'world', true)
    })

    expect(screen.getByRole('textbox')).toHaveValue('Hello world')
  })
})
