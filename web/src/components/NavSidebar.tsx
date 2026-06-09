import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Inbox, Star, Paperclip, Settings,
  Copy, Check, Plus, Trash2, RotateCcw,
  Github, QrCode, X as XIcon,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatCountdown } from '@/lib/utils'
import { QRModal } from '@/components/QRModal'
import { TTL_OPTIONS, type TTLHours } from '@/hooks/useSettings'
import type { MailboxTab } from '@/hooks/useMailboxTabs'
import type { Mailbox } from '@/types'

export type NavView = 'inbox' | 'starred' | 'attachments' | 'settings'

interface Props {
  tabs: MailboxTab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onAddTab: (localPart?: string, ttlHours?: number) => Promise<void>
  onCloseTab: (id: string) => void

  activeMailbox: Mailbox | null
  wsConnected: boolean
  loading: boolean
  emailCount: number
  unreadCount: number
  starredCount: number
  attachmentEmailCount: number

  view: NavView
  onViewChange: (v: NavView) => void
  defaultTTLHours: TTLHours

  onCopyAddress: () => void
  onRefresh: () => void
  onDeleteMailbox: () => void

  arrivalTimes?: number[]
}

// ── Countdown ticker ─────────────────────────────────────────────────────────

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [label, setLabel] = useState(() => formatCountdown(expiresAt))
  useEffect(() => {
    const id = setInterval(() => setLabel(formatCountdown(expiresAt)), 1_000)
    return () => clearInterval(id)
  }, [expiresAt])
  const expired = label === 'expired'
  return (
    <span className={cn(
      'text-xs font-mono tabular-nums',
      expired ? 'text-red-400' : 'text-amber-400/80',
    )}>
      {expired ? 'Expired' : `Expires in ${label}`}
    </span>
  )
}

// ── Sparkline — real activity indicator ──────────────────────────────────────

function Sparkline({
  emailCount,
  arrivalTimes = [],
}: {
  emailCount: number
  arrivalTimes: number[]
}) {
  const now = Date.now()
  const windowMs = 10 * 60 * 1000
  const bucketMs = windowMs / 10

  const bars = Array.from({ length: 10 }, (_, i) => {
    if (arrivalTimes.length > 0) {
      const bucketEnd   = now - (9 - i) * bucketMs
      const bucketStart = bucketEnd - bucketMs
      const count = arrivalTimes.filter(t => t >= bucketStart && t <= bucketEnd).length
      return count > 0 ? Math.min(1, 0.35 + count * 0.4) : 0.1
    }
    const seed = (emailCount * 7 + i * 13) % 10
    return Math.max(0.12, Math.min(0.6, (seed + 2) / 14))
  })

  return (
    <div className="flex items-end gap-px h-4 mt-1">
      {bars.map((h, i) => (
        <div
          key={i}
          className={cn(
            'w-1.5 rounded-sm transition-all duration-500',
            arrivalTimes.length > 0 && h > 0.3
              ? 'bg-emerald-400/70'
              : 'bg-emerald-500/30',
          )}
          style={{ height: `${h * 100}%` }}
        />
      ))}
    </div>
  )
}

// ── Logo mark ─────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <img
      src="/favicon-96x96.png"
      alt="MailTub"
      className="size-7 rounded-lg shrink-0 object-cover"
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function NavSidebar({
  tabs,
  activeTabId,
  onSelectTab,
  onAddTab,
  onCloseTab,
  activeMailbox,
  wsConnected,
  loading,
  emailCount,
  unreadCount: _unreadCount,
  starredCount,
  attachmentEmailCount,
  view,
  onViewChange,
  defaultTTLHours,
  onCopyAddress: _onCopyAddress,
  onRefresh,
  onDeleteMailbox,
  arrivalTimes = [],
}: Props) {
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newLocalPart, setNewLocalPart] = useState('')
  const [newTTL, setNewTTL] = useState<TTLHours>(defaultTTLHours)
  const [creating, setCreating] = useState(false)
  const [showDelConfirm, setShowDelConfirm] = useState(false)

  useEffect(() => { setNewTTL(defaultTTLHours) }, [defaultTTLHours])

  const handleCopy = useCallback(() => {
    if (!activeMailbox) return
    navigator.clipboard.writeText(activeMailbox.address).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1_800)
      toast.success('Address copied')
    })
  }, [activeMailbox])

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      await onAddTab(newLocalPart.trim() || undefined, newTTL)
      setShowNewForm(false)
      setNewLocalPart('')
    } catch (err) {
      toast.error((err as Error).message ?? 'Failed to create mailbox')
    } finally {
      setCreating(false)
    }
  }, [onAddTab, newLocalPart, newTTL])

  const handleDeleteConfirmed = useCallback(async () => {
    setShowDelConfirm(false)
    await onDeleteMailbox()
  }, [onDeleteMailbox])

  const navItems: { id: NavView; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'inbox',       label: 'Inbox',       icon: <Inbox className="size-3.5" />,     count: emailCount > 0 ? emailCount : undefined },
    { id: 'starred',     label: 'Starred',     icon: <Star className="size-3.5" />,      count: starredCount > 0 ? starredCount : undefined },
    { id: 'attachments', label: 'Attachments', icon: <Paperclip className="size-3.5" />, count: attachmentEmailCount > 0 ? attachmentEmailCount : undefined },
    { id: 'settings',    label: 'Settings',    icon: <Settings className="size-3.5" /> },
  ]

  return (
    <>
      <aside className="w-[220px] shrink-0 flex flex-col bg-surface-1 border-r border-border overflow-hidden select-none relative">

        {/* ── Brand header ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-border shrink-0">
          <LogoMark />
          <div>
            <div className="text-[13px] font-semibold text-primary leading-none">MailTub</div>
            <div className="text-[10px] text-muted leading-none mt-0.5">Disposable Email</div>
          </div>
        </div>

        {/* ── Tab strip (multi-mailbox) ─────────────────────────── */}
        {tabs.length > 1 && (
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border shrink-0 overflow-x-auto">
            {tabs.map((tab, i) => (
              <div key={tab.id} className="flex items-center gap-0.5 shrink-0 group">
                <button
                  onClick={() => onSelectTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors',
                    tab.id === activeTabId
                      ? 'bg-emerald-600/20 text-emerald-600 dark:text-emerald-300 border border-emerald-600/30'
                      : 'text-muted hover:text-secondary hover:bg-surface-2',
                  )}
                >
                  {tab.loading ? (
                    <span className="opacity-50">Loading…</span>
                  ) : (
                    tab.mailbox?.localPart ?? `Tab ${i + 1}`
                  )}
                </button>
                {tabs.length > 1 && (
                  <button
                    onClick={() => onCloseTab(tab.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-secondary p-px"
                  >
                    <XIcon className="size-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Mailbox section ───────────────────────────────────── */}
        <div className="px-3 pt-3 pb-2 border-b border-border shrink-0">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted mb-2">
            Your Address
          </p>

          {loading || !activeMailbox ? (
            <div className="space-y-1.5 animate-pulse">
              <div className="h-7 bg-surface-3 rounded-md" />
              <div className="h-3 bg-surface-2 rounded w-24" />
            </div>
          ) : (
            <>
              {/* Address block */}
              <div className="flex items-center gap-1.5 bg-surface-2 rounded-md px-2 py-1.5 border border-border group">
                <span className="flex-1 min-w-0 font-mono text-[11px] text-secondary truncate">
                  {activeMailbox.address}
                </span>
                <button
                  onClick={handleCopy}
                  title="Copy address"
                  className="shrink-0 text-muted hover:text-primary transition-colors"
                >
                  {copied
                    ? <Check className="size-3 text-emerald-500" />
                    : <Copy className="size-3" />}
                </button>
                <button
                  onClick={() => setShowQR(true)}
                  title="QR code"
                  className="shrink-0 text-muted hover:text-primary transition-colors"
                >
                  <QrCode className="size-3" />
                </button>
              </div>

              {/* Expiry */}
              <div className="flex items-center gap-1 mt-1.5 px-0.5">
                <Clock className="size-2.5 text-amber-400/60 shrink-0" />
                <ExpiryCountdown expiresAt={activeMailbox.expiresAt} />
              </div>
            </>
          )}

          {/* New Mailbox form / button */}
          <AnimatePresence mode="wait">
            {showNewForm ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden mt-2"
              >
                <div className="space-y-1.5">
                  <input
                    value={newLocalPart}
                    onChange={e => setNewLocalPart(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    placeholder="custom-name (optional)"
                    className="w-full bg-surface-2 border border-border rounded-md px-2 py-1 text-[11px] font-mono text-primary placeholder-muted outline-none focus:border-emerald-500/50 transition-colors"
                    autoFocus
                  />
                  {/* TTL pills */}
                  <div className="flex gap-1">
                    {TTL_OPTIONS.map(opt => (
                      <button
                        key={opt.hours}
                        onClick={() => setNewTTL(opt.hours)}
                        className={cn(
                          'flex-1 py-1 rounded text-[10px] font-medium transition-colors border',
                          newTTL === opt.hours
                            ? 'bg-emerald-600/25 text-emerald-600 dark:text-emerald-300 border-emerald-600/40'
                            : 'bg-surface-2 text-muted border-border hover:text-secondary',
                        )}
                      >
                        {opt.short}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setShowNewForm(false); setNewLocalPart('') }}
                      className="flex-1 py-1 rounded text-[10px] text-muted hover:text-secondary border border-border transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="flex-1 py-1 rounded text-[10px] font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors"
                    >
                      {creating ? 'Creating…' : 'Create'}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.button
                key="btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowNewForm(true)}
                disabled={tabs.length >= 5}
                className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-border text-[11px] text-secondary hover:text-primary hover:border-emerald-500/30 hover:bg-emerald-600/8 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Plus className="size-3" />
                New Mailbox
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── Menu navigation ────────────────────────────────────── */}
        <nav className="flex-1 px-2 py-2 overflow-y-auto">
          <p className="text-[9px] font-semibold uppercase tracking-widest text-muted px-2 mb-1">Menu</p>
          <ul className="space-y-0.5">
            {navItems.map(item => (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12px] font-medium transition-all text-left',
                    view === item.id
                      ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                      : 'text-secondary hover:text-primary hover:bg-surface-2',
                  )}
                >
                  <span className={cn(
                    'shrink-0',
                    view === item.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted',
                  )}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.count != null && (
                    <span className={cn(
                      'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                      view === item.id
                        ? 'bg-emerald-600/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-surface-3 text-secondary',
                    )}>
                      {item.count > 99 ? '99+' : item.count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Delete mailbox confirm ─────────────────────────────── */}
        <AnimatePresence>
          {showDelConfirm && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute inset-x-0 bottom-20 mx-2 bg-surface-1 border border-red-900/50 rounded-lg p-3 shadow-xl z-10"
            >
              <p className="text-[11px] text-red-500 dark:text-red-300 font-medium mb-2">Delete this mailbox?</p>
              <p className="text-[10px] text-muted mb-3">All emails will be lost. A new address will be generated.</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowDelConfirm(false)}
                  className="flex-1 py-1 rounded text-[10px] text-secondary border border-border hover:text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirmed}
                  className="flex-1 py-1 rounded text-[10px] font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Status footer ──────────────────────────────────────── */}
        <div className="px-3 py-3 border-t border-border shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={cn(
              'size-1.5 rounded-full shrink-0 transition-colors',
              wsConnected ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]' : 'bg-border-muted',
            )} />
            <span className="text-[11px] font-medium text-secondary">
              {wsConnected ? 'Live' : 'Connecting…'}
            </span>
            <span className="text-[10px] text-muted ml-auto">
              {wsConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <p className="text-[10px] text-muted leading-snug mb-2">
            Emails arrive instantly via WebSocket
          </p>
          <Sparkline emailCount={emailCount} arrivalTimes={arrivalTimes} />

          {/* Action icons row */}
          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-1">
              <button
                onClick={onRefresh}
                title="Refresh"
                className="p-1.5 rounded text-muted hover:text-secondary hover:bg-surface-2 transition-colors"
              >
                <RotateCcw className="size-3" />
              </button>
              <button
                onClick={() => setShowDelConfirm(true)}
                title="Delete mailbox"
                className="p-1.5 rounded text-muted hover:text-red-400 hover:bg-red-950/20 transition-colors"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="https://github.com/dml-labs/mailtub"
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded text-muted hover:text-secondary hover:bg-surface-2 transition-colors"
              >
                <Github className="size-3" />
              </a>
              <button
                onClick={() => onViewChange('settings')}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  view === 'settings'
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-600/15'
                    : 'text-muted hover:text-secondary hover:bg-surface-2',
                )}
              >
                <Settings className="size-3" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* QR Modal */}
      {showQR && activeMailbox && (
        <QRModal address={activeMailbox.address} onClose={() => setShowQR(false)} />
      )}
    </>
  )
}
