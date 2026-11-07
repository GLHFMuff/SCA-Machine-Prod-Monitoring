// Fullscreen utility helper with cross-browser fallback support

export function isFullscreen() {
  if (typeof document === 'undefined') return false
  return Boolean(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  )
}

export async function requestFullscreen() {
  if (typeof document === 'undefined') return false
  if (isFullscreen()) return true

  const elem = document.documentElement
  try {
    if (elem.requestFullscreen) {
      await elem.requestFullscreen()
    } else if (elem.webkitRequestFullscreen) {
      await elem.webkitRequestFullscreen()
    } else if (elem.mozRequestFullScreen) {
      await elem.mozRequestFullScreen()
    } else if (elem.msRequestFullscreen) {
      await elem.msRequestFullscreen()
    }
    return true
  } catch (err) {
    // Expected to reject when called without user gesture on initial load in standard browsers
    return false
  }
}

export async function exitFullscreen() {
  if (typeof document === 'undefined') return false
  if (!isFullscreen()) return true

  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen()
    } else if (document.webkitExitFullscreen) {
      await document.webkitExitFullscreen()
    } else if (document.mozCancelFullScreen) {
      await document.mozCancelFullScreen()
    } else if (document.msExitFullscreen) {
      await document.msExitFullscreen()
    }
    return true
  } catch (err) {
    return false
  }
}

export async function toggleFullscreen() {
  if (isFullscreen()) {
    return exitFullscreen()
  } else {
    return requestFullscreen()
  }
}

export function onFullscreenChange(callback) {
  if (typeof document === 'undefined') return () => {}

  const events = [
    'fullscreenchange',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange'
  ]

  const handler = () => {
    callback(isFullscreen())
  }

  events.forEach((ev) => document.addEventListener(ev, handler))

  return () => {
    events.forEach((ev) => document.removeEventListener(ev, handler))
  }
}

