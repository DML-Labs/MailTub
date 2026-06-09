import { useState } from 'react'
import { adminApi } from '@/api/admin'
import { useTheme } from '@/contexts/ThemeContext'
import { Sun, Moon, Monitor, Eye, EyeOff, ShieldCheck } from 'lucide-react'

export default function AdminSetup() {
  const { theme, setTheme } = useTheme()
  const [password, setPassword]         = useState('')
  const [confirmPassword, setConfirm]   = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [field, setField]               = useState<'password' | 'confirm' | ''>('')

  const themeOptions: Array<{ value: typeof theme; icon: typeof Sun }> = [
    { value: 'dark',   icon: Moon },
    { value: 'light',  icon: Sun },
    { value: 'system', icon: Monitor },
  ]
  const next = themeOptions[(themeOptions.findIndex(t => t.value === theme) + 1) % 3]
  const ThemeIcon = themeOptions.find(t => t.value === theme)?.icon ?? Moon

  const strength = (() => {
    if (!password) return 0
    let s = 0
    if (password.length >= 8)  s++
    if (password.length >= 16) s++
    if (/[A-Z]/.test(password)) s++
    if (/[0-9]/.test(password)) s++
    if (/[^A-Za-z0-9]/.test(password)) s++
    return s
  })()

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][strength] ?? ''
  const strengthColor = ['', 'bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-400', 'bg-emerald-500'][strength] ?? 'bg-emerald-500'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setField('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setField('password')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      setField('confirm')
      return
    }

    setLoading(true)
    try {
      await adminApi.setup(password, confirmPassword)
      window.location.href = '/admin/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.')
    } finally {
      setLoading(false)
    }
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
          <p className="text-muted text-sm">Admin Setup</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface-1 border border-border rounded-2xl p-7 shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="size-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <ShieldCheck className="size-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-primary font-semibold text-base leading-none">Create admin password</h1>
              <p className="text-muted text-xs mt-0.5">Stored securely as a bcrypt hash in your database</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Password field */}
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className={`w-full bg-surface-0 border rounded-lg px-3 py-2.5 pr-9 text-sm text-primary placeholder-muted focus:outline-none transition-colors ${
                    field === 'password' ? 'border-red-500/60' : 'border-border focus:border-emerald-500/50'
                  }`}
                  autoFocus
                  autoComplete="new-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {/* Strength meter */}
              {password && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex gap-0.5 flex-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength ? strengthColor : 'bg-surface-3'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted shrink-0">{strengthLabel}</span>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="text-xs font-medium text-secondary block mb-1.5">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirm(e.target.value)}
                placeholder="••••••••••••"
                className={`w-full bg-surface-0 border rounded-lg px-3 py-2.5 text-sm text-primary placeholder-muted focus:outline-none transition-colors ${
                  field === 'confirm' ? 'border-red-500/60' : 'border-border focus:border-emerald-500/50'
                }`}
                autoComplete="new-password"
                disabled={loading}
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 rounded-lg px-3 py-2.5 border bg-red-500/10 border-red-500/20 text-xs text-red-400">
                <span className="shrink-0 leading-none mt-0.5">⚠️</span>
                <p className="leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg py-2.5 mt-1 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Setting up…' : 'Set password & open dashboard'}
            </button>
          </div>
        </form>

        <p className="text-center mt-5">
          <a href="/" className="text-muted text-xs hover:text-secondary transition-colors">← Back to inbox</a>
        </p>
      </div>
    </div>
  )
}
