import {
  Copy, Check, QrCode, RotateCcw, Trash2,
  Search, X as XIcon, Sun, Moon, Monitor,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import type { Mailbox } from '@/types'

interface Props {
  activeMailbox: Mailbox | null
  wsConnected: boolean
  toolbarCopied: boolean
  onCopyAddress: () => void
  onQROpen: () => void
  onRefresh: () => void
  onDeleteMailbox: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  searchRef: React.RefObject<HTMLInputElement>
}

const THEME_CYCLE: Record<Theme, Theme> = { dark: 'light', light: 'system', system: 'dark' }

const THEME_ICON: Record<Theme, React.ReactNode> = {
  dark:   <Moon className="size-3.5" />,
  light:  <Sun className="size-3.5" />,
  system: <Monitor className="size-3.5" />,
}

export function AppBar({
  activeMailbox,
  wsConnected,
  toolbarCopied,
  onCopyAddress,
  onQROpen,
  onRefresh,
  onDeleteMailbox,
  searchQuery,
  onSearchChange,
  searchRef,
}: Props) {
  const { theme, setTheme } = useTheme()

  return (
    <div className="h-10 shrink-0 flex items-center gap-1.5 px-3 border-b border-border bg-surface-1/90 backdrop-blur-sm">

      {/* ── Address chip + actions ────────────────── */}
      {activeMailbox ? (
        <>
          <span className="font-mono text-xs text-secondary bg-surface-0 rounded-md px-2.5 py-1 border border-border truncate max-w-[200px] select-all">
            {activeMailbox.address}
          </span>

          <div className="flex items-center gap-0.5 ml-0.5">
            <button
              onClick={onCopyAddress}
              title="Copy address"
              className={cn('icon-btn size-7', toolbarCopied && 'text-emerald-400')}
            >
              {toolbarCopied
                ? <Check className="size-3.5 text-emerald-400" />
                : <Copy className="size-3.5" />}
            </button>

            <button
              onClick={onQROpen}
              title="QR code"
              className="icon-btn size-7"
            >
              <QrCode className="size-3.5" />
            </button>

            <button
              onClick={onRefresh}
              title="Refresh inbox"
              className="icon-btn size-7"
            >
              <RotateCcw className="size-3.5" />
            </button>

            <button
              onClick={onDeleteMailbox}
              title="Delete mailbox"
              className="icon-btn size-7 hover:text-red-400 hover:bg-red-950/30"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </>
      ) : (
        <span className="text-xs text-muted italic">No mailbox</span>
      )}

      {/* ── Spacer ───────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Search ───────────────────────────────── */}
      <div className="flex items-center gap-1.5 bg-surface-0 border border-border rounded-lg px-2.5 h-6 w-[200px] focus-within:border-emerald-500/40 focus-within:shadow-emerald-sm transition-all">
        <Search className="size-3 text-muted shrink-0" />
        <input
          ref={searchRef}
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search…  ⌘K"
          className="flex-1 min-w-0 bg-transparent text-xs text-primary placeholder-muted outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="text-muted hover:text-secondary transition-colors"
          >
            <XIcon className="size-3" />
          </button>
        )}
      </div>

      {/* ── Theme cycle ──────────────────────────── */}
      <button
        onClick={() => setTheme(THEME_CYCLE[theme])}
        title={`Theme: ${theme} (click to cycle)`}
        className="icon-btn size-7"
      >
        {THEME_ICON[theme]}
      </button>

      {/* ── WS status dot ────────────────────────── */}
      <span
        title={wsConnected ? 'WebSocket connected' : 'WebSocket connecting…'}
        className={cn(
          'size-1.5 rounded-full shrink-0 transition-colors',
          wsConnected
            ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.7)]'
            : 'bg-border-muted',
        )}
      />

      {/* ── Avatar ───────────────────────────────── */}
      <div className="size-6 rounded-full bg-emerald-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0 select-none">
        M
      </div>
    </div>
  )
}
