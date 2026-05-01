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
