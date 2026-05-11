import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })
}))

import { openCodeService } from '../../src/main/services/opencode-service'

describe('OpenCodeService prompt waitForCompletion', () => {
  const service = openCodeService as unknown as {
    instance: unknown
  }
  const originalInstance = service.instance

  afterEach(() => {
    service.instance = originalInstance
  })

  function installMockInstance() {
    const prompt = vi.fn().mockResolvedValue({
      data: {
        info: { id: 'assistant-1' },
        parts: []
      }
    })
    const promptAsync = vi.fn().mockResolvedValue({ data: undefined })
    service.instance = {
      client: {
        session: {
          prompt,
          promptAsync
        }
      },
      server: { url: 'http://127.0.0.1:1234', close: vi.fn() },
      sessionMap: new Map([['/repo::oc-1', 'hive-1']]),
      sessionDirectories: new Map(),
      directorySubscriptions: new Map(),
      childToParentMap: new Map()
    }
    return { prompt, promptAsync }
  }

  it('uses the blocking OpenCode prompt endpoint when waitForCompletion is true', async () => {
    const { prompt, promptAsync } = installMockInstance()

    await openCodeService.prompt(
      '/repo',
      'oc-1',
      'ship it',
      { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
      { waitForCompletion: true }
    )

    expect(prompt).toHaveBeenCalledWith({
      path: { id: 'oc-1' },
      query: { directory: '/repo' },
      body: {
        model: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
        variant: undefined,
        parts: [{ type: 'text', text: 'ship it' }]
      }
    })
    expect(promptAsync).not.toHaveBeenCalled()
  })

  it('keeps the default desktop path non-blocking', async () => {
    const { prompt, promptAsync } = installMockInstance()

    await openCodeService.prompt('/repo', 'oc-1', 'ship it', {
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5'
    })

    expect(promptAsync).toHaveBeenCalledOnce()
    expect(prompt).not.toHaveBeenCalled()
  })
})
