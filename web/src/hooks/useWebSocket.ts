import { useEffect, useRef, useCallback } from 'react'
import type { WSMessage } from '@/types'

type Handler = (msg: WSMessage) => void

/**
 * Manages a WebSocket connection to /ws, subscribes to a mailbox address,
 * and calls `onMessage` for every server event.  Auto-reconnects on close
 * with exponential back-off (1 s → 2 s → 4 s … capped at 30 s).
 * Calls `onDisconnect` when the socket closes unexpectedly so callers can
 * update their UI state.
 */
export function useWebSocket(
  mailboxAddress: string | undefined,
  onMessage: Handler,
  onDisconnect?: () => void,
) {
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()
  const retryDelay = useRef(1_000) // starts at 1 s; doubles each failure

  // Keep stable refs so the effect doesn't re-run on handler changes.
  const handlerRef = useRef<Handler>(onMessage)
  handlerRef.current = onMessage
  const disconnectRef = useRef(onDisconnect)
  disconnectRef.current = onDisconnect

  const connect = useCallback(() => {
    if (!mailboxAddress) return

    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      retryDelay.current = 1_000 // reset back-off on successful connect
      ws.send(JSON.stringify({ type: 'subscribe', mailbox: mailboxAddress }))
    }

    ws.onmessage = (ev: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage
        handlerRef.current(msg)
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      disconnectRef.current?.()
      const delay = retryDelay.current
      retryDelay.current = Math.min(retryDelay.current * 2, 30_000)
      retryTimer.current = setTimeout(() => connect(), delay)
    }

    ws.onerror = () => ws.close()
  }, [mailboxAddress])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(retryTimer.current)
      const ws = wsRef.current
      if (ws) {
        // Prevent the onclose handler from scheduling another reconnect.
        ws.onclose = null
        ws.close()
      }
    }
  }, [connect])

  return wsRef
}
