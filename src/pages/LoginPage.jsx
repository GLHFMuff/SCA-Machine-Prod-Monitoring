import { useCallback, useEffect, useRef, useState } from 'react'
import { getAppSettingsApi, getMachinesApi, loginApi } from '../services/api.js'
import { isFullscreen, toggleFullscreen, requestFullscreen, onFullscreenChange } from '../utils/fullscreen.js'
import { DEFAULT_SHIFT_LIST, detectActiveShift, formatClockHHMM } from '../utils/shiftUtils.js'
import styles from './LoginPage.module.css'

export default function LoginPage({ onLogin, theme, onToggleTheme, sessionNotice, onDismissNotice }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [machineId, setMachineId] = useState('')
  const [shifts, setShifts] = useState(DEFAULT_SHIFT_LIST)
  const [detectedShift, setDetectedShift] = useState(() => detectActiveShift(DEFAULT_SHIFT_LIST, new Date()))
  const [shift, setShift] = useState(() => {
    const initial = detectActiveShift(DEFAULT_SHIFT_LIST, new Date())
    return initial ? String(initial.id) : ''
  })
  const [clockLabel, setClockLabel] = useState(() => formatClockHHMM(new Date()))
  const [machines, setMachines] = useState([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [isFs, setIsFs] = useState(() => isFullscreen())

  const shiftTouchedRef = useRef(false)
  const serverOffsetMsRef = useRef(0)

  useEffect(() => {
    return onFullscreenChange(setIsFs)
  }, [])

  const applyShiftDetection = useCallback((shiftList, offsetMs, serverActiveShift = null) => {
    const nowAdjusted = new Date(Date.now() + offsetMs)
    const active = detectActiveShift(shiftList, nowAdjusted) || serverActiveShift || null
    setDetectedShift((prev) =>
      prev?.id === active?.id && prev?.name === active?.name && prev?.start === active?.start && prev?.end === active?.end
        ? prev
        : active
    )
    setClockLabel(formatClockHHMM(nowAdjusted))

    setShift((prevShift) => {
      const stillExists = shiftList.some((item) => String(item.id) === String(prevShift))
      if (!shiftTouchedRef.current || (prevShift && !stillExists)) {
        shiftTouchedRef.current = false
        return active ? String(active.id) : ''
      }
      return prevShift
    })
  }, [])

  const loadShiftSettings = useCallback(async () => {
    try {
      const data = await getAppSettingsApi()
      const configuredShifts = Array.isArray(data?.settings?.shifts) && data.settings.shifts.length > 0
        ? data.settings.shifts
        : DEFAULT_SHIFT_LIST

      let offsetMs = 0
      if (data?.serverNow) {
        const parsedServerMs = Date.parse(data.serverNow)
        if (Number.isFinite(parsedServerMs)) {
          offsetMs = parsedServerMs - Date.now()
        }
      }
      serverOffsetMsRef.current = offsetMs
      setShifts(configuredShifts)
      applyShiftDetection(configuredShifts, offsetMs, data?.activeShift || null)
    } catch {
      // Fall back to locally detected shift from current shift list if settings API is unavailable
      applyShiftDetection(DEFAULT_SHIFT_LIST, serverOffsetMsRef.current, null)
    }
  }, [applyShiftDetection])

  const refreshMachines = useCallback(async () => {
    try {
      const latestMachines = await getMachinesApi()
      setMachines(latestMachines)
      setMachineId((currentId) => {
        const selected = latestMachines.find((machine) => String(machine.machine_id) === String(currentId))
        return selected && !selected.user_active?.trim() ? currentId : ''
      })
    } catch (error) {
      setErr((current) => current || error.message)
    }
  }, [])

  useEffect(() => {
    loadShiftSettings()
    refreshMachines()
    const machinesIntervalId = window.setInterval(refreshMachines, 5000)
    const settingsIntervalId = window.setInterval(loadShiftSettings, 30000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadShiftSettings()
        refreshMachines()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.clearInterval(machinesIntervalId)
      window.clearInterval(settingsIntervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadShiftSettings, refreshMachines])

  // Re-evaluate configured shift setting every second (in-memory only) so boundary transitions switch at :00
  useEffect(() => {
    const clockIntervalId = window.setInterval(() => {
      applyShiftDetection(shifts, serverOffsetMsRef.current, null)
    }, 1000)
    return () => window.clearInterval(clockIntervalId)
  }, [shifts, applyShiftDetection])

  async function handleSubmit(e) {
    e.preventDefault()
    // Pastikan fullscreen saat tombol login diklik
    requestFullscreen()

    if (!username.trim()) return setErr('Username tidak boleh kosong.')
    if (!password) return setErr('Password tidak boleh kosong.')
    if (!machineId) return setErr('Silakan pilih mesin yang tersedia.')
    if (!shift) return setErr('Silakan pilih shift.')

    setLoading(true)
    setErr('')
    try {
      const result = await loginApi(username, password, machineId)
      if (result.success && result.user) {
        const sessionUser = { ...result.user, machineId, shift: Number(shift) }
        // A fresh login always starts a new work flow, never restore the prior operator's order.
        for (const storage of [localStorage, sessionStorage]) {
          const staleKeys = []
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index)
            if (key === `mpm_active_order_${machineId}` || key?.startsWith('pending_defects_') && key.endsWith(`_${machineId}`)) {
              staleKeys.push(key)
            }
          }
          staleKeys.forEach((key) => storage.removeItem(key))
        }
        localStorage.setItem('mpm_user', JSON.stringify(sessionUser))
        sessionStorage.setItem('mpm_login_session', JSON.stringify({
          user: sessionUser,
          machineId,
          shift: Number(shift),
        }))
        onDismissNotice?.()
        onLogin(sessionUser)
      }
    } catch (error) {
      setErr(error.message || 'Terjadi kesalahan saat menghubungi server.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <main className={styles.card}>
        <header className={styles.topRow}>
          <div className={styles.logo}>
            <div className={styles.logoIcon} aria-hidden="true">PM</div>
            <div><div className={styles.logoText}>ProdMon</div><div className={styles.logoSub}>Machine Production System</div></div>
          </div>
          <div className={styles.headerActions}>
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
              title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
              aria-label="Ganti tema tampilan"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <div className={styles.columns}>
          <section className={styles.machinePanel} aria-labelledby="machine-heading">
            <div className={styles.sectionEyebrow}>01 / STASIUN KERJA</div>
            <h1 id="machine-heading" className={styles.title}>Pilih mesin</h1>
            <p className={styles.sub}>Pilih mesin yang akan Anda operasikan.</p>
            <div className={styles.machineGrid}>
              {machines.map((machine) => {
                const busy = Boolean(machine.user_active?.trim())
                const selected = String(machineId) === String(machine.machine_id)
                return <button key={machine.machine_id} type="button"
                  className={`${styles.machineTile} ${selected ? styles.machineSelected : ''} ${busy ? styles.machineBusy : ''}`}
                  disabled={busy} aria-pressed={selected}
                  onClick={() => { setMachineId(String(machine.machine_id)); setErr('') }}>
                  <span className={styles.machineNumber}>{machine.machine_num || `Mesin ${machine.machine_id}`}</span>
                  <span className={styles.machineStatus}>{busy ? `Dipakai ${machine.user_active}` : selected ? 'Dipilih' : 'Tersedia'}</span>
                </button>
              })}
              {!machines.length && <p className={styles.machineEmpty}>Memuat daftar mesin...</p>}
            </div>
            {/* <p className={styles.refreshNote}>Status mesin diperbarui otomatis setiap 5 detik.</p> */}
          </section>

          <section className={styles.loginPanel} aria-labelledby="login-heading">
            <div className={styles.sectionEyebrow}>02 / OPERATOR</div>
            <h2 id="login-heading" className={styles.title}>Selamat datang</h2>
            <p className={styles.sub}>Masuk dengan akun operator Anda.</p>
            {sessionNotice && (
              <div className={styles.noticeBanner} role="status">
                <span>⚠️ {sessionNotice}</span>
                {onDismissNotice && (
                  <button
                    type="button"
                    className={styles.noticeCloseBtn}
                    onClick={onDismissNotice}
                    aria-label="Tutup pemberitahuan"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <fieldset className={styles.shiftGroup}>
                <legend className={styles.label}>
                  Pilih shift
                  <span className={styles.shiftAutoHint}>
                    {' '}({clockLabel} • {detectedShift ? `Otomatis: ${detectedShift.name}` : 'Pilih manual'})
                  </span>
                </legend>
                <div className={styles.shiftOptions}>
                  {shifts.map((item) => {
                    const isSelected = Number(shift) === Number(item.id)
                    const isAutoDefault = Number(detectedShift?.id) === Number(item.id)
                    return (
                      <label key={item.id} className={`${styles.shiftOption} ${isSelected ? styles.shiftSelected : ''}`}>
                        <input
                          type="radio"
                          name="shift"
                          value={item.id}
                          checked={isSelected}
                          onChange={(event) => {
                            shiftTouchedRef.current = true
                            setShift(event.target.value)
                            setErr('')
                          }}
                        />
                        <span className={styles.shiftNameRow}>
                          <span>{item.name || `Shift ${item.id}`}</span>
                          {isAutoDefault && <span className={styles.shiftDefaultBadge}>Auto</span>}
                        </span>
                        {item.start && item.end && (
                          <span className={styles.shiftTime}>{item.start}–{item.end}</span>
                        )}
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="username">Username</label>
                <input id="username" className={styles.input} type="text" placeholder="Contoh: operator01"
                  value={username} onChange={(event) => { setUsername(event.target.value); setErr('') }} autoComplete="username" required />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="password">Password</label>
                <input id="password" className={styles.input} type="password" placeholder="Masukkan password"
                  value={password} onChange={(event) => { setPassword(event.target.value); setErr('') }} autoComplete="current-password" required />
              </div>
              {err && <p className={styles.err} role="alert">{err}</p>}
              <button className={`btn btn-primary ${styles.submitBtn}`} type="submit" disabled={loading}>
                {loading ? 'Memvalidasi...' : 'Masuk ke ProdMon'}
              </button>
            </form>
            <p className={styles.hint}>Mesin yang sedang digunakan operator lain tidak dapat dipilih.</p>
            <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '13px', display: 'flex', justifyContent: 'center', gap: '16px' }}>
              <a href="/panel" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' }}>
                🛡️ Panel Pengawas (Karu)
              </a>
              <span style={{ color: 'var(--muted)' }}>•</span>
              <a href="/admin" style={{ color: 'var(--muted)', textDecoration: 'none' }}>
                ⚙️ Admin Portal
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
