export function renderResolution() {
  return Math.min(window.devicePixelRatio || 1, 2)
}

export function watchPixelDensity(onChange: () => void) {
  let query: MediaQueryList | undefined
  const observe = () => {
    query?.removeEventListener('change', changed)
    query = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    query?.addEventListener('change', changed)
  }
  const changed = () => {
    // A media query only watches one density, so re-arm it for the new display.
    observe()
    onChange()
  }
  observe()
  return () => query?.removeEventListener('change', changed)
}
