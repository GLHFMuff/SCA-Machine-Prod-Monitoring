import { useCallback, useEffect, useState } from 'react'
import {
  getStoredAdminSession,
  checkAdminSessionDetailedApi,
  getAppSettingsApi,
  adminLoginApi,
  adminLogoutApi,
} from '../services/api.js'
import AdminPanel from '../components/AdminPanel.jsx'
import IdleWarningModal from '../components/IdleWarningModal.jsx'
import Toast from '../components/Toast.jsx'
import { useIdleSession } from '../hooks/useIdleSession.js'
import { isFullscreen, exitFullscreen, toggleFullscreen, onFullscreenChange } from '../utils/fullscreen.js'
import styles from './AdminPage.module.css'

export default function AdminPage({ theme, onToggleTheme, onNavigate }) {
  const [adminUser, setAdminUser] = useState(() => {
    const stored = getStoredAdminSession()
    return stored?.user?.role === 'admin' ? stored.user : null
  })
  const [checking, setChecking] = useState(true)
  const [initialServerIdleMs, setInitialServerIdleMs] = useState(null)
  const [sessionSettings, setSessionSettings] = useState({
    idleTimeoutMinutes: 120,
    idleWarningSeconds: 60,
    applyIdleToAdmin: false,
  })

  // Login form state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [isFs, setIsFs] = useState(() => isFullscreen())

  // Matikan paksa fullscreen saat halaman /admin dimuat
  useEffect(() => {
    if (isFullscreen()) {
      exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    return onFullscreenChange(setIsFs)
  }, [])

  function showToast(msg) {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(''), 4000)
  }

  const syncAppSettings = useCallback(async () => {
    try {
      const data = await getAppSettingsApi()
      if (data?.settings?.session) {
        setSessionSettings((prev) => ({
          ...prev,
          ...data.settings.session,
        }))
      }
    } catch {
      // ignore transient error
    }
  }, [])

  // Validate admin session with backend on mount
  useEffect(() => {
    syncAppSettings()
    const stored = getStoredAdminSession()
    if (!stored?.key) {
      setChecking(false)
      return
    }

    checkAdminSessionDetailedApi(stored.key)
      .then((res) => {
        if ((res?.status === 'valid' || res?.status === 'offline') && String(res.user?.role || '').toLowerCase() === 'admin') {
          setAdminUser(res.user)
          setInitialServerIdleMs(
            typeof res.session?.idle_elapsed_ms === 'number'
              ? res.session.idle_elapsed_ms
              : null
          )
        } else {
          setAdminUser(null)
          setInitialServerIdleMs(null)
          if (res?.status === 'unauthorized' && res.reason) {
            setErr(res.reason)
          }
        }
      })
      .catch(() => {
        setAdminUser(null)
      })
      .finally(() => {
        setChecking(false)
      })
  }, [syncAppSettings])

  // Handle Admin Login submission
  async function handleAdminLogin(e) {
    e.preventDefault()
    if (!username.trim()) return setErr('Username tidak boleh kosong.')
    if (!password) return setErr('Password tidak boleh kosong.')

    setLoading(true)
    setErr('')

    try {
      const result = await adminLoginApi(username, password)
      if (result.success && result.user) {
        if (String(result.user.role || '').toLowerCase() !== 'admin') {
          setErr('Akses ditolak: Akun ini tidak memiliki hak akses Administrator.')
          return
        }
        setInitialServerIdleMs(0)
        setAdminUser(result.user)
        showToast(`Selamat datang, Administrator ${result.user.name || result.user.username}`)
      }
    } catch (error) {
      setErr(error.message || 'Terjadi kesalahan saat verifikasi admin.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Admin Logout
  const handleAdminLogout = useCallback(async (reason = '') => {
    const sessionKey = adminUser?.sessionKey || localStorage.getItem('mpm_admin_session_key')
    await adminLogoutApi(sessionKey)
    setAdminUser(null)
    setInitialServerIdleMs(null)
    if (typeof reason === 'string' && reason.trim()) {
      setErr(reason)
    } else {
      showToast('Berhasil keluar dari sesi Administrator.')
    }
  }, [adminUser?.sessionKey])

  const { warningRemainingSec, extendSession } = useIdleSession({
    enabled: !checking && Boolean(adminUser?.sessionKey),
    sessionKey: adminUser?.sessionKey || '',
    storageKey: 'mpm_admin_last_activity_at',
    idleTimeoutMinutes: sessionSettings.applyIdleToAdmin ? sessionSettings.idleTimeoutMinutes : 0,
    idleWarningSeconds: sessionSettings.idleWarningSeconds,
    initialServerIdleMs,
    checkSessionFn: checkAdminSessionDetailedApi,
    onSettingsSync: syncAppSettings,
    onAutoLogout: (reason) => handleAdminLogout(reason),
  })

  if (checking) {
    return (
      <div className={styles.loadingScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛠️</div>
          <div style={{ fontSize: '15px', fontWeight: '600' }}>Memuat Sesi Administrator…</div>
        </div>
      </div>
    )
  }

  // If not logged in as admin: show Admin Login Portal
  if (!adminUser) {
    return (
      <div className={styles.loginCenter}>
        <div className={styles.loginCard}>
          <header className={styles.loginHeader}>
            <div className={styles.logoRow}>
              <div className={styles.logoIcon}>PM</div>
              <div>
                <div className={styles.logoText}>ProdMon</div>
                <div className={styles.logoSub}>Admin Portal</div>
              </div>
            </div>

            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={toggleFullscreen}
                title={isFs ? 'Keluar Fullscreen (Esc)' : 'Masuk Fullscreen'}
                aria-label="Toggle Fullscreen"
              >
                {isFs ? '🗗' : '⛶'}
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={onToggleTheme}
                title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
                aria-label="Ganti tema tampilan"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
            </div>
          </header>

          <div className={styles.portalBadge}>
            <span>👑</span> Khusus Role Administrator
          </div>

          <h1 className={styles.title}>Portal Admin</h1>
          <p className={styles.sub}>
            Halaman ini khusus untuk pengelolaan sistem dan mesin loom. Tidak memerlukan pilihan mesin atau shift.
          </p>

          <form onSubmit={handleAdminLogin}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="admin-username">Username Admin</label>
              <input
                id="admin-username"
                className={styles.input}
                type="text"
                placeholder="Contoh: admin"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setErr('')
                }}
                autoComplete="username"
                autoFocus
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="admin-password">Password Admin</label>
              <input
                id="admin-password"
                className={styles.input}
                type="password"
                placeholder="Masukkan password admin"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErr('')
                }}
                autoComplete="current-password"
                required
              />
            </div>

            {err && <div className={styles.errMsg}>{err}</div>}

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={loading}
            >
              {loading ? 'Memvalidasi…' : 'Masuk ke Admin Panel'}
            </button>
          </form>

          <footer className={styles.loginFooter}>
            <button
              type="button"
              className={styles.backLink}
              onClick={() => onNavigate('/panel')}
              style={{ marginRight: '16px' }}
            >
              🛡️ Ke Panel Pengawas (/panel)
            </button>
            <button
              type="button"
              className={styles.backLink}
              onClick={() => onNavigate('/')}
            >
              ← Kembali ke Produksi Loom
            </button>
          </footer>
        </div>

        {toastMsg && <Toast message={toastMsg} />}
      </div>
    )
  }

  // If authenticated as admin: show full AdminPanel
  return (
    <div className={styles.adminPageWrap}>
      <AdminPanel
        user={adminUser}
        onBackToProduction={() => onNavigate('/')}
        onLogout={() => handleAdminLogout('')}
        onSettingsUpdated={(nextSettings) => {
          if (nextSettings?.session) {
            setSessionSettings((prev) => ({ ...prev, ...nextSettings.session }))
          }
        }}
        showToast={showToast}
      />
      <IdleWarningModal
        remainingSeconds={warningRemainingSec}
        idleTimeoutMinutes={sessionSettings.idleTimeoutMinutes}
        machineLabel="Portal Admin"
        onContinue={extendSession}
        onLogoutNow={() => handleAdminLogout('')}
      />
      {toastMsg && <Toast message={toastMsg} />}
    </div>
  )
}
