import { useState, useEffect, useCallback, useRef } from 'react'
import * as api from '@/api/client'
import type { Email, Mailbox } from '@/types'

const STORAGE_KEY = 'mailtub_address'

export interface UseMailboxReturn {
  mailbox: Mailbox | null
  emails: Email[]
  unreadCount: number
  loading: boolean
  refreshing: boolean
  error: string | null
  wsConnected: boolean
  createNew: (localPart?: string) => Promise<void>
  refresh: () => Promise<void>
  addEmail: (e: Email) => void
  removeEmail: (id: string) => void
  setWsConnected: (v: boolean) => void
}

export function useMailbox(): UseMailboxReturn {
  const [mailbox, setMailbox] = useState<Mailbox | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)

  const mailboxRef = useRef<Mailbox | null>(null)
  mailboxRef.current = mailbox

  const unreadCount = emails.filter(e => !e.isRead).length

  const fetchEmails = useCallback(async (mb: Mailbox) => {
    const { emails } = await api.listEmails(mb.address)
    setEmails(emails ?? [])
  }, [])

  const boot = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const { mailbox: mb } = await api.getMailbox(saved)
          setMailbox(mb)
          await fetchEmails(mb)
          return
        } catch {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
      const mb = await api.createMailbox()
      setMailbox(mb)
      localStorage.setItem(STORAGE_KEY, mb.address)
      setEmails([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initialization failed')
    } finally {
      setLoading(false)
    }
  }, [fetchEmails])

  const createNew = useCallback(async (localPart?: string) => {
    setLoading(true)
    setError(null)
    setEmails([])
    try {
      const mb = await api.createMailbox(localPart)
      setMailbox(mb)
      localStorage.setItem(STORAGE_KEY, mb.address)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create mailbox')
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    const mb = mailboxRef.current
    if (!mb) return
    setRefreshing(true)
    try {
      await fetchEmails(mb)
    } finally {
      setRefreshing(false)
    }
  }, [fetchEmails])

  const addEmail = useCallback((e: Email) => {
    setEmails(prev => {
      if (prev.some(x => x.id === e.id)) return prev
      return [e, ...prev]
    })
  }, [])

  const removeEmail = useCallback((id: string) => {
    setEmails(prev => prev.filter(e => e.id !== id))
  }, [])

  useEffect(() => {
    void boot()
  }, [boot])

  return {
    mailbox,
    emails,
    unreadCount,
    loading,
    refreshing,
    error,
    wsConnected,
    createNew,
    refresh,
    addEmail,
    removeEmail,
    setWsConnected,
  }
}
