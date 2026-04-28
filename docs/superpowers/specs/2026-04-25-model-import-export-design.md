# Model Import / Export In Settings

## Problem

The Settings > Models screen supports editing model profiles and selecting default models, but it has no way to back up or migrate that configuration. Users who reinstall the app, move to another machine, or want to share a known-good model setup must recreate profiles and selected models manually.

This repository already stores model configuration in two places:

- `model_profiles` in SQLite via `window.modelProfileOps`
- global and per-SDK selected models in `useSettingsStore`

The missing piece is a safe import/export flow in Settings that can move both sets of data together.

## Goal

Add an import/export feature to Settings > Models that:

- exports all model profiles
- exports the currently selected global model state
- imports the same payload back into the app
- detects profile name conflicts during import
- lets the user choose whether conflicting profiles should be overwritten or skipped

## Scope

Included:

- all model profiles shown in Settings > Models
- `selectedModel`
- `selectedModelByProvider`
- restoring the imported model selection after import
- UI entry points in Settings > Models
- renderer-side validation and conflict handling

Excluded:

- project, worktree, or connection-level profile assignment export/import
- mode-specific defaults such as `defaultModels`
- non-model settings
- encrypted export format

## Recommended Approach

Implement a renderer-side import/export module and keep file handling in the Settings UI.

Why this approach:

- it reuses the existing `modelProfileOps` and `useSettingsStore` APIs
- it keeps the feature local to the Settings > Models surface
- it avoids adding new main/preload IPC for a UI-scoped feature
- it is easier to test as pure import/export helpers plus a thin UI layer

## Alternatives Considered

### 1. Put all logic directly inside `SettingsModels.tsx`

This would be the smallest code change, but it would mix JSON parsing, version validation, conflict detection, file I/O, and persistence logic into a UI component that is already responsible for rendering model settings.

### 2. Add new main-process IPC for import/export

This would centralize the logic, but it expands the change surface across main, preload, and renderer without strong payoff for a settings-only workflow. It also makes tests heavier.

### 3. Renderer-side import/export service

This keeps the UI thin while reusing the existing stores and IPC. This is the recommended option.

## Export Format

Use a versioned JSON file with a stable top-level shape:

```json
{
  "version": 1,
  "exported_at": "2026-04-25T12:00:00.000Z",
  "profiles": [
    {
      "name": "Claude Proxy",
      "provider": "claude",
      "api_key": "...",
      "base_url": "https://proxy.example.com",
      "model_id": "claude-sonnet-4",
      "openai_api_key": null,
      "openai_base_url": null,
      "codex_config_toml": null,
      "settings_json": "{}",
      "is_default": true
    }
  ],
  "selected_model": {
    "providerID": "anthropic",
    "modelID": "claude-sonnet-4-5",
    "variant": "thinking"
  },
  "selected_model_by_provider": {
    "claude-code": {
      "providerID": "anthropic",
      "modelID": "claude-sonnet-4-5",
      "variant": "thinking"
    },
    "codex": {
      "providerID": "openai",
      "modelID": "gpt-5.1",
      "variant": "fast"
    }
  }
}
```

Notes:

- do not export internal database IDs or timestamps for profiles
- export only fields needed to recreate profile content
- include both `selected_model` and `selected_model_by_provider` because the current store supports legacy global selection and newer per-SDK selection

## Import Rules

### File Validation

The import flow must reject payloads that:

- are not valid JSON
- are missing `version`
- use an unsupported `version`
- do not contain `profiles` as an array
- contain profile entries missing required fields such as `name`, `provider`, or `settings_json`

### Conflict Detection

Conflict identity is based on `profile.name`.

Before writing any imported profile, compare incoming names against existing profiles:

- no conflict: create a new profile
- conflict: collect the conflicting names and ask the user what to do

The user-selected conflict strategy applies to all conflicts in that import run:

- `overwrite`: update the existing profile with imported content
- `skip`: leave the existing profile untouched

This matches the user requirement that import behavior should be chosen interactively rather than hard-coded.

### Default Profile Restoration

Imported profile default state should be restored after all create/update operations finish.

If multiple imported profiles are marked `is_default`, the importer should treat the last imported default as authoritative. In practice, the exporter should emit at most one default profile, but the importer should still behave deterministically.

### Selected Model Restoration

After profile import completes:

- restore `selectedModel`
- restore `selectedModelByProvider`
- persist restored selections through the existing `useSettingsStore` actions

This ensures the import updates both local persisted settings and the backend-selected model routing already handled by the store.

## UI Design

File: `src/renderer/src/components/settings/SettingsModels.tsx`

Add two actions next to the existing model profile controls:

- `Export All`
- `Import`

Behavior:

- `Export All` builds the export payload and triggers a JSON download
- `Import` opens a file picker for `.json`
- if conflicts are detected, show a confirmation dialog describing the conflicting profile names and offering:
  - overwrite conflicting profiles
  - skip conflicting profiles
- show success and error toasts for the final result

The UI should stay in the existing Settings visual language and not introduce a new settings section for this feature.

## Renderer Module Design

Add a dedicated helper module in the renderer, for example:

- `src/renderer/src/lib/model-import-export.ts`

Responsibilities:

- define the import/export payload types
- build export payloads from current store state
- validate parsed JSON payloads
- detect conflicts against existing profiles
- produce an import execution plan

The actual writes should still happen through the existing stores and `window.modelProfileOps`.

This keeps parsing and transformation logic separate from React rendering.

## Persistence Flow

### Export

1. Read profiles from `useModelProfileStore`
2. Read `selectedModel` and `selectedModelByProvider` from `useSettingsStore`
3. Build versioned JSON payload
4. Download as a file such as `xuanpu-models-YYYY-MM-DD.json`

### Import

1. User selects a JSON file
2. Parse and validate payload
3. Load current profiles
4. Detect conflicts by profile name
5. If conflicts exist, ask the user to choose overwrite or skip
6. For each imported profile:
   - overwrite: `updateProfile(existing.id, importedData)`
   - skip: do nothing for that entry
   - no conflict: `createProfile(importedData)`
7. Restore imported default profile
8. Restore imported selected models through `useSettingsStore`
9. Reload model profiles and show summary toast

## Error Handling

User-facing errors:

- invalid JSON
- unsupported import version
- malformed profile data
- failed create/update during import
- failed export download construction

Behavior:

- reject invalid payloads before any write
- stop the import on unexpected persistence failures
- show a concise error toast with the underlying message when available

## Testing

Follow TDD and cover both helper logic and UI-driven behavior.

### Helper tests

- export payload contains the expected shape
- export payload excludes profile IDs and timestamps
- validation rejects malformed payloads
- conflict detection identifies matching names correctly
- import planning handles overwrite and skip modes deterministically

### UI/store integration tests

- clicking export produces a payload with profiles and selected models
- import with no conflicts creates profiles and restores selected models
- import with conflicts plus overwrite updates existing profiles
- import with conflicts plus skip leaves existing profiles untouched
- successful import refreshes the profile list

## Files Expected To Change

- `src/renderer/src/components/settings/SettingsModels.tsx`
- `src/renderer/src/stores/useModelProfileStore.ts`
- `src/renderer/src/stores/useSettingsStore.ts`
- `src/renderer/src/lib/model-import-export.ts`
- relevant renderer tests under `test/`

## Risks

- Restoring selected models must use existing store actions carefully to avoid stale local state or backend divergence.
- Importing secrets in plaintext JSON is intentional for this feature, but users should understand the file contains API credentials.
- Name-based conflict resolution is simple and user-visible, but renaming a profile before import will create a second entry rather than match the old one.

## Success Criteria

- A user can export model profiles plus current model selections from Settings > Models.
- A user can import that file on another machine and restore the same profiles and selected models.
- When imported profile names already exist, the app asks whether to overwrite or skip those conflicts.
- The feature fits the current Settings UI and has automated test coverage.
