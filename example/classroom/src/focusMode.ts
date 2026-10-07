export function createClassroomFocus(element: HTMLElement, onChange: (focused: boolean) => void) {
  const document = element.ownerDocument
  let focused = false, ownsFullscreen = false, disposed = false

  function update(value: boolean) {
    if (disposed || focused === value) return
    focused = value
    onChange(value)
  }
  function exitFullscreen() {
    if (document.fullscreenElement !== element) return
    try { void document.exitFullscreen().catch(() => {}) } catch { /* Keep the in-page exit available. */ }
  }
  function exit() {
    update(false)
    exitFullscreen()
  }
  function onFullscreenChange() {
    if (document.fullscreenElement === element) {
      ownsFullscreen = true
      if (!focused || disposed) exitFullscreen()
    } else if (ownsFullscreen) {
      ownsFullscreen = false
      update(false)
    }
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && focused) exit()
  }

  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('keydown', onKeyDown)
  return {
    enter() {
      if (disposed || focused) return
      update(true)
      if (document.fullscreenElement || document.fullscreenEnabled === false || !element.requestFullscreen) return
      // Request directly from the click; denied/unsupported fullscreen still leaves focus mode usable.
      try {
        void element.requestFullscreen({ navigationUI: 'hide' }).then(() => {
          if (disposed || !focused) exitFullscreen()
        }).catch(() => {})
      } catch { /* Older hosts can throw instead of rejecting. */ }
    },
    exit,
    dispose() {
      disposed = true
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      document.removeEventListener('keydown', onKeyDown)
      exitFullscreen()
    },
  }
}
