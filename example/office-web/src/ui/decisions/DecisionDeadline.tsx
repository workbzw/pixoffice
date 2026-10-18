import { useEffect, useState } from 'react'
import './DecisionDeadline.css'

export function DecisionDeadline({ expiresAt, createdAt, deadline, label = '选择剩余时间', className = '' }: {
  expiresAt: number; createdAt?: number; deadline?: number; label?: string; className?: string
}) {
  const clock = deadline === undefined ? Date.now : () => expiresAt + performance.now() - deadline
  const [now, setNow] = useState(clock)
  const [start] = useState(() => createdAt ?? Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(deadline === undefined ? Date.now() : expiresAt + performance.now() - deadline), 250)
    return () => clearInterval(timer)
  }, [deadline, expiresAt])
  const remaining = Math.max(0, expiresAt - now), percent = Math.min(100, remaining / Math.max(1, expiresAt - start) * 100)
  const seconds = Math.ceil(remaining / 1000)
  return <div className={`decision-deadline ${className}`} aria-live="off">
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)} aria-valuetext={`${seconds} 秒`}>
      <i style={{ width: `${percent}%` }} />
    </div>
    <span>{seconds} 秒</span>
  </div>
}
