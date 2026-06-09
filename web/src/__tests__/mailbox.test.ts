import { describe, it, expect } from 'vitest'

// Frontend-side mailbox-address utilities

/** Mirrors the backend ValidateLocalPart rules for live client-side feedback */
function validateLocalPart(s: string): string | null {
  const trimmed = s.toLowerCase().trim()
  if (trimmed.length < 3) return 'Must be at least 3 characters'
  if (trimmed.length > 32) return 'Must be at most 32 characters'
  if (!/^[a-z0-9]([a-z0-9.\-]{1,30})[a-z0-9]$/.test(trimmed)) {
    return 'Only lowercase letters, numbers, hyphens and dots allowed'
  }
  if (/\.\.|--|\.−|−\./.test(trimmed)) return 'No consecutive special characters'
  return null
}

/** Format expiry duration in human-readable form */
function formatTTL(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = hours / 24
  return `${days}d`
}

/** Extract domain from a full email address */
function extractDomain(address: string): string {
  return address.split('@')[1] ?? ''
}

describe('validateLocalPart', () => {
  it('accepts a valid simple address', () => {
    expect(validateLocalPart('hello')).toBeNull()
  })

  it('accepts address with hyphen', () => {
    expect(validateLocalPart('my-inbox')).toBeNull()
  })

  it('accepts address with dot', () => {
    expect(validateLocalPart('first.last')).toBeNull()
  })

  it('rejects too short', () => {
    expect(validateLocalPart('ab')).not.toBeNull()
  })

  it('rejects too long (33 chars)', () => {
    expect(validateLocalPart('a'.repeat(33))).not.toBeNull()
  })

  it('rejects leading hyphen', () => {
    expect(validateLocalPart('-hello')).not.toBeNull()
  })

  it('normalizes uppercase input (accepts "Hello" as "hello")', () => {
    // validator lowercases before checking — uppercase is normalized, not rejected
    expect(validateLocalPart('Hello')).toBeNull()
  })

  it('rejects space', () => {
    expect(validateLocalPart('hello world')).not.toBeNull()
  })
})

describe('formatTTL', () => {
  it('formats hours < 24 with h suffix', () => {
    expect(formatTTL(1)).toBe('1h')
    expect(formatTTL(6)).toBe('6h')
  })

  it('formats 24h as 1d', () => {
    expect(formatTTL(24)).toBe('1d')
  })

  it('formats 168h as 7d', () => {
    expect(formatTTL(168)).toBe('7d')
  })
})

describe('extractDomain', () => {
  it('extracts domain from full address', () => {
    expect(extractDomain('user@example.com')).toBe('example.com')
  })

  it('returns empty string if no @', () => {
    expect(extractDomain('no-at-sign')).toBe('')
  })
})
