import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('mobile route layout source', () => {
  test('sessions and devices routes use viewport-height scroll containers', () => {
    const sessionsSource = readFileSync(
      'mobile/src/routes/Sessions.tsx',
      'utf8'
    )
    const devicesSource = readFileSync(
      'mobile/src/routes/Devices.tsx',
      'utf8'
    )

    expect(sessionsSource).toContain(
      'className="mobile-page mobile-scroll h-dvh overflow-y-auto safe-pad-top safe-pad-bottom"'
    )
    expect(devicesSource).toContain(
      'className="mobile-page mobile-scroll h-dvh overflow-y-auto safe-pad-top safe-pad-bottom"'
    )
  })

  test('session detail message stream can shrink inside the flex column', () => {
    const detailSource = readFileSync(
      'mobile/src/routes/SessionDetail.tsx',
      'utf8'
    )

    expect(detailSource).toContain(
      'className="mobile-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-4 space-y-4"'
    )
  })
})
