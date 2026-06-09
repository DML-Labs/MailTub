import type { Email, Mailbox } from '@/types'

const BASE = '/api/v1'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((body as { error?: string }).error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Mailbox ─────────────────────────────────────────────────────────────────

export function createMailbox(localPart?: string, ttlHours?: number): Promise<Mailbox> {
  const body: { localPart?: string; ttlHours?: number } = {}
  if (localPart) body.localPart = localPart
  if (ttlHours)  body.ttlHours  = ttlHours
  const hasBody = Object.keys(body).length > 0
  return request<Mailbox>(`${BASE}/mailbox`, {
    method: 'POST',
    body: hasBody ? JSON.stringify(body) : undefined,
  })
}

export function getMailbox(
  address: string,
): Promise<{ mailbox: Mailbox; emailCount: number }> {
  return request(`${BASE}/mailbox/${enc(address)}`)
}

export function deleteMailbox(address: string): Promise<void> {
  return request(`${BASE}/mailbox/${enc(address)}`, { method: 'DELETE' })
}

// ─── Emails ──────────────────────────────────────────────────────────────────

export function listEmails(
  address: string,
  limit = 50,
  offset = 0,
): Promise<{ emails: Email[]; total: number }> {
  return request(
    `${BASE}/mailbox/${enc(address)}/emails?limit=${limit}&offset=${offset}`,
  )
}

export function getEmail(address: string, id: string): Promise<Email> {
  return request(`${BASE}/mailbox/${enc(address)}/emails/${id}`)
}

export function deleteEmail(address: string, id: string): Promise<void> {
  return request(`${BASE}/mailbox/${enc(address)}/emails/${id}`, { method: 'DELETE' })
}

export function markEmailRead(address: string, id: string): Promise<void> {
  return request(`${BASE}/mailbox/${enc(address)}/emails/${id}/read`, { method: 'PATCH' })
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export async function downloadAttachment(
  address: string,
  emailId: string,
  attachmentId: string,
  filename: string,
): Promise<void> {
  const url = `${BASE}/mailbox/${enc(address)}/emails/${emailId}/attachments/${attachmentId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  triggerDownload(blob, filename)
}

// ─── Export helpers ───────────────────────────────────────────────────────────

/** Download emails as a single JSON file. */
export function exportEmailsJSON(emails: Email[], filename = 'inbox.json'): void {
  const blob = new Blob([JSON.stringify(emails, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

/** Build a minimal RFC-2822 .eml string from an Email object. */
function emailToEml(email: Email): string {
  const headers = [
    `Date: ${new Date(email.receivedAt).toUTCString()}`,
    `From: ${email.from ?? ''}`,
    `Subject: ${email.subject ?? '(no subject)'}`,
    `Message-ID: <${email.id}@mailtub>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
  ].join('\r\n')
  const body = email.bodyText ?? email.bodyHtml ?? ''
  return `${headers}\r\n\r\n${body}`
}

/** Download a single email as an .eml file (RFC-2822). */
export function downloadEmailEML(email: Email, filename?: string): void {
  const eml = emailToEml(email)
  const blob = new Blob([eml], { type: 'message/rfc822' })
  const safe = (email.subject ?? 'email').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)
  triggerDownload(blob, filename ?? `${safe}.eml`)
}

/** Download emails as a ZIP of .eml files (lazy-loads jszip). */
export async function exportEmailsZIP(emails: Email[], filename = 'inbox.zip'): Promise<void> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  emails.forEach((email, i) => {
    const idx = String(i + 1).padStart(3, '0')
    const subject = (email.subject ?? 'no-subject').replace(/[/\\?%*:|"<>]/g, '-').slice(0, 60)
    zip.file(`${idx}_${subject}.eml`, emailToEml(email))
  })
  const blob = await zip.generateAsync({ type: 'blob' })
  triggerDownload(blob, filename)
}

// ─── Health ───────────────────────────────────────────────────────────────────

export function health(): Promise<Record<string, unknown>> {
  return request(`${BASE}/health`)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enc(s: string): string {
  return encodeURIComponent(s)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
