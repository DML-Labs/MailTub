import { useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MailboxTab } from '@/hooks/useMailboxTabs'

const MAX_TABS = 5

const TAB_ACCENTS = [
  { bar: 'bg-violet-500', active: 'text-violet-300', dot: 'bg-violet-500' },
  { bar: 'bg-blue-500',   active: 'text-blue-300',   dot: 'bg-blue-500' },
  { bar: 'bg-emerald-500',active: 'text-emerald-300', dot: 'bg-emerald-500' },
  { bar: 'bg-amber-400',  active: 'text-amber-300',   dot: 'bg-amber-400' },
  { bar: 'bg-rose-500',   active: 'text-rose-300',    dot: 'bg-rose-500' },
]

interface Props {
  tabs: MailboxTab[]
  activeTabId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onAdd: () => void
}

export function MailboxTabs({ tabs, activeTabId, onSelect, onClose, onAdd }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  return (
    <div className="flex items-stretch border-b border-border bg-surface-1 shrink-0 h-9 min-h-0">
      {/* Scrollable tab strip */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-stretch overflow-x-auto min-w-0"
        style={{ scrollbarWidth: 'none' }}
      >
        <AnimatePresence initial={false}>
          {tabs.map((tab, i) => {
            const isActive = tab.id === activeTabId
            const accent = TAB_ACCENTS[i % TAB_ACCENTS.length]
            const label = tab.mailbox?.localPart ?? `Tab ${i + 1}`
            const unread = tab.emails.filter(e => !e.isRead).length

            return (
              <motion.div
                key={tab.id}
                data-active={isActive}
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'relative group flex items-center gap-1.5 px-2.5 shrink-0 max-w-[128px]',
                  'cursor-pointer select-none transition-colors duration-100',
                  isActive
                    ? 'bg-surface-0 border-r border-border'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-surface-2/40 border-r border-border-subtle',
                )}
                onClick={() => onSelect(tab.id)}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <motion.span
                    layoutId="tab-bar"
                    className={cn('absolute top-0 left-0 right-0 h-[2px] rounded-b-sm', accent.bar)}
                  />
                )}

                {/* Color dot for inactive */}
                {!isActive && (
                  <span className={cn('size-1.5 rounded-full shrink-0', accent.dot, 'opacity-60')} />
                )}

                {/* Label */}
                <span
                  className={cn(
                    'text-[11px] font-semibold truncate leading-none',
                    isActive ? accent.active : '',
                  )}
                >
                  {tab.loading ? '…' : label}
                </span>

                {/* Unread badge */}
                {unread > 0 && (
                  <span
                    className={cn(
                      'shrink-0 min-w-[14px] h-3.5 px-1 rounded-full text-[9px] font-bold',
                      'flex items-center justify-center',
                      isActive ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300',
                    )}
                  >
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}

                {/* Close */}
                {tabs.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); onClose(tab.id) }}
                    aria-label={`Close ${label}`}
                    className={cn(
                      'shrink-0 size-4 rounded flex items-center justify-center transition-all duration-100',
                      'opacity-0 group-hover:opacity-100',
                      'hover:bg-white/10 text-slate-500 hover:text-slate-300',
                      isActive && 'opacity-70',
                    )}
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Add tab */}
      <button
        onClick={onAdd}
        disabled={tabs.length >= MAX_TABS}
        title={tabs.length >= MAX_TABS ? `Maximum ${MAX_TABS} tabs` : 'New mailbox tab'}
        aria-label="Open new mailbox tab"
        className={cn(
          'shrink-0 flex items-center justify-center w-9 border-l border-border-subtle transition-all duration-100',
          'text-slate-600 hover:text-slate-300 hover:bg-surface-2/60',
          'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent',
        )}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}
