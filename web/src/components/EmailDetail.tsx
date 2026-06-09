import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Trash2, Code2, AlignLeft, List, Download, Paperclip,
  Mail, Clock, ArrowLeft, FileText, Image, Archive, File,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn, formatBytes } from '@/lib/utils'
import { downloadAttachment, downloadEmailEML } from '@/api/client'
import type { Email } from '@/types'

interface Props {
  email: Email | null
  mailboxAddress: string
  onDelete: (id: string) => void
  onClose: () => void
  blockRemoteImages?: boolean
}

type Tab = 'html' | 'text' | 'headers'

function extractDomain(from: string | null | undefined): string | null {
  if (!from) return null
  const match = from.match(/@([\w.-]+)/)
  return match ? match[1] : null
}

function injectBlockerCSS(html: string): string {
  const css = `img[src^="http"],img[src^="https"],img[src^="//"]{display:none!important}[style*="background-image"]{background-image:none!important}`
  const styleTag = `<style id="__mt_blocker__">${css}</style>`
  if (/<head[\s>]/i.test(html)) return html.replace(/<head([\s>])/i, `<head$1${styleTag}`)
  return styleTag + html
}

export function EmailDetail({ email, mailboxAddress, onDelete, onClose, blockRemoteImages }: Props) {
  const [tab, setTab] = useState<Tab>('html')

  if (!email) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10 select-none bg-mesh">
        <div className="size-16 rounded-2xl bg-surface-1 border border-border mx-auto flex items-center justify-center mb-4 shadow-xl">
          <Mail className="size-7 text-muted" />
        </div>
        <p className="text-sm font-semibold text-secondary mb-1">No email selected</p>
        <p className="text-[11px] text-muted max-w-[200px] leading-relaxed">
          Pick an email from the list — it'll open right here.
        </p>
      </div>
    )
  }

  const handleDelete = () => {
    onDelete(email.id)
    toast.success('Email deleted')
  }

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    try {
      await downloadAttachment(mailboxAddress, email.id, attachmentId, filename)
    } catch {
      toast.error('Failed to download attachment')
    }
  }

  const handleDownloadEML = () => {
    try {
      downloadEmailEML(email)
      toast.success('Downloaded as .eml')
    } catch {
      toast.error('Failed to generate .eml file')
    }
  }

  const attachments = email.attachments ?? []
  const senderDomain = extractDomain(email.from)

  return (
    <motion.div
      key={email.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-surface-1/40 px-5 pt-4 pb-3">
        {/* Subject + actions */}
        <div className="flex items-start gap-3 mb-3">
          <button
            onClick={onClose}
            className="shrink-0 mt-0.5 icon-btn size-7"
            title="Back to inbox"
            aria-label="Back to inbox"
          >
            <ArrowLeft className="size-3.5" />
          </button>

          <h2 className="flex-1 text-[15px] font-semibold text-primary leading-snug break-words min-w-0">
            {email.subject || <span className="text-muted italic">(no subject)</span>}
          </h2>

          <button
            onClick={handleDownloadEML}
            className="shrink-0 icon-btn size-7"
            title="Download as .eml"
            aria-label="Download as .eml"
          >
            <Download className="size-3.5" />
          </button>

          <button
            onClick={handleDelete}
            className="shrink-0 icon-btn size-7 hover:text-red-400 hover:bg-red-950/30"
            title="Delete email"
            aria-label="Delete email"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px]">
          <MetaLabel icon={<Mail className="size-3" />}>From</MetaLabel>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-secondary truncate" title={email.from ?? undefined}>{email.from}</span>
            {senderDomain && (
              <span className="badge-green shrink-0 flex items-center gap-0.5">
                <ShieldCheck className="size-2.5" />
                {senderDomain}
              </span>
            )}
          </div>

          <MetaLabel icon={<Mail className="size-3" />}>To</MetaLabel>
          <span className="text-secondary truncate font-mono text-[10px]" title={email.to ?? undefined}>{email.to}</span>

          <MetaLabel icon={<Clock className="size-3" />}>Date</MetaLabel>
          <span className="text-secondary">
            {new Date(email.receivedAt).toLocaleString(undefined, {
              dateStyle: 'medium', timeStyle: 'short',
            })}
          </span>

          <MetaLabel icon={<FileText className="size-3" />}>Size</MetaLabel>
          <span className="text-muted">{formatBytes(email.size)}</span>
        </div>
      </div>

      {/* ── Attachments ──────────────────────────────────────── */}
      {attachments.length > 0 && (
        <div className="shrink-0 border-b border-border bg-surface-1/30 px-5 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted uppercase tracking-widest mb-2">
            <Paperclip className="size-3" />
            <span>{attachments.length} attachment{attachments.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((att) => (
              <button
                key={att.id}
                onClick={() => handleDownloadAttachment(att.id, att.filename)}
                title={`Download ${att.filename} (${formatBytes(att.size)})`}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-150',
                  'border-border bg-surface-2 hover:bg-surface-3 hover:border-emerald-700/40',
                  'text-[11px] text-secondary hover:text-primary',
                  'focus-visible:ring-1 focus-visible:ring-emerald-600/40',
                )}
              >
                <AttachmentIcon contentType={att.contentType} />
                <span className="max-w-[140px] truncate">{att.filename}</span>
                <span className="text-muted font-mono text-[10px]">{formatBytes(att.size)}</span>
                <Download className="size-2.5 text-muted ml-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── View tabs ────────────────────────────────────────── */}
      <div className="shrink-0 flex border-b border-border bg-surface-1/50">
        <ViewTab active={tab === 'html'} icon={<Code2 className="size-3" />} onClick={() => setTab('html')}>
          HTML
        </ViewTab>
        <ViewTab active={tab === 'text'} icon={<AlignLeft className="size-3" />} onClick={() => setTab('text')}>
          Plain text
        </ViewTab>
        <ViewTab active={tab === 'headers'} icon={<List className="size-3" />} onClick={() => setTab('headers')}>
          Headers
        </ViewTab>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'html' && (
          <iframe
            key={`${email.id}-html-${blockRemoteImages ? 'blocked' : 'open'}`}
            srcDoc={(() => {
              const base = email.bodyHtml ||
                '<html><body style="font-family:system-ui,sans-serif;color:#64748b;padding:32px 24px;background:#fff;font-size:14px;line-height:1.6">No HTML content for this email.</body></html>'
              return blockRemoteImages ? injectBlockerCSS(base) : base
            })()}
            sandbox="allow-same-origin"
            className="w-full h-full border-0 bg-white"
            title="Email HTML content"
          />
        )}

        {tab === 'text' && (
          <div className="h-full overflow-y-auto p-5">
            {email.bodyText ? (
              <pre className="font-mono text-[11px] text-secondary whitespace-pre-wrap leading-relaxed">
                {email.bodyText}
              </pre>
            ) : (
              <p className="text-[11px] text-muted italic">No plain text content for this email.</p>
            )}
          </div>
        )}

        {tab === 'headers' && (
          <div className="h-full overflow-y-auto p-5">
            {Object.entries(email.headers).length > 0 ? (
              <div className="space-y-1.5">
                {Object.entries(email.headers).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[130px_1fr] gap-3 text-[11px] py-1 border-b border-border-subtle">
                    <span className="font-mono text-emerald-400 font-medium truncate self-start pt-px">{k}</span>
                    <span className="font-mono text-secondary break-all leading-relaxed">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted italic">No headers captured for this email.</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function MetaLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-muted font-medium self-start pt-px shrink-0">
      {icon}
      {children}
    </span>
  )
}

function ViewTab({
  active, icon, onClick, children,
}: {
  active: boolean
  icon: React.ReactNode
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-semibold tracking-wide transition-all duration-150',
        'border-b-2',
        active
          ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
          : 'border-transparent text-muted hover:text-secondary hover:bg-surface-2/50',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function AttachmentIcon({ contentType }: { contentType: string }) {
  const ct = contentType.toLowerCase()
  if (ct.startsWith('image/')) return <Image className="size-3 text-blue-400 shrink-0" />
  if (ct.includes('zip') || ct.includes('tar') || ct.includes('gz')) return <Archive className="size-3 text-amber-400 shrink-0" />
  if (ct.startsWith('text/') || ct.includes('pdf')) return <FileText className="size-3 text-muted shrink-0" />
  return <File className="size-3 text-muted shrink-0" />
}
