import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  getStoredPanelSession,
  checkPanelSessionDetailedApi,
  panelLoginApi,
  panelLogoutApi,
  searchOrdersApi,
  getCountingData,
  getNextRollInfo,
  updateRollLineApi,
  deleteRollApi,
  saveRollDefectsApi,
  saveJoinedPiecesApi,
  updateRollStockApi,
} from '../services/api.js'
import EditRollModal from '../components/EditRollModal.jsx'
import ConfirmDeleteModal from '../components/ConfirmDeleteModal.jsx'
import DefectModal from '../components/DefectModal.jsx'
import JoinedPieceModal from '../components/JoinedPieceModal.jsx'
import ETicketModal from '../components/ETicketModal.jsx'
import RollLabelModal from '../components/RollLabelModal.jsx'
import Toast from '../components/Toast.jsx'
import { isFullscreen, exitFullscreen, toggleFullscreen, onFullscreenChange } from '../utils/fullscreen.js'
import { mapDbDefectToUi, mapDbJoinedPieceToUi } from '../utils/inspectionHelpers.js'
import styles from './PanelPage.module.css'

function parseFormattedNumber(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const cleaned = String(val).replace(/,/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

export default function PanelPage({ theme, onToggleTheme, onNavigate }) {
  // ── Session State ──
  const [panelUser, setPanelUser] = useState(() => {
    const stored = getStoredPanelSession()
    const roleLower = String(stored?.user?.role || '').toLowerCase()
    return roleLower === 'karu' || roleLower === 'admin' ? stored.user : null
  })
  const [checkingAuth, setCheckingAuth] = useState(true)

  // ── Login Form State ──
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // ── Search & Selection State ──
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedProdId, setSelectedProdId] = useState(null)
  const [loadingOrderDetail, setLoadingOrderDetail] = useState(false)

  // ── Order Detail State ──
  const [orderHeader, setOrderHeader] = useState(null)
  const [rolls, setRolls] = useState([])
  const [coProducts, setCoProducts] = useState([])
  const [defects, setDefects] = useState({}) // { rollId: [{id, yard, code}] }
  const [joinedPieces, setJoinedPieces] = useState({}) // { rollId: [{id, yard}] }
  const [maxDefectLineByRoll, setMaxDefectLineByRoll] = useState({})
  const [maxJoinedPieceLineByRoll, setMaxJoinedPieceLineByRoll] = useState({})
  const [multiMachineStats, setMultiMachineStats] = useState(null)

  // ── Filter & Tabs State ──
  const [activeMachineFilter, setActiveMachineFilter] = useState('ALL')
  const [activeCategoryTab, setActiveCategoryTab] = useState('rolls') // 'rolls' | 'coproducts'

  // ── Modals State ──
  const [rollToEdit, setRollToEdit] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [rollToDelete, setRollToDelete] = useState(null)
  const [deletingRoll, setDeletingRoll] = useState(false)
  const [defectModalRoll, setDefectModalRoll] = useState(null)
  const [jpModalRoll, setJpModalRoll] = useState(null)
  const [ticketModalRoll, setTicketModalRoll] = useState(null)
  const [labelModalRoll, setLabelModalRoll] = useState(null)

  // ── Notification Toast ──
  const [toastMsg, setToastMsg] = useState('')
  const [isFs, setIsFs] = useState(() => isFullscreen())

  const searchDebounceRef = useRef(null)

  function showToast(msg) {
    setToastMsg(msg)
    window.setTimeout(() => setToastMsg(''), 3500)
  }

  // Monitor fullscreen changes
  useEffect(() => {
    return onFullscreenChange(setIsFs)
  }, [])

  // ── Check Session with Backend on Mount ──
  useEffect(() => {
    const stored = getStoredPanelSession()
    if (!stored?.key) {
      setCheckingAuth(false)
      return
    }

    checkPanelSessionDetailedApi(stored.key)
      .then((res) => {
        const roleLower = String(res.user?.role || '').toLowerCase()
        if ((res?.status === 'valid' || res?.status === 'offline') && (roleLower === 'karu' || roleLower === 'admin')) {
          setPanelUser(res.user)
        } else {
          setPanelUser(null)
          if (res?.reason) setLoginError(res.reason)
        }
      })
      .catch(() => {
        setPanelUser(null)
      })
      .finally(() => {
        setCheckingAuth(false)
      })
  }, [])

  // ── Handle Panel Login ──
  async function handleLogin(e) {
    e.preventDefault()
    if (!loginUsername.trim()) return setLoginError('Username tidak boleh kosong.')
    if (!loginPassword) return setLoginError('Password tidak boleh kosong.')

    setLoginLoading(true)
    setLoginError('')

    try {
      const result = await panelLoginApi(loginUsername, loginPassword)
      if (result.success && result.user) {
        const roleLower = String(result.user.role || '').toLowerCase()
        if (roleLower !== 'karu' && roleLower !== 'admin') {
          setLoginError('Akses ditolak: Portal ini khusus untuk Kepala Regu (Karu) dan Administrator.')
          return
        }
        setPanelUser(result.user)
        showToast(`Selamat datang, ${result.user.name || result.user.username}`)
      }
    } catch (err) {
      setLoginError(err.message || 'Terjadi kesalahan saat verifikasi login.')
    } finally {
      setLoginLoading(false)
    }
  }

  // ── Handle Panel Logout ──
  const handleLogout = useCallback(async () => {
    const sessionKey = panelUser?.sessionKey || localStorage.getItem('mpm_panel_session_key')
    await panelLogoutApi(sessionKey)
    setPanelUser(null)
    setSelectedProdId(null)
    setOrderHeader(null)
    setRolls([])
    setCoProducts([])
    showToast('Berhasil keluar dari sesi Panel Pengawas.')
  }, [panelUser?.sessionKey])

  // ── Search Orders API Fetcher ──
  const executeSearch = useCallback(async (query) => {
    setSearchLoading(true)
    try {
      const results = await searchOrdersApi(query, 30)
      setSearchResults(results || [])
    } catch (err) {
      console.warn('Gagal mencari order:', err.message)
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }, [])

  // Auto load recent orders when authenticated or when search term changes
  useEffect(() => {
    if (!panelUser) return

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }

    searchDebounceRef.current = setTimeout(() => {
      executeSearch(searchTerm)
    }, 300)

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [panelUser, searchTerm, executeSearch])

  // ── Load Full Order Detail ──
  const loadOrderDetail = useCallback(async (prodId) => {
    if (!prodId) return
    setLoadingOrderDetail(true)
    try {
      // 1. Ambil detail counting header & ALL lines (tanpa filter machineId)
      const [countingData, nextRollInfo] = await Promise.all([
        getCountingData(prodId, ''), // Empty machineId = returns ALL machines
        getNextRollInfo(prodId, '').catch(() => null),
      ])

      if (!countingData) {
        showToast(`⚠️ Data untuk order '${prodId}' tidak ditemukan di database.`)
        setSelectedProdId(null)
        setOrderHeader(null)
        return
      }

      setOrderHeader(countingData)
      setMultiMachineStats(nextRollInfo)

      // 2. Parse baris roll kain regular (ProductType != 1)
      const allLines = countingData.lines || countingData.allLines || []
      const loadedRolls = allLines
        .filter((l) => Number(l.ProductType ?? 5) !== 1)
        .map((l) => {
          let parsedBs = 0
          if (l.Description) {
            const match = l.Description.match(/BS:\s*([\d.]+)/i)
            if (match) parsedBs = parseFloat(match[1]) || 0
          }
          return {
            id: Number(l.RoolNumber),
            length: parseFloat(l.Length) || 0,
            bsQty: parsedBs,
            noMesin: String(l.NoMesin || '1'),
            isPrinted: Boolean(l.isPrinted),
            description: l.Description || `Roll #${l.RoolNumber}`,
            isExecute: Boolean(l.IsExecute),
            isStock: Boolean(l.isStock),
            qrNum: l.QrNum || '',
            transDate: l.TransDate || '',
            createdBy: l.CreatedBy || '',
            shift: l.Shift || '',
          }
        })

      // 3. Parse baris co-products (ProductType == 1)
      const loadedCoProducts = allLines
        .filter((l) => Number(l.ProductType ?? 5) === 1)
        .map((l) => ({
          id: Number(l.RoolNumber),
          length: Number(l.Length) || 0,
          inventStatus: l.InventStatus || 'BS',
          noMesin: String(l.NoMesin || '1'),
          productType: 1,
          transDate: l.TransDate || '',
        }))

      // 4. Parse titik cacat dari database
      const loadedDefects = {}
      if (Array.isArray(countingData.defects)) {
        for (const d of countingData.defects) {
          const rId = d.RoolNumber
          if (!loadedDefects[rId]) loadedDefects[rId] = []
          loadedDefects[rId].push(mapDbDefectToUi(d))
        }
      }

      // 5. Parse joined pieces dari database
      const loadedJoinedPieces = {}
      if (Array.isArray(countingData.joinedPieces)) {
        for (const jp of countingData.joinedPieces) {
          const rId = jp.RoolNumber
          if (!loadedJoinedPieces[rId]) loadedJoinedPieces[rId] = []
          loadedJoinedPieces[rId].push(mapDbJoinedPieceToUi(jp))
        }
      }

      setRolls(loadedRolls)
      setCoProducts(loadedCoProducts)
      setDefects(loadedDefects)
      setJoinedPieces(loadedJoinedPieces)
      setMaxDefectLineByRoll(countingData.maxDefectLineByRoll || {})
      setMaxJoinedPieceLineByRoll(countingData.maxJoinedPieceLineByRoll || {})
      setActiveMachineFilter('ALL')
    } catch (err) {
      console.error('Error saat memuat detail order:', err)
      showToast(`⚠️ Gagal memuat data order: ${err.message}`)
    } finally {
      setLoadingOrderDetail(false)
    }
  }, [])

  // ── Select an Order ──
  function handleSelectOrder(prodId) {
    setSelectedProdId(prodId)
    loadOrderDetail(prodId)
  }

  // ── Switch / Clear Selected Order ──
  function handleBackToSearch() {
    setSelectedProdId(null)
    setOrderHeader(null)
    setRolls([])
    setCoProducts([])
    executeSearch(searchTerm)
  }

  // ── EDIT ROLL: Handled via updateRollLineApi ──
  async function handleSaveEditRoll(editValues) {
    if (!rollToEdit || !orderHeader?.ProdId) return
    setSavingEdit(true)
    const prodId = orderHeader.ProdId
    const rollId = rollToEdit.id

    try {
      const parsedLength = parseFloat(editValues.length)
      const parsedBs = parseFloat(editValues.bsQty || 0)
      const updatedTransDate = editValues.transDate || rollToEdit.transDate

      // Format description agar BS qty awet
      let updatedDesc = rollToEdit.description || `Roll #${rollId} (${parsedLength} yard)`
      if (parsedBs > 0) {
        if (/BS:\s*[\d.]+/i.test(updatedDesc)) {
          updatedDesc = updatedDesc.replace(/BS:\s*[\d.]+/i, `BS: ${parsedBs}`)
        } else {
          updatedDesc = `${updatedDesc} | BS: ${parsedBs} yd`
        }
      } else {
        updatedDesc = updatedDesc.replace(/\s*\|\s*BS:\s*[\d.]+\s*(yd)?/i, '')
      }

      const updateRes = await updateRollLineApi(prodId, rollId, {
        length: parsedLength,
        bsQty: parsedBs,
        description: updatedDesc,
        isExecute: false, // Aturan: update line reset isExecute jadi false
        noMesin: rollToEdit.noMesin,
        isPrinted: rollToEdit.isPrinted,
        transDate: updatedTransDate,
      })

      // Update local state
      setRolls((prev) =>
        prev.map((r) =>
          r.id === rollId
            ? {
                ...r,
                length: parsedLength,
                bsQty: parsedBs,
                description: updatedDesc,
                isExecute: false,
                transDate: updatedTransDate,
                qrNum: updateRes?.data?.QrNum || r.qrNum,
              }
            : r
        )
      )

      showToast(`✓ Roll #${rollId} berhasil diperbarui.`)
      setRollToEdit(null)
    } catch (err) {
      console.error('Error saat simpan edit roll:', err)
      showToast(`⚠️ Gagal menyimpan perubahan: ${err.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  // ── DELETE ROLL: Handled via deleteRollApi ──
  async function handleConfirmDeleteRoll() {
    if (!rollToDelete || !orderHeader?.ProdId || deletingRoll) return
    setDeletingRoll(true)
    const prodId = orderHeader.ProdId
    const rollId = rollToDelete.id

    try {
      await deleteRollApi(prodId, rollId)

      // Update local state
      setRolls((prev) => prev.filter((r) => r.id !== rollId))
      setDefects((prev) => {
        const next = { ...prev }
        delete next[rollId]
        return next
      })
      setJoinedPieces((prev) => {
        const next = { ...prev }
        delete next[rollId]
        return next
      })

      showToast(`✓ Roll #${rollId} berhasil dihapus.`)
      setRollToDelete(null)
    } catch (err) {
      console.error('Error saat hapus roll:', err)
      showToast(`⚠️ Gagal menghapus roll: ${err.message}`)
    } finally {
      setDeletingRoll(false)
    }
  }

  // ── DELETE CO-PRODUCT: Handled via deleteRollApi ──
  async function handleDeleteCoProduct(coProductId) {
    if (!orderHeader?.ProdId) return
    try {
      await deleteRollApi(orderHeader.ProdId, coProductId)
      setCoProducts((prev) => prev.filter((item) => item.id !== coProductId))
      showToast(`✓ Co-Product #${coProductId} berhasil dihapus.`)
    } catch (err) {
      showToast(`⚠️ Gagal menghapus Co-Product: ${err.message}`)
    }
  }

  // ── TOGGLE STOCK STATUS ──
  async function handleToggleStock(rollId, isStock) {
    if (!orderHeader?.ProdId) return
    try {
      const res = await updateRollStockApi(orderHeader.ProdId, rollId, isStock)
      setRolls((prev) =>
        prev.map((r) =>
          r.id === rollId
            ? { ...r, isStock, qrNum: res?.data?.QrNum || r.qrNum }
            : r
        )
      )
      showToast(`✓ Roll #${rollId} diubah menjadi ${isStock ? 'Kain Stock (S)' : 'Order (O)'}.`)
    } catch (err) {
      showToast(`⚠️ Gagal mengubah status stock: ${err.message}`)
    }
  }

  // ── SAVE DEFECTS FROM DEFECT MODAL ──
  async function handleSaveDefects(updatedDefects, updatedJoinedPieces) {
    if (!defectModalRoll || !orderHeader?.ProdId) return
    const prodId = orderHeader.ProdId
    const rollId = defectModalRoll.id

    try {
      await Promise.all([
        saveRollDefectsApi(prodId, rollId, updatedDefects),
        saveJoinedPiecesApi(prodId, rollId, updatedJoinedPieces),
      ])

      setDefects((prev) => ({
        ...prev,
        [rollId]: updatedDefects,
      }))
      setJoinedPieces((prev) => ({
        ...prev,
        [rollId]: updatedJoinedPieces,
      }))

      showToast(`✓ Catatan inspeksi Roll #${rollId} berhasil disimpan.`)
      setDefectModalRoll(null)
    } catch (err) {
      console.error('Error saat simpan inspeksi:', err)
      showToast(`⚠️ Gagal menyimpan inspeksi: ${err.message}`)
    }
  }

  // ── SAVE JOINED PIECES FROM JP MODAL ──
  async function handleSaveJoinedPieces(updatedJps) {
    if (!jpModalRoll || !orderHeader?.ProdId) return
    const prodId = orderHeader.ProdId
    const rollId = jpModalRoll.id

    try {
      await saveJoinedPiecesApi(prodId, rollId, updatedJps)
      setJoinedPieces((prev) => ({
        ...prev,
        [rollId]: updatedJps,
      }))
      showToast(`✓ Data Joined Piece Roll #${rollId} berhasil disimpan.`)
      setJpModalRoll(null)
    } catch (err) {
      showToast(`⚠️ Gagal menyimpan Joined Piece: ${err.message}`)
    }
  }

  // ── Derived Statistics ──
  const distinctMachines = useMemo(() => {
    const set = new Set()
    rolls.forEach((r) => r.noMesin && set.add(String(r.noMesin).trim()))
    coProducts.forEach((cp) => cp.noMesin && set.add(String(cp.noMesin).trim()))
    return Array.from(set).sort((a, b) => Number(a) - Number(b))
  }, [rolls, coProducts])

  const filteredRolls = useMemo(() => {
    if (activeMachineFilter === 'ALL') return rolls
    return rolls.filter((r) => String(r.noMesin).trim() === activeMachineFilter)
  }, [rolls, activeMachineFilter])

  const filteredCoProducts = useMemo(() => {
    if (activeMachineFilter === 'ALL') return coProducts
    return coProducts.filter((cp) => String(cp.noMesin).trim() === activeMachineFilter)
  }, [coProducts, activeMachineFilter])

  const totalYards = useMemo(() => {
    return rolls.reduce((acc, r) => acc + (parseFloat(r.length) || 0), 0)
  }, [rolls])

  const totalBs = useMemo(() => {
    return rolls.reduce((acc, r) => acc + (parseFloat(r.bsQty) || 0), 0)
  }, [rolls])

  const totalDefectsCount = useMemo(() => {
    return Object.values(defects).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0)
  }, [defects])

  const targetOrderQty = parseFormattedNumber(orderHeader?.OrderQty)
  const targetStockQty = parseFormattedNumber(orderHeader?.StockQty)
  const achievementPct = targetOrderQty > 0 ? Math.round((totalYards / targetOrderQty) * 100) : 0

  // Machine breakdown summary
  const machineBreakdown = useMemo(() => {
    const map = {}
    distinctMachines.forEach((m) => {
      map[m] = { machine: m, rollCount: 0, rollYards: 0, cpCount: 0 }
    })
    rolls.forEach((r) => {
      const m = String(r.noMesin).trim()
      if (map[m]) {
        map[m].rollCount += 1
        map[m].rollYards += parseFloat(r.length) || 0
      }
    })
    coProducts.forEach((cp) => {
      const m = String(cp.noMesin).trim()
      if (map[m]) {
        map[m].cpCount += 1
      }
    })
    return Object.values(map)
  }, [distinctMachines, rolls, coProducts])

  // Mock prodData object to pass into ETicketModal & RollLabelModal
  const activeProdDataForModals = useMemo(() => {
    if (!orderHeader) return null
    return {
      prodNumber: orderHeader.ProdId,
      seqmentNum: orderHeader.SeqmentNum || orderHeader.ProdId,
      customer: orderHeader.CustCode || '',
      custCode: orderHeader.CustCode || '',
      fabricType: orderHeader.DesignCode || '',
      designCode: orderHeader.DesignCode || '',
      color: orderHeader.Color || '',
      orderQty: targetOrderQty,
      stockQty: targetStockQty,
      k3lNumber: orderHeader.K3LNumber || '',
      k3lName: orderHeader.K3LName || '',
      K3LNumber: orderHeader.K3LNumber || '',
      K3LName: orderHeader.K3LName || '',
      patternCode: orderHeader.PatternCode || '',
      PatternCode: orderHeader.PatternCode || '',
      noMesin: rolls[0]?.noMesin || '1',
      userId: panelUser?.username || 'karu',
    }
  }, [orderHeader, targetOrderQty, targetStockQty, rolls, panelUser])

  // ── Render: Auth Checking Screen ──
  if (checkingAuth) {
    return (
      <div className={styles.loadingScreen}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏭</div>
          <div style={{ fontSize: '15px', fontWeight: '600' }}>Memeriksa Sesi Panel Pengawas…</div>
        </div>
      </div>
    )
  }

  // ── Render: Login Portal (If not logged in as Karu or Admin) ──
  if (!panelUser) {
    return (
      <div className={styles.loginCenter}>
        <div className={styles.loginCard}>
          <header className={styles.loginHeader}>
            <div className={styles.brandGroup}>
              <div className={styles.brandIcon}>PM</div>
              <div className={styles.brandTitles}>
                <div className={styles.brandName}>ProdMon</div>
                <div className={styles.panelTag}>Panel Pengawas</div>
              </div>
            </div>

            <div className={styles.headerRight}>
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
            <div className={styles.portalBadgeIcon}>🛡️</div>
            <div>
              <div className={styles.portalBadgeTitle}>Portal Kepala Regu (Karu) & Admin</div>
              <div className={styles.portalBadgeDesc}>
                Akses pengawasan produksi seluruh mesin, inspeksi cacat kain, serta manajemen data roll.
              </div>
            </div>
          </div>

          <form className={styles.loginForm} onSubmit={handleLogin}>
            {loginError && <div className={styles.errorBanner}>⚠️ {loginError}</div>}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Username atau Email</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="mis. hari, roni, admin"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                autoFocus
                disabled={loginLoading}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Password</label>
              <input
                type="password"
                className={styles.formInput}
                placeholder="Masukkan password akun Anda"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={loginLoading}
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loginLoading}>
              {loginLoading ? 'Memverifikasi Akses…' : 'Masuk ke Panel Pengawas'}
            </button>
          </form>

          <div className={styles.backHomeLink}>
            <button
              type="button"
              onClick={() => {
                if (onNavigate) onNavigate('/')
                else window.location.href = '/'
              }}
            >
              ← Kembali ke Layar Operasional Mesin Loom
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Authenticated Panel View ──
  return (
    <div className={styles.panelWrap}>
      {/* ── Top Navigation Bar ── */}
      <header className={styles.topHeader}>
        <div className={styles.brandGroup}>
          <div className={styles.brandIcon}>🏭</div>
          <div className={styles.brandTitles}>
            <div className={styles.brandName}>
              <span>ProdMon</span>
              <span className={styles.panelTag}>Panel Pengawas</span>
            </div>
            <span className={styles.brandSub}>Pengawasan Produksi, Edit & Kontrol Roll</span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.userBadge}>
            <span
              className={
                String(panelUser.role).toLowerCase() === 'admin'
                  ? styles.roleChipAdmin
                  : styles.roleChipKaru
              }
            >
              {String(panelUser.role).toUpperCase()}
            </span>
            <span>{panelUser.name || panelUser.username}</span>
          </div>

          {String(panelUser.role).toLowerCase() === 'admin' && (
            <button
              type="button"
              className={styles.navLinkBtn}
              onClick={() => {
                if (onNavigate) onNavigate('/admin')
                else window.location.href = '/admin'
              }}
              title="Buka Admin Portal Pengaturan Mesin"
            >
              ⚙️ Admin Portal
            </button>
          )}

          <button
            type="button"
            className={styles.navLinkBtn}
            onClick={() => {
              if (onNavigate) onNavigate('/')
              else window.location.href = '/'
            }}
            title="Buka Layar Operator Mesin"
          >
            🏭 Operasional Mesin
          </button>

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

          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            title="Keluar dari sesi Panel Pengawas"
          >
            ⏻ Keluar
          </button>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className={styles.mainContent}>
        {/* ── Search & Selection Section ── */}
        {!selectedProdId ? (
          <section className={styles.searchSection}>
            <div className={styles.searchHeader}>
              <h2 className={styles.searchTitle}>
                <span>🔍</span> Cari Order Produksi (ProdId / No. WO)
              </h2>
              <p className={styles.searchSubtitle}>
                Ketik nomor <strong>ProdId</strong> atau nomor <strong>SeqmentNum</strong> untuk mencari order.
                Pilih salah satu order dari hasil pencarian untuk melihat detail produksi.
              </p>
            </div>

            <div className={styles.searchInputWrap}>
              <span className={styles.searchIcon}>🔎</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Ketik nomor ProdId atau No WO (mis. OP.112026.000047, SPM, TEST, dsb)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              {searchLoading && <span className={styles.searchSpin}>🔄</span>}
              {searchTerm && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => setSearchTerm('')}
                  title="Hapus pencarian"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Results Header */}
            <div className={styles.resultsHeader}>
              <span className={styles.resultsCount}>
                {searchLoading
                  ? 'Sedang mencari order…'
                  : `Ditemukan ${searchResults.length} Order Produksi`}
              </span>
              {searchTerm && (
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  Filter: <strong>"{searchTerm}"</strong>
                </span>
              )}
            </div>

            {/* Results Grid */}
            {searchResults.length === 0 && !searchLoading ? (
              <div className={styles.emptyResults}>
                <div className={styles.emptyIcon}>📦</div>
                <h3>Tidak ada order produksi yang cocok</h3>
                <p>Coba kata kunci lain atau periksa kembali nomor ProdId / SeqmentNum.</p>
              </div>
            ) : (
              <div className={styles.resultsGrid}>
                {searchResults.map((order) => {
                  const hasRolls = Number(order.total_rolls) > 0
                  return (
                    <div
                      key={order.ProdId}
                      className={styles.orderCard}
                      onClick={() => handleSelectOrder(order.ProdId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSelectOrder(order.ProdId)
                      }}
                    >
                      <div className={styles.cardTop}>
                        <div className={styles.cardProdId}>{order.ProdId}</div>
                        {order.SeqmentNum && (
                          <div className={styles.cardWoBadge}>WO: {order.SeqmentNum}</div>
                        )}
                      </div>

                      <div className={styles.cardMetaRow}>
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Customer</span>
                          <span className={styles.metaVal}>{order.CustCode || '-'}</span>
                        </div>
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Kain / Design</span>
                          <span className={styles.metaVal}>{order.DesignCode || '-'}</span>
                        </div>
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Warna</span>
                          <span className={styles.metaVal}>{order.Color || '-'}</span>
                        </div>
                        <div className={styles.metaItem}>
                          <span className={styles.metaLabel}>Target Qty</span>
                          <span className={styles.metaVal}>
                            {parseFormattedNumber(order.OrderQty).toLocaleString()} yd
                          </span>
                        </div>
                      </div>

                      <div className={styles.cardFooter}>
                        <div className={styles.cardStats}>
                          <span className={styles.statItem} title="Total Roll Terinput">
                            📋 {Number(order.total_rolls) || 0} Roll
                          </span>
                          <span className={styles.statItem} title="Total Panjang Terinput">
                            📏 {parseFloat(order.total_yards || 0).toLocaleString()} yd
                          </span>
                          {order.machines && order.machines.length > 0 && (
                            <span className={styles.statItem} title="Mesin Terlibat">
                              🏭 M-{order.machines.join(', ')}
                            </span>
                          )}
                        </div>
                        <div className={styles.selectHint}>
                          <span>Pilih Order</span>
                          <span>→</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        ) : (
          /* ── Selected Order Detail View ── */
          <div>
            {/* Active Order Control Bar */}
            <div className={styles.activeOrderBar}>
              <div className={styles.activeOrderInfo}>
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={handleBackToSearch}
                  title="Kembali ke layar pencarian order"
                >
                  <span>←</span>
                  <span>Ganti Order / Cari Lagi</span>
                </button>

                <div className={styles.orderHighlight}>
                  <span className={styles.orderHighlightLabel}>Order Terpilih</span>
                  <span className={styles.orderHighlightProd}>{orderHeader?.ProdId}</span>
                </div>

                {orderHeader?.SeqmentNum && orderHeader.SeqmentNum !== orderHeader.ProdId && (
                  <span className={styles.cardWoBadge}>No. WO: {orderHeader.SeqmentNum}</span>
                )}
              </div>

              <div className={styles.orderActions}>
                <button
                  type="button"
                  className={styles.refreshBtn}
                  onClick={() => loadOrderDetail(selectedProdId)}
                  disabled={loadingOrderDetail}
                  title="Muat ulang data order dari server"
                >
                  <span className={loadingOrderDetail ? styles.spin : ''}>🔄</span>
                  <span>{loadingOrderDetail ? 'Memuat…' : 'Refresh Data'}</span>
                </button>
              </div>
            </div>

            {/* Order Summary Cards */}
            <section className={styles.infoCardsGrid}>
              <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Customer</span>
                <span className={styles.infoCardValue}>{orderHeader?.CustCode || '-'}</span>
                <span className={styles.infoCardSub}>Kode Pemesan</span>
              </div>

              <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Jenis Kain (Design)</span>
                <span className={styles.infoCardValue}>{orderHeader?.DesignCode || '-'}</span>
                <span className={styles.infoCardSub}>{orderHeader?.Color || 'Tanpa Spesifikasi Warna'}</span>
              </div>

              <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Target Order Qty</span>
                <span className={styles.infoCardValue}>
                  {targetOrderQty.toLocaleString()} <span style={{ fontSize: '12px' }}>yard</span>
                </span>
                <span className={styles.infoCardSub}>
                  Stock Qty: {targetStockQty.toLocaleString()} yd
                </span>
              </div>

              <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Realisasi Produksi</span>
                <span className={styles.infoCardValue} style={{ color: '#0284c7' }}>
                  {totalYards.toLocaleString()} <span style={{ fontSize: '12px' }}>yard</span>
                </span>
                <span className={styles.infoCardSub}>
                  Pencapaian: <strong>{achievementPct}%</strong> dari Target
                </span>
              </div>

              <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Total Roll Kain</span>
                <span className={styles.infoCardValue}>
                  {rolls.length} <span style={{ fontSize: '12px' }}>Roll</span>
                </span>
                <span className={styles.infoCardSub}>
                  Co-Products: {coProducts.length} Roll
                </span>
              </div>

              <div className={styles.infoCard}>
                <span className={styles.infoCardLabel}>Inspeksi & Cacat</span>
                <span
                  className={styles.infoCardValue}
                  style={{ color: totalDefectsCount > 0 ? '#f59e0b' : '#10b981' }}
                >
                  {totalDefectsCount} <span style={{ fontSize: '12px' }}>Titik</span>
                </span>
                <span className={styles.infoCardSub}>
                  Total BS: {totalBs.toLocaleString()} yd
                </span>
              </div>
            </section>

            {/* Multi-Machine Breakdown Pills */}
            {machineBreakdown.length > 0 && (
              <div className={styles.machinePillsRow}>
                <span className={styles.machinePillsLabel}>Distribusi Mesin:</span>
                {machineBreakdown.map((mb) => (
                  <div key={mb.machine} className={styles.machinePill}>
                    <span className={styles.machinePillIcon}>🏭</span>
                    <span>
                      <strong>Mesin #{mb.machine}:</strong> {mb.rollCount} Roll ({mb.rollYards.toLocaleString()} yd)
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Table Toolbar & Filters ── */}
            <div className={styles.tableToolbar}>
              {/* Category Tabs: Regular Rolls vs Co-Products */}
              <div className={styles.categoryTabs}>
                <button
                  type="button"
                  className={`${styles.categoryTabBtn} ${
                    activeCategoryTab === 'rolls' ? styles.categoryTabActive : ''
                  }`}
                  onClick={() => setActiveCategoryTab('rolls')}
                >
                  📋 Daftar Roll Kain
                  <span className={styles.tabBadge}>{rolls.length}</span>
                </button>

                <button
                  type="button"
                  className={`${styles.categoryTabBtn} ${
                    activeCategoryTab === 'coproducts' ? styles.categoryTabActive : ''
                  }`}
                  onClick={() => setActiveCategoryTab('coproducts')}
                >
                  🧵 Co-Products / BS
                  <span className={styles.tabBadge}>{coProducts.length}</span>
                </button>
              </div>

              {/* Machine Filter Selector Tabs */}
              {distinctMachines.length > 1 && (
                <div className={styles.filterTabs}>
                  <button
                    type="button"
                    className={`${styles.filterTabBtn} ${
                      activeMachineFilter === 'ALL' ? styles.filterTabActive : ''
                    }`}
                    onClick={() => setActiveMachineFilter('ALL')}
                  >
                    Semua Mesin ({rolls.length})
                  </button>
                  {distinctMachines.map((m) => {
                    const count = rolls.filter((r) => String(r.noMesin).trim() === m).length
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`${styles.filterTabBtn} ${
                          activeMachineFilter === m ? styles.filterTabActive : ''
                        }`}
                        onClick={() => setActiveMachineFilter(m)}
                      >
                        Mesin #{m} ({count})
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Rolls Table View ── */}
            <div className={styles.tableCard}>
              {activeCategoryTab === 'rolls' ? (
                <div className={styles.tableWrap}>
                  <table className={styles.rollTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '80px' }}>No. Roll</th>
                        <th style={{ width: '85px' }}>Mesin</th>
                        <th style={{ width: '130px' }}>Panjang</th>
                        <th style={{ width: '90px' }}>BS Qty</th>
                        <th style={{ width: '70px' }}>Stock</th>
                        <th style={{ width: '110px' }}>Tanggal</th>
                        <th style={{ width: '130px' }}>Inspeksi</th>
                        <th style={{ width: '90px' }}>Tiket</th>
                        <th style={{ width: '110px' }}>Operator</th>
                        <th style={{ minWidth: '340px', textAlign: 'center' }}>Aksi Pengawas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRolls.length === 0 ? (
                        <tr>
                          <td colSpan="10" style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                            Tidak ada data roll kain untuk filter mesin ini.
                          </td>
                        </tr>
                      ) : (
                        filteredRolls.map((roll) => {
                          const rollDefects = defects[roll.id] || []
                          const hasDefect = rollDefects.length > 0
                          const rollJps = joinedPieces[roll.id] || []

                          return (
                            <tr key={roll.id}>
                              <td>
                                <span className={styles.rollNum}>#{roll.id}</span>
                              </td>
                              <td>
                                <span className={styles.machineTag}>M-{roll.noMesin}</span>
                              </td>
                              <td>
                                <span className={styles.lengthText}>{roll.length}</span>{' '}
                                <span className={styles.unitText}>yard</span>
                              </td>
                              <td>
                                {roll.bsQty && roll.bsQty > 0 ? (
                                  <span className={styles.bsTextWarn}>{roll.bsQty} yd</span>
                                ) : (
                                  <span className={styles.bsTextZero}>0</span>
                                )}
                              </td>
                              <td>
                                <input
                                  type="checkbox"
                                  className={styles.stockCheckbox}
                                  checked={Boolean(roll.isStock)}
                                  onChange={(e) => handleToggleStock(roll.id, e.target.checked)}
                                  title={roll.isStock ? 'Kain Stock (Format S)' : 'Order Non-Stock (Format O)'}
                                />
                              </td>
                              <td>{roll.transDate || '-'}</td>
                              <td>
                                {hasDefect ? (
                                  <span className={styles.badgeWarn}>
                                    ⚠️ {rollDefects.length} Cacat
                                  </span>
                                ) : (
                                  <span className={styles.badgeOk}>✓ OK</span>
                                )}
                              </td>
                              <td>
                                {roll.isPrinted ? (
                                  <span style={{ color: '#0284c7', fontWeight: '700', fontSize: '11px' }}>
                                    ✓ Dicetak
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--muted)', fontSize: '11px' }}>Belum</span>
                                )}
                              </td>
                              <td>
                                <span style={{ fontSize: '12px', fontWeight: '500' }}>
                                  {roll.createdBy || '-'}
                                </span>
                              </td>
                              <td>
                                <div className={styles.rowActions}>
                                  {/* Edit Roll: Length, BS, Date */}
                                  <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.actionBtnEdit}`}
                                    onClick={() => setRollToEdit(roll)}
                                    title={`Edit Panjang & BS Qty Roll #${roll.id}`}
                                  >
                                    ✏️ Edit
                                  </button>

                                  {/* View / Edit Defect modal */}
                                  <button
                                    type="button"
                                    className={`${styles.actionBtn} ${
                                      hasDefect ? styles.actionBtnDefectActive : styles.actionBtnDefect
                                    }`}
                                    onClick={() => setDefectModalRoll(roll)}
                                    title="Lihat dan kelola titik inspeksi kain"
                                  >
                                    ⚠️ Inspeksi {hasDefect ? `(${rollDefects.length})` : ''}
                                  </button>

                                  {/* View / Edit Joined Piece */}
                                  <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={() => setJpModalRoll(roll)}
                                    title="Lihat dan kelola Joined Piece"
                                  >
                                    🧵 JP {rollJps.length > 0 ? `(${rollJps.length})` : ''}
                                  </button>

                                  {/* Print / View E-Ticket */}
                                  <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={() => setTicketModalRoll(roll)}
                                    title="Lihat / Cetak E-Ticket Cunda"
                                  >
                                    🖨️ E-Ticket
                                  </button>

                                  {/* Print / View Label */}
                                  <button
                                    type="button"
                                    className={styles.actionBtn}
                                    onClick={() => setLabelModalRoll(roll)}
                                    title="Lihat / Cetak Label Roll"
                                  >
                                    🏷️ Label
                                  </button>

                                  {/* Delete Roll */}
                                  <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                                    onClick={() => setRollToDelete(roll)}
                                    title={`Hapus Baris Roll #${roll.id}`}
                                  >
                                    🗑️ Hapus
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
              ) : (
                /* ── Co-Products Table View ── */
                <div className={styles.tableWrap}>
                  <table className={styles.rollTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '100px' }}>ID</th>
                        <th>Jenis Co-Product</th>
                        <th>Panjang</th>
                        <th>Mesin</th>
                        <th>Tanggal</th>
                        <th style={{ width: '120px' }}>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCoProducts.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '36px', color: 'var(--muted)' }}>
                            Belum ada baris Co-Product (BS/Jablak/Kecilan) pada order ini.
                          </td>
                        </tr>
                      ) : (
                        filteredCoProducts.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className={styles.rollNum}>#{item.id}</span>
                            </td>
                            <td>
                              <span className={styles.cardWoBadge}>{item.inventStatus}</span>
                            </td>
                            <td>
                              <span className={styles.lengthText}>{item.length}</span>{' '}
                              <span className={styles.unitText}>yard</span>
                            </td>
                            <td>
                              <span className={styles.machineTag}>M-{item.noMesin}</span>
                            </td>
                            <td>{item.transDate || '-'}</td>
                            <td>
                              <button
                                type="button"
                                className={`${styles.actionBtn} ${styles.actionBtnDelete}`}
                                onClick={() => handleDeleteCoProduct(item.id)}
                                title={`Hapus Co-Product #${item.id}`}
                              >
                                🗑️ Hapus
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── MODALS (VIEW, EDIT, DELETE ONLY - NO CREATE) ── */}

      {/* 1. Modal Edit Roll */}
      {rollToEdit && (
        <EditRollModal
          roll={rollToEdit}
          prodId={orderHeader?.ProdId}
          machineId={rollToEdit.noMesin}
          loading={savingEdit}
          onSave={handleSaveEditRoll}
          onClose={() => setRollToEdit(null)}
        />
      )}

      {/* 2. Modal Konfirmasi Hapus Roll */}
      {rollToDelete && (
        <ConfirmDeleteModal
          roll={rollToDelete}
          defectCount={(defects[rollToDelete.id] || []).length}
          loading={deletingRoll}
          onConfirm={handleConfirmDeleteRoll}
          onCancel={() => setRollToDelete(null)}
        />
      )}

      {/* 3. Modal Inspeksi Cacat Kain (canCreate = false: HANYA VIEW & DELETE) */}
      {defectModalRoll && (
        <DefectModal
          roll={defectModalRoll}
          prodId={orderHeader?.ProdId}
          isPreRoll={false}
          initDefects={defects[defectModalRoll.id] || []}
          initJoinedPieces={joinedPieces[defectModalRoll.id] || []}
          maxDefectLine={maxDefectLineByRoll[defectModalRoll.id] || 0}
          maxJoinedPieceLine={maxJoinedPieceLineByRoll[defectModalRoll.id] || 0}
          canCreate={false} // Pembatasan: Pengawas tidak dapat create inspeksi baru
          onSave={handleSaveDefects}
          onClose={() => setDefectModalRoll(null)}
        />
      )}

      {/* 4. Modal Joined Piece (canCreate = false: HANYA VIEW & DELETE) */}
      {jpModalRoll && (
        <JoinedPieceModal
          roll={jpModalRoll}
          prodId={orderHeader?.ProdId}
          initJoinedPieces={joinedPieces[jpModalRoll.id] || []}
          maxLineNumber={maxJoinedPieceLineByRoll[jpModalRoll.id] || 0}
          canCreate={false} // Pembatasan: Pengawas tidak dapat create joined piece baru
          onSave={handleSaveJoinedPieces}
          onClose={() => setJpModalRoll(null)}
        />
      )}

      {/* 5. Modal E-Ticket Preview & Print */}
      {ticketModalRoll && (
        <ETicketModal
          roll={ticketModalRoll}
          prodData={activeProdDataForModals}
          user={panelUser}
          defects={defects[ticketModalRoll.id] || []}
          joinedPieces={joinedPieces[ticketModalRoll.id] || []}
          onPrint={async () => {
            setRolls((prev) =>
              prev.map((r) => (r.id === ticketModalRoll.id ? { ...r, isPrinted: true } : r))
            )
          }}
          onClose={() => setTicketModalRoll(null)}
        />
      )}

      {/* 6. Modal Label Roll Preview & Print */}
      {labelModalRoll && (
        <RollLabelModal
          roll={labelModalRoll}
          prodData={activeProdDataForModals}
          user={panelUser}
          defects={defects[labelModalRoll.id] || []}
          onPrint={async () => {
            setRolls((prev) =>
              prev.map((r) => (r.id === labelModalRoll.id ? { ...r, isPrinted: true } : r))
            )
          }}
          onClose={() => setLabelModalRoll(null)}
        />
      )}

      {/* Notification Toast */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}
    </div>
  )
}

