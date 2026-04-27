# Hub LAN Listen Design

**Goal:** Let Hub listen on either loopback (`127.0.0.1`) or LAN (`0.0.0.0`) and restore the user's Hub enabled state after app restart.

## Scope

- Default remains loopback-only for safety.
- Users can switch the listening host from Hub settings.
- Switching host while Hub is running restarts the local Hub service so the new binding takes effect immediately.
- Hub start/stop state is persisted separately from the transient runtime server state.
- App startup restores Hub when the persisted enabled state is on.

## Architecture

- `hub_settings` remains the persistence store. Two new keys are used:
  - `listen_host`: `127.0.0.1` or `0.0.0.0`
  - `enabled`: `1` or `0`
- `HubServer.start()` accepts an optional listen host and binds using the existing fallback logic.
- `HubController` owns persisted settings, startup restoration, and restart behavior.
- Renderer state mirrors `HubStatusSnapshot` and calls a new `setListenHost()` IPC action.

## Behavior

- Starting Hub saves `enabled=1` only after the server starts successfully.
- Stopping Hub from settings saves `enabled=0`.
- App shutdown stops server/tunnel without changing `enabled`.
- If `listen_host` changes while running, controller stops the tunnel, restarts Hub, then attempts to restore the tunnel if it was running.
- If startup restoration fails, Hub remains off at runtime but the persisted setting stays on so users can see/retry from settings.

## UI

- Hub settings adds a “监听地址” selector inside the local service card.
- `127.0.0.1` is labelled local-only.
- `0.0.0.0` is labelled LAN access and includes a security warning.
- When bound to `0.0.0.0`, the displayed URL should prefer a real non-internal IPv4 address instead of `0.0.0.0`; if none is available, fall back to `0.0.0.0` with explanatory text.

## Testing

- Server unit tests cover explicit loopback and LAN host binding status.
- Controller/unit-level behavior is covered where practical through helper tests or direct server tests.
- Renderer/store tests are not required unless an existing adjacent Hub settings test exists.

## Self-Review

- No placeholder requirements remain.
- The design keeps the default secure and only exposes LAN when the user opts in.
- The persisted enabled state is separate from shutdown cleanup so app restart can restore Hub.
