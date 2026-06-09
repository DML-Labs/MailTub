import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { NavSidebar, type NavView } from '@/components/NavSidebar'
import { AppBar } from '@/components/AppBar'
import { SettingsPanel } from '@/components/SettingsPanel'
import { EmailList } from '@/components/EmailList'
import { EmailDetail } from '@/components/EmailDetail'
import { QRModal } from '@/components/QRModal'
import { CommandPalette } from '@/components/CommandPalette'
import { useMailboxTabs } from '@/hooks/useMailboxTabs'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useStarred } from '@/hooks/useStarred'
import { useSettings } from '@/hooks/useSettings'
import { deleteEmail, exportEmailsJSON, exportEmailsZIP } from '@/api/client'
import { cn } from '@/lib/utils'
import type { Email, WSMessage } from '@/types'

// ── WebSocket bridge — one per tab, always mounted ────────────────────────────

function TabWSBridge({
  tabId,
  address,
  onMessage,
  onDisconnect,
}: {
  tabId: string
  address: string | undefined
  onMessage: (tabId: string, msg: WSMessage) => void
  onDisconnect: (tabId: string) => void
}) {
  const handleMessage  = useCallback((msg: WSMessage) => onMessage(tabId, msg), [tabId, onMessage])
  const handleDisconn  = useCallback(() => onDisconnect(tabId), [tabId, onDisconnect])
  useWebSocket(address, handleMessage, handleDisconn)
  return null
}

// ── Footer bar ────────────────────────────────────────────────────────────────

function FooterBar() {
  return (
    <div className="h-7 shrink-0 flex items-center justify-between px-4 border-t border-border bg-surface-1/50">
      <span className="text-[10px] text-muted">MailTub · Self-hosted · Apache 2.0</span>
      <span className="text-[10px] text-faint">Made by DML Labs ❤️</span>
    </div>
  )
}

// ── View title helper ─────────────────────────────────────────────────────────

const VIEW_LABELS: Record<NavView, string> = {
  inbox: 'Inbox',
  starred: 'Starred',
  attachments: 'Attachments',
  settings: 'Settings',
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const {
    tabs, activeTabId, activeTab, unreadCount,
    addTab, closeTab, setActiveTab,
    deleteTabMailbox, refreshTab,
    addEmailToTab, removeEmailFromTab, markEmailReadInTab, setTabWsConnected,
  } = useMailboxTabs()

  const { starred, toggle: toggleStar, isStarred } = useStarred()
  const { settings, setSettings } = useSettings()

  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null)
  const [view, setView] = useState<NavView>('inbox')
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [showQR, setShowQR] = useState(false)
  const [toolbarCopied, setToolbarCopied] = useState(false)
  const [arrivalTimes, setArrivalTimes] = useState<number[]>([])
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Keep sound setting in a ref so WS handler doesn't need to re-subscribe
  const soundEnabledRef = useRef(settings.soundEnabled)
  useEffect(() => { soundEnabledRef.current = settings.soundEnabled }, [settings.soundEnabled])

  // Clear state on tab switch
  const prevTabId = useRef(activeTabId)
  useEffect(() => {
    if (activeTabId !== prevTabId.current) {
      prevTabId.current = activeTabId
      setSelectedEmail(null)
      setSearchQuery('')
      setFilter('all')
      setMobilePane('list')
    }
  }, [activeTabId])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      // Ctrl+P / Cmd+P → command palette (override browser print)
      if (meta && e.key === 'p') {
        e.preventDefault()
        setPaletteOpen(v => !v)
        return
      }
      // Ctrl+K / Cmd+K → focus search
      if (meta && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // ── Favicon + title badge ─────────────────────────────────────────────────
  const originalTitle = useRef('MailTub')
  const faviconRef = useRef<HTMLLinkElement | null>(null)

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) MailTub` : originalTitle.current
    const canvas = document.createElement('canvas')
    canvas.width = 32; canvas.height = 32
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const r = 6
    ctx.fillStyle = '#059669'
    ctx.beginPath()
    ctx.moveTo(r, 0); ctx.lineTo(32 - r, 0); ctx.quadraticCurveTo(32, 0, 32, r)
    ctx.lineTo(32, 32 - r); ctx.quadraticCurveTo(32, 32, 32 - r, 32)
    ctx.lineTo(r, 32); ctx.quadraticCurveTo(0, 32, 0, 32 - r)
    ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.lineWidth = 2
    ctx.strokeRect(4, 9, 24, 15)
    ctx.beginPath()
    ctx.moveTo(4, 9); ctx.lineTo(16, 19); ctx.lineTo(28, 9)
    ctx.stroke()
    if (unreadCount > 0) {
      const badge = unreadCount > 99 ? '99+' : String(unreadCount)
      const sz = 14
      ctx.fillStyle = '#ef4444'; ctx.beginPath()
      ctx.arc(32 - sz / 2, sz / 2, sz / 2, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ffffff'; ctx.font = `bold ${unreadCount > 9 ? 7 : 9}px sans-serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(badge, 32 - sz / 2, sz / 2)
    }
    if (!faviconRef.current) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      faviconRef.current = link
    }
    faviconRef.current.href = canvas.toDataURL('image/png')
  }, [unreadCount])

  // ── Email arrival chime ───────────────────────────────────────────────────
  const playChime = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const t = ctx.currentTime
      const notes = [523.25, 783.99]
      notes.forEach((freq, i) => {
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.08, t + i * 0.16)
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.45)
        osc.start(t + i * 0.16)
        osc.stop(t + i * 0.16 + 0.5)
      })
      setTimeout(() => ctx.close(), 2000)
    } catch { /* AudioContext unavailable */ }
  }, [])

  // ── WebSocket handlers ────────────────────────────────────────────────────
  const handleWsMessage = useCallback((tabId: string, msg: WSMessage) => {
    switch (msg.type) {
      case 'subscribed':
      case 'heartbeat':
        setTabWsConnected(tabId, true)
        break
      case 'new_email':
        if (msg.email) {
          addEmailToTab(tabId, msg.email)
          setArrivalTimes(prev => [...prev.slice(-9), Date.now()])
          if (soundEnabledRef.current) playChime()
          if (tabId === activeTabId) {
            toast.success(`New email from ${msg.email.from || 'unknown'}`, {
              description: msg.email.subject || '(no subject)', duration: 5000,
            })
          } else {
            const tab = tabs.find(t => t.id === tabId)
            toast(`New email in ${tab?.mailbox?.localPart ?? 'another tab'}`, {
              description: msg.email.subject || '(no subject)', duration: 4000,
            })
          }
        }
        break
      case 'email_delete':
        if (msg.emailId) removeEmailFromTab(tabId, msg.emailId)
        break
    }
  }, [addEmailToTab, removeEmailFromTab, setTabWsConnected, activeTabId, tabs, playChime])

  const handleWsDisconnect = useCallback((tabId: string) => setTabWsConnected(tabId, false), [setTabWsConnected])

  // ── Filtered emails ───────────────────────────────────────────────────────
  const allEmails = activeTab?.emails ?? []

  const filteredEmails = useMemo(() => {
    let list = allEmails
    if (view === 'starred')     list = list.filter(e => isStarred(e.id))
    if (view === 'attachments') list = list.filter(e => (e.attachments?.length ?? 0) > 0)
    const q = searchQuery.trim().toLowerCase()
    if (q) list = list.filter(e =>
      e.subject?.toLowerCase().includes(q) ||
      e.from?.toLowerCase().includes(q) ||
      e.bodyText?.toLowerCase().includes(q),
    )
    if (filter === 'unread') list = list.filter(e => !e.isRead)
    if (filter === 'read')   list = list.filter(e =>  e.isRead)
    return list
  }, [allEmails, view, searchQuery, filter, starred])

  const starredCount         = useMemo(() => allEmails.filter(e => isStarred(e.id)).length, [allEmails, starred])
  const attachmentEmailCount = useMemo(() => allEmails.filter(e => (e.attachments?.length ?? 0) > 0).length, [allEmails])

  // ── Email actions ─────────────────────────────────────────────────────────
  const handleSelectEmail = useCallback((email: Email) => {
    setSelectedEmail(email)
    setMobilePane('detail')
    if (!email.isRead) markEmailReadInTab(activeTabId, email.id)
  }, [activeTabId, markEmailReadInTab])

  const handleEmailClose = useCallback(() => {
    // On mobile, go back to list without clearing the selection.
    // On desktop, clear the selected email.
    if (window.innerWidth < 768) {
      setMobilePane('list')
    } else {
      setSelectedEmail(null)
    }
  }, [])

  const handleDeleteEmail = useCallback(async (id: string) => {
    if (!activeTab?.mailbox) return
    try {
      await deleteEmail(activeTab.mailbox.address, id)
      removeEmailFromTab(activeTabId, id)
      if (selectedEmail?.id === id) { setSelectedEmail(null); setMobilePane('list') }
    } catch {
      toast.error('Failed to delete email')
    }
  }, [activeTab, activeTabId, removeEmailFromTab, selectedEmail])

  const handleDeleteMailbox = useCallback(async () => {
    if (!activeTab) return
    try {
      await deleteTabMailbox(activeTabId)
      setSelectedEmail(null)
      setMobilePane('list')
      toast.success('Mailbox deleted — new address generated')
    } catch {
      toast.error('Failed to delete mailbox')
    }
  }, [activeTab, activeTabId, deleteTabMailbox])

  const handleAddTab = useCallback(async (localPart?: string, ttlHours?: number) => {
    try { await addTab(localPart, ttlHours) }
    catch { toast.error('Failed to create mailbox') }
  }, [addTab])

  const handleRefresh = useCallback(() => refreshTab(activeTabId), [refreshTab, activeTabId])

  const handleCopyAddress = useCallback(() => {
    if (!activeTab?.mailbox) return
    navigator.clipboard.writeText(activeTab.mailbox.address).then(() => {
      setToolbarCopied(true)
      setTimeout(() => setToolbarCopied(false), 1_800)
      toast.success('Address copied')
    })
  }, [activeTab])

  const handleExportJSON = useCallback(() => {
    if (allEmails.length === 0) { toast.error('No emails to export'); return }
    exportEmailsJSON(allEmails, `${activeTab?.mailbox?.localPart ?? 'inbox'}_${new Date().toISOString().slice(0, 10)}.json`)
    toast.success(`Exported ${allEmails.length} email${allEmails.length !== 1 ? 's' : ''} as JSON`)
  }, [allEmails, activeTab])

  const handleExportZIP = useCallback(async () => {
    if (allEmails.length === 0) { toast.error('No emails to export'); return }
    try {
      await exportEmailsZIP(allEmails, `${activeTab?.mailbox?.localPart ?? 'inbox'}_${new Date().toISOString().slice(0, 10)}.zip`)
      toast.success('Exported as .eml ZIP')
    } catch { toast.error('Export failed') }
  }, [allEmails, activeTab])

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-surface-0">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-40 w-[500px] h-[280px] bg-emerald-900/6 rounded-full blur-3xl" />
      </div>

      {/* WS bridges */}
      {tabs.map(tab => (
        <TabWSBridge
          key={tab.id}
          tabId={tab.id}
          address={tab.mailbox?.address}
          onMessage={handleWsMessage}
          onDisconnect={handleWsDisconnect}
        />
      ))}

      {/* ── App bar ────────────────────────────────────────────── */}
      <AppBar
        activeMailbox={activeTab?.mailbox ?? null}
        wsConnected={activeTab?.wsConnected ?? false}
        toolbarCopied={toolbarCopied}
        onCopyAddress={handleCopyAddress}
        onQROpen={() => setShowQR(true)}
        onRefresh={handleRefresh}
        onDeleteMailbox={handleDeleteMailbox}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchRef={searchRef}
      />

      {/* ── Main content ───────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">

        {/* Mobile sidebar overlay backdrop */}
        {mobileNavOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 md:hidden"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Hamburger (mobile only) */}
        <button
          onClick={() => setMobileNavOpen(v => !v)}
          className={cn(
            'fixed bottom-4 left-4 z-30 md:hidden',
            'size-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg',
            'transition-transform active:scale-95',
          )}
          aria-label="Open navigation"
        >
          {mobileNavOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        {/* Left nav */}
        <div className={cn(
          'fixed inset-y-0 left-0 z-30 transition-transform duration-200 ease-in-out',
          'md:relative md:z-auto md:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}>
          <NavSidebar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={id => { setActiveTab(id); setMobileNavOpen(false) }}
            onAddTab={handleAddTab}
            onCloseTab={closeTab}
            activeMailbox={activeTab?.mailbox ?? null}
            wsConnected={activeTab?.wsConnected ?? false}
            loading={activeTab?.loading ?? true}
            emailCount={allEmails.length}
            unreadCount={unreadCount}
            starredCount={starredCount}
            attachmentEmailCount={attachmentEmailCount}
            view={view}
            onViewChange={v => { setView(v); setMobileNavOpen(false) }}
            defaultTTLHours={settings.defaultTTLHours}
            onCopyAddress={handleCopyAddress}
            onRefresh={handleRefresh}
            onDeleteMailbox={handleDeleteMailbox}
            arrivalTimes={arrivalTimes}
          />
        </div>

        {/* Content area */}
        <AnimatePresence mode="wait">
          {view === 'settings' ? (
            <SettingsPanel
              key="settings"
              defaultTTLHours={settings.defaultTTLHours}
              onDefaultTTLChange={h => setSettings({ defaultTTLHours: h })}
              activeMailbox={activeTab?.mailbox ?? null}
              activeEmails={allEmails}
              soundEnabled={settings.soundEnabled}
              onSoundToggle={() => setSettings({ soundEnabled: !settings.soundEnabled })}
              blockRemoteImages={settings.blockRemoteImages}
              onBlockRemoteImagesToggle={() => setSettings({ blockRemoteImages: !settings.blockRemoteImages })}
            />
          ) : (
            <motion.div
              key="inbox"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex-1 flex min-w-0 overflow-hidden"
            >
              {/* ── Middle: email list ─────────────────────────── */}
              <div className={cn(
                'w-full md:w-[300px] shrink-0 flex flex-col border-r border-border bg-surface-1',
                // Mobile: hide when viewing detail
                mobilePane === 'detail' ? 'hidden md:flex' : 'flex',
              )}>

                {/* View title + count + filter */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
                  <span className="text-sm font-semibold text-primary">{VIEW_LABELS[view]}</span>
                  {filteredEmails.length > 0 && (
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-surface-3 text-secondary">
                      {filteredEmails.length}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-0.5">
                    {(['all', 'unread', 'read'] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-medium capitalize transition-colors',
                          filter === f
                            ? 'bg-surface-3 text-primary'
                            : 'text-muted hover:text-secondary',
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Search results count — shown when search is active */}
                {searchQuery && (
                  <div className="px-3 py-1.5 border-b border-border-subtle shrink-0">
                    <p className="text-[10px] text-muted">
                      {filteredEmails.length} result{filteredEmails.length !== 1 ? 's' : ''} for "{searchQuery}"
                    </p>
                  </div>
                )}

                {/* Email list */}
                {activeTab?.loading ? (
                  <EmailListSkeleton />
                ) : (
                  <EmailList
                    emails={filteredEmails}
                    selectedId={selectedEmail?.id ?? null}
                    onSelect={handleSelectEmail}
                    starredIds={starred}
                    onToggleStar={toggleStar}
                  />
                )}
              </div>

              {/* ── Right: email detail ────────────────────────── */}
              <div className={cn(
                'flex-1 flex flex-col overflow-hidden bg-surface-0',
                // Mobile: hide when viewing list
                mobilePane === 'list' ? 'hidden md:flex' : 'flex',
              )}>
                <EmailDetail
                  email={selectedEmail}
                  mailboxAddress={activeTab?.mailbox?.address ?? ''}
                  onDelete={handleDeleteEmail}
                  onClose={handleEmailClose}
                  blockRemoteImages={settings.blockRemoteImages}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Footer bar ─────────────────────────────────────────── */}
      <FooterBar />

      {/* QR modal */}
      {showQR && activeTab?.mailbox && (
        <QRModal address={activeTab.mailbox.address} onClose={() => setShowQR(false)} />
      )}

      {/* Command palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        activeMailbox={activeTab?.mailbox ?? null}
        onNewMailbox={() => handleAddTab(undefined, settings.defaultTTLHours)}
        onCopyAddress={handleCopyAddress}
        onRefresh={handleRefresh}
        onDeleteMailbox={handleDeleteMailbox}
        onExportJSON={handleExportJSON}
        onExportZIP={handleExportZIP}
        onViewChange={v => setView(v as NavView)}
      />
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function EmailListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="flex gap-2.5 px-3 py-2.5 border-b border-border animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="size-8 rounded-full bg-surface-3 shrink-0" />
          <div className="flex-1 py-px space-y-1.5">
            <div className="flex justify-between gap-4">
              <div className="h-2.5 bg-surface-3 rounded-full w-24" />
              <div className="h-2 bg-surface-2 rounded-full w-10" />
            </div>
            <div className="h-2 bg-surface-2 rounded-full w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}
