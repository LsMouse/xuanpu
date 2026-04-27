import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (_event: unknown, ...args: unknown[]) => unknown

const { handlers, mockDetectAgentSdks } = vi.hoisted(() => ({
  handlers: new Map<string, IpcHandler>(),
  mockDetectAgentSdks: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler)
    })
  },
  shell: {
    showItemInFolder: vi.fn()
  }
}))

vi.mock('../../src/main/services/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}))

vi.mock('../../src/main/services/skill-service', () => ({
  installSkill: vi.fn(),
  listHubSkills: vi.fn(),
  listInstalledSkills: vi.fn(),
  readSkillContent: vi.fn(),
  uninstallSkill: vi.fn()
}))

vi.mock('../../src/main/services/hub-service', () => ({
  addRemoteHub: vi.fn(),
  listHubs: vi.fn(),
  refreshHub: vi.fn(),
  removeRemoteHub: vi.fn()
}))

vi.mock('../../src/main/services/system-info', () => ({
  detectAgentSdks: mockDetectAgentSdks
}))

import { registerSkillHandlers } from '../../src/main/ipc/skill-handlers'

async function callHandler<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return (await handler(null, ...args)) as T
}

describe('skill IPC handlers', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    registerSkillHandlers()
  })

  it('awaits async provider detection before returning availability', async () => {
    mockDetectAgentSdks.mockResolvedValue({
      claude: true,
      codex: true,
      opencode: false
    })

    await expect(callHandler('skill:detectProviders')).resolves.toEqual({
      success: true,
      availability: {
        'claude-code': true,
        codex: true,
        opencode: false
      }
    })
    expect(mockDetectAgentSdks).toHaveBeenCalledOnce()
  })
})
