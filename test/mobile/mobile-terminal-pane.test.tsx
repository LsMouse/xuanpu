import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@xterm/xterm', () => ({
  Terminal: class MockTerminal {
    cols = 80
    rows = 24
    loadAddon(): void {}
    open(): void {}
    onData(): void {}
    reset(): void {}
    write(): void {}
    dispose(): void {}
    focus(): void {}
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class MockFitAddon {
    fit(): void {}
  }
}))

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

  it('sends typed shell commands with a newline', () => {
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

    const input = screen.getByPlaceholderText('输入 Shell 命令…')
    fireEvent.change(input, { target: { value: 'pwd' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(sendInput).toHaveBeenCalledWith('pwd\n')
    expect(input).toHaveValue('')
  })
})
