import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../stores/useAuth'
import { getApiBase, setApiBase } from '../api/client'

export function Login(): React.JSX.Element {
  const { login, error } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [apiBaseDraft, setApiBaseDraft] = useState(getApiBase())

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setSubmitting(true)
    const ok = await login(username.trim(), password)
    setSubmitting(false)
    if (ok) navigate('/devices', { replace: true })
  }

  const saveApiBase = (): void => {
    const v = apiBaseDraft.trim().replace(/\/+$/, '')
    if (v) {
      setApiBase(v)
      setShowAdvanced(false)
    }
  }

  return (
    <div className="mobile-page flex min-h-dvh flex-col justify-end px-5 pb-10 pt-8 safe-pad-top safe-pad-bottom min-[420px]:justify-center">
      <div className="w-full max-w-sm mx-auto">
        <div className="mb-7 flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-xl font-black text-zinc-950 shadow-[0_14px_40px_rgba(244,244,245,0.16)]">
            玄
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight leading-none">Xuanpu</h1>
            <p className="mt-1.5 text-[15px] text-zinc-400">Hub 远程访问</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mobile-card rounded-[28px] p-3.5 space-y-3.5">
          <label className="block">
            <span className="sr-only">用户名</span>
            <input
              type="text"
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-4 text-[17px] text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:bg-zinc-950"
            />
          </label>
          <label className="block">
            <span className="sr-only">密码</span>
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 py-4 text-[17px] text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-zinc-500 focus:bg-zinc-950"
            />
          </label>
          {error && (
            <p className="rounded-2xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !username.trim() || !password}
            className="h-13 w-full rounded-2xl bg-zinc-100 text-base font-semibold text-zinc-950 shadow-[0_14px_34px_rgba(244,244,245,0.12)] transition active:scale-[0.99] active:bg-white disabled:opacity-45 disabled:active:scale-100"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="rounded-full px-4 py-2 text-sm text-zinc-500 active:bg-zinc-900 active:text-zinc-300"
          >
            {showAdvanced ? '收起高级设置' : '高级设置'}
          </button>
        </div>

        {showAdvanced && (
          <div className="mobile-card mt-4 space-y-3 rounded-3xl p-4">
            <label className="block">
              <span className="text-sm font-medium text-zinc-300">Hub API 地址</span>
              <input
                type="url"
                value={apiBaseDraft}
                onChange={(e) => setApiBaseDraft(e.target.value)}
                placeholder="https://xxx.trycloudflare.com"
                className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm font-mono text-zinc-100 outline-none focus:border-zinc-500"
              />
            </label>
            <button
              type="button"
              onClick={saveApiBase}
              className="h-11 w-full rounded-2xl bg-zinc-800 text-sm font-medium text-zinc-100 active:bg-zinc-700"
            >
              保存并刷新
            </button>
            <p className="text-xs text-zinc-500">
              保存后本地持久化，无需每次在 URL 加 <code>?api=</code>。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
