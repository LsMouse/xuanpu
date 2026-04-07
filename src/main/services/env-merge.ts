/**
 * Utilities for merging per-project / per-worktree environment variables
 * into the AI SDK process environment.
 *
 * Merge order: process.env ← project.env_vars ← worktree.env_vars
 * (worktree overrides project, project overrides global)
 */

/**
 * Parse and merge project + worktree env var JSON blobs.
 * Returns only the user-defined overrides (does NOT include process.env).
 */
export function mergeEnvVars(
  projectEnvJson: string | null,
  worktreeEnvJson: string | null
): Record<string, string> {
  const result: Record<string, string> = {}
  if (projectEnvJson) {
    try {
      Object.assign(result, JSON.parse(projectEnvJson))
    } catch {
      // ignore invalid JSON
    }
  }
  if (worktreeEnvJson) {
    try {
      Object.assign(result, JSON.parse(worktreeEnvJson))
    } catch {
      // ignore invalid JSON
    }
  }
  return result
}

/**
 * Build a full env object for SDK child processes by merging
 * process.env with project + worktree overrides.
 */
export function buildSdkEnv(
  projectEnvJson: string | null,
  worktreeEnvJson: string | null
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...mergeEnvVars(projectEnvJson, worktreeEnvJson)
  }
}
