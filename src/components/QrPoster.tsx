import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Card } from '../ui'

/**
 * The QR players scan to register. Rendered light-on-white regardless of theme
 * because phone cameras read that far more reliably, and because this gets
 * screenshotted and pasted into a WhatsApp group.
 */
export function QrPoster({
  url,
  code,
  title,
}: {
  url: string
  code: string
  title: string
}) {
  const [png, setPng] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(url, {
      width: 720,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0b1524', light: '#ffffff' },
    })
      .then((d) => alive && setPng(d))
      .catch(() => alive && setPng(null))
    return () => {
      alive = false
    }
  }, [url])

  return (
    <Card className="overflow-hidden">
      <div className="bg-white p-5 text-center text-court-950">
        <p className="font-display text-xs uppercase tracking-[0.2em] text-court-700">
          Scan to join
        </p>
        <h3 className="mt-1 font-display text-lg leading-tight">{title}</h3>
        <div className="mx-auto mt-3 w-full max-w-[260px]">
          {png ? (
            <img src={png} alt={`QR code to join session ${code}`} className="w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded bg-slate-200" />
          )}
        </div>
        <p className="mt-3 font-display text-3xl tracking-[0.25em]">{code}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-court-600">
          or enter this code in the app
        </p>
      </div>
      <div className="break-all border-t border-court-700/60 px-3 py-2 text-center text-[11px] text-slate-500">
        {url}
      </div>
    </Card>
  )
}
