import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStarred } from '@/hooks/useStarred'

const STORAGE_KEY = 'mailtub_starred_v1'

beforeEach(() => localStorage.clear())

describe('useStarred', () => {
  it('isStarred returns false for unknown id', () => {
    const { result } = renderHook(() => useStarred())
    expect(result.current.isStarred('unknown-id')).toBe(false)
  })

  it('toggle stars an email', () => {
    const { result } = renderHook(() => useStarred())
    act(() => result.current.toggle('email-1'))
    expect(result.current.isStarred('email-1')).toBe(true)
  })

  it('toggle unstars a starred email', () => {
    const { result } = renderHook(() => useStarred())
    act(() => result.current.toggle('email-1'))
    act(() => result.current.toggle('email-1'))
    expect(result.current.isStarred('email-1')).toBe(false)
  })

  it('starring multiple emails works independently', () => {
    const { result } = renderHook(() => useStarred())
    act(() => result.current.toggle('a'))
    act(() => result.current.toggle('b'))
    expect(result.current.isStarred('a')).toBe(true)
    expect(result.current.isStarred('b')).toBe(true)
    act(() => result.current.toggle('a'))
    expect(result.current.isStarred('a')).toBe(false)
    expect(result.current.isStarred('b')).toBe(true)
  })

  it('starred set is persisted to localStorage', () => {
    const { result } = renderHook(() => useStarred())
    act(() => result.current.toggle('persist-me'))
    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(raw).toContain('persist-me')
  })

  it('restores starred state from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['restored-id']))
    const { result } = renderHook(() => useStarred())
    expect(result.current.isStarred('restored-id')).toBe(true)
  })
})
