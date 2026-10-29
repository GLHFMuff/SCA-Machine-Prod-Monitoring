import { useState } from 'react'
import { loginApi } from '../services/api.js'
import styles from './LoginPage.module.css'

const QUICK_ACCOUNTS = [
  { username: 'mesin1', label: 'Mesin 1', machineId: '1' },
  { username: 'mesin2', label: 'Mesin 2', machineId: '2' },
  { username: 'mesin3', label: 'Mesin 3', machineId: '3' },
]

export default function LoginPage({ onLogin, theme, onToggleTheme }) {
  const [username, setUsername] = useState('mesin1')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username.trim()) {
      setErr('Username tidak boleh kosong.')
      return
    }
    if (!password) {
      setErr('Password tidak boleh kosong.')
      return
    }

    setLoading(true)
    setErr('')

    try {
      const result = await loginApi(username, password)
      if (result.success && result.user) {
        onLogin(result.user)
      }
    } catch (error) {
      setErr(error.message || 'Terjadi kesalahan saat menghubungi server.')
    } finally {
      setLoading(false)
    }
  }

  function handleQuickSelect(acc) {
    setUsername(acc.username)
    setPassword(acc.username) // Default password sama dengan username
    setErr('')
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        {/* Top Header Row with Logo and Theme Toggle */}
        <div className={styles.topRow}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>🏭</div>
            <div>
              <div className={styles.logoText}>ProdMon</div>
              <div className={styles.logoSub}>Machine Production System</div>
            </div>
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
        </div>

        <h1 className={styles.title}>Selamat Datang</h1>
        <p className={styles.sub}>Masuk dengan akun mesin / operator Anda</p>

        <form onSubmit={handleSubmit}>
          {/* Quick account selector chips */}
          <div className={styles.formGroup}>
            <div className={styles.quickLabel}>Pilih Cepat Akun Mesin:</div>
            <div className={styles.quickRow}>
              {QUICK_ACCOUNTS.map((acc) => (
                <button
                  key={acc.username}
                  type="button"
                  className={styles.quickChip}
                  onClick={() => handleQuickSelect(acc)}
                  title={`Gunakan akun ${acc.label}`}
                >
                  ⚙️ {acc.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Username</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Contoh: mesin1"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setErr('')
              }}
              autoComplete="username"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Masukkan password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErr('')
              }}
              autoComplete="current-password"
              required
            />
          </div>

          {err && <p className={styles.err}>{err}</p>}

          <button
            className={`btn btn-primary ${styles.submitBtn}`}
            type="submit"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '⏳ Memvalidasi…' : '🔐 Masuk'}
          </button>
        </form>

        <div className={styles.hint}>
          💡 Akun operator: <strong>mesin1</strong>, <strong>mesin2</strong>, atau <strong>mesin3</strong> (Password sama dengan username).
        </div>
      </div>
    </div>
  )
}
