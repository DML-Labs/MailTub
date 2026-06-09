import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Copy, Check, RotateCcw, Plus, Trash2,
  Wifi, WifiOff, X, ArrowRight, QrCode,
} from 'lucide-react'
import { toast } from 'sonner'
import { QRModal } from '@/components/QRModal'
import { cn, formatCountdown } from '@/lib/utils'
import type { Mailbox } from '@/types'

interface Props {
  mailbox: Mailbox | null
  emailCount: number
  loading: boolean
  refreshing: boolean
  wsConnected: boolean
  onNew: (localPart?: string) => Promise<void>
  onRefresh: () => void
  onDelete: () => void
}

export function MailboxHeader({
  mailbox,
  emailCount,
  loading,
  refreshing,
  wsConnected,
  onNew,
  onRefresh,
  onDelete,
}: Props) {
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [customError, setCustomError] = useState('')
  const [creating, setCreating] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Live countdown
  useEffect(() => {
    if (!mailbox) return
    const tick = () => setCountdown(formatCountdown(mailbox.expiresAt))
    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [mailbox])

  // Focus input on custom mode open
  useEffect(() => {
    if (customMode) setTimeout(() => inputRef.current?.focus(), 60)
  }, [customMode])

  // Close custom mode when address changes
  const prevAddress = useRef(mailbox?.address)
  useEffect(() => {
    if (mailbox?.address && mailbox.address !== prevAddress.current) {
      prevAddress.current = mailbox.address
      setCustomMode(false)
      setCustomInput('')
      setCustomError('')
    }
  }, [mailbox?.address])

  const copyAddress = useCallback(async () => {
    if (!mailbox) return
    await navigator.clipboard.writeText(mailbox.address)
    setCopied(true)
    toast.success('Address copied')
    setTimeout(() => setCopied(false), 2000)
  }, [mailbox])

  const handleCustomSubmit = useCallback(async () => {
    const val = customInput.trim().toLowerCase()
    if (!val) return
    setCustomError('')
    setCreating(true)
    try {
      await onNew(val)
    } catch (err) {
      setCustomError(err instanceof Error ? err.message : 'Failed to create address')
    } finally {
      setCreating(false)
    }
  }, [customInput, onNew])

  const cancelCustom = () => {
    setCustomMode(false)
    setCustomInput('')
    setCustomError('')
  }

  const domain = mailbox?.domain ?? 'localhost'

  return (
    <div className="shrink-0 border-b border-border bg-surface-1">
      {/* ── Brand bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2.5">
          {/* Logo mark */}
          <div className="size-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-900/30 shrink-0">
            <svg viewBox="0 0 20 20" fill="none" className="size-4">
              <path d="M3 5.5L10 11L17 5.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="2" y="4" width="16" height="12" rx="2" stroke="white" strokeWidth="1.8"/>
            </svg>
          </div>
          <div>
            <div className="text-[13px] font-bold text-white tracking-tight leading-none">MailTub</div>
            <div className="text-[9px] text-slate-600 font-medium tracking-wide uppercase leading-none mt-0.5">by DML Labs</div>
          </div>
        </div>

        {/* WS status pill */}
        <div className={cn(
          'flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border transition-all duration-300',
          wsConnected
            ? 'text-emerald-400 border-emerald-900/60 bg-emerald-950/40'
            : 'text-slate-600 border-border bg-surface-2',
        )}>
          {wsConnected
            ? <><Wifi className="size-2.5" /><span>Live</span></>
            : <><WifiOff className="size-2.5" /><span>Offline</span></>
          }
        </div>
      </div>

      {/* ── Address block ───────────────────────────────────── */}
      <div className="px-4 pb-3">
        <button
          onClick={copyAddress}
          disabled={loading || !mailbox}
          className={cn(
            'w-full text-left rounded-xl border p-3 transition-all duration-150 group',
            'glow-violet hover:glow-violet-md',
            'bg-surface-0 border-border hover:border-violet-800/50',
            'disabled:opacity-50 disabled:cursor-default',
          )}
          title="Click to copy address"
        >
          {loading || !mailbox ? (
            <div className="h-[18px] w-44 bg-surface-2 rounded animate-pulse" />
          ) : (
            <span className="font-mono text-[13px] text-violet-300 group-hover:text-violet-200 transition-colors break-all leading-tight">
              {mailbox.address}
            </span>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2 text-[10px]">
              <span className="text-slate-600">Expires</span>
              <span className="text-amber-400 font-semibold tabular-nums font-mono">
                {loading ? '—' : countdown}
              </span>
              {!loading && emailCount > 0 && (
                <>
                  <span className="text-slate-700">·</span>
                  <span className="text-slate-500">{emailCount} email{emailCount !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
            <span className="text-[10px] text-slate-700 group-hover:text-slate-500 transition-colors">
              click to copy
            </span>
          </div>
        </button>

        {/* ── Custom address form ─────────────────────────── */}
        <AnimatePresence>
          {customMode && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.16 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-violet-800/40 bg-surface-0/80 p-3">
                <p className="text-[10px] text-slate-500 font-medium mb-2">Custom local part</p>
                <div className="flex gap-1.5">
                  <div className={cn(
                    'flex-1 flex items-center rounded-lg border bg-surface-1 overflow-hidden transition-colors',
                    customError ? 'border-red-900/60' : 'border-border focus-within:border-violet-700/60',
                  )}>
                    <input
                      ref={inputRef}
                      value={customInput}
                      onChange={e => {
                        setCustomInput(e.target.value.toLowerCase().replace(/[^a-z0-9.\-]/g, ''))
                        setCustomError('')
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleCustomSubmit()
                        if (e.key === 'Escape') cancelCustom()
                      }}
                      placeholder="yourname"
                      maxLength={32}
                      className="flex-1 min-w-0 bg-transparent text-[12px] font-mono text-slate-200 placeholder-slate-700 px-2.5 py-1.5 outline-none"
                    />
                    <span className="text-[10px] text-slate-600 font-mono pr-2 shrink-0">@{domain}</span>
                  </div>
                  <button
                    onClick={handleCustomSubmit}
                    disabled={!customInput.trim() || creating}
                    className="flex items-center justify-center px-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    aria-label="Create custom address"
                  >
                    {creating
                      ? <RotateCcw className="size-3 animate-spin" />
                      : <ArrowRight className="size-3.5" />
                    }
                  </button>
                </div>
                {customError && (
                  <p className="text-[10px] text-red-400 mt-1.5 leading-snug">{customError}</p>
                )}
                <p className="text-[10px] text-slate-700 mt-1.5">
                  3–32 chars · letters, numbers, hyphens, dots
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Action strip ─────────────────────────────────── */}
        <div className="flex gap-1.5 mt-2.5">
          {/* Copy — primary */}
          <button
            onClick={copyAddress}
            disabled={loading || !mailbox}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold rounded-lg px-3 py-2 transition-all',
              copied
                ? 'bg-emerald-800/40 text-emerald-300 border border-emerald-700/50'
                : 'bg-violet-600 hover:bg-violet-500 text-white',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>

          {/* Icon actions */}
          {[
            {
              icon: <QrCode className="size-3.5" />,
              label: 'QR code',
              onClick: () => setShowQR(true),
              disabled: loading || !mailbox,
            },
            {
              icon: <RotateCcw className={cn('size-3.5', (loading || refreshing) && 'animate-spin')} />,
              label: 'Refresh',
              onClick: onRefresh,
              disabled: loading || refreshing,
            },
            {
              icon: customMode ? <X className="size-3.5" /> : <Plus className="size-3.5" />,
              label: customMode ? 'Cancel' : 'Custom address',
              onClick: customMode ? cancelCustom : () => setCustomMode(true),
              disabled: loading,
              active: customMode,
            },
            {
              icon: <Trash2 className="size-3.5" />,
              label: 'Delete mailbox',
              onClick: onDelete,
              disabled: loading || !mailbox,
              danger: true,
            },
          ].map(({ icon, label, onClick, disabled, active, danger }) => (
            <button
              key={label}
              onClick={onClick}
              disabled={disabled}
              title={label}
              aria-label={label}
              className={cn(
                'flex items-center justify-center size-[34px] rounded-lg border transition-all duration-150',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                active
                  ? 'border-violet-700/60 text-violet-400 bg-violet-950/40'
                  : danger
                    ? 'border-border text-slate-600 hover:text-red-400 hover:border-red-900/50 hover:bg-red-950/20'
                    : 'border-border text-slate-500 hover:text-slate-200 hover:bg-surface-3 hover:border-border-muted',
              )}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {showQR && mailbox && (
        <QRModal address={mailbox.address} onClose={() => setShowQR(false)} />
      )}
    </div>
  )
}
