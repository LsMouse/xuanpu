import { useState, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/useI18n'

interface EnvVarsEditorProps {
  value: Record<string, string>
  onChange: (v: Record<string, string>) => void
}

interface EnvEntry {
  key: string
  value: string
}

function toEntries(obj: Record<string, string>): EnvEntry[] {
  const entries = Object.entries(obj).map(([key, value]) => ({ key, value }))
  return entries.length > 0 ? entries : [{ key: '', value: '' }]
}

function fromEntries(entries: EnvEntry[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const entry of entries) {
    const key = entry.key.trim()
    if (key) result[key] = entry.value
  }
  return result
}

export function EnvVarsEditor({ value, onChange }: EnvVarsEditorProps): React.JSX.Element {
  const { t } = useI18n()
  const [entries, setEntries] = useState<EnvEntry[]>(() => toEntries(value))

  const commit = useCallback(
    (newEntries: EnvEntry[]) => {
      setEntries(newEntries)
      onChange(fromEntries(newEntries))
    },
    [onChange]
  )

  const handleKeyChange = useCallback(
    (index: number, newKey: string) => {
      const updated = entries.map((e, i) => (i === index ? { ...e, key: newKey } : e))
      commit(updated)
    },
    [entries, commit]
  )

  const handleValueChange = useCallback(
    (index: number, newValue: string) => {
      const updated = entries.map((e, i) => (i === index ? { ...e, value: newValue } : e))
      commit(updated)
    },
    [entries, commit]
  )

  const handleAdd = useCallback(() => {
    commit([...entries, { key: '', value: '' }])
  }, [entries, commit])

  const handleRemove = useCallback(
    (index: number) => {
      const updated = entries.filter((_, i) => i !== index)
      commit(updated.length > 0 ? updated : [{ key: '', value: '' }])
    },
    [entries, commit]
  )

  // Detect duplicate keys for validation
  const keyCounts = new Map<string, number>()
  for (const entry of entries) {
    const k = entry.key.trim()
    if (k) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1)
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, index) => {
        const isDuplicate = entry.key.trim() && (keyCounts.get(entry.key.trim()) ?? 0) > 1
        return (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={entry.key}
              onChange={(e) => handleKeyChange(index, e.target.value)}
              placeholder={t('dialogs.envVars.keyPlaceholder')}
              className={`font-mono text-sm flex-1 h-8 ${isDuplicate ? 'border-destructive' : ''}`}
            />
            <span className="text-muted-foreground text-sm">=</span>
            <Input
              value={entry.value}
              onChange={(e) => handleValueChange(index, e.target.value)}
              placeholder={t('dialogs.envVars.valuePlaceholder')}
              className="font-mono text-sm flex-[2] h-8"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => handleRemove(index)}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        )
      })}
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleAdd}>
        <Plus className="h-3 w-3 mr-1.5" />
        {t('dialogs.envVars.addVariable')}
      </Button>
    </div>
  )
}
