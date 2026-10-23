import { useState, useEffect } from 'react'
import LoginPage from './pages/LoginPage.jsx'
import MainPage from './pages/MainPage.jsx'
import { getStoredSession, checkSessionApi, logoutApi } from './services/api.js'

export default function App() {
  const [user, setUser] = useState(() => {
    // Check initial cached user from localStorage
    const stored = getStoredSession()
    return stored?.user || null
  })
  const [checkingSession, setCheckingSession] = useState(true)

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // Validate session key with backend API on initial load
  useEffect(() => {
    const stored = getStoredSession()
    if (!stored?.key) {
      setCheckingSession(false)
      return
    }

    checkSessionApi(stored.key)
      .then((validatedUser) => {
        if (validatedUser) {
          setUser(validatedUser)
        } else {
          setUser(null)
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

  async function handleLogout() {
    const sessionKey = user?.sessionKey || localStorage.getItem('mpm_session_key')
    await logoutApi(sessionKey)
    setUser(null)
  }

  if (checkingSession) {
    return (
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
    )
  }

  if (!user) {
    return (
      <LoginPage
        onLogin={setUser}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <MainPage
      user={user}
      onLogout={handleLogout}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  )
}
