import { useState, useEffect } from 'react'
import { adminApi } from '@/api/admin'
import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon, Monitor } from 'lucide-react'

type ErrorCode = 'needs_setup' | 'locked_out' | 'wrong_password' | 'empty_password' | 'bad_request' | 'network' | ''

function errorStyles(code: ErrorCode) {
  if (code === 'locked_out') return 'bg-orange-500/10 border-orange-500/20 text-orange-400'
  if (code === 'needs_setup') return 'bg-blue-500/10 border-blue-500/20 text-blue-400'
  return 'bg-red-500/10 border-red-500/20 text-red-400'
}

function errorIcon(code: ErrorCode) {
  if (code === 'needs_setup') return '⚙️'
  if (code === 'locked_out')  return '🔒'
  return '⚠️'
}

export default function AdminLogin() {
  const { theme, setTheme } = useTheme()
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [errorCode, setErrorCode] = useState<ErrorCode>('')
  const [loading, setLoading]     = useState(false)
  const [checking, setChecking]   = useState(true)

  // On mount: check setup status. Redirect to wizard if first-run is needed.
  useEffect(() => {
    adminApi.setupStatus()
      .then(({ needsSetup }) => {
        if (needsSetup) {
          window.location.href = '/admin/setup'
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setErrorCode('')
    try {
      await adminApi.login(password)
      window.location.href = '/admin/dashboard'
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.'
      setError(msg)
      if (msg.includes('locked') || msg.includes('lockout') || msg.includes('Too many'))
        setErrorCode('locked_out')
      else if (msg.includes('setup'))
        setErrorCode('needs_setup')
      else
        setErrorCode('wrong_password')
    } finally {
      setLoading(false)
    }
  }

  const themeOptions: Array<{ value: typeof theme; icon: typeof Sun }> = [
    { value: 'dark',   icon: Moon },
    { value: 'light',  icon: Sun },
    { value: 'system', icon: Monitor },
  ]
  const next = themeOptions[(themeOptions.findIndex(t => t.value === theme) + 1) % 3]
  const ThemeIcon = themeOptions.find(t => t.value === theme)?.icon ?? Moon

  if (checking) {
    return (
      <div className="min-h-screen bg-surface-0 flex items-center justify-center">
        <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center px-4">
      {/* Theme toggle */}
      <button
        onClick={() => setTheme(next.value)}
        className="fixed top-4 right-4 p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-2 transition-colors"
        title={`Switch theme (current: ${theme})`}
      >
        <ThemeIcon className="size-4" />
      </button>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2 mb-3">
            <img src="/favicon-96x96.png" alt="MailTub" className="w-8 h-8 rounded-lg object-cover" />
            <span className="text-primary font-bold text-xl tracking-tight">MailTub</span>
          </div>
          <p className="text-muted text-sm">Admin Panel</p>
        </div>

        {/* needs_setup fallback (shouldn't normally appear — useEffect redirects) */}
        {errorCode === 'needs_setup' ? (
          <div className="bg-surface-1 border border-border rounded-2xl p-7 shadow-2xl space-y-4 text-center">
            <div className="text-3xl">⚙️</div>
            <div>
              <h2 className="text-primary font-semibold text-base mb-1">Setup Required</h2>
              <p className="text-secondary text-sm leading-relaxed">
                The admin password has not been configured yet.
              </p>
            </div>
            <a
              href="/admin/setup"
              className="block w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg py-2.5 text-center transition-colors"
            >
              Open setup wizard
            </a>
          </div>
        ) : (
          /* Login form */
          <form onSubmit={handleSubmit} className="bg-surface-1 border border-border rounded-2xl p-7 shadow-2xl">
            <h1 className="text-primary font-semibold text-base mb-5">Sign in to continue</h1>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Admin Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-surface-0 border border-border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none focus:border-emerald-500/50 transition-colors"
                  autoFocus
                  autoComplete="current-password"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 border text-xs ${errorStyles(errorCode)}`}>
                  <span className="shrink-0 leading-none mt-0.5">{errorIcon(errorCode)}</span>
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg py-2.5 mt-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        )}

        <p className="text-center mt-5">
          <a href="/" className="text-muted text-xs hover:text-secondary transition-colors">← Back to inbox</a>
        </p>
      </div>
    </div>
  )
}
