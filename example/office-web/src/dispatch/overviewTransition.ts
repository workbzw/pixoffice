export interface OverviewOrigin {
  top: number
  left: number
  width: number
  height: number
  radius: number
}

export function readOverviewOrigin(trigger: HTMLElement | null, radius?: number): OverviewOrigin | undefined {
  if (!trigger) return undefined
  const bounds = trigger.getBoundingClientRect()
  return { top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height,
    radius: radius ?? Math.min(bounds.width, bounds.height) / 2 }
}

export function overviewOriginFrame(origin: OverviewOrigin, viewport: { width: number; height: number }): Keyframe {
  const scaleX = Math.max(.001, origin.width / viewport.width), scaleY = Math.max(.001, origin.height / viewport.height)
  return { transform: `translate(${origin.left}px, ${origin.top}px) scale(${scaleX}, ${scaleY})`, borderRadius: `${origin.radius}px` }
}

export const fullOverviewFrame: Keyframe = { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '0px' }

export function applyOverviewFrame(element: HTMLElement, frame: Keyframe) {
  element.style.transform = String(frame.transform ?? 'none')
  element.style.borderRadius = String(frame.borderRadius ?? '0px')
}

export function overviewTriggerFrame(element: HTMLElement, trigger: HTMLElement | null): Keyframe {
  const viewport = element.ownerDocument.defaultView!
  return overviewOriginFrame(readOverviewOrigin(trigger) ?? { top: 18, left: viewport.innerWidth - 64, width: 44, height: 44, radius: 22 },
    { width: viewport.innerWidth, height: viewport.innerHeight })
}

function timing(element: HTMLElement, duration: number) {
  const reduced = element.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches
  return { duration: reduced ? 0 : duration, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'both' as const }
}

export function animateOverview(element: HTMLElement, from: Keyframe, to: Keyframe, closing = false) {
  return element.animate([from, to], timing(element, closing ? 240 : 380))
}

export function animateOfficeEntry(element: HTMLElement, origin: OverviewOrigin) {
  const viewport = element.ownerDocument.defaultView!
  return element.animate([
    { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px`, height: `${origin.height}px`, borderRadius: `${origin.radius}px` },
    { left: '0px', top: '0px', width: `${viewport.innerWidth}px`, height: `${viewport.innerHeight}px`, borderRadius: '0px' },
  ], timing(element, 420))
}

export function revealOffice(element: HTMLElement) {
  return element.animate([{ opacity: 1 }, { opacity: 0 }], timing(element, 220))
}
