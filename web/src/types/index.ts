export interface Mailbox {
  id: string
  address: string
  localPart: string
  domain: string
  expiresAt: string
  createdAt: string
}

export interface Attachment {
  id: string
  emailId: string
  filename: string
  contentType: string
  size: number
}

export interface Email {
  id: string
  mailboxId: string
  from: string
  to: string
  subject: string
  bodyText: string
  bodyHtml: string
  headers: Record<string, string>
  size: number
  isRead: boolean
  receivedAt: string
  attachments?: Attachment[]
}

export interface EmailListItem extends Email {
  // Alias for the list view — same shape, no extension needed,
  // but named separately to signal intent.
}

export type WSEventType =
  | 'new_email'
  | 'email_read'
  | 'email_delete'
  | 'heartbeat'
  | 'subscribed'

export interface WSMessage {
  type: WSEventType
  email?: Email
  emailId?: string
  mailbox?: string
}
