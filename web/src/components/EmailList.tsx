import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, Paperclip, Star } from 'lucide-react'
import { cn, formatRelativeTime, senderInitial, extractDisplayName } from '@/lib/utils'
import type { Email } from '@/types'

interface Props {
  emails: Email[]
  selectedId: string | null
  onSelect: (email: Email) => void
  starredIds?: Set<string>
  onToggleStar?: (id: string) => void
}

export function EmailList({ emails, selectedId, onSelect, starredIds, onToggleStar }: Props) {
  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-12 px-6 text-center select-none">
        <div className="relative mb-5">
          <div className="size-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center">
            <Inbox className="size-6 text-muted" />
          </div>
          <span className="absolute -top-1 -right-1 size-3 rounded-full bg-emerald-500/80 border-2 border-surface-0 animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-primary mb-1">Inbox is empty</p>
        <p className="text-[11px] text-muted max-w-[180px] leading-relaxed text-balance">
          Emails sent to your address appear here instantly, no refresh needed.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <AnimatePresence initial={false}>
        {emails.map((email, i) => (
          <EmailRow
            key={email.id}
            email={email}
            index={i}
            selected={email.id === selectedId}
            isStarred={starredIds?.has(email.id) ?? false}
            onSelect={onSelect}
            onToggleStar={onToggleStar}
          />
        ))}
      </AnimatePresence>
      {emails.length > 0 && (
        <div className="px-3 py-2 text-[10px] text-muted text-center border-t border-border-subtle">
          {emails.length} email{emails.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

function EmailRow({
  email,
  index,
  selected,
  isStarred,
  onSelect,
  onToggleStar,
}: {
  email: Email
  index: number
  selected: boolean
  isStarred: boolean
  onSelect: (email: Email) => void
  onToggleStar?: (id: string) => void
}) {
  const displayName  = extractDisplayName(email.from) || email.from
  const initial      = senderInitial(email.from)
  const hasAttachments = (email.attachments?.length ?? 0) > 0

  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleStar?.(email.id)
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
      transition={{ delay: Math.min(index * 0.035, 0.25), duration: 0.18, ease: 'easeOut' }}
      onClick={() => onSelect(email)}
      className={cn(
        'w-full text-left px-3 py-2.5 flex gap-2.5 transition-all duration-100 group',
        'border-b border-border-subtle',
        selected
          ? 'bg-surface-2 border-l-2 border-l-emerald-500'
          : 'border-l-2 border-l-transparent hover:bg-surface-2/50',
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'size-8 rounded-full shrink-0 flex items-center justify-center',
          'text-[11px] font-bold uppercase tracking-wider',
          'bg-gradient-to-br ring-1 ring-white/5',
          avatarGradient(initial),
        )}
        aria-hidden="true"
      >
        {initial}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 py-px">
        {/* Row 1: sender + time + star */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span
            className={cn(
              'text-[12px] truncate leading-tight',
              email.isRead ? 'text-secondary font-medium' : 'text-primary font-semibold',
            )}
          >
            {displayName}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-muted tabular-nums">
              {formatRelativeTime(email.receivedAt)}
            </span>
            {onToggleStar && (
              <button
                onClick={handleStarClick}
                className={cn(
                  'p-px rounded transition-colors',
                  isStarred
                    ? 'text-amber-400'
                    : 'text-muted opacity-0 group-hover:opacity-100 hover:text-amber-400',
                )}
                aria-label={isStarred ? 'Unstar' : 'Star'}
              >
                <Star className={cn('size-3', isStarred && 'fill-amber-400')} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: subject + unread dot + attachments */}
        <div className="flex items-center gap-1.5">
          {!email.isRead && (
            <span className="size-[5px] rounded-full bg-emerald-400 shrink-0 mt-px" aria-label="unread" />
          )}
          <p
            className={cn(
              'text-[11px] truncate leading-snug flex-1',
              email.isRead ? 'text-muted' : 'text-secondary font-medium',
            )}
          >
            {email.subject || '(no subject)'}
          </p>
          {hasAttachments && (
            <Paperclip className="size-2.5 text-muted shrink-0 ml-auto" aria-label="has attachments" />
          )}
        </div>
      </div>
    </motion.button>
  )
}

function avatarGradient(letter: string): string {
  const palettes = [
    'from-violet-700 to-indigo-600 text-violet-100',
    'from-blue-700 to-sky-600 text-blue-100',
    'from-emerald-700 to-teal-600 text-emerald-100',
    'from-amber-600 to-orange-600 text-amber-100',
    'from-rose-700 to-pink-600 text-rose-100',
    'from-fuchsia-700 to-purple-600 text-fuchsia-100',
    'from-cyan-700 to-blue-600 text-cyan-100',
  ]
  return palettes[letter.charCodeAt(0) % palettes.length]
}
