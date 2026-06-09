import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('foo')).toBe('foo')
  })

  it('joins multiple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null, '', 'baz')).toBe('foo baz')
  })

  it('merges conflicting tailwind classes (last wins)', () => {
    const result = cn('text-red-500', 'text-blue-500')
    expect(result).toBe('text-blue-500')
  })

  it('merges bg- classes correctly', () => {
    const result = cn('bg-red-500', 'bg-green-500')
    expect(result).toBe('bg-green-500')
  })

  it('handles conditional object syntax', () => {
    expect(cn({ 'text-bold': true, 'text-italic': false })).toBe('text-bold')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })

  it('deduplicates identical classes', () => {
    const result = cn('p-2', 'p-2')
    // tailwind-merge deduplicates
    expect(result).toBe('p-2')
  })
})
