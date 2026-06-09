import { useState, useEffect, useCallback, useRef } from 'react'
import * as api from '@/api/client'
import type { Email, Mailbox } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MailboxTab {
  id: string
  mailbox: Mailbox | null
  emails: Email[]
  loading: boolean
  wsConnected: boolean
}

export interface UseMailboxTabsReturn {
  tabs: MailboxTab[]
  activeTabId: string
  activeTab: MailboxTab | null
  unreadCount: number
  addTab: (localPart?: string, ttlHours?: number) => Promise<void>
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  replaceTabMailbox: (tabId: string, localPart?: string, ttlHours?: number) => Promise<void>
  deleteTabMailbox: (tabId: string) => Promise<void>
  refreshTab: (tabId: string) => Promise<void>
  addEmailToTab: (tabId: string, email: Email) => void
  removeEmailFromTab: (tabId: string, emailId: string) => void
  markEmailReadInTab: (tabId: string, emailId: string) => void
  setTabWsConnected: (tabId: string, v: boolean) => void
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mailtub_tabs_v2'
const MAX_TABS = 5

interface SavedTab { id: string; address: string }
interface PersistedState { tabs: SavedTab[]; activeTabId: string }

function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

function savePersisted(tabs: MailboxTab[], activeTabId: string) {
  const saved: PersistedState = {
    tabs: tabs
      .filter(t => t.mailbox !== null)
      .map(t => ({ id: t.id, address: t.mailbox!.address })),
    activeTabId,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved))
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMailboxTabs(): UseMailboxTabsReturn {
  const [tabs, setTabs] = useState<MailboxTab[]>([])
  const [activeTabId, setActiveTabIdState] = useState('')
  const didInit = useRef(false)

  // Stable ref so callbacks don't need tabs/activeTabId in deps
  const tabsRef = useRef<MailboxTab[]>([])
  tabsRef.current = tabs
  const activeTabIdRef = useRef(activeTabId)
  activeTabIdRef.current = activeTabId

  // Persist whenever tabs or active changes
  useEffect(() => {
    if (didInit.current && tabs.length > 0) {
      savePersisted(tabs, activeTabId)
    }
  }, [tabs, activeTabId])

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true

    async function init() {
      const saved = loadPersisted()
      if (saved && saved.tabs.length > 0) {
        // Create loading placeholders immediately
        const placeholders: MailboxTab[] = saved.tabs.map(s => ({
          id: s.id,
          mailbox: null,
          emails: [],
          loading: true,
          wsConnected: false,
        }))
        setTabs(placeholders)

        const validActiveId = saved.tabs.find(t => t.id === saved.activeTabId)
          ? saved.activeTabId
          : saved.tabs[0].id
        setActiveTabIdState(validActiveId)

        // Restore each tab in parallel
        const restored = await Promise.all(
          saved.tabs.map(async (s): Promise<MailboxTab> => {
            try {
              const { mailbox } = await api.getMailbox(s.address)
              const { emails } = await api.listEmails(s.address)
              return { id: s.id, mailbox, emails: emails ?? [], loading: false, wsConnected: false }
            } catch {
              // Expired or gone — create a fresh mailbox for this slot
              try {
                const mb = await api.createMailbox()
                return { id: s.id, mailbox: mb, emails: [], loading: false, wsConnected: false }
              } catch {
                return { id: s.id, mailbox: null, emails: [], loading: false, wsConnected: false }
              }
            }
          }),
        )

        const live = restored.filter(t => t.mailbox !== null)
        if (live.length === 0) {
          // All failed — create one fresh tab
          const fresh = await createFreshTab()
          setTabs([fresh])
          setActiveTabIdState(fresh.id)
        } else {
          setTabs(live)
          if (!live.find(t => t.id === validActiveId)) {
            setActiveTabIdState(live[0].id)
          }
        }
      } else {
        // Fresh session
        const fresh = await createFreshTab()
        setTabs([fresh])
        setActiveTabIdState(fresh.id)
      }
    }

    init()
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  async function createFreshTab(localPart?: string, ttlHours?: number): Promise<MailboxTab> {
    const id = crypto.randomUUID()
    const mb = await api.createMailbox(localPart, ttlHours)
    return { id, mailbox: mb, emails: [], loading: false, wsConnected: false }
  }

  const mutateTab = useCallback((tabId: string, updater: (t: MailboxTab) => MailboxTab) => {
    setTabs(prev => prev.map(t => (t.id === tabId ? updater(t) : t)))
  }, [])

  // ── Public API ────────────────────────────────────────────────────────────

  const addTab = useCallback(async (localPart?: string, ttlHours?: number) => {
    if (tabsRef.current.length >= MAX_TABS) return
    const id = crypto.randomUUID()
    const placeholder: MailboxTab = { id, mailbox: null, emails: [], loading: true, wsConnected: false }
    setTabs(prev => [...prev, placeholder])
    setActiveTabIdState(id)
    try {
      const mb = await api.createMailbox(localPart, ttlHours)
      setTabs(prev => prev.map(t => t.id === id ? { ...t, mailbox: mb, loading: false } : t))
    } catch (err) {
      setTabs(prev => prev.filter(t => t.id !== id))
      if (tabsRef.current.length > 0) setActiveTabIdState(tabsRef.current[0].id)
      throw err
    }
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) return prev // keep at least one
      return next
    })
    setActiveTabIdState(prev => {
      if (prev !== id) return prev
      const remaining = tabsRef.current.filter(t => t.id !== id)
      return remaining.length > 0 ? remaining[0].id : prev
    })
  }, [])

  const setActiveTab = useCallback((id: string) => {
    setActiveTabIdState(id)
  }, [])

  const replaceTabMailbox = useCallback(async (tabId: string, localPart?: string, ttlHours?: number) => {
    mutateTab(tabId, t => ({ ...t, loading: true, emails: [] }))
    try {
      const mb = await api.createMailbox(localPart, ttlHours)
      mutateTab(tabId, t => ({ ...t, mailbox: mb, loading: false }))
    } catch (err) {
      mutateTab(tabId, t => ({ ...t, loading: false }))
      throw err
    }
  }, [mutateTab])

  const deleteTabMailbox = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab?.mailbox) return
    try {
      await api.deleteMailbox(tab.mailbox.address)
    } catch { /* ignore */ }
    await replaceTabMailbox(tabId)
  }, [replaceTabMailbox])

  const refreshTab = useCallback(async (tabId: string) => {
    const tab = tabsRef.current.find(t => t.id === tabId)
    if (!tab?.mailbox) return
    try {
      const { emails } = await api.listEmails(tab.mailbox.address)
      mutateTab(tabId, t => ({ ...t, emails: emails ?? [] }))
    } catch { /* ignore */ }
  }, [mutateTab])

  const addEmailToTab = useCallback((tabId: string, email: Email) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== tabId) return t
      if (t.emails.some(e => e.id === email.id)) return t
      return { ...t, emails: [email, ...t.emails] }
    }))
  }, [])

  const removeEmailFromTab = useCallback((tabId: string, emailId: string) => {
    setTabs(prev => prev.map(t =>
      t.id !== tabId ? t : { ...t, emails: t.emails.filter(e => e.id !== emailId) }
    ))
  }, [])

  const markEmailReadInTab = useCallback((tabId: string, emailId: string) => {
    setTabs(prev => prev.map(t =>
      t.id !== tabId ? t : {
        ...t,
        emails: t.emails.map(e => e.id === emailId ? { ...e, isRead: true } : e),
      }
    ))
  }, [])

  const setTabWsConnected = useCallback((tabId: string, v: boolean) => {
    mutateTab(tabId, t => ({ ...t, wsConnected: v }))
  }, [mutateTab])

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null
  const unreadCount = tabs.reduce(
    (sum, t) => sum + t.emails.filter(e => !e.isRead).length,
    0,
  )

  return {
    tabs,
    activeTabId,
    activeTab,
    unreadCount,
    addTab,
    closeTab,
    setActiveTab,
    replaceTabMailbox,
    deleteTabMailbox,
    refreshTab,
    addEmailToTab,
    removeEmailFromTab,
    markEmailReadInTab,
    setTabWsConnected,
  }
}
