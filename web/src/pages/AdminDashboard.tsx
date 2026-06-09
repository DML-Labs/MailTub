import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  adminApi,
  type AdminStats, type AdminMailbox, type AdminEmail,
  type LogEntry, type AdminConfig,
} from '@/api/admin'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'
import {
  RefreshCw, Trash2, LogOut, ChevronDown, ChevronRight,
  Mail, Clock, Database, Activity, Shield, Search,
  Terminal, Settings, AlertTriangle,
  Copy, Check, Sun, Moon, Monitor, ServerCrash,
} from 'lucide-react'

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
function fmtShort(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function isExpired(iso: string) { return new Date(iso) < new Date() }

type Tab = 'overview' | 'mailboxes' | 'logs' | 'config'
type StatusFilter = 'all' | 'active' | 'expired' | 'hasEmails' | 'empty'
type LogLevel = 'all' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

// ── Stat card ──────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, accent }: {
  label: string; value: number | string; icon: React.ReactNode; accent?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 flex items-center gap-4">
      <div className={cn('size-10 rounded-lg flex items-center justify-center text-white shrink-0', accent ?? 'bg-emerald-600/20')}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-muted uppercase tracking-wide font-medium">{label}</p>
        <p className="text-2xl font-bold text-primary leading-none mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ── Copy button ────────────────────────────────────────────────────────────

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} className="p-1 rounded text-muted hover:text-primary transition-colors" title="Copy">
      {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
    </button>
  )
}

// ── Log level badge ────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    DEBUG: 'text-blue-400 bg-blue-500/10',
    INFO:  'text-emerald-400 bg-emerald-500/10',
    WARN:  'text-yellow-400 bg-yellow-500/10',
    ERROR: 'text-red-400 bg-red-500/10',
  }
  const upper = level.toUpperCase()
  return (
    <span className={cn('inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold', map[upper] ?? 'text-secondary bg-surface-3')}>
      {upper}
    </span>
  )
}

// ── Theme toggle button ────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const options: Array<{ value: typeof theme; icon: React.ReactNode; label: string }> = [
    { value: 'dark',   icon: <Moon className="size-3.5" />,    label: 'Dark' },
    { value: 'light',  icon: <Sun className="size-3.5" />,     label: 'Light' },
    { value: 'system', icon: <Monitor className="size-3.5" />, label: 'System' },
  ]
  const current = options.findIndex(o => o.value === theme)
  const next = options[(current + 1) % 3]
  const CurrentIcon = options[current]?.icon ?? <Moon className="size-3.5" />
  return (
    <button
      onClick={() => setTheme(next.value)}
      className="p-1.5 rounded-lg border border-border text-muted hover:text-primary hover:bg-surface-2 transition-colors"
      title={`Theme: ${theme} — click to switch`}
    >
      {CurrentIcon}
    </button>
  )
}

// ── Main dashboard ─────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const LIMIT = 50
  const [purging, setPurging] = useState<string | null>(null)
  const [purgingExpired, setPurgingExpired] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mailboxEmails, setMailboxEmails] = useState<Record<string, AdminEmail[]>>({})
  const [loadingEmails, setLoadingEmails] = useState<string | null>(null)
  const [selectedEmail, setSelectedEmail] = useState<AdminEmail | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [logLevel, setLogLevel] = useState<LogLevel>('all')
  const [logSearch, setLogSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [adminConfig, setAdminConfig] = useState<AdminConfig | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const logTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Change password form state
  const [cpCurrent, setCpCurrent]     = useState('')
  const [cpNew, setCpNew]             = useState('')
  const [cpConfirm, setCpConfirm]     = useState('')
  const [cpShowNew, setCpShowNew]     = useState(false)
  const [cpLoading, setCpLoading]     = useState(false)
  const [cpError, setCpError]         = useState('')
  const [cpSuccess, setCpSuccess]     = useState(false)

  // Auth check
  function handleAuthError() { window.location.href = '/admin/login' }

  const loadStats = useCallback(async () => {
    try { setStats(await adminApi.stats()) }
    catch (e) { if ((e as Error).message === 'unauthorized') handleAuthError() }
  }, [])

  const loadMailboxes = useCallback(async (p: number) => {
    try {
      const res = await adminApi.mailboxes(p, LIMIT)
      setMailboxes(res.mailboxes ?? [])
      setTotal(res.total)
    } catch { /* handled via stats */ }
  }, [])

  const loadLogs = useCallback(async () => {
    try { const res = await adminApi.logs(300); setLogs(res.logs ?? []) }
    catch { /* ignore */ }
  }, [])

  const loadConfig = useCallback(async () => {
    try { setAdminConfig(await adminApi.config()) }
    catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadStats()
    loadMailboxes(page)
  }, [loadStats, loadMailboxes, page])

  useEffect(() => {
    if (tab === 'logs') {
      loadLogs()
      if (autoRefresh) {
        logTimerRef.current = setInterval(loadLogs, 5000)
      }
    }
    return () => { if (logTimerRef.current) clearInterval(logTimerRef.current) }
  }, [tab, autoRefresh, loadLogs])

  useEffect(() => {
    if (tab === 'config') loadConfig()
  }, [tab, loadConfig])

  async function handleLogout() {
    await adminApi.logout()
    window.location.href = '/admin/login'
  }

  async function handlePurge(id: string) {
    setPurging(id); setError('')
    try {
      await adminApi.purgeMailbox(id)
      setMailboxes(prev => prev.filter(m => m.id !== id))
      setStats(prev => prev ? { ...prev, mailboxes: prev.mailboxes - 1 } : prev)
      if (expandedId === id) setExpandedId(null)
    } catch (e) { setError((e as Error).message) }
    finally { setPurging(null) }
  }

  async function handlePurgeExpired() {
    setPurgingExpired(true); setError('')
    try {
      const res = await adminApi.purgeExpired()
      await Promise.all([loadMailboxes(1), loadStats()])
      setPage(1)
      if (res.purged > 0) setExpandedId(null)
    } catch (e) { setError((e as Error).message) }
    finally { setPurgingExpired(false) }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([loadStats(), loadMailboxes(page)])
    setRefreshing(false)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setCpError('')
    setCpSuccess(false)
    if (cpNew.length < 8) { setCpError('New password must be at least 8 characters.'); return }
    if (cpNew !== cpConfirm) { setCpError('Passwords do not match.'); return }
    setCpLoading(true)
    try {
      await adminApi.changePassword(cpCurrent, cpNew, cpConfirm)
      setCpSuccess(true)
      setCpCurrent(''); setCpNew(''); setCpConfirm('')
      setTimeout(() => setCpSuccess(false), 4000)
    } catch (err) {
      setCpError(err instanceof Error ? err.message : 'Failed to change password.')
    } finally {
      setCpLoading(false)
    }
  }

  async function toggleExpand(mb: AdminMailbox) {
    if (expandedId === mb.id) { setExpandedId(null); setSelectedEmail(null); return }
    setExpandedId(mb.id)
    setSelectedEmail(null)
    if (!mailboxEmails[mb.id]) {
      setLoadingEmails(mb.id)
      try {
        const res = await adminApi.mailboxEmails(mb.id, 1, 20)
        setMailboxEmails(prev => ({ ...prev, [mb.id]: res.emails ?? [] }))
      } catch { /* ignore */ }
      finally { setLoadingEmails(null) }
    }
  }

  // Filtered mailboxes (client-side)
  const filteredMailboxes = useMemo(() => {
    let list = mailboxes
    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter(m => m.address.toLowerCase().includes(q) || m.localPart.toLowerCase().includes(q))
    if (statusFilter === 'active')   list = list.filter(m => !isExpired(m.expiresAt))
    if (statusFilter === 'expired')  list = list.filter(m =>  isExpired(m.expiresAt))
    if (statusFilter === 'hasEmails') list = list.filter(m => m.emailCount > 0)
    if (statusFilter === 'empty')    list = list.filter(m => m.emailCount === 0)
    return list
  }, [mailboxes, searchQuery, statusFilter])

  // Filtered logs (client-side, reversed so newest first)
  const filteredLogs = useMemo(() => {
    let list = [...logs].reverse()
    if (logLevel !== 'all') list = list.filter(l => l.level.toUpperCase() === logLevel)
    const q = logSearch.trim().toLowerCase()
    if (q) list = list.filter(l => l.msg.toLowerCase().includes(q) ||
      JSON.stringify(l.attrs ?? {}).toLowerCase().includes(q))
    return list
  }, [logs, logLevel, logSearch])

  const expiredCount = useMemo(() => mailboxes.filter(m => isExpired(m.expiresAt)).length, [mailboxes])

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',  label: 'Overview',  icon: <Activity className="size-3.5" /> },
    { id: 'mailboxes', label: 'Mailboxes', icon: <Mail className="size-3.5" /> },
    { id: 'logs',      label: 'Logs',      icon: <Terminal className="size-3.5" /> },
    { id: 'config',    label: 'Config',    icon: <Settings className="size-3.5" /> },
  ]

  return (
    <div className="min-h-screen bg-surface-0 text-primary">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="border-b border-border bg-surface-1/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-13 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Shield className="size-4 text-white" />
            </div>
            <span className="font-bold text-base text-primary">MailTub</span>
            <span className="text-muted text-sm">/ Admin</span>
          </div>
          {stats && (
            <span className="ml-1 text-[10px] bg-surface-2 border border-border px-1.5 py-0.5 rounded font-mono text-muted">
              {stats.version}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
            >
              <RefreshCw className={cn('size-3', refreshing && 'animate-spin')} /> Refresh
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
            >
              <LogOut className="size-3" /> Logout
            </button>
          </div>
        </div>
        {/* Tab bar */}
        <div className="max-w-6xl mx-auto px-4 flex gap-0.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                tab === t.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-muted hover:text-secondary hover:border-border',
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </div>
        )}

        {/* ── Overview ──────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Total Mailboxes" value={stats?.mailboxes ?? '—'} icon={<Mail className="size-5 text-emerald-400" />} accent="bg-emerald-600/15" />
              <StatCard label="Total Emails"    value={stats?.emails ?? '—'}    icon={<Database className="size-5 text-blue-400" />}    accent="bg-blue-600/15" />
              <StatCard label="Active"          value={stats ? stats.mailboxes - expiredCount : '—'}  icon={<Activity className="size-5 text-emerald-400" />} accent="bg-emerald-600/15" />
              <StatCard label="Expired"         value={expiredCount}               icon={<Clock className="size-5 text-amber-400" />}     accent="bg-amber-600/15" />
            </div>

            <div className="rounded-xl border border-border bg-surface-1 p-4">
              <h3 className="text-sm font-semibold text-primary mb-3">Quick Actions</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handlePurgeExpired}
                  disabled={purgingExpired || expiredCount === 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-secondary hover:text-primary hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  {purgingExpired ? 'Purging…' : `Purge Expired (${expiredCount})`}
                </button>
                <button
                  onClick={() => setTab('mailboxes')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
                >
                  <Mail className="size-3.5" /> Browse Mailboxes
                </button>
                <button
                  onClick={() => setTab('logs')}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-xs font-medium text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
                >
                  <Terminal className="size-3.5" /> View Logs
                </button>
              </div>
            </div>

            {stats && (
              <div className="rounded-xl border border-border bg-surface-1 p-4 text-xs text-secondary space-y-1">
                <p><span className="text-muted">Domain:</span> <span className="text-primary font-mono">{stats.domain}</span></p>
                <p><span className="text-muted">Version:</span> <span className="text-primary font-mono">{stats.version}</span></p>
              </div>
            )}
          </div>
        )}

        {/* ── Mailboxes ──────────────────────────────────────────── */}
        {tab === 'mailboxes' && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search address…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface-1 text-sm text-primary placeholder-muted focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'active', 'expired', 'hasEmails', 'empty'] as StatusFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setStatusFilter(f)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                      statusFilter === f
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'border border-border text-muted hover:text-secondary hover:bg-surface-2',
                    )}
                  >
                    {f === 'hasEmails' ? 'Has Emails' : f}
                  </button>
                ))}
              </div>
              <button
                onClick={handlePurgeExpired}
                disabled={purgingExpired || expiredCount === 0}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-secondary hover:text-primary hover:bg-surface-2 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="size-3" />
                {purgingExpired ? 'Purging…' : `Purge Expired (${expiredCount})`}
              </button>
            </div>

            <p className="text-xs text-muted">
              {filteredMailboxes.length} of {total} mailboxes
            </p>

            {/* Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50 text-left">
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted w-6" />
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted">Address</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted hidden md:table-cell">Created</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted hidden md:table-cell">Expires</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted text-center">Emails</th>
                      <th className="px-3 py-2.5 text-xs font-semibold text-muted text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMailboxes.map(mb => (
                      <>
                        <tr
                          key={mb.id}
                          className={cn(
                            'border-b border-border transition-colors',
                            expandedId === mb.id ? 'bg-surface-2' : 'bg-surface-1 hover:bg-surface-2/60',
                          )}
                        >
                          <td className="px-3 py-2.5">
                            <button onClick={() => toggleExpand(mb)} className="text-muted hover:text-primary transition-colors">
                              {expandedId === mb.id
                                ? <ChevronDown className="size-3.5" />
                                : <ChevronRight className="size-3.5" />}
                            </button>
                          </td>
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => toggleExpand(mb)}
                              className="font-mono text-xs text-primary hover:text-emerald-400 transition-colors text-left"
                            >
                              {mb.address}
                            </button>
                            {isExpired(mb.expiresAt) && (
                              <span className="ml-2 text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.5 rounded">expired</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted hidden md:table-cell">{fmtShort(mb.createdAt)}</td>
                          <td className="px-3 py-2.5 text-xs text-muted hidden md:table-cell">{fmtShort(mb.expiresAt)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={cn('text-xs font-semibold', mb.emailCount > 0 ? 'text-emerald-400' : 'text-muted')}>
                              {mb.emailCount}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              onClick={() => handlePurge(mb.id)}
                              disabled={purging === mb.id}
                              title="Delete mailbox"
                              className="p-1 rounded text-muted hover:text-red-400 transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                        {/* Expanded email list */}
                        {expandedId === mb.id && (
                          <tr key={`${mb.id}-expanded`} className="bg-surface-0">
                            <td colSpan={6} className="p-0">
                              <div className="border-b border-border">
                                {loadingEmails === mb.id ? (
                                  <div className="px-6 py-4 text-xs text-muted">Loading emails…</div>
                                ) : (mailboxEmails[mb.id] ?? []).length === 0 ? (
                                  <div className="px-6 py-4 text-xs text-muted italic">No emails in this mailbox</div>
                                ) : (
                                  <div className="flex">
                                    {/* Email list */}
                                    <div className="w-80 border-r border-border shrink-0">
                                      {(mailboxEmails[mb.id] ?? []).map(em => (
                                        <button
                                          key={em.id}
                                          onClick={() => setSelectedEmail(selectedEmail?.id === em.id ? null : em)}
                                          className={cn(
                                            'w-full text-left px-4 py-2.5 border-b border-border last:border-0 transition-colors',
                                            selectedEmail?.id === em.id ? 'bg-emerald-500/8' : 'hover:bg-surface-2',
                                          )}
                                        >
                                          <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <span className="text-xs font-medium text-primary truncate">
                                              {em.from || '(unknown)'}
                                            </span>
                                            <span className="text-[10px] text-muted shrink-0">{fmtShort(em.receivedAt)}</span>
                                          </div>
                                          <p className="text-[11px] text-secondary truncate">{em.subject || '(no subject)'}</p>
                                          {!em.isRead && <span className="size-1.5 bg-emerald-500 rounded-full inline-block mt-0.5" />}
                                        </button>
                                      ))}
                                    </div>
                                    {/* Email detail */}
                                    {selectedEmail && selectedEmail.mailboxId === mb.id && (
                                      <div className="flex-1 p-4 overflow-auto max-h-64">
                                        <p className="text-xs font-semibold text-primary mb-1">{selectedEmail.subject || '(no subject)'}</p>
                                        <p className="text-[10px] text-muted mb-3">
                                          From: {selectedEmail.from} · {fmt(selectedEmail.receivedAt)}
                                        </p>
                                        <pre className="text-[11px] text-secondary whitespace-pre-wrap font-mono leading-relaxed">
                                          {selectedEmail.bodyText || '(no text body)'}
                                        </pre>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                    {filteredMailboxes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted">
                          No mailboxes match your search/filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Page {page} of {Math.ceil(total / LIMIT)}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2.5 py-1.5 rounded border border-border hover:bg-surface-2 disabled:opacity-40 transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page * LIMIT >= total}
                    className="px-2.5 py-1.5 rounded border border-border hover:bg-surface-2 disabled:opacity-40 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Logs ──────────────────────────────────────────────── */}
        {tab === 'logs' && (
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
                <input
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  placeholder="Search log messages…"
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-surface-1 text-sm text-primary placeholder-muted focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div className="flex gap-1">
                {(['all', 'DEBUG', 'INFO', 'WARN', 'ERROR'] as LogLevel[]).map(l => (
                  <button
                    key={l}
                    onClick={() => setLogLevel(l)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors',
                      logLevel === l
                        ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                        : 'border border-border text-muted hover:text-secondary hover:bg-surface-2',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setAutoRefresh(a => !a)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                  autoRefresh
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/8'
                    : 'border-border text-muted hover:text-secondary hover:bg-surface-2',
                )}
              >
                <Activity className="size-3" /> {autoRefresh ? 'Live' : 'Paused'}
              </button>
              <button onClick={loadLogs} className="p-1.5 rounded-lg border border-border text-muted hover:text-primary hover:bg-surface-2 transition-colors">
                <RefreshCw className="size-3.5" />
              </button>
            </div>

            <p className="text-xs text-muted">{filteredLogs.length} entries</p>

            {/* Log entries */}
            <div className="rounded-xl border border-border overflow-hidden bg-surface-1">
              {filteredLogs.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted">
                  {logs.length === 0 ? 'No logs captured yet — logs appear here as the server generates them.' : 'No entries match your filter.'}
                </div>
              ) : (
                <div className="overflow-y-auto max-h-[500px]">
                  {filteredLogs.map((entry, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-surface-2/50 transition-colors"
                    >
                      <span className="text-[10px] text-muted font-mono shrink-0 mt-px">
                        {new Date(entry.time).toLocaleTimeString()}
                      </span>
                      <LevelBadge level={entry.level} />
                      <span className="flex-1 text-xs text-primary font-mono break-all">{entry.msg}</span>
                      {entry.attrs && Object.keys(entry.attrs).length > 0 && (
                        <span className="text-[10px] text-muted font-mono shrink-0">
                          {Object.entries(entry.attrs).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Config ─────────────────────────────────────────────── */}
        {tab === 'config' && (
          <div className="space-y-4">
            {!adminConfig ? (
              <div className="text-sm text-muted text-center py-10">Loading configuration…</div>
            ) : (
              <>
                {[
                  {
                    title: 'Network', icon: <Activity className="size-3.5" />,
                    items: [
                      ['Domain', adminConfig.domain],
                      ['HTTP Port', String(adminConfig.httpPort)],
                      ['SMTP Port', String(adminConfig.smtpPort)],
                      ['STARTTLS', adminConfig.starttls ? 'Enabled' : 'Disabled'],
                    ],
                  },
                  {
                    title: 'Storage', icon: <Database className="size-3.5" />,
                    items: [
                      ['Database Path', adminConfig.dbPath],
                      ['Redis Cache', adminConfig.redisEnabled ? 'Enabled' : 'Disabled'],
                    ],
                  },
                  {
                    title: 'Mailboxes', icon: <Mail className="size-3.5" />,
                    items: [
                      ['Default TTL', adminConfig.mailboxTTL],
                      ['SMTP Max Size', `${adminConfig.smtpMaxSizeMB} MB`],
                      ['Rate Limit', adminConfig.rateLimit],
                    ],
                  },
                  {
                    title: 'Security', icon: <Shield className="size-3.5" />,
                    items: [
                      ['Admin Panel', adminConfig.adminEnabled ? 'Enabled' : 'Disabled'],
                      ['API Key', adminConfig.apiKeySet ? 'Configured' : 'Not set'],
                      ['Log Level', adminConfig.logLevel],
                    ],
                  },
                  {
                    title: 'Server', icon: <ServerCrash className="size-3.5" />,
                    items: [
                      ['Version', adminConfig.version],
                    ],
                  },
                ].map(group => (
                  <div key={group.title} className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2/50">
                      <span className="text-muted">{group.icon}</span>
                      <h3 className="text-sm font-semibold text-primary">{group.title}</h3>
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between px-4 py-2.5 gap-4">
                          <span className="text-xs text-muted">{k}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-primary">{v}</span>
                            <CopyBtn value={v} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Change Password — only available when password is DB-managed */}
                {!adminConfig.envOverride && (
                  <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2/50">
                      <KeyRound className="size-3.5 text-muted" />
                      <h3 className="text-sm font-semibold text-primary">Change Password</h3>
                    </div>
                    <form onSubmit={handleChangePassword} className="p-4 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-secondary block mb-1.5">Current password</label>
                        <input
                          type="password"
                          value={cpCurrent}
                          onChange={e => setCpCurrent(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="current-password"
                          disabled={cpLoading}
                          className="w-full bg-surface-0 border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-secondary block mb-1.5">New password</label>
                        <div className="relative">
                          <input
                            type={cpShowNew ? 'text' : 'password'}
                            value={cpNew}
                            onChange={e => setCpNew(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                            disabled={cpLoading}
                            className="w-full bg-surface-0 border border-border rounded-lg px-3 py-2 pr-9 text-sm text-primary placeholder-muted focus:outline-none focus:border-emerald-500/50 transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setCpShowNew(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-secondary transition-colors"
                            tabIndex={-1}
                          >
                            {cpShowNew ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-secondary block mb-1.5">Confirm new password</label>
                        <input
                          type={cpShowNew ? 'text' : 'password'}
                          value={cpConfirm}
                          onChange={e => setCpConfirm(e.target.value)}
                          placeholder="••••••••"
                          autoComplete="new-password"
                          disabled={cpLoading}
                          className="w-full bg-surface-0 border border-border rounded-lg px-3 py-2 text-sm text-primary placeholder-muted focus:outline-none focus:border-emerald-500/50 transition-colors"
                        />
                      </div>
                      {cpError && (
                        <div className="flex items-start gap-2 rounded-lg px-3 py-2 border bg-red-500/10 border-red-500/20 text-xs text-red-400">
                          <span className="shrink-0 mt-0.5">⚠️</span>
                          <p>{cpError}</p>
                        </div>
                      )}
                      {cpSuccess && (
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2 border bg-emerald-500/10 border-emerald-500/20 text-xs text-emerald-400">
                          <span>✓</span>
                          <p>Password changed successfully. Your current session remains active.</p>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={cpLoading || !cpCurrent || !cpNew || !cpConfirm}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <KeyRound className="size-3" />
                        {cpLoading ? 'Saving…' : 'Update password'}
                      </button>
                    </form>
                  </div>
                )}
                {adminConfig.envOverride && (
                  <div className="rounded-xl border border-border bg-surface-1 p-4">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <KeyRound className="size-3.5 shrink-0" />
                      <p>Password is managed via the <code className="text-emerald-400 font-mono">ADMIN_PASSWORD</code> environment variable. Update the env var to change it.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
