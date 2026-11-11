import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getMachinesApi,
  createMachineApi,
  updateMachineApi,
  deleteMachineApi,
  getAvailablePrintersApi,
  getDefectCodeList,
  createDefectCodeApi,
  updateDefectCodeApi,
  deleteDefectCodeApi,
  getUsersApi,
  createUserApi,
  updateUserApi,
  deleteUserApi,
  directPrintRollLabelApi,
  getAppSettingsApi,
  saveAppSettingsApi,
} from '../services/api.js'
import { DEFAULT_SHIFT_LIST, detectActiveShift, isOvernightShift } from '../utils/shiftUtils.js'
import styles from './AdminPanel.module.css'

const DEFAULT_SETTINGS = {
  session: {
    idleTimeoutMinutes: 120,
    idleWarningSeconds: 60,
    sessionExpiresDays: 30,
    applyIdleToAdmin: false,
  },
  shifts: DEFAULT_SHIFT_LIST,
  updatedAt: null,
}

const IDLE_PRESETS = [
  { label: '30 mnt', value: 30 },
  { label: '1 jam', value: 60 },
  { label: '2 jam (Default)', value: 120 },
  { label: '4 jam', value: 240 },
  { label: 'Nonaktif (0)', value: 0 },
]

function formatIdleMinutes(minutes) {
  if (minutes === null || minutes === undefined) return ''
  const mins = Number(minutes)
  if (!Number.isFinite(mins)) return ''
  if (mins <= 1) return 'Baru saja aktif'
  if (mins < 60) return `Aktif ${mins} mnt lalu`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  return rem > 0 ? `Tidak aktif ${hrs} jam ${rem} mnt` : `Tidak aktif ${hrs} jam`
}

function TablePagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemName = 'data',
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  const getPageNumbers = () => {
    const pages = []
    let start = Math.max(1, currentPage - 2)
    let end = Math.min(totalPages, currentPage + 2)
    if (end - start < 4) {
      if (start === 1) {
        end = Math.min(totalPages, start + 4)
      } else if (end === totalPages) {
        start = Math.max(1, end - 4)
      }
    }
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  if (totalItems === 0) return null

  return (
    <div className={styles.paginationWrap}>
      <div className={styles.paginationInfo}>
        <span>
          Menampilkan <strong>{startItem}</strong>–<strong>{endItem}</strong> dari <strong>{totalItems}</strong> {itemName}
        </span>
        <div className={styles.pageSizeSelector}>
          <span>Tampilkan:</span>
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value))
              onPageChange(1)
            }}
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>per hal</span>
        </div>
      </div>

      <div className={styles.paginationNav}>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="Halaman pertama"
        >
          ⏮
        </button>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Halaman sebelumnya"
        >
          ◀
        </button>

        {getPageNumbers().map((pageNum) => (
          <button
            key={pageNum}
            type="button"
            className={`${styles.pageBtn} ${pageNum === currentPage ? styles.pageBtnActive : ''}`}
            onClick={() => onPageChange(pageNum)}
          >
            {pageNum}
          </button>
        ))}

        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Halaman berikutnya"
        >
          ▶
        </button>
        <button
          type="button"
          className={styles.pageBtn}
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title="Halaman terakhir"
        >
          ⏭
        </button>
      </div>
    </div>
  )
}

export default function AdminPanel({ user, onBackToProduction, onLogout, onSettingsUpdated, showToast }) {
  const [activeTab, setActiveTab] = useState('machines') // 'machines' | 'defects' | 'users' | 'settings'
  const [loading, setLoading] = useState(true)

  // Real data state
  const [machines, setMachines] = useState([])
  const [printers, setPrinters] = useState([])
  const [defaultPrinter, setDefaultPrinter] = useState('')
  const [defects, setDefects] = useState([])
  const [users, setUsers] = useState([])

  // App Setting state (JSON config on server)
  const [savedSettings, setSavedSettings] = useState(DEFAULT_SETTINGS)
  const [settingsForm, setSettingsForm] = useState(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)

  // Search & Filter state
  const [machineSearch, setMachineSearch] = useState('')
  const [machineFilter, setMachineFilter] = useState('all') // all, active, idle
  const [defectSearch, setDefectSearch] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('all') // all, admin, user

  // ── Pagination States ──
  const [machinePage, setMachinePage] = useState(1)
  const [machinePageSize, setMachinePageSize] = useState(5)

  const [defectPage, setDefectPage] = useState(1)
  const [defectPageSize, setDefectPageSize] = useState(5)

  const [userPage, setUserPage] = useState(1)
  const [userPageSize, setUserPageSize] = useState(5)

  // Reset page when search or filters change
  useEffect(() => {
    setMachinePage(1)
  }, [machineSearch, machineFilter])

  useEffect(() => {
    setDefectPage(1)
  }, [defectSearch])

  useEffect(() => {
    setUserPage(1)
  }, [userSearch, userRoleFilter])


  // ── Modal States ──
  // 1. Machine Modal (Create / Edit)
  const [machineModal, setMachineModal] = useState(null) // { mode: 'create'|'edit', data: { machine_id, machine_num, autonic_table, printer_name, user_active } }
  const [submittingMachine, setSubmittingMachine] = useState(false)

  // 2. Defect Modal (Create / Edit)
  const [defectModal, setDefectModal] = useState(null) // { mode: 'create'|'edit', originalCode: string, data: { Code, Defect } }
  const [submittingDefect, setSubmittingDefect] = useState(false)

  // 3. User Modal (Create / Edit)
  const [userModal, setUserModal] = useState(null) // { mode: 'create'|'edit', data: { id, username, password, email, full_name, role, machine_id, is_active } }
  const [submittingUser, setSubmittingUser] = useState(false)

  // 4. Confirm Dialog Modal
  const [confirmModal, setConfirmModal] = useState(null) // { title, message, actionLabel, isDanger, onConfirm }

  // Load all admin data from backend API
  const refreshAllData = useCallback(async () => {
    setLoading(true)
    try {
      const [machinesData, printersData, defectsData, usersData, appSettingsData] = await Promise.allSettled([
        getMachinesApi(),
        getAvailablePrintersApi(),
        getDefectCodeList({ limit: 1000 }),
        getUsersApi(),
        getAppSettingsApi(),
      ])

      if (machinesData.status === 'fulfilled') {
        setMachines(machinesData.value || [])
      }
      if (printersData.status === 'fulfilled') {
        setPrinters(printersData.value?.printers || [])
        setDefaultPrinter(printersData.value?.defaultPrinter || printersData.value?.zebraPrinter || '')
      }
      if (defectsData.status === 'fulfilled') {
        setDefects(defectsData.value?.data || [])
      }
      if (usersData.status === 'fulfilled') {
        setUsers(usersData.value || [])
      }
      if (appSettingsData.status === 'fulfilled' && appSettingsData.value?.settings) {
        const nextSettings = appSettingsData.value.settings
        setSavedSettings(nextSettings)
        setSettingsForm(JSON.parse(JSON.stringify(nextSettings)))
      }
    } catch (err) {
      console.error('[AdminPanel] Error fetching admin data:', err)
      showToast?.('Sebagian data gagal dimuat dari server.')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    refreshAllData()
  }, [refreshAllData])

  // Filtered Machines
  const filteredMachines = useMemo(() => {
    return machines.filter((m) => {
      const query = machineSearch.toLowerCase().trim()
      const matchSearch =
        !query ||
        String(m.machine_num || m.machine_id).toLowerCase().includes(query) ||
        String(m.user_active || '').toLowerCase().includes(query) ||
        String(m.printer_name || '').toLowerCase().includes(query) ||
        String(m.autonic_table || '').toLowerCase().includes(query)

      const isActive = Boolean(m.user_active && m.user_active.trim())
      const matchFilter =
        machineFilter === 'all' ||
        (machineFilter === 'active' && isActive) ||
        (machineFilter === 'idle' && !isActive)

      return matchSearch && matchFilter
    })
  }, [machines, machineSearch, machineFilter])

  // Filtered Defects
  const filteredDefects = useMemo(() => {
    return defects.filter((d) => {
      const query = defectSearch.toLowerCase().trim()
      if (!query) return true
      return (
        String(d.Code || '').toLowerCase().includes(query) ||
        String(d.Defect || '').toLowerCase().includes(query)
      )
    })
  }, [defects, defectSearch])

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const query = userSearch.toLowerCase().trim()
      const matchSearch =
        !query ||
        String(u.username || '').toLowerCase().includes(query) ||
        String(u.full_name || '').toLowerCase().includes(query) ||
        String(u.email || '').toLowerCase().includes(query) ||
        String(u.machine_id || '').toLowerCase().includes(query)

      const matchRole =
        userRoleFilter === 'all' ||
        u.role === userRoleFilter

      return matchSearch && matchRole
    })
  }, [users, userSearch, userRoleFilter])

  // ── Paginated Slices ──
  const paginatedMachines = useMemo(() => {
    const start = (machinePage - 1) * machinePageSize
    return filteredMachines.slice(start, start + machinePageSize)
  }, [filteredMachines, machinePage, machinePageSize])

  const paginatedDefects = useMemo(() => {
    const start = (defectPage - 1) * defectPageSize
    return filteredDefects.slice(start, start + defectPageSize)
  }, [filteredDefects, defectPage, defectPageSize])

  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * userPageSize
    return filteredUsers.slice(start, start + userPageSize)
  }, [filteredUsers, userPage, userPageSize])


  // ══════════════════════════════════════════════════════════
  // CRUD HANDLERS: MESIN (machine_lists)
  // ══════════════════════════════════════════════════════════
  async function handleSaveMachine(e) {
    e.preventDefault()
    if (!machineModal?.data) return
    const { machine_id, machine_num, autonic_table, printer_name } = machineModal.data

    if (machine_num === undefined || machine_num === null || String(machine_num).trim() === '') {
      showToast?.('Nomor mesin wajib diisi.')
      return
    }

    setSubmittingMachine(true)
    try {
      if (machineModal.mode === 'create') {
        const created = await createMachineApi({
          machine_id: machine_id ? parseInt(machine_id, 10) : undefined,
          machine_num: parseInt(machine_num, 10),
          autonic_table: autonic_table || `autonicmachine_${machine_num}`,
          printer_name: printer_name || null,
        })
        showToast?.(`✓ Mesin #${created.machine_num} berhasil ditambahkan.`)
      } else {
        const updated = await updateMachineApi(machine_id, {
          machine_num: parseInt(machine_num, 10),
          autonic_table: autonic_table || null,
          printer_name: printer_name || null,
        })
        showToast?.(`✓ Mesin #${updated.machine_num} berhasil diperbarui.`)
      }
      setMachineModal(null)
      refreshAllData()
    } catch (err) {
      showToast?.(`Gagal menyimpan mesin: ${err.message}`)
    } finally {
      setSubmittingMachine(false)
    }
  }

  function handlePromptDeleteMachine(m) {
    setConfirmModal({
      title: `Hapus Mesin #${m.machine_num || m.machine_id}?`,
      message: `Apakah Anda yakin ingin menghapus Mesin #${m.machine_num || m.machine_id} dari daftar stasiun kerja? Data mesin ini akan dihapus permanen dari sistem.`,
      actionLabel: 'Ya, Hapus Mesin',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteMachineApi(m.machine_id)
          showToast?.(`✓ Mesin #${m.machine_num || m.machine_id} berhasil dihapus.`)
          setConfirmModal(null)
          refreshAllData()
        } catch (err) {
          showToast?.(`Gagal menghapus mesin: ${err.message}`)
        }
      },
    })
  }

  function handlePromptReleaseMachineSession(m) {
    setConfirmModal({
      title: `Lepas Sesi Operator di Mesin #${m.machine_num || m.machine_id}?`,
      message: `Mesin ini saat ini tercatat sedang digunakan oleh operator '${m.user_active}'. Lepas sesi ini agar mesin dapat dipilih kembali oleh operator lain?`,
      actionLabel: 'Lepas Sesi',
      isDanger: false,
      onConfirm: async () => {
        try {
          await updateMachineApi(m.machine_id, { user_active: null })
          showToast?.(`✓ Sesi '${m.user_active}' di Mesin #${m.machine_num || m.machine_id} berhasil dilepas.`)
          setConfirmModal(null)
          refreshAllData()
        } catch (err) {
          showToast?.(`Gagal melepas sesi: ${err.message}`)
        }
      },
    })
  }

  // ══════════════════════════════════════════════════════════
  // CRUD HANDLERS: DEFECT CODES (DefectCode)
  // ══════════════════════════════════════════════════════════
  async function handleSaveDefect(e) {
    e.preventDefault()
    if (!defectModal?.data) return
    const { Code, Defect } = defectModal.data
    const cleanCode = String(Code || '').trim()
    const cleanDefect = String(Defect || '').trim()

    if (!cleanCode) {
      showToast?.('Kode inspeksi wajib diisi.')
      return
    }

    setSubmittingDefect(true)
    try {
      if (defectModal.mode === 'create') {
        const created = await createDefectCodeApi({ Code: cleanCode, Defect: cleanDefect })
        showToast?.(`✓ Kode inspeksi '${created.Code}' berhasil ditambahkan.`)
      } else {
        const updated = await updateDefectCodeApi(defectModal.originalCode, {
          newCode: cleanCode,
          Defect: cleanDefect,
        })
        showToast?.(`✓ Kode inspeksi '${updated.Code}' berhasil diperbarui.`)
      }
      setDefectModal(null)
      refreshAllData()
    } catch (err) {
      showToast?.(`Gagal menyimpan kode inspeksi: ${err.message}`)
    } finally {
      setSubmittingDefect(false)
    }
  }

  function handlePromptDeleteDefect(defect) {
    const code = defect.Code
    setConfirmModal({
      title: `Hapus Kode Inspeksi '${code}'?`,
      message: `Apakah Anda yakin ingin menghapus kode inspeksi '${code}' (${defect.Defect || 'Tanpa Keterangan'})? Tindakan ini tidak dapat dibatalkan.`,
      actionLabel: 'Ya, Hapus',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteDefectCodeApi(code)
          showToast?.(`✓ Kode inspeksi '${code}' berhasil dihapus.`)
          setConfirmModal(null)
          refreshAllData()
        } catch (err) {
          showToast?.(`Gagal menghapus kode inspeksi: ${err.message}`)
        }
      },
    })
  }

  // ══════════════════════════════════════════════════════════
  // CRUD HANDLERS: USERS (users)
  // ══════════════════════════════════════════════════════════
  async function handleSaveUser(e) {
    e.preventDefault()
    if (!userModal?.data) return
    const { id, username, password, email, full_name, role, machine_id, is_active } = userModal.data

    if (!username || !username.trim()) {
      showToast?.('Username wajib diisi.')
      return
    }

    if (userModal.mode === 'create' && (!password || !password.trim())) {
      showToast?.('Password wajib diisi untuk pengguna baru.')
      return
    }

    setSubmittingUser(true)
    try {
      if (userModal.mode === 'create') {
        const created = await createUserApi({
          username: username.trim(),
          password: password.trim(),
          email: email ? email.trim() : undefined,
          full_name: full_name ? full_name.trim() : undefined,
          role: role || 'user',
          machine_id: machine_id !== undefined ? String(machine_id) : '0',
          is_active: is_active !== false,
        })
        showToast?.(`✓ Pengguna '${created.username}' berhasil dibuat.`)
      } else {
        const updated = await updateUserApi(id, {
          username: username.trim(),
          password: password && password.trim() ? password.trim() : undefined,
          email: email !== undefined ? email.trim() : undefined,
          full_name: full_name !== undefined ? full_name.trim() : undefined,
          role: role || 'user',
          machine_id: machine_id !== undefined ? String(machine_id) : '0',
          is_active: Boolean(is_active),
        })
        showToast?.(`✓ Data pengguna '${updated.username}' berhasil diperbarui.`)
      }
      setUserModal(null)
      refreshAllData()
    } catch (err) {
      showToast?.(`Gagal menyimpan pengguna: ${err.message}`)
    } finally {
      setSubmittingUser(false)
    }
  }

  function handlePromptDeleteUser(u) {
    setConfirmModal({
      title: `Hapus Pengguna '${u.username}'?`,
      message: `Apakah Anda yakin ingin menghapus akun '${u.full_name || u.username}' (@${u.username})? Seluruh sesi aktif pengguna ini akan otomatis dicabut.`,
      actionLabel: 'Ya, Hapus Pengguna',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteUserApi(u.id)
          showToast?.(`✓ Pengguna '${u.username}' berhasil dihapus.`)
          setConfirmModal(null)
          refreshAllData()
        } catch (err) {
          showToast?.(`Gagal menghapus pengguna: ${err.message}`)
        }
      },
    })
  }

  // Handle Quick Print Test
  async function handleTestPrint(printerName) {
    if (!printerName) {
      showToast?.('Pilih printer terlebih dahulu.')
      return
    }
    try {
      showToast?.(`Mengirim tes cetak ke: ${printerName}…`)
      const testZpl = `^XA^FO50,50^A0N,40,40^FDPRODMON ADMIN TEST^FS^FO50,110^A0N,28,28^FDPRINTER: ${printerName}^FS^FO50,160^A0N,24,24^FDDATE: ${new Date().toLocaleString('id-ID')}^FS^XZ`
      await directPrintRollLabelApi({
        printerName,
        rawZpl: testZpl,
      })
      showToast?.(`✓ Tes cetak berhasil dikirim ke printer: ${printerName}`)
    } catch (err) {
      showToast?.(`Gagal tes cetak: ${err.message}`)
    }
  }

  // ══════════════════════════════════════════════════════════
  // APP SETTING HANDLERS (JSON Config)
  // ══════════════════════════════════════════════════════════
  const isSettingsDirty = useMemo(() => {
    return JSON.stringify(settingsForm) !== JSON.stringify(savedSettings)
  }, [settingsForm, savedSettings])

  const previewActiveShift = useMemo(() => {
    return detectActiveShift(settingsForm?.shifts || [], new Date())
  }, [settingsForm?.shifts])

  function updateSessionSetting(field, value) {
    setSettingsForm((prev) => ({
      ...prev,
      session: {
        ...prev.session,
        [field]: value,
      },
    }))
  }

  function handleUpdateShift(index, field, value) {
    setSettingsForm((prev) => {
      const nextShifts = prev.shifts.map((s, idx) =>
        idx === index ? { ...s, [field]: value } : s
      )
      return { ...prev, shifts: nextShifts }
    })
  }

  function handleAddShift() {
    setSettingsForm((prev) => {
      const nextId = prev.shifts.length
        ? Math.max(...prev.shifts.map((s) => Number(s.id) || 0)) + 1
        : 1
      return {
        ...prev,
        shifts: [
          ...prev.shifts,
          { id: nextId, name: `Shift ${nextId}`, start: '07:00', end: '15:00' },
        ],
      }
    })
  }

  function handleRemoveShift(index) {
    setSettingsForm((prev) => {
      if (prev.shifts.length <= 1) return prev
      return {
        ...prev,
        shifts: prev.shifts.filter((_, idx) => idx !== index),
      }
    })
  }

  function handleResetDefaultSettings() {
    setSettingsForm(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)))
    showToast?.('Form pengaturan dikembalikan ke nilai default (belum disimpan).')
  }

  async function handleSaveSettings(e) {
    e.preventDefault()
    setSavingSettings(true)
    try {
      const payload = {
        ...settingsForm,
        session: {
          ...settingsForm.session,
          idleTimeoutMinutes: Number(settingsForm.session.idleTimeoutMinutes || 0),
          idleWarningSeconds: Number(settingsForm.session.idleWarningSeconds || 0),
          sessionExpiresDays: Number(settingsForm.session.sessionExpiresDays || 30),
          applyIdleToAdmin: Boolean(settingsForm.session.applyIdleToAdmin),
        },
        shifts: settingsForm.shifts.map((s) => ({
          ...s,
          id: Number(s.id),
          name: String(s.name || '').trim(),
          start: String(s.start || '').trim(),
          end: String(s.end || '').trim(),
        })),
      }
      const res = await saveAppSettingsApi(payload, user?.sessionKey)
      setSavedSettings(res.settings)
      setSettingsForm(JSON.parse(JSON.stringify(res.settings)))
      onSettingsUpdated?.(res.settings)
      showToast?.(`✓ ${res.message || 'Pengaturan aplikasi berhasil disimpan.'}`)
    } catch (err) {
      showToast?.(`Gagal menyimpan pengaturan: ${err.message}`)
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className={styles.adminPanel}>
      {/* ── Top Header Bar ── */}
      <header className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <div className={styles.headerTitleRow}>
            <h1 className={styles.headerTitle}>🛠️ Admin Control Panel</h1>
            <span className={styles.adminCrownBadge}>
              <span>👑</span> Role Administrator
            </span>
          </div>
          <p className={styles.headerSubtitle}>
            Pusat pengelolaan master data: Mesin Loom & Printer, Master Defect Kain, dan Manajemen Akun Pengguna.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={refreshAllData}
            title="Muat ulang seluruh data dari database"
            disabled={loading}
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
          <button
            type="button"
            className={styles.backBtn}
            onClick={onBackToProduction}
            title="Kembali ke layar scanning / antarmuka produksi"
          >
            ← Ke Layar Produksi
          </button>
          {onLogout && (
            <button
              type="button"
              className={styles.logoutBtn}
              onClick={onLogout}
              title="Keluar dari sesi Administrator"
            >
              ⏻ Logout
            </button>
          )}
        </div>
      </header>

      {/* ── Tab Navigation ── */}
      <nav className={styles.tabNav} aria-label="Menu Admin Panel">
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'machines' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('machines')}
        >
          <span>🖥️</span> Mesin & Printer
          <span className={styles.tabBadge}>{filteredMachines.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'defects' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('defects')}
        >
          <span>📋</span> Master Kode Inspeksi
          <span className={styles.tabBadge}>{filteredDefects.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'users' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <span>👥</span> Manajemen Pengguna
          <span className={styles.tabBadge}>{filteredUsers.length}</span>
        </button>

        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'settings' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span>⚙️</span> App Setting
          <span className={styles.tabBadge}>{(settingsForm?.shifts || []).length} Shift</span>
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════
          TAB 1: MESIN & PRINTER
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'machines' && (
        <section className={styles.tabContentCard}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Cari nomor mesin, operator, autonic, atau printer…"
                value={machineSearch}
                onChange={(e) => setMachineSearch(e.target.value)}
              />
            </div>

            <div className={styles.toolbarActions}>
              <select
                className={styles.filterSelect}
                value={machineFilter}
                onChange={(e) => setMachineFilter(e.target.value)}
              >
                <option value="all">Semua Mesin ({machines.length})</option>
                <option value="active">
                  Sedang Digunakan ({machines.filter((m) => m.user_active && m.user_active.trim()).length})
                </option>
                <option value="idle">
                  Tersedia / Idle ({machines.filter((m) => !m.user_active || !m.user_active.trim()).length})
                </option>
              </select>

              <button
                type="button"
                className={styles.actionBtnPrimary}
                onClick={() =>
                  setMachineModal({
                    mode: 'create',
                    data: {
                      machine_id: '',
                      machine_num: machines.length ? Math.max(...machines.map((m) => m.machine_num || 0)) + 1 : 1,
                      autonic_table: '',
                      printer_name: defaultPrinter || '',
                    },
                  })
                }
              >
                + Tambah Mesin
              </button>
            </div>
          </div>

          <div className={styles.tableResponsive}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th style={{ width: '130px' }}>No. Mesin</th>
                  <th style={{ width: '160px' }}>Status Operasional</th>
                  <th>Operator Aktif</th>
                  <th>Tabel Sensor Autonic</th>
                  <th>Printer Label Terpasang</th>
                  <th style={{ textAlign: 'right', minWidth: '220px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredMachines.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                      Tidak ada mesin yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedMachines.map((m) => {
                    const isActive = Boolean(m.user_active && m.user_active.trim())
                    return (
                      <tr key={m.machine_id}>
                        <td>
                          <strong style={{ fontSize: '15px' }}>
                            Mesin #{m.machine_num || m.machine_id}
                          </strong>
                          <div style={{ fontSize: '11px', color: 'var(--muted)' }}>ID: {m.machine_id}</div>
                        </td>
                        <td>
                          {isActive ? (
                            <span className={`${styles.badge} ${styles.badgeActive}`}>
                              ● Sedang Digunakan
                            </span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeIdle}`}>
                              ○ Tersedia / Idle
                            </span>
                          )}
                        </td>
                        <td>
                          {isActive ? (
                            <div className={styles.userCell}>
                              <div className={styles.userAvatar}>
                                {(m.user_active || 'U').charAt(0).toUpperCase()}
                              </div>
                              <div className={styles.userMeta}>
                                <span className={styles.userName}>{m.user_active}</span>
                                {m.idle_minutes !== null && m.idle_minutes !== undefined && (
                                  <span
                                    className={`${styles.activityMeta} ${
                                      savedSettings?.session?.idleTimeoutMinutes > 0 &&
                                      m.idle_minutes >= savedSettings.session.idleTimeoutMinutes * 0.75
                                        ? styles.activityMetaWarn
                                        : ''
                                    }`}
                                  >
                                    {formatIdleMinutes(m.idle_minutes)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className={styles.codeBadge}>
                            {m.autonic_table || `autonic_${String(m.machine_id).padStart(2, '0')}`}
                          </span>
                        </td>
                        <td>
                          {m.printer_name ? (
                            <span className={styles.printerBadge}>
                              <span>🖨️</span>
                              <strong>{m.printer_name}</strong>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: '12.5px' }}>
                              Default ({defaultPrinter || 'Belum diatur'})
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.tableActions}>
                            {isActive && (
                              <button
                                type="button"
                                className={styles.tableActionBtnWarn}
                                onClick={() => handlePromptReleaseMachineSession(m)}
                                title="Lepas sesi operator yang sedang terkunci di mesin ini"
                              >
                                🔓 Lepas Sesi
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.tableActionBtn}
                              onClick={() =>
                                setMachineModal({
                                  mode: 'edit',
                                  data: {
                                    machine_id: m.machine_id,
                                    machine_num: m.machine_num || m.machine_id,
                                    autonic_table: m.autonic_table || '',
                                    printer_name: m.printer_name || '',
                                    user_active: m.user_active || '',
                                  },
                                })
                              }
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className={styles.tableActionBtnDanger}
                              onClick={() => handlePromptDeleteMachine(m)}
                              title="Hapus mesin dari sistem"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            currentPage={machinePage}
            totalItems={filteredMachines.length}
            pageSize={machinePageSize}
            onPageChange={setMachinePage}
            onPageSizeChange={setMachinePageSize}
            itemName="mesin"
          />
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 2: MASTER KODE INSPEKSI (DefectCode)
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'defects' && (
        <section className={styles.tabContentCard}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Cari kode defect atau nama inspeksi kain…"
                value={defectSearch}
                onChange={(e) => setDefectSearch(e.target.value)}
              />
            </div>

            <div className={styles.toolbarActions}>
              <button
                type="button"
                className={styles.actionBtnPrimary}
                onClick={() =>
                  setDefectModal({
                    mode: 'create',
                    originalCode: '',
                    data: { Code: '', Defect: '' },
                  })
                }
              >
                + Tambah Kode Inspeksi
              </button>
            </div>
          </div>

          <div className={styles.tableResponsive}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>No</th>
                  <th style={{ width: '180px' }}>Kode Inspeksi</th>
                  <th>Nama / Deskripsi Inspeksi Kain</th>
                  <th style={{ width: '120px' }}>Status</th>
                  <th style={{ textAlign: 'right', width: '160px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredDefects.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                      Tidak ada kode inspeksi yang sesuai kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedDefects.map((defect, index) => {
                    const code = defect.Code || `D${index + 1}`
                    const rowNumber = (defectPage - 1) * defectPageSize + index + 1
                    return (
                      <tr key={code}>
                        <td style={{ color: 'var(--muted)' }}>{rowNumber}</td>
                        <td>
                          <span className={styles.codeBadge}>{code}</span>
                        </td>
                        <td>
                          <strong style={{ fontSize: '14.5px' }}>{defect.Defect || '(Tanpa Nama)'}</strong>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${styles.badgeActive}`}>
                            ✓ Aktif
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.tableActions}>
                            <button
                              type="button"
                              className={styles.tableActionBtn}
                              onClick={() =>
                                setDefectModal({
                                  mode: 'edit',
                                  originalCode: defect.Code,
                                  data: { Code: defect.Code, Defect: defect.Defect || '' },
                                })
                              }
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className={styles.tableActionBtnDanger}
                              onClick={() => handlePromptDeleteDefect(defect)}
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            currentPage={defectPage}
            totalItems={filteredDefects.length}
            pageSize={defectPageSize}
            onPageChange={setDefectPage}
            onPageSizeChange={setDefectPageSize}
            itemName="kode inspeksi"
          />
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 3: MANAJEMEN PENGGUNA (users)
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <section className={styles.tabContentCard}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Cari nama lengkap, username, atau email…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>

            <div className={styles.toolbarActions}>
              <select
                className={styles.filterSelect}
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
              >
                <option value="all">Semua Peran ({users.length})</option>
                <option value="admin">
                  Administrator ({users.filter((u) => u.role === 'admin').length})
                </option>
                <option value="user">
                  Operator ({users.filter((u) => u.role !== 'admin').length})
                </option>
              </select>

              <button
                type="button"
                className={styles.actionBtnPrimary}
                onClick={() =>
                  setUserModal({
                    mode: 'create',
                    data: {
                      id: '',
                      username: '',
                      password: '',
                      full_name: '',
                      email: '',
                      role: 'user',
                      machine_id: '1',
                      is_active: true,
                    },
                  })
                }
              >
                + Tambah Pengguna
              </button>
            </div>
          </div>

          <div className={styles.tableResponsive}>
            <table className={styles.adminTable}>
              <thead>
                <tr>
                  <th>Pengguna</th>
                  <th>Peran (Role)</th>
                  <th>Mesin Default</th>
                  <th>Email</th>
                  <th>Status Akun</th>
                  <th style={{ textAlign: 'right', minWidth: '160px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                      Tidak ada pengguna yang cocok dengan kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedUsers.map((u) => {
                    const isAdmin = u.role === 'admin'
                    return (
                      <tr key={u.id || u.username}>
                        <td>
                          <div className={styles.userCell}>
                            <div
                              className={styles.userAvatar}
                              style={{
                                background: isAdmin
                                  ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                                  : undefined,
                              }}
                            >
                              {(u.full_name || u.username || 'U').charAt(0).toUpperCase()}
                            </div>
                            <div className={styles.userMeta}>
                              <span className={styles.userName}>{u.full_name || u.username}</span>
                              <span className={styles.userHandle}>@{u.username}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isAdmin ? (
                            <span className={`${styles.badge} ${styles.badgeAdmin}`}>
                              👑 Administrator
                            </span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeUser}`}>
                              👤 Operator
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={styles.codeBadge}>
                            {u.machine_id && String(u.machine_id) !== '0'
                              ? `Mesin #${u.machine_id}`
                              : 'Semua Mesin'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--muted)' }}>{u.email || '-'}</td>
                        <td>
                          {u.is_active ? (
                            <span className={`${styles.badge} ${styles.badgeActive}`}>
                              ● Aktif
                            </span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeIdle}`}>
                              ○ Nonaktif
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className={styles.tableActions}>
                            <button
                              type="button"
                              className={styles.tableActionBtn}
                              onClick={() =>
                                setUserModal({
                                  mode: 'edit',
                                  data: {
                                    id: u.id,
                                    username: u.username,
                                    password: '',
                                    full_name: u.full_name || '',
                                    email: u.email || '',
                                    role: u.role || 'user',
                                    machine_id: u.machine_id || '0',
                                    is_active: u.is_active !== false,
                                  },
                                })
                              }
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              className={styles.tableActionBtnDanger}
                              onClick={() => handlePromptDeleteUser(u)}
                              disabled={u.username === user?.username}
                              title={
                                u.username === user?.username
                                  ? 'Tidak dapat menghapus akun yang sedang Anda gunakan'
                                  : 'Hapus akun pengguna'
                              }
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <TablePagination
            currentPage={userPage}
            totalItems={filteredUsers.length}
            pageSize={userPageSize}
            onPageChange={setUserPage}
            onPageSizeChange={setUserPageSize}
            itemName="pengguna"
          />
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB 4: APP SETTING (JSON Config tanpa tabel DB)
         ══════════════════════════════════════════════════════════ */}
      {activeTab === 'settings' && (
        <section className={styles.tabContentCard}>
          <form onSubmit={handleSaveSettings} className={styles.settingsStack}>
            {/* Section 1: Session & Inactivity */}
            <div className={styles.settingsSection}>
              <div className={styles.settingsSectionHeader}>
                <div>
                  <h2 className={styles.settingsSectionTitle}>⏱️ Aturan Sesi & Deteksi Tidak Aktif (Inactive)</h2>
                  <p className={styles.settingsSectionDesc}>
                    Jika operator tidak melakukan aktivitas nyata (interaksi layar, scan, tarik sensor, simpan roll/cacat, cetak label) selama batas waktu di bawah, akun otomatis logout dan mesin dilepas. Polling latar belakang tidak dihitung sebagai aktivitas.
                  </p>
                </div>
              </div>

              <div className={styles.settingsGrid}>
                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="setting-idle-minutes">
                    Batas Waktu Tidak Aktif (Menit)
                  </label>
                  <input
                    id="setting-idle-minutes"
                    type="number"
                    min={0}
                    max={10080}
                    className={styles.formInput}
                    value={settingsForm.session.idleTimeoutMinutes}
                    onChange={(e) => updateSessionSetting('idleTimeoutMinutes', e.target.value)}
                    required
                  />
                  <div className={styles.presetRow}>
                    {IDLE_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        className={`${styles.presetBtn} ${
                          Number(settingsForm.session.idleTimeoutMinutes) === preset.value ? styles.presetBtnActive : ''
                        }`}
                        onClick={() => updateSessionSetting('idleTimeoutMinutes', preset.value)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <span className={styles.settingHelp}>
                    Default: <strong>120 menit (2 jam)</strong>. Isi <strong>0</strong> untuk menonaktifkan auto-logout karena tidak aktif.
                  </span>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="setting-idle-warning">
                    Peringatan Sebelum Auto-Logout (Detik)
                  </label>
                  <input
                    id="setting-idle-warning"
                    type="number"
                    min={0}
                    max={600}
                    className={styles.formInput}
                    value={settingsForm.session.idleWarningSeconds}
                    onChange={(e) => updateSessionSetting('idleWarningSeconds', e.target.value)}
                    required
                  />
                  <span className={styles.settingHelp}>
                    Menampilkan modal hitung mundur di layar sebelum logout otomatis. Isi <strong>0</strong> jika ingin langsung logout tanpa peringatan.
                  </span>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel} htmlFor="setting-expires-days">
                    Masa Berlaku Maksimal Token (Hari)
                  </label>
                  <input
                    id="setting-expires-days"
                    type="number"
                    min={1}
                    max={3650}
                    className={styles.formInput}
                    value={settingsForm.session.sessionExpiresDays}
                    onChange={(e) => updateSessionSetting('sessionExpiresDays', e.target.value)}
                    required
                  />
                  <span className={styles.settingHelp}>
                    Batas maksimal umur token login di server selama user tetap aktif. Pergantian shift tidak otomatis me-logout user.
                  </span>
                </div>

                <div className={styles.formField}>
                  <span className={styles.formLabel}>Cakupan Portal Admin (/admin)</span>
                  <label className={styles.toggleLabel}>
                    <input
                      type="checkbox"
                      checked={Boolean(settingsForm.session.applyIdleToAdmin)}
                      onChange={(e) => updateSessionSetting('applyIdleToAdmin', e.target.checked)}
                    />
                    <span>Terapkan auto-logout idle ke Portal Admin</span>
                  </label>
                  <span className={styles.settingHelp}>
                    Jika tidak dicentang, auto-logout idle hanya berlaku untuk akun operator yang memakai mesin produksi.
                  </span>
                </div>
              </div>
            </div>

            {/* Section 2: Shift Hours */}
            <div className={styles.settingsSection}>
              <div className={styles.settingsSectionHeader}>
                <div>
                  <h2 className={styles.settingsSectionTitle}>🕒 Jadwal Jam Shift (Default Otomatis Login)</h2>
                  <p className={styles.settingsSectionDesc}>
                    Digunakan untuk memilih shift default secara otomatis saat operator membuka halaman login. Operator tetap bebas mengganti pilihan shift secara manual.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {previewActiveShift ? (
                    <span className={styles.shiftPreviewBadge}>
                      ● Saat ini terdeteksi: {previewActiveShift.name} ({previewActiveShift.start}–{previewActiveShift.end})
                    </span>
                  ) : (
                    <span className={`${styles.shiftPreviewBadge} ${styles.shiftPreviewWarn}`}>
                      ○ Tidak ada shift cocok untuk jam saat ini
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.tableActionBtn}
                    onClick={handleAddShift}
                  >
                    + Tambah Shift
                  </button>
                </div>
              </div>

              <div className={styles.shiftRows}>
                {(settingsForm.shifts || []).map((shiftItem, index) => {
                  const isOvernight = isOvernightShift(shiftItem)

                  return (
                    <div key={`${index}-${shiftItem.id}`} className={styles.shiftRowCard}>
                      <div className={styles.formField}>
                        <label className={styles.formLabel}>ID Shift</label>
                        <input
                          type="number"
                          min={1}
                          className={styles.formInput}
                          value={shiftItem.id}
                          onChange={(e) => handleUpdateShift(index, 'id', e.target.value)}
                          required
                        />
                      </div>

                      <div className={styles.formField}>
                        <label className={styles.formLabel}>
                          Nama Shift
                          {isOvernight && <span className={styles.shiftOvernightTag}>Lintas Malam</span>}
                        </label>
                        <input
                          type="text"
                          className={styles.formInput}
                          placeholder="Contoh: Shift 1"
                          value={shiftItem.name}
                          onChange={(e) => handleUpdateShift(index, 'name', e.target.value)}
                          required
                        />
                      </div>

                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Jam Mulai</label>
                        <input
                          type="time"
                          className={styles.formInput}
                          value={shiftItem.start}
                          onChange={(e) => handleUpdateShift(index, 'start', e.target.value)}
                          required
                        />
                      </div>

                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Jam Selesai</label>
                        <input
                          type="time"
                          className={styles.formInput}
                          value={shiftItem.end}
                          onChange={(e) => handleUpdateShift(index, 'end', e.target.value)}
                          required
                        />
                      </div>

                      <div>
                        <button
                          type="button"
                          className={styles.tableActionBtnDanger}
                          onClick={() => handleRemoveShift(index)}
                          disabled={settingsForm.shifts.length <= 1}
                          title="Hapus jadwal shift ini"
                        >
                          🗑️ Hapus
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={styles.settingsFooter}>
              <div className={styles.settingsMeta}>
                Disimpan ke konfigurasi JSON di server (tanpa tabel database).
                {savedSettings?.updatedAt && (
                  <> • Terakhir diperbarui: <strong>{new Date(savedSettings.updatedAt).toLocaleString('id-ID')}</strong></>
                )}
                {isSettingsDirty && <> • <strong style={{ color: 'var(--warning)' }}>Ada perubahan belum disimpan</strong></>}
              </div>

              <div className={styles.settingsActions}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={handleResetDefaultSettings}
                  disabled={savingSettings}
                >
                  ↺ Reset Default
                </button>
                <button
                  type="submit"
                  className={styles.actionBtnPrimary}
                  disabled={savingSettings}
                >
                  {savingSettings ? 'Menyimpan…' : '💾 Simpan Pengaturan'}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 1: FORM MESIN (CREATE / EDIT)
         ══════════════════════════════════════════════════════════ */}
      {machineModal && (
        <div className={styles.modalBackdrop} onClick={() => !submittingMachine && setMachineModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveMachine}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span>🏭</span> {machineModal.mode === 'create' ? 'Tambah Mesin Baru' : `Edit Mesin #${machineModal.data.machine_num}`}
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setMachineModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Nomor Mesin (Angka)</label>
                    <input
                      type="number"
                      className={styles.formInput}
                      placeholder="Contoh: 1, 2, 3..."
                      value={machineModal.data.machine_num}
                      onChange={(e) =>
                        setMachineModal({
                          ...machineModal,
                          data: { ...machineModal.data, machine_num: e.target.value },
                        })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Nama Tabel Autonic Sensor</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder={`Contoh: autonicmachine_${machineModal.data.machine_num || '1'}`}
                      value={machineModal.data.autonic_table}
                      onChange={(e) =>
                        setMachineModal({
                          ...machineModal,
                          data: { ...machineModal.data, autonic_table: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Printer Label (Direct Print)</label>
                  <select
                    className={styles.formInput}
                    value={machineModal.data.printer_name || ''}
                    onChange={(e) =>
                      setMachineModal({
                        ...machineModal,
                        data: { ...machineModal.data, printer_name: e.target.value },
                      })
                    }
                  >
                    <option value="">(Gunakan Default Sistem: {defaultPrinter || 'N/A'})</option>
                    {printers.map((p) => {
                      const name = typeof p === 'string' ? p : p.name || p.printer_name
                      return (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      )
                    })}
                  </select>
                </div>

                {machineModal.data.printer_name && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className={styles.tableActionBtn}
                      onClick={() => handleTestPrint(machineModal.data.printer_name)}
                    >
                      🖨️ Uji Tes Cetak Printer
                    </button>
                  </div>
                )}
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setMachineModal(null)}
                  disabled={submittingMachine}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={styles.actionBtnPrimary}
                  disabled={submittingMachine}
                >
                  {submittingMachine ? 'Menyimpan…' : 'Simpan Mesin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 2: FORM DEFECT CODE (CREATE / EDIT)
         ══════════════════════════════════════════════════════════ */}
      {defectModal && (
        <div className={styles.modalBackdrop} onClick={() => !submittingDefect && setDefectModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveDefect}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span>📋</span> {defectModal.mode === 'create' ? 'Tambah Kode Inspeksi Baru' : `Edit Kode Inspeksi '${defectModal.originalCode}'`}
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setDefectModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Kode Inspeksi (Unik, Contoh: L05, W02, B10)</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Masukkan kode inspeksi..."
                    value={defectModal.data.Code}
                    onChange={(e) =>
                      setDefectModal({
                        ...defectModal,
                        data: { ...defectModal.data, Code: e.target.value.toUpperCase() },
                      })
                    }
                    required
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Nama / Deskripsi Inspeksi Kain</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    placeholder="Contoh: Lusi Putus, Pakan Renggang, Garis Sisir..."
                    value={defectModal.data.Defect}
                    onChange={(e) =>
                      setDefectModal({
                        ...defectModal,
                        data: { ...defectModal.data, Defect: e.target.value },
                      })
                    }
                    required
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setDefectModal(null)}
                  disabled={submittingDefect}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={styles.actionBtnPrimary}
                  disabled={submittingDefect}
                >
                  {submittingDefect ? 'Menyimpan…' : 'Simpan Kode Inspeksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL 3: FORM USER (CREATE / EDIT)
         ══════════════════════════════════════════════════════════ */}
      {userModal && (
        <div className={styles.modalBackdrop} onClick={() => !submittingUser && setUserModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveUser}>
              <div className={styles.modalHeader}>
                <div className={styles.modalTitle}>
                  <span>👤</span> {userModal.mode === 'create' ? 'Tambah Pengguna Baru' : `Edit Akun @${userModal.data.username}`}
                </div>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setUserModal(null)}
                >
                  ✕
                </button>
              </div>

              <div className={styles.modalBody}>
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Username</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="Contoh: operator12"
                      value={userModal.data.username}
                      onChange={(e) =>
                        setUserModal({
                          ...userModal,
                          data: { ...userModal.data, username: e.target.value },
                        })
                      }
                      required
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Nama Lengkap</label>
                    <input
                      type="text"
                      className={styles.formInput}
                      placeholder="Contoh: Budi Santoso"
                      value={userModal.data.full_name}
                      onChange={(e) =>
                        setUserModal({
                          ...userModal,
                          data: { ...userModal.data, full_name: e.target.value },
                        })
                      }
                      required
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Email</label>
                    <input
                      type="email"
                      className={styles.formInput}
                      placeholder="Contoh: budi@sca.id"
                      value={userModal.data.email}
                      onChange={(e) =>
                        setUserModal({
                          ...userModal,
                          data: { ...userModal.data, email: e.target.value },
                        })
                      }
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>
                      {userModal.mode === 'create' ? 'Password' : 'Password Baru (Opsional)'}
                    </label>
                    <input
                      type="password"
                      className={styles.formInput}
                      placeholder={userModal.mode === 'create' ? 'Masukkan password akun' : 'Kosongkan jika tidak diubah'}
                      value={userModal.data.password}
                      onChange={(e) =>
                        setUserModal({
                          ...userModal,
                          data: { ...userModal.data, password: e.target.value },
                        })
                      }
                      required={userModal.mode === 'create'}
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Peran (Role)</label>
                    <select
                      className={styles.formInput}
                      value={userModal.data.role}
                      onChange={(e) =>
                        setUserModal({
                          ...userModal,
                          data: { ...userModal.data, role: e.target.value },
                        })
                      }
                    >
                      <option value="user">Operator (User)</option>
                      <option value="admin">Administrator (Admin)</option>
                    </select>
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Mesin Default</label>
                    <select
                      className={styles.formInput}
                      value={userModal.data.machine_id}
                      onChange={(e) =>
                        setUserModal({
                          ...userModal,
                          data: { ...userModal.data, machine_id: e.target.value },
                        })
                      }
                    >
                      <option value="0">Semua Mesin</option>
                      {machines.map((m) => (
                        <option key={m.machine_id} value={m.machine_id}>
                          Mesin #{m.machine_num || m.machine_id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Status Akun</label>
                  <select
                    className={styles.formInput}
                    value={userModal.data.is_active ? 'active' : 'inactive'}
                    onChange={(e) =>
                      setUserModal({
                        ...userModal,
                        data: { ...userModal.data, is_active: e.target.value === 'active' },
                      })
                    }
                  >
                    <option value="active">Aktif (Dapat Login)</option>
                    <option value="inactive">Nonaktif (Diblokir)</option>
                  </select>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={() => setUserModal(null)}
                  disabled={submittingUser}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={styles.actionBtnPrimary}
                  disabled={submittingUser}
                >
                  {submittingUser ? 'Menyimpan…' : 'Simpan Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          CONFIRMATION DIALOG MODAL (DELETE & RELEASE)
         ══════════════════════════════════════════════════════════ */}
      {confirmModal && (
        <div className={styles.modalBackdrop} onClick={() => setConfirmModal(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle}>
                <span>{confirmModal.isDanger ? '⚠️' : 'ℹ️'}</span> {confirmModal.title}
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setConfirmModal(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <p style={{ fontSize: '14.5px', color: 'var(--text)', lineHeight: '1.55' }}>
                {confirmModal.message}
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.backBtn}
                onClick={() => setConfirmModal(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className={confirmModal.isDanger ? styles.tableActionBtnDanger : styles.actionBtnPrimary}
                onClick={confirmModal.onConfirm}
                style={{ padding: '10px 18px', fontSize: '14px' }}
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
