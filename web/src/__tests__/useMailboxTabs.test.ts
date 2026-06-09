import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMailboxTabs } from '@/hooks/useMailboxTabs'
import type { Email, Mailbox } from '@/types'

// ── API mock ──────────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  createMailbox: vi.fn().mockResolvedValue({
    id: 'mb-test',
    address: 'test@localhost',
    localPart: 'test',
    domain: 'localhost',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  } satisfies Mailbox),
  listEmails: vi.fn().mockResolvedValue({ emails: [] }),
  getMailbox: vi.fn().mockResolvedValue({
    mailbox: {
      id: 'mb-test',
      address: 'test@localhost',
      localPart: 'test',
      domain: 'localhost',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  }),
  deleteMailbox: vi.fn().mockResolvedValue(undefined),
}))

// ── Helpers ───────────────────────────────────────────────────────────────

function makeEmail(overrides: Partial<Email> = {}): Email {
  return {
    id: 'email-1',
    mailboxId: 'mb-test',
    from: 'sender@example.com',
    to: 'test@localhost',
    subject: 'Hello',
    bodyText: 'Plain text body',
    bodyHtml: '',
    headers: {},
    attachments: [],
    receivedAt: new Date().toISOString(),
    isRead: false,
    size: 100,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

// ── Initialization ────────────────────────────────────────────────────────

describe('useMailboxTabs initialization', () => {
  it('creates one tab on fresh session', async () => {
    const { result } = renderHook(() => useMailboxTabs())

    // Wait for the init effect to complete
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    expect(result.current.tabs.length).toBe(1)
    expect(result.current.activeTab).not.toBeNull()
  })

  it('activeTabId matches the single tab', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const { tabs, activeTabId } = result.current
    expect(tabs[0].id).toBe(activeTabId)
  })
})

// ── addEmailToTab ─────────────────────────────────────────────────────────

describe('addEmailToTab', () => {
  it('prepends an email to the correct tab', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    const email = makeEmail()

    act(() => result.current.addEmailToTab(tabId, email))

    expect(result.current.activeTab?.emails).toHaveLength(1)
    expect(result.current.activeTab?.emails[0].id).toBe('email-1')
  })

  it('ignores duplicate emails', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    const email = makeEmail()

    act(() => result.current.addEmailToTab(tabId, email))
    act(() => result.current.addEmailToTab(tabId, email))

    expect(result.current.activeTab?.emails).toHaveLength(1)
  })

  it('prepends so newest email is first', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId

    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'old' })))
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'new' })))

    expect(result.current.activeTab?.emails[0].id).toBe('new')
    expect(result.current.activeTab?.emails[1].id).toBe('old')
  })
})

// ── removeEmailFromTab ────────────────────────────────────────────────────

describe('removeEmailFromTab', () => {
  it('removes the correct email', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'keep' })))
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'remove' })))
    act(() => result.current.removeEmailFromTab(tabId, 'remove'))

    const ids = result.current.activeTab?.emails.map(e => e.id)
    expect(ids).toEqual(['keep'])
  })

  it('is a no-op for unknown email id', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.addEmailToTab(tabId, makeEmail()))
    act(() => result.current.removeEmailFromTab(tabId, 'nonexistent'))

    expect(result.current.activeTab?.emails).toHaveLength(1)
  })
})

// ── markEmailReadInTab ────────────────────────────────────────────────────

describe('markEmailReadInTab', () => {
  it('marks a specific email as read', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'e1', isRead: false })))
    act(() => result.current.markEmailReadInTab(tabId, 'e1'))

    expect(result.current.activeTab?.emails[0].isRead).toBe(true)
  })

  it('does not affect other emails', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'e1', isRead: false })))
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'e2', isRead: false })))
    act(() => result.current.markEmailReadInTab(tabId, 'e1'))

    const e2 = result.current.activeTab?.emails.find(e => e.id === 'e2')
    expect(e2?.isRead).toBe(false)
  })
})

// ── unreadCount ───────────────────────────────────────────────────────────

describe('unreadCount', () => {
  it('counts unread emails across tabs', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'e1', isRead: false })))
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'e2', isRead: false })))

    expect(result.current.unreadCount).toBe(2)
  })

  it('decreases when an email is marked read', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.addEmailToTab(tabId, makeEmail({ id: 'e1', isRead: false })))
    act(() => result.current.markEmailReadInTab(tabId, 'e1'))

    expect(result.current.unreadCount).toBe(0)
  })
})

// ── closeTab ──────────────────────────────────────────────────────────────

describe('closeTab', () => {
  it('keeps at least one tab open', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.closeTab(tabId))

    expect(result.current.tabs.length).toBeGreaterThanOrEqual(1)
  })
})

// ── setTabWsConnected ──────────────────────────────────────────────────────

describe('setTabWsConnected', () => {
  it('updates ws connection state for the tab', async () => {
    const { result } = renderHook(() => useMailboxTabs())
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })

    const tabId = result.current.activeTabId
    act(() => result.current.setTabWsConnected(tabId, true))

    expect(result.current.activeTab?.wsConnected).toBe(true)
  })
})
