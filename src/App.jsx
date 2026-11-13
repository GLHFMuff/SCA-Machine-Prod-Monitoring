import { useCallback, useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage.jsx'
import MainPage from './pages/MainPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import PanelPage from './pages/PanelPage.jsx'
import FullscreenBanner from './components/FullscreenBanner.jsx'
import IdleWarningModal from './components/IdleWarningModal.jsx'
import { useIdleSession } from './hooks/useIdleSession.js'
import {
  getStoredSession,
  checkSessionDetailedApi,
  getAppSettingsApi,
  logoutApi,
} from './services/api.js'

const DEFAULT_SESSION_SETTINGS = {
  idleTimeoutMinutes: 120,
  idleWarningSeconds: 60,
  sessionExpiresDays: 30,
  applyIdleToAdmin: false,
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname)

  // Listen for browser navigation (back/forward & SPA navigations)
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname)
    }
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  function navigate(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
      setCurrentPath(path)
    }
  }

  const [user, setUser] = useState(() => {
    // Check initial cached user from localStorage
    const stored = getStoredSession()
    return stored?.user || null
  })
  const [checkingSession, setCheckingSession] = useState(true)
  const [initialServerIdleMs, setInitialServerIdleMs] = useState(null)
  const [sessionNotice, setSessionNotice] = useState('')
  const [sessionSettings, setSessionSettings] = useState(DEFAULT_SESSION_SETTINGS)

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const syncAppSettings = useCallback(async () => {
    try {
      const data = await getAppSettingsApi()
      if (data?.settings?.session) {
        setSessionSettings({
          ...DEFAULT_SESSION_SETTINGS,
          ...data.settings.session,
        })
      }
    } catch {
      // Keep current/default settings if backend is temporarily unreachable
    }
  }, [])

  const isAdminRoute = currentPath === '/admin' || currentPath === '/admin/' || currentPath.startsWith('/admin/')
  const isPanelRoute = currentPath === '/panel' || currentPath === '/panel/' || currentPath.startsWith('/panel/')
  const isSpecialRoute = isAdminRoute || isPanelRoute

  // Load latest settings whenever navigating back to production route
  useEffect(() => {
    if (!isSpecialRoute) {
      syncAppSettings()
    }
  }, [isSpecialRoute, syncAppSettings])

  // Validate session key with backend API on initial load (hanya untuk rute produksi biasa)
  useEffect(() => {
    const stored = getStoredSession()
    if (!stored?.key) {
      setCheckingSession(false)
      return
    }

    checkSessionDetailedApi(stored.key)
      .then((res) => {
        if (res?.status === 'valid' || res?.status === 'offline') {
          setUser(res.user)
          setInitialServerIdleMs(
            typeof res.session?.idle_elapsed_ms === 'number'
              ? res.session.idle_elapsed_ms
              : null
          )
        } else {
          setUser(null)
          setInitialServerIdleMs(null)
          if (res?.status === 'unauthorized' && res.reason) {
            setSessionNotice(res.reason)
          }
        }
      })
      .catch(() => {
        setUser(null)
      })
      .finally(() => {
        setCheckingSession(false)
      })
  }, [])

  function toggleTheme() {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const handleLogout = useCallback(async (noticeReason = '') => {
    const sessionKey = user?.sessionKey || localStorage.getItem('mpm_session_key')
    await logoutApi(sessionKey)
    setUser(null)
    setInitialServerIdleMs(null)
    if (typeof noticeReason === 'string' && noticeReason.trim()) {
      setSessionNotice(noticeReason)
    }
  }, [user?.sessionKey])

  const handleLogin = useCallback((loggedInUser) => {
    setSessionNotice('')
    setInitialServerIdleMs(0)
    setUser(loggedInUser)
  }, [])

  const { warningRemainingSec, extendSession } = useIdleSession({
    enabled: !isSpecialRoute && !checkingSession && Boolean(user?.sessionKey),
    sessionKey: user?.sessionKey || '',
    storageKey: 'mpm_last_activity_at',
    idleTimeoutMinutes: sessionSettings.idleTimeoutMinutes,
    idleWarningSeconds: sessionSettings.idleWarningSeconds,
    initialServerIdleMs,
    checkSessionFn: checkSessionDetailedApi,
    onSettingsSync: syncAppSettings,
    onAutoLogout: (reason) => handleLogout(reason),
  })

  return (
    <>
      {/* Force fullscreen banner hanya untuk operasional produksi loom, nonaktif di /admin & /panel */}
      {!isSpecialRoute && <FullscreenBanner />}

      {/* Rute Khusus Administrator: /admin */}
      {isAdminRoute ? (
        <AdminPage
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={navigate}
        />
      ) : isPanelRoute ? (
        <PanelPage
          theme={theme}
          onToggleTheme={toggleTheme}
          onNavigate={navigate}
        />
      ) : checkingSession ? (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text)',
          fontFamily: 'sans-serif'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏭</div>
            <div style={{ fontSize: '14px', color: 'var(--muted)' }}>Memuat sesi...</div>
          </div>
        </div>
      ) : !user ? (
        <LoginPage
          onLogin={handleLogin}
          theme={theme}
          onToggleTheme={toggleTheme}
          sessionNotice={sessionNotice}
          onDismissNotice={() => setSessionNotice('')}
        />
      ) : (
        <>
          <MainPage
            user={user}
            onLogout={() => handleLogout('')}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <IdleWarningModal
            remainingSeconds={warningRemainingSec}
            idleTimeoutMinutes={sessionSettings.idleTimeoutMinutes}
            machineLabel={user.machine}
            onContinue={extendSession}
            onLogoutNow={() => handleLogout('')}
          />
        </>
      )}
    </>
  )
}
