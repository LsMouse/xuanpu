import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLogger } from './logger'

const log = createLogger({ component: 'SdkConfigWriter' })

// ── Deep merge utility ──────────────────────────────────────────

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

/**
 * Deep-merge `override` onto `base`.  Objects are merged recursively;
 * arrays and primitives in `override` replace the value in `base`.
 */
function deepMerge(base: JsonObject, override: JsonObject): JsonObject {
  const result: JsonObject = { ...base }
  for (const key of Object.keys(override)) {
    const bVal = base[key]
    const oVal = override[key]
    if (
      typeof bVal === 'object' &&
      bVal !== null &&
      !Array.isArray(bVal) &&
      typeof oVal === 'object' &&
      oVal !== null &&
      !Array.isArray(oVal)
    ) {
      result[key] = deepMerge(bVal as JsonObject, oVal as JsonObject)
    } else {
      result[key] = oVal
    }
  }
  return result
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Parse and merge per-SDK configs from project + worktree layers,
 * then write relevant config files to disk before session start.
 *
 * Merge order: project ← worktree  (worktree keys override project)
 */
export async function writeSdkConfigs(
  worktreePath: string,
  projectSdkConfigs: string | null,
  worktreeSdkConfigs: string | null
): Promise<void> {
  // Parse stored JSON blobs
  let projectConfigs: Record<string, JsonObject> = {}
  let worktreeConfigs: Record<string, JsonObject> = {}

  if (projectSdkConfigs) {
    try {
      projectConfigs = JSON.parse(projectSdkConfigs)
    } catch {
      log.warn('Invalid project sdk_configs JSON, ignoring')
    }
  }
  if (worktreeSdkConfigs) {
    try {
      worktreeConfigs = JSON.parse(worktreeSdkConfigs)
    } catch {
      log.warn('Invalid worktree sdk_configs JSON, ignoring')
    }
  }

  // Merge: collect all SDK keys from both layers
  const allSdkKeys = new Set([
    ...Object.keys(projectConfigs),
    ...Object.keys(worktreeConfigs)
  ])

  for (const sdkKey of allSdkKeys) {
    const projectCfg = projectConfigs[sdkKey] ?? {}
    const worktreeCfg = worktreeConfigs[sdkKey] ?? {}
    const merged =
      Object.keys(worktreeCfg).length > 0
        ? deepMerge(projectCfg as JsonObject, worktreeCfg as JsonObject)
        : projectCfg

    if (Object.keys(merged).length === 0) continue

    try {
      if (sdkKey === 'claude-code') {
        await writeClaudeCodeConfig(worktreePath, merged)
      }
      // Codex: placeholder for future support
      // if (sdkKey === 'codex') { ... }
    } catch (err) {
      log.warn(`Failed to write config for SDK "${sdkKey}"`, {
        worktreePath,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  }
}

// ── Per-SDK writers ─────────────────────────────────────────────

async function writeClaudeCodeConfig(
  worktreePath: string,
  config: JsonObject
): Promise<void> {
  const claudeDir = join(worktreePath, '.claude')
  await mkdir(claudeDir, { recursive: true })

  const settingsPath = join(claudeDir, 'settings.local.json')
  const content = JSON.stringify(config, null, 2) + '\n'
  await writeFile(settingsPath, content, 'utf-8')

  log.info('Wrote Claude Code settings.local.json', {
    worktreePath,
    path: settingsPath,
    configKeys: Object.keys(config)
  })
}
