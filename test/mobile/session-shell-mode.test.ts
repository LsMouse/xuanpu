import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('mobile session shell mode source', () => {
  test('session detail keeps a local model or shell mode state', () => {
    const source = readFileSync('mobile/src/routes/SessionDetail.tsx', 'utf8')
    expect(source).toContain("useState<'model' | 'shell'>('model')")
  })

  test('prompt composer exposes model and shell mode buttons', () => {
    const source = readFileSync('mobile/src/components/PromptComposer.tsx', 'utf8')
    expect(source).toContain("onModeChange?.('model')")
    expect(source).toContain("onModeChange?.('shell')")
    expect(source).toContain('Shell 模式已启用')
  })
})
