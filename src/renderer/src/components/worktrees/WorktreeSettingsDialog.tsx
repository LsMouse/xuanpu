import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from '@/lib/toast'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useSettingsStore } from '@/stores'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { ModelSelector } from '@/components/sessions/ModelSelector'
import { EnvVarsEditor } from '@/components/shared/EnvVarsEditor'

interface WorktreeRecord {
  id: string
  name: string
  path: string
  default_model_provider_id: string | null
  default_model_id: string | null
  default_model_variant: string | null
  env_vars: string | null
  default_agent_sdk: string | null
  sdk_configs: string | null
}

interface WorktreeSettingsDialogProps {
  worktree: WorktreeRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SDK_CONFIG_TABS = ['claude-code', 'codex'] as const
type SdkConfigTab = (typeof SDK_CONFIG_TABS)[number]

function parseSdkConfigs(json: string | null): Record<string, string> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    // Store each SDK config as a pretty-printed JSON string for editing
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
    }
    return result
  } catch {
    return {}
  }
}

function serializeSdkConfigs(configs: Record<string, string>): string | null {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(configs)) {
    const trimmed = value.trim()
    if (!trimmed || trimmed === '{}') continue
    try {
      result[key] = JSON.parse(trimmed)
    } catch {
      // Store as-is if not valid JSON (user might be editing)
      result[key] = trimmed
    }
  }
  return Object.keys(result).length > 0 ? JSON.stringify(result) : null
}

export function WorktreeSettingsDialog({
  worktree,
  open,
  onOpenChange
}: WorktreeSettingsDialogProps): React.JSX.Element {
  const { t } = useI18n()
  const availableAgentSdks = useSettingsStore((state) => state.availableAgentSdks)
  const globalDefaultSdk = useSettingsStore((state) => state.defaultAgentSdk)

  const [defaultAgentSdk, setDefaultAgentSdk] = useState<string | null>(null)
  const [defaultModel, setDefaultModel] = useState<{
    providerID: string
    modelID: string
    variant?: string
  } | null>(null)
  const [envVars, setEnvVars] = useState<Record<string, string>>({})
  const [sdkConfigs, setSdkConfigs] = useState<Record<string, string>>({})
  const [activeConfigTab, setActiveConfigTab] = useState<SdkConfigTab>('claude-code')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleEnvVarsChange = useCallback((v: Record<string, string>) => {
    setEnvVars(v)
  }, [])

  useEffect(() => {
    if (open) {
      setDefaultAgentSdk(worktree.default_agent_sdk ?? null)
      if (worktree.default_model_id) {
        setDefaultModel({
          providerID: worktree.default_model_provider_id!,
          modelID: worktree.default_model_id,
          variant: worktree.default_model_variant ?? undefined
        })
      } else {
        setDefaultModel(null)
      }
      if (worktree.env_vars) {
        try {
          setEnvVars(JSON.parse(worktree.env_vars))
        } catch {
          setEnvVars({})
        }
      } else {
        setEnvVars({})
      }
      setSdkConfigs(parseSdkConfigs(worktree.sdk_configs))
      setJsonError(null)
    }
  }, [
    open,
    worktree.default_agent_sdk,
    worktree.default_model_provider_id,
    worktree.default_model_id,
    worktree.default_model_variant,
    worktree.env_vars,
    worktree.sdk_configs
  ])

  const handleConfigChange = useCallback(
    (value: string) => {
      setSdkConfigs((prev) => ({ ...prev, [activeConfigTab]: value }))
      // Validate JSON
      const trimmed = value.trim()
      if (!trimmed || trimmed === '{}') {
        setJsonError(null)
        return
      }
      try {
        JSON.parse(trimmed)
        setJsonError(null)
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'Invalid JSON')
      }
    },
    [activeConfigTab]
  )

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await window.db.worktree.update(worktree.id, {
        default_agent_sdk: defaultAgentSdk,
        default_model_provider_id: defaultModel?.providerID ?? null,
        default_model_id: defaultModel?.modelID ?? null,
        default_model_variant: defaultModel?.variant ?? null,
        env_vars: Object.keys(envVars).length > 0 ? JSON.stringify(envVars) : null,
        sdk_configs: serializeSdkConfigs(sdkConfigs)
      })
      if (result) {
        toast.success(t('dialogs.worktreeSettings.saveSuccess'))
        onOpenChange(false)
      } else {
        toast.error(t('dialogs.worktreeSettings.saveError'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('dialogs.worktreeSettings.title')}</DialogTitle>
          <DialogDescription className="text-xs truncate">{worktree.path}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Default Agent SDK */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('dialogs.worktreeSettings.defaultAgentSdk.label')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('dialogs.worktreeSettings.defaultAgentSdk.description')}
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setDefaultAgentSdk(null)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm border transition-colors',
                  defaultAgentSdk === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent/50'
                )}
              >
                {t('dialogs.worktreeSettings.defaultAgentSdk.useProjectDefault')}
              </button>
              {availableAgentSdks?.opencode && (
                <button
                  onClick={() => setDefaultAgentSdk('opencode')}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                    defaultAgentSdk === 'opencode'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent/50'
                  )}
                >
                  OpenCode
                </button>
              )}
              {availableAgentSdks?.claude && (
                <button
                  onClick={() => setDefaultAgentSdk('claude-code')}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                    defaultAgentSdk === 'claude-code'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent/50'
                  )}
                >
                  Claude Code
                </button>
              )}
              {availableAgentSdks?.codex && (
                <button
                  onClick={() => setDefaultAgentSdk('codex')}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm border transition-colors',
                    defaultAgentSdk === 'codex'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent/50'
                  )}
                >
                  Codex
                </button>
              )}
              <button
                onClick={() => setDefaultAgentSdk('terminal')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm border transition-colors',
                  defaultAgentSdk === 'terminal'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent/50'
                )}
              >
                Terminal
              </button>
            </div>
            {defaultAgentSdk === null && (
              <p className="text-xs text-muted-foreground/70 italic">
                {t('dialogs.worktreeSettings.defaultAgentSdk.currentDefault', {
                  sdk:
                    globalDefaultSdk === 'claude-code'
                      ? 'Claude Code'
                      : globalDefaultSdk === 'codex'
                        ? 'Codex'
                        : globalDefaultSdk === 'terminal'
                          ? 'Terminal'
                          : 'OpenCode'
                })}
              </p>
            )}
          </div>

          {/* Default Model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('dialogs.worktreeSettings.defaultModel.label')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('dialogs.worktreeSettings.defaultModel.description')}
            </p>
            <div className="flex items-center gap-2">
              <ModelSelector value={defaultModel} onChange={setDefaultModel} />
              {defaultModel && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() => setDefaultModel(null)}
                >
                  {t('dialogs.worktreeSettings.defaultModel.useProjectDefault')}
                </Button>
              )}
            </div>
          </div>

          {/* Environment Variables */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('dialogs.worktreeSettings.envVars.label')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('dialogs.worktreeSettings.envVars.description')}
            </p>
            <EnvVarsEditor value={envVars} onChange={handleEnvVarsChange} />
          </div>

          {/* SDK Config (JSON) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              {t('dialogs.worktreeSettings.sdkConfigs.label')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('dialogs.worktreeSettings.sdkConfigs.description')}
            </p>
            <div className="flex gap-1.5 mb-2">
              {SDK_CONFIG_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveConfigTab(tab)
                    setJsonError(null)
                  }}
                  className={cn(
                    'px-3 py-1 rounded-md text-xs border transition-colors',
                    activeConfigTab === tab
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 text-muted-foreground border-border hover:bg-accent/50'
                  )}
                >
                  {tab === 'claude-code'
                    ? t('dialogs.worktreeSettings.sdkConfigs.claudeCode')
                    : t('dialogs.worktreeSettings.sdkConfigs.codex')}
                </button>
              ))}
            </div>
            <Textarea
              ref={textareaRef}
              value={sdkConfigs[activeConfigTab] ?? ''}
              onChange={(e) => handleConfigChange(e.target.value)}
              placeholder={t('dialogs.worktreeSettings.sdkConfigs.emptyHint')}
              rows={8}
              className="font-mono text-sm resize-y"
            />
            {jsonError && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                {jsonError}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('dialogs.worktreeSettings.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t('dialogs.worktreeSettings.saving') : t('dialogs.worktreeSettings.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
