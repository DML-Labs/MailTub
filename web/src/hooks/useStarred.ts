import { useState, useCallback } from 'react'

const STORAGE_KEY = 'mailtub_starred_v1'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function save(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch { /* ignore */ }
}

export function useStarred() {
  const [starred, setStarred] = useState<Set<string>>(load)

  const toggle = useCallback((id: string) => {
    setStarred(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      save(next)
      return next
    })
  }, [])

  const isStarred = useCallback((id: string) => starred.has(id), [starred])

  return { starred, toggle, isStarred }
}
