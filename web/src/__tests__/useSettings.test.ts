import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettings } from '@/hooks/useSettings'

beforeEach(() => localStorage.clear())

describe('useSettings', () => {
  it('returns default settings on first render', () => {
    const { result } = renderHook(() => useSettings())
    const { settings } = result.current
    expect(typeof settings.defaultTTLHours).toBe('number')
    expect(typeof settings.soundEnabled).toBe('boolean')
  })

  it('setSettings updates a value', () => {
    const { result } = renderHook(() => useSettings())
    act(() => result.current.setSettings({ soundEnabled: false }))
    expect(result.current.settings.soundEnabled).toBe(false)
  })

  it('persists settings to localStorage', () => {
    const { result } = renderHook(() => useSettings())
    act(() => result.current.setSettings({ defaultTTLHours: 6 }))
    const raw = localStorage.getItem('mailtub_settings_v1')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).defaultTTLHours).toBe(6)
  })

  it('restores settings from localStorage on mount', () => {
    localStorage.setItem('mailtub_settings_v1', JSON.stringify({ defaultTTLHours: 168, soundEnabled: false }))
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.defaultTTLHours).toBe(168)
    expect(result.current.settings.soundEnabled).toBe(false)
  })

  it('blockRemoteImages defaults to false', () => {
    const { result } = renderHook(() => useSettings())
    expect(result.current.settings.blockRemoteImages).toBe(false)
  })

  it('blockRemoteImages can be toggled', () => {
    const { result } = renderHook(() => useSettings())
    act(() => result.current.setSettings({ blockRemoteImages: true }))
    expect(result.current.settings.blockRemoteImages).toBe(true)
  })
})
