import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Moon, Sun, Monitor, Download, FileJson, Archive, Info, Loader2, Bell, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTheme, type Theme } from '@/contexts/ThemeContext'
import { TTL_OPTIONS, type TTLHours } from '@/hooks/useSettings'
import { exportEmailsJSON, exportEmailsZIP, health } from '@/api/client'
import type { Email, Mailbox } from '@/types'

interface Props {
  defaultTTLHours: TTLHours
  onDefaultTTLChange: (h: TTLHours) => void
  activeMailbox: Mailbox | null
  activeEmails: Email[]
  soundEnabled: boolean
  onSoundToggle: () => void
  blockRemoteImages: boolean
  onBlockRemoteImagesToggle: () => void
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-2/50">
        <span className="text-secondary">{icon}</span>
        <h2 className="text-sm font-semibold text-primary">{title}</h2>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  )
}

// ── Theme picker ──────────────────────────────────────────────────────────────

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'dark',   label: 'Dark',   icon: <Moon className="size-4" />,    desc: 'Dark surface, emerald accent' },
  { value: 'light',  label: 'Light',  icon: <Sun className="size-4" />,     desc: 'Light surface, minimal' },
  { value: 'system', label: 'System', icon: <Monitor className="size-4" />, desc: 'Follow OS preference' },
]

function ThemePicker() {
  const { theme, resolved, setTheme } = useTheme()

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEME_OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => setTheme(opt.value)}
          className={cn(
            'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all text-center',
            theme === opt.value
              ? 'border-accent/50 bg-accent/8 text-accent'
              : 'border-border text-secondary hover:border-border-muted hover:text-primary hover:bg-surface-2',
          )}
        >
          <span>{opt.icon}</span>
          <span className="text-xs font-semibold">{opt.label}</span>
          <span className="text-[10px] opacity-70 leading-tight">{opt.desc}</span>
          {opt.value === 'system' && (
            <span className="text-[9px] opacity-50">({resolved})</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── TTL picker ────────────────────────────────────────────────────────────────

function TTLPicker({
  value,
  onChange,
}: {
  value: TTLHours
  onChange: (h: TTLHours) => void
}) {
  return (
    <div>
      <p className="text-xs text-secondary mb-2">
        Default expiry for new mailboxes. You can override this per-mailbox at creation time.
      </p>
      <div className="grid grid-cols-4 gap-2">
        {TTL_OPTIONS.map(opt => (
          <button
            key={opt.hours}
            onClick={() => onChange(opt.hours)}
            className={cn(
              'py-2 rounded-lg border text-xs font-semibold transition-all',
              value === opt.hours
                ? 'border-accent/50 bg-accent/8 text-accent'
                : 'border-border text-secondary hover:border-border-muted hover:text-primary',
            )}
          >
            <div className="text-sm font-bold">{opt.short}</div>
            <div className="text-[10px] opacity-70">{opt.label}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Sound toggle ──────────────────────────────────────────────────────────────

function SoundSection({
  enabled,
  onToggle,
}: {
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-primary">Arrival chime</p>
        <p className="text-xs text-secondary mt-0.5">
          Play a soft chime when a new email arrives (uses Web Audio API).
        </p>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        title={enabled ? 'Disable sound' : 'Enable sound'}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          enabled ? 'bg-emerald-600' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'size-3.5 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  )
}

// ── Export section ────────────────────────────────────────────────────────────

function ExportSection({ emails, mailbox }: { emails: Email[]; mailbox: Mailbox | null }) {
  const [exportingZip, setExportingZip] = useState(false)
  const address = mailbox?.localPart ?? 'inbox'
  const count = emails.length

  const handleJSON = () => {
    if (count === 0) { toast.error('No emails to export'); return }
    exportEmailsJSON(emails, `${address}_${dateStamp()}.json`)
    toast.success(`Exported ${count} email${count !== 1 ? 's' : ''} as JSON`)
  }

  const handleZIP = async () => {
    if (count === 0) { toast.error('No emails to export'); return }
    setExportingZip(true)
    try {
      await exportEmailsZIP(emails, `${address}_${dateStamp()}.zip`)
      toast.success(`Exported ${count} email${count !== 1 ? 's' : ''} as .eml ZIP`)
    } catch {
      toast.error('Export failed')
    } finally {
      setExportingZip(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-secondary">
        {count > 0
          ? `Export all ${count} email${count !== 1 ? 's' : ''} from the active inbox.`
          : 'No emails in the active inbox to export.'}
      </p>
      <div className="flex gap-2">
        <button
          onClick={handleJSON}
          disabled={count === 0}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-medium transition-all',
            count > 0
              ? 'border-border text-primary hover:border-border-muted hover:bg-surface-2'
              : 'border-border text-faint cursor-not-allowed',
          )}
        >
          <FileJson className="size-3.5" />
          Export JSON
        </button>
        <button
          onClick={handleZIP}
          disabled={count === 0 || exportingZip}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-medium transition-all',
            count > 0 && !exportingZip
              ? 'border-border text-primary hover:border-border-muted hover:bg-surface-2'
              : 'border-border text-faint cursor-not-allowed',
          )}
        >
          {exportingZip
            ? <Loader2 className="size-3.5 animate-spin" />
            : <Archive className="size-3.5" />}
          Export .eml ZIP
        </button>
      </div>
    </div>
  )
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10)
}

// ── About section ─────────────────────────────────────────────────────────────

function AboutSection() {
  const [version, setVersion] = useState('v1.0.0')

  useEffect(() => {
    health()
      .then(h => {
        if (typeof h.version === 'string') setVersion(h.version)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          ['Version', version],
          ['License', 'Apache 2.0'],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <span className="text-muted">{k}</span>
            <span className="text-primary font-medium font-mono text-[11px]">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 pt-2 border-t border-border">
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/dml-labs/mailtub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-secondary hover:text-primary transition-colors underline underline-offset-2"
          >
            GitHub →
          </a>
          <a
            href="https://github.com/dml-labs/mailtub/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-secondary hover:text-primary transition-colors underline underline-offset-2"
          >
            Releases →
          </a>
          <a
            href="https://github.com/dml-labs/mailtub/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-secondary hover:text-primary transition-colors underline underline-offset-2"
          >
            Issues →
          </a>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-faint text-[11px]">
            By{' '}
            <a
              href="https://github.com/Devmayank-official"
              target="_blank"
              rel="noopener noreferrer"
              className="text-secondary hover:text-primary transition-colors underline underline-offset-2"
            >
              Devmayank
            </a>
            {' '}· DML Labs
          </span>
          <span className="text-faint text-[11px]">❤️ Open Source</span>
        </div>
      </div>
    </div>
  )
}

// ── Toggle row ─────────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, enabled, onToggle,
}: {
  label: string; description: string; enabled: boolean; onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-primary">{label}</p>
        <p className="text-xs text-secondary mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        role="switch"
        aria-checked={enabled}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          enabled ? 'bg-emerald-600' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'size-3.5 rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-[19px]' : 'translate-x-[3px]',
          )}
        />
      </button>
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export function SettingsPanel({
  defaultTTLHours,
  onDefaultTTLChange,
  activeMailbox,
  activeEmails,
  soundEnabled,
  onSoundToggle,
  blockRemoteImages,
  onBlockRemoteImagesToggle,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex-1 overflow-y-auto bg-surface-0"
    >
      <div className="max-w-xl mx-auto px-6 py-8 space-y-4">
        <div className="mb-6">
          <h1 className="text-lg font-bold text-primary">Settings</h1>
          <p className="text-sm text-secondary mt-0.5">Appearance, mailbox defaults, privacy, and export.</p>
        </div>

        <Section title="Appearance" icon={<Sun className="size-3.5" />}>
          <ThemePicker />
        </Section>

        <Section title="Mailbox" icon={<Info className="size-3.5" />}>
          <TTLPicker value={defaultTTLHours} onChange={onDefaultTTLChange} />
        </Section>

        <Section title="Notifications" icon={<Bell className="size-3.5" />}>
          <SoundSection enabled={soundEnabled} onToggle={onSoundToggle} />
        </Section>

        <Section title="Privacy" icon={<ShieldOff className="size-3.5" />}>
          <ToggleRow
            label="Block remote images"
            description="Prevent tracking pixels and remote images from loading in HTML emails."
            enabled={blockRemoteImages}
            onToggle={onBlockRemoteImagesToggle}
          />
        </Section>

        <Section title="Export" icon={<Download className="size-3.5" />}>
          <ExportSection emails={activeEmails} mailbox={activeMailbox} />
        </Section>

        <Section title="About MailTub" icon={<Info className="size-3.5" />}>
          <AboutSection />
        </Section>
      </div>
    </motion.div>
  )
}
