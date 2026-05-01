# Mobile Shell Mode Design

## Summary

Add a full terminal mode to the mobile session page.

The default remains model chat mode. Users can switch the current session page
between `模型` and `Shell`. Shell mode attaches to a **worktree-scoped**
terminal, not a session-scoped terminal, matching the desktop mental model.

This design keeps chat transport and terminal transport separate:

- chat stays on the existing Hub session websocket
- terminal gets a new dedicated Hub terminal websocket
- terminal output is not injected into the chat timeline

## Goals

- Keep current mobile chat behavior as the default
- Add a true interactive PTY-backed shell for mobile
- Scope shell state by worktree, consistent with desktop terminal behavior
- Support reconnect and output replay for unstable mobile connections
- Keep the protocol and UI boundaries clean enough for future expansion

## Non-Goals

- Do not merge shell output into chat messages
- Do not make model mode automatically consume terminal output
- Do not introduce per-session shell ownership
- Do not reuse desktop Ghostty surfaces for remote mobile terminal rendering
- Do not persist shell/model mode into the database in the first version

## User Experience

### Entry

On the existing mobile session page, the default mode is `模型`.

The composer area gains a mode switch:

- `模型`
- `Shell`

When the user selects `Shell`:

- the message timeline is replaced by a terminal view
- the worktree-scoped terminal is attached if already active
- otherwise a new PTY is created for that worktree

When the user switches back to `模型`:

- the terminal remains alive
- only the view changes back to chat mode

### Shell View

Shell mode shows:

- terminal output area rendered with `xterm.js`
- connection/status line
- compact control strip

Control strip actions:

- `Ctrl-C`
- `Esc`
- `Tab`
- `↑`
- `↓`
- `←`
- `→`
- `重连`
- `重启 Shell`

### Scope Rules

Shell mode is attached to the current worktree.

Implications:

- two mobile session pages for the same worktree attach to the same terminal
- switching sessions within the same worktree can keep the same shell alive
- different worktrees get different shell instances

## Architecture

### Overall Split

Keep two independent real-time channels:

1. existing Hub session websocket
2. new Hub terminal websocket

This avoids overloading the chat protocol with terminal semantics.

### Backend Components

Add a new backend bridge for mobile terminal traffic.

Proposed pieces:

- `HubTerminalBridge`
- `HubTerminalRegistry`
- terminal websocket route under Hub server

Responsibilities:

- resolve worktree-scoped terminal identity
- create or attach a PTY-backed terminal
- fan out output to mobile subscribers
- support resize, input, restart, kill, and resume

### PTY Backend Choice

Use `node-pty` for Hub mobile shell sessions.

Do not couple mobile shell transport to desktop Ghostty surfaces.

Rationale:

- mobile needs raw byte-stream input/output
- resize and replay are simpler with `node-pty`
- remote shell should not depend on desktop GUI lifecycle

### Worktree-Scoped Terminal Identity

Each mobile shell instance is keyed by `worktreeId`.

Registry state stores:

- `worktreeId`
- `terminalId`
- `cwd`
- `shell`
- live PTY handle
- ring buffer of recent output frames
- subscribers
- latest sequence number
- terminal status

## Protocol Design

## Terminal Websocket Route

Add a dedicated websocket route:

- `/ws/terminal/:deviceId/:worktreeId`

Authentication reuses existing Hub websocket auth rules.

## Server -> Client Messages

### `terminal/snapshot`

Initial state after attach:

- `type`
- `seq`
- `worktreeId`
- `terminalId`
- `cwd`
- `shell`
- `status`
- `buffer`

### `terminal/output`

Incremental terminal output:

- `type`
- `seq`
- `data`

### `terminal/status`

State transitions:

- `connecting`
- `open`
- `closed`
- `error`

### `terminal/exit`

Terminal process exit:

- `type`
- `seq`
- `exitCode`
- `signal`

### `terminal/error`

Structured terminal-side errors:

- `type`
- `seq?`
- `code`
- `message`

## Client -> Server Messages

### `terminal/attach`

Attach to existing worktree terminal or create a new one.

### `terminal/input`

Write arbitrary character data to the PTY.

### `terminal/resize`

Resize terminal viewport with:

- `cols`
- `rows`

### `terminal/kill`

Terminate the PTY process.

### `terminal/restart`

Destroy and recreate the PTY for the same worktree.

### `terminal/resume`

Resume from a known `lastSeq`.

## Frontend Design

### Session Page

Keep `mobile/src/routes/SessionDetail.tsx` as the single page.

Add local mode state:

- `model`
- `shell`

Default:

- `model`

The page body becomes a conditional renderer:

- model mode -> current message timeline
- shell mode -> `MobileTerminalPane`

### Composer

Update `mobile/src/components/PromptComposer.tsx`:

- add mode switch UI
- keep current message composer for model mode
- hide message textarea in shell mode
- show shell helper controls in shell mode

The page should not show both interaction surfaces at once.

### Terminal Pane

Add a dedicated mobile terminal component, likely:

- `mobile/src/components/MobileTerminalPane.tsx`

Responsibilities:

- mount `xterm.js`
- subscribe to terminal websocket
- write server output into terminal
- capture user input and send `terminal/input`
- issue `terminal/resize` on viewport changes
- expose reconnect/restart actions

### Mobile Input Strategy

Use `xterm.js` for rendering and local input handling, with helper buttons for
control sequences that are awkward on mobile keyboards.

At minimum send:

- `\u0003` for `Ctrl-C`
- `\u001b` for `Esc`
- `\t` for `Tab`
- arrow escape sequences for cursor keys

### Session Metadata Dependency

Shell mode depends on resolving the current session's worktree.

If the current session has no worktree:

- disable Shell mode
- show a short explanation

This must be explicit to avoid ambiguous terminal ownership.

## Reconnect and Replay

Terminal websocket uses per-terminal monotonic sequence numbers.

On reconnect:

- client sends `terminal/resume { lastSeq }`
- server replays buffered frames newer than `lastSeq`
- if the gap has been evicted, server returns a terminal reload error and sends
  a fresh `terminal/snapshot`

This mirrors the current Hub chat reconnect strategy.

## Error Handling

### No Worktree

If session metadata lacks a worktree:

- Shell switch is disabled
- UI explains shell is only available for worktree-backed sessions

### PTY Creation Failure

If PTY creation fails:

- stay in shell mode
- render terminal error state
- allow retry via `重启 Shell`

### Terminal Exit

If the shell exits naturally:

- keep the shell pane visible
- show exit state
- allow restart

### Connection Loss

If websocket disconnects:

- show reconnecting state
- auto-reconnect
- preserve terminal buffer client-side until resync completes

## Testing Plan

### Backend Tests

- create worktree terminal on first attach
- attach multiple subscribers to the same worktree terminal
- input writes to PTY
- resize propagates
- exit frame emitted
- restart replaces PTY
- resume replays buffered output

### Frontend Tests

- session detail defaults to model mode
- shell switch toggles body to terminal pane
- shell mode hides message composer textarea
- shell helper buttons send expected control sequences
- shell mode disabled for no-worktree sessions
- reconnect state renders correctly

### Regression Coverage

- existing mobile chat timeline remains unchanged in model mode
- existing session sync logic remains intact
- mobile scrolling fixes remain intact after adding mode switch UI

## File/Module Plan

Expected touch points:

- `mobile/src/routes/SessionDetail.tsx`
- `mobile/src/components/PromptComposer.tsx`
- `mobile/src/hooks/useSessionStream.ts`
- `mobile/src/api/ws.ts`
- `mobile/src/components/MobileTerminalPane.tsx`
- `mobile/src/hooks/useTerminalStream.ts`
- `src/main/services/hub/hub-server.ts`
- `src/main/services/hub/hub-terminal-bridge.ts`
- `src/main/services/hub/hub-terminal-protocol.ts`
- `src/main/services/hub/hub-terminal-registry.ts`

Possible shared type additions:

- `src/shared/types/...` only if the terminal protocol is shared across layers

## Tradeoffs

### Why not reuse the chat websocket

It would reduce short-term file count but make the protocol muddier:

- terminal byte streams do not fit naturally into message timeline semantics
- replay logic becomes harder to reason about
- future maintenance gets worse

### Why not session-scoped shell

Session-scoped shell conflicts with existing worktree mental models and would
create multiple terminals for what users perceive as the same coding context.

### Why not persist the mode now

Persisting mode adds more state edge cases for limited initial value.

First version should optimize for correctness:

- page default is always `模型`
- shell must be selected intentionally each time

## Rollout Notes

Implementation should land in stages:

1. terminal protocol + server bridge
2. mobile shell pane + attach/reconnect
3. composer mode switch
4. control strip and resize polish

This keeps debugging localized and reduces integration risk.
