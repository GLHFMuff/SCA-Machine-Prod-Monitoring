import styles from './AppHeader.module.css'

export default function AppHeader({ user, onLogout, theme, onToggleTheme }) {
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
