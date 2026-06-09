import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Copy, RefreshCw, Moon, Sun, Monitor, Settings,
  Star, Paperclip, Mail, ExternalLink, Download, Archive,
  Search, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/contexts/ThemeContext'
import type { Mailbox } from '@/types'

export interface PaletteCommand {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  keywords?: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  activeMailbox: Mailbox | null
  onNewMailbox: () => void
  onCopyAddress: () => void
  onRefresh: () => void
  onDeleteMailbox: () => void
  onExportJSON: () => void
  onExportZIP: () => void
  onViewChange: (view: string) => void
}

function highlight(text: string, query: string) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-emerald-500/25 text-emerald-400 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </span>
  )
}

export function CommandPalette({
  open,
  onClose,
  activeMailbox,
  onNewMailbox,
  onCopyAddress,
  onRefresh,
  onDeleteMailbox,
  onExportJSON,
  onExportZIP,
  onViewChange,
}: Props) {
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { theme, setTheme } = useTheme()

  const themeOptions: PaletteCommand[] = [
    { id: 'theme-dark',   label: 'Theme: Dark',   icon: <Moon className="size-4" />,    keywords: ['appearance', 'color'], action: () => { setTheme('dark'); onClose() } },
    { id: 'theme-light',  label: 'Theme: Light',  icon: <Sun className="size-4" />,     keywords: ['appearance', 'color'], action: () => { setTheme('light'); onClose() } },
    { id: 'theme-system', label: 'Theme: System', icon: <Monitor className="size-4" />, keywords: ['appearance', 'auto'],  action: () => { setTheme('system'); onClose() } },
  ].filter(c => {
    if (theme === 'dark'   && c.id === 'theme-dark')   return false
    if (theme === 'light'  && c.id === 'theme-light')  return false
    if (theme === 'system' && c.id === 'theme-system') return false
    return true
  })

  const commands: PaletteCommand[] = useMemo(() => [
    {
      id: 'new',
      label: 'New Mailbox',
      description: 'Create a new disposable inbox',
      icon: <Plus className="size-4" />,
      shortcut: 'N',
      keywords: ['create', 'add', 'inbox'],
      action: () => { onNewMailbox(); onClose() },
    },
    ...(activeMailbox ? [
      {
        id: 'copy',
        label: 'Copy Address',
        description: activeMailbox.address,
        icon: <Copy className="size-4" />,
        shortcut: 'C',
        keywords: ['clipboard', 'email'],
        action: () => { onCopyAddress(); onClose() },
      },
      {
        id: 'refresh',
        label: 'Refresh Inbox',
        description: 'Reload emails for current mailbox',
        icon: <RefreshCw className="size-4" />,
        shortcut: 'R',
        keywords: ['reload', 'sync'],
        action: () => { onRefresh(); onClose() },
      },
    ] : []),
    {
      id: 'inbox',
      label: 'Go to Inbox',
      icon: <Mail className="size-4" />,
      keywords: ['navigate', 'home'],
      action: () => { onViewChange('inbox'); onClose() },
    },
    {
      id: 'starred',
      label: 'Go to Starred',
      icon: <Star className="size-4" />,
      keywords: ['navigate', 'favourite'],
      action: () => { onViewChange('starred'); onClose() },
    },
    {
      id: 'attachments',
      label: 'Go to Attachments',
      icon: <Paperclip className="size-4" />,
      keywords: ['navigate', 'files'],
      action: () => { onViewChange('attachments'); onClose() },
    },
    {
      id: 'settings',
      label: 'Open Settings',
      icon: <Settings className="size-4" />,
      shortcut: ',',
      keywords: ['preferences', 'config'],
      action: () => { onViewChange('settings'); onClose() },
    },
    ...themeOptions,
    ...(activeMailbox ? [
      {
        id: 'export-json',
        label: 'Export as JSON',
        description: 'Download all emails as JSON',
        icon: <Download className="size-4" />,
        keywords: ['download', 'backup'],
        action: () => { onExportJSON(); onClose() },
      },
      {
        id: 'export-zip',
        label: 'Export as ZIP',
        description: 'Download all emails as .eml files',
        icon: <Archive className="size-4" />,
        keywords: ['download', 'backup', 'eml'],
        action: () => { onExportZIP(); onClose() },
      },
      {
        id: 'delete-mailbox',
        label: 'Delete Mailbox',
        description: `Delete ${activeMailbox.address}`,
        icon: <X className="size-4 text-red-400" />,
        keywords: ['remove', 'destroy'],
        action: () => { onDeleteMailbox(); onClose() },
      },
    ] : []),
    {
      id: 'admin',
      label: 'Admin Panel',
      description: 'Open the admin dashboard',
      icon: <ExternalLink className="size-4" />,
      keywords: ['manage', 'dashboard'],
      action: () => { window.location.href = '/admin/dashboard'; onClose() },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [activeMailbox, theme])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.keywords?.some(k => k.includes(q))
    )
  }, [commands, query])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query, open])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])

  const runSelected = useCallback(() => {
    filtered[selectedIdx]?.action()
  }, [filtered, selectedIdx])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        runSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered.length, runSelected, onClose])

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-start justify-center pointer-events-none"
          >
            <div
              className="pointer-events-auto mt-[15vh] w-full max-w-[560px] mx-4 rounded-2xl border border-border bg-surface-1 shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                <Search className="size-4 text-muted shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Type a command or search…"
                  className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted border border-border font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[340px] overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-muted py-8">No commands found</p>
                ) : (
                  filtered.map((cmd, i) => (
                    <button
                      key={cmd.id}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        i === selectedIdx
                          ? 'bg-emerald-500/10 text-primary'
                          : 'text-secondary hover:bg-surface-2',
                      )}
                      onMouseEnter={() => setSelectedIdx(i)}
                      onClick={cmd.action}
                    >
                      <span className={cn('shrink-0', i === selectedIdx ? 'text-emerald-400' : 'text-muted')}>
                        {cmd.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium">
                          {highlight(cmd.label, query)}
                        </span>
                        {cmd.description && (
                          <span className="block text-[11px] text-muted truncate">
                            {cmd.description}
                          </span>
                        )}
                      </span>
                      {cmd.shortcut && (
                        <kbd className="shrink-0 hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted border border-border font-mono">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-faint">
                <span><kbd className="font-mono">↑↓</kbd> navigate</span>
                <span><kbd className="font-mono">↵</kbd> select</span>
                <span><kbd className="font-mono">ESC</kbd> close</span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
