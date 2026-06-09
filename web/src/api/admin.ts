const BASE = '/admin/api'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export interface AdminStats {
  mailboxes: number
  emails: number
  version: string
  domain: string
}

export interface AdminMailbox {
  id: string
  address: string
  localPart: string
  domain: string
  expiresAt: string
  createdAt: string
  emailCount: number
}

export interface AdminMailboxList {
  mailboxes: AdminMailbox[]
  total: number
  page: number
  limit: number
}

export interface AdminEmail {
  id: string
  mailboxId: string
  from: string
  to: string
  subject: string
  bodyText: string
  bodyHtml: string
  isRead: boolean
  receivedAt: string
  size: number
}

export interface AdminEmailList {
  emails: AdminEmail[]
  total: number
  page: number
  limit: number
}

export interface LogEntry {
  time: string
  level: string
  msg: string
  attrs?: Record<string, unknown>
}

export interface AdminLogs {
  logs: LogEntry[]
  count: number
}

export interface AdminConfig {
  domain: string
  httpPort: number
  smtpPort: number
  mailboxTTL: string
  smtpMaxSizeMB: number
  starttls: boolean
  redisEnabled: boolean
  logLevel: string
  version: string
  dbPath: string
  adminEnabled: boolean
  envOverride: boolean
  apiKeySet: boolean
  rateLimit: string
}

export interface SetupStatus {
  needsSetup: boolean
  envOverride: boolean
}

export const adminApi = {
  setupStatus: () =>
    req<SetupStatus>(`${BASE}/setup-status`),

  setup: (password: string, confirmPassword: string) =>
    req<{ status: string }>(`${BASE}/setup`, {
      method: 'POST',
      body: JSON.stringify({ password, confirmPassword }),
    }),

  login: (password: string) =>
    req<{ status: string }>(`${BASE}/login`, { method: 'POST', body: JSON.stringify({ password }) }),

  logout: () =>
    req<{ status: string }>(`${BASE}/logout`, { method: 'POST' }),

  stats: () =>
    req<AdminStats>(`${BASE}/stats`),

  mailboxes: (page = 1, limit = 50) =>
    req<AdminMailboxList>(`${BASE}/mailboxes?page=${page}&limit=${limit}`),

  mailboxEmails: (mailboxId: string, page = 1, limit = 20) =>
    req<AdminEmailList>(`${BASE}/mailboxes/${mailboxId}/emails?page=${page}&limit=${limit}`),

  purgeMailbox: (id: string) =>
    req<{ status: string }>(`${BASE}/mailboxes/${id}`, { method: 'DELETE' }),

  purgeExpired: () =>
    req<{ purged: number }>(`${BASE}/purge-expired`, { method: 'POST' }),

  logs: (n = 200) =>
    req<AdminLogs>(`${BASE}/logs?n=${n}`),

  config: () =>
    req<AdminConfig>(`${BASE}/config`),

  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    req<{ status: string }>(`${BASE}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    }),
}
