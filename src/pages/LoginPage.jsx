import { useState } from 'react'
import { USERS } from '../data/dummyData.js'
import styles from './LoginPage.module.css'

export default function LoginPage({ onLogin }) {
  const [uid, setUid] = useState('OPR001')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (!pass) { setErr('Password tidak boleh kosong.'); return }
    setLoading(true)
    setTimeout(() => {
      const user = USERS.find(u => u.id === uid)
      if (user && pass === '1234') {
        onLogin(user)
      } else {
        setErr('ID Operator atau password salah.')
        setLoading(false)
      }
    }, 800)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>

        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>🏭</div>
          <div>
            <div className={styles.logoText}>ProdMon</div>
            <div className={styles.logoSub}>Machine Production System</div>
          </div>
        </div>

        <h1 className={styles.title}>Selamat Datang</h1>
        <p className={styles.sub}>Masuk dengan akun operator Anda</p>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>ID Operator</label>
            <select
              className={styles.input}
              value={uid}
              onChange={e => { setUid(e.target.value); setErr('') }}
            >
              {USERS.map(u => (
                <option key={u.id} value={u.id}>
                  {u.id} – {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder="Masukkan password"
              value={pass}
              onChange={e => { setPass(e.target.value); setErr('') }}
            />
          </div>

          {err && <p className={styles.err}>{err}</p>}

          <button
            className={`btn btn-primary ${styles.submitBtn}`}
            type="submit"
            disabled={loading}
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '⏳ Memproses…' : '🔐 Masuk'}
          </button>
        </form>

        <div className={styles.hint}>
          💡 Demo: pilih operator lalu masukkan password{' '}
          <strong>1234</strong>
        </div>
      </div>
    </div>
  )
}
