import { useState, useEffect } from 'react'
import { isFullscreen, requestFullscreen, onFullscreenChange } from '../utils/fullscreen.js'
import styles from './FullscreenBanner.module.css'

export default function FullscreenBanner() {
  const [fsActive, setFsActive] = useState(() => isFullscreen())

  useEffect(() => {
    // 1. Coba request fullscreen langsung saat mount (berhasil di Kiosk / PWA / browser tertentu)
    requestFullscreen().then((success) => {
      if (success) {
        setFsActive(true)
      }
    })

    // 2. Karena browser umumnya menolak fullscreen tanpa user gesture,
    // pasang listener pada sentuhan/klik pertama di mana saja di layar
    const handleFirstGesture = () => {
      if (!isFullscreen()) {
        requestFullscreen().then((success) => {
          if (success) {
            setFsActive(true)
          }
        })
      }
    }

    const events = ['click', 'touchstart', 'pointerdown', 'keydown']
    events.forEach((ev) => window.addEventListener(ev, handleFirstGesture, { passive: true }))

    // 3. Pantau perubahan status fullscreen (misal ESC atau tombol toggle)
    const cleanupFs = onFullscreenChange((active) => {
      setFsActive(active)
    })

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleFirstGesture))
      cleanupFs()
    }
  }, [])

  if (fsActive) return null

  return (
    <aside
      className={styles.banner}
      onClick={() => requestFullscreen()}
      role="button"
      tabIndex={0}
      title="Klik untuk beralih ke Mode Layar Penuh"
    >
      <div className={styles.iconWrap} aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
        </svg>
      </div>
      <span className={styles.text}>
        Klik di mana saja atau tekan tombol ini untuk <strong>Layar Penuh (Fullscreen)</strong>
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={(e) => {
          e.stopPropagation()
          requestFullscreen()
        }}
      >
        Layar Penuh
      </button>
    </aside>
  )
}

