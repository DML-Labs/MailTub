import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check } from 'lucide-react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'

interface Props {
  address: string
  onClose: () => void
}

export function QRModal({ address, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    QRCode.toDataURL(address, {
      width: 220,
      margin: 2,
      color: { dark: '#e2e8f0', light: '#0a0a10' },
      errorCorrectionLevel: 'M',
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [address])

  const copyAddress = useCallback(async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 10 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-surface-1 border border-border rounded-2xl shadow-2xl shadow-black/60 p-6 w-72 flex flex-col items-center gap-4"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="QR code for mailbox address"
        >
          <button
            onClick={onClose}
            aria-label="Close QR code"
            className="absolute top-3 right-3 icon-btn size-7"
          >
            <X className="size-3.5" />
          </button>

          <div className="text-center">
            <p className="text-[13px] font-semibold text-white">Scan to use this address</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Point your camera at the code below</p>
          </div>

          <div className="rounded-xl overflow-hidden border border-border bg-surface-0 p-2.5">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR code for ${address}`}
                className="w-[200px] h-[200px] block"
                draggable={false}
              />
            ) : (
              <div className="w-[200px] h-[200px] flex items-center justify-center">
                <div className="size-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="w-full rounded-lg border border-border bg-surface-0 px-3 py-2">
            <p className="font-mono text-[11px] text-violet-300 text-center break-all leading-relaxed">
              {address}
            </p>
          </div>

          <button
            onClick={copyAddress}
            className={cn(
              'w-full flex items-center justify-center gap-2 text-[12px] font-semibold rounded-lg px-4 py-2.5 transition-all',
              copied
                ? 'bg-emerald-700/30 text-emerald-300 border border-emerald-700/50'
                : 'bg-violet-600 hover:bg-violet-500 text-white',
            )}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied!' : 'Copy address'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
