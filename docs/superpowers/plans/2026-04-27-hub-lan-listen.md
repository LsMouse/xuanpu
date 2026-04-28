# Hub LAN Listen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable Hub listening host and persist/restore Hub enabled state.

**Architecture:** Persist Hub settings in `hub_settings`, thread them through controller, IPC, preload, renderer store, and Hub settings UI. Keep `127.0.0.1` as the safe default and restart Hub when a running listener changes host.

**Tech Stack:** Electron main process, TypeScript, React, Zustand, SQLite via `better-sqlite3`, Vitest.

---

### Task 1: Server Listen Host

**Files:**

- Modify: `src/main/services/hub/hub-server.ts`
- Test: `test/server/hub-server.test.ts`

- [ ] Add `HubListenHost = '127.0.0.1' | '0.0.0.0'` and validate unknown values back to `127.0.0.1`.
- [ ] Change `HubServer.start(port?)` to accept `start(port?, host?)`.
- [ ] Update fallback binding to use requested host unless loopback needs the existing `::1` fallback.
- [ ] Add tests that `start(0, '127.0.0.1')` reports loopback and `start(0, '0.0.0.0')` reports LAN binding.

### Task 2: Controller Persistence

**Files:**

- Modify: `src/main/services/hub/hub-controller.ts`
- Modify: `src/main/index.ts`

- [ ] Add helpers for `listen_host` and `enabled` settings.
- [ ] Start saves enabled after success; user stop saves disabled.
- [ ] Add shutdown stop path that does not overwrite enabled.
- [ ] Add `restoreStartupState()` and call it after registering Hub handlers.
- [ ] Add `setListenHost()` that saves the host and restarts Hub when currently running.

### Task 3: IPC and Types

**Files:**

- Modify: `src/main/ipc/hub-handlers.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

- [ ] Add `hub:setListenHost` channel.
- [ ] Expose `window.hubOps.setListenHost(host)`.
- [ ] Extend `HubStatusSnapshot` with `listenHost` and `enabledOnStartup`.

### Task 4: Renderer Store and UI

**Files:**

- Modify: `src/renderer/src/stores/useHubStore.ts`
- Modify: `src/renderer/src/components/settings/HubSection.tsx`

- [ ] Add store action `setListenHost()` and default snapshot fields.
- [ ] Add listen host selector to the local Hub card.
- [ ] Show LAN warning and avoid presenting `0.0.0.0` as the only useful scan URL when possible.

### Task 5: Verification

**Files:**

- Test: `test/server/hub-server.test.ts`

- [ ] Run `pnpm vitest run test/server/hub-server.test.ts`.
- [ ] Run `pnpm lint` if the focused tests pass.
