import { useState, useEffect } from 'react'
import { isFullscreen, toggleFullscreen, onFullscreenChange } from '../utils/fullscreen.js'
import styles from './AppHeader.module.css'

export default function AppHeader({ user, onLogout, theme, onToggleTheme }) {
  const [isFs, setIsFs] = useState(() => isFullscreen())

  useEffect(() => {
    return onFullscreenChange(setIsFs)
  }, [])

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logoIcon}>🏭</div>
        <span className={styles.title}>ProdMon</span>
      </div>

      <div className={styles.right}>
        <div className={styles.userBadge}>
          <span className={styles.dot} />
          <span>{user.name}</span>
          <span className="chip">{user.machine}</span>
        </div>
        <button
          type="button"
          className={styles.themeBtn}
          onClick={toggleFullscreen}
          title={isFs ? 'Keluar Fullscreen (Esc)' : 'Masuk Fullscreen'}
          aria-label="Toggle Fullscreen"
        >
          {isFs ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={styles.themeBtn}
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Ganti ke Mode Terang (Light Mode)' : 'Ganti ke Mode Gelap (Dark Mode)'}
          aria-label="Ganti tema tampilan"
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button
          className={styles.logoutBtn}
          onClick={onLogout}
          title="Keluar"
          aria-label="Logout"
        >
          ⏻
        </button>
      </div>
    </header>
  )
}
