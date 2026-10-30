import { useState, useCallback, useEffect } from 'react'
import { SCAN_DATA } from '../data/dummyData.js'
import AppHeader from '../components/AppHeader.jsx'
import ScanIdle from '../components/ScanIdle.jsx'
import InfoCards from '../components/InfoCards.jsx'
import RollTable from '../components/RollTable.jsx'
import ScanModal from '../components/ScanModal.jsx'
import DefectModal from '../components/DefectModal.jsx'
import MultiMachineReserveModal from '../components/MultiMachineReserveModal.jsx'
import Toast from '../components/Toast.jsx'
import { getAutonicData } from '../services/autonicService.js'
import { flushAutonicData } from '../services/autonicService.js'
import {
  saveCountingHeader,
  saveCountingData,
  getCountingData,
  markRollTicketPrinted,
  getNextRollInfo,
  deleteRollApi,
  updateRollLineApi,
  saveRollDefectsApi,
  updateRollStockApi,
} from '../services/api.js'
import styles from './MainPage.module.css'

function parseFormattedNumber(val) {
  if (val === undefined || val === null || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const cleaned = String(val).replace(/,/g, '').trim()
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : parsed
}

export default function MainPage({ user, onLogout, theme, onToggleTheme }) {
  const currentMachineId = String(user?.machine_id || user?.machineId || '1')

  // Baca active order dari sessionStorage / localStorage agar persist saat refresh
  const initialSavedOrder = (() => {
    try {
      const storageKey = `mpm_active_order_${currentMachineId}`
      const saved = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })()

  const [scanned, setScanned] = useState(() => Boolean(initialSavedOrder?.prodId))
  const [showScan, setShowScan] = useState(false)
  const [loadingScan, setLoadingScan] = useState(() => Boolean(initialSavedOrder?.prodId))

  // Data order produksi aktif (bisa dari DB atau order baru)
  const [prodData, setProdData] = useState(() => {
    if (initialSavedOrder?.prodId) {
      return {
        ...SCAN_DATA,
        prodNumber: initialSavedOrder.prodId,
        seqmentNum: initialSavedOrder.seqmentNum || initialSavedOrder.noWo || initialSavedOrder.prodId,
        customer: initialSavedOrder.customer || initialSavedOrder.custCode || SCAN_DATA.customer,
        custCode: initialSavedOrder.custCode || initialSavedOrder.customer || '',
        fabricType: initialSavedOrder.design || initialSavedOrder.designCode || SCAN_DATA.fabricType,
        designCode: initialSavedOrder.designCode || initialSavedOrder.design || '',
        color: initialSavedOrder.color || SCAN_DATA.color,
        recidProdId: initialSavedOrder.recidProdId || '',
        recidSalesId: initialSavedOrder.recidSalesId || '',
        recidItemId: initialSavedOrder.recidItemId || '',
        orderQty: parseFormattedNumber(initialSavedOrder.orderQty),
        stockQty: parseFormattedNumber(initialSavedOrder.stockQty),
        k3lNumber: initialSavedOrder.k3lNumber || initialSavedOrder.K3LNumber || '',
        k3lName: initialSavedOrder.k3lName || initialSavedOrder.K3LName || '',
        K3LNumber: initialSavedOrder.K3LNumber || initialSavedOrder.k3lNumber || '',
        K3LName: initialSavedOrder.K3LName || initialSavedOrder.k3lName || '',
        noMesin: currentMachineId,
        userId: user?.username || user?.name || 'operator',
        isFromDb: true,
      }
    }
    return SCAN_DATA
  })

  // Daftar roll kain lokal
  const [rolls, setRolls] = useState([])
  const [defectModal, setDefectModal] = useState(null) // roll object | null
  const [defects, setDefects] = useState({}) // { rollId: [{id, yard, code}] }
  const [pendingDefects, setPendingDefects] = useState([]) // Catatan cacat sementara saat roll belum terbentuk
  const [toastMsg, setToastMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // State untuk Multi-Mesin & Roll Reserve
  const [startRollNumber, setStartRollNumber] = useState(initialSavedOrder?.startRollNumber || null)
  const [existingDbRolls, setExistingDbRolls] = useState([])
  const [rollsByMachine, setRollsByMachine] = useState({})
  const [maxRollNumber, setMaxRollNumber] = useState(0)
  const [maxOtherRollNumber, setMaxOtherRollNumber] = useState(0)
  const [mandatoryReserveModal, setMandatoryReserveModal] = useState(null)

  const updateStartRollNumber = useCallback((val) => {
    setStartRollNumber(val)
    try {
      const storageKey = `mpm_active_order_${currentMachineId}`
      const existingStr = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey)
      if (existingStr) {
        const parsed = JSON.parse(existingStr)
        parsed.startRollNumber = val
        sessionStorage.setItem(storageKey, JSON.stringify(parsed))
        localStorage.setItem(storageKey, JSON.stringify(parsed))
      }
    } catch (e) {
      console.warn('Gagal sync startRollNumber ke session:', e)
    }
  }, [currentMachineId])

  const updatePendingDefects = useCallback((list) => {
    setPendingDefects(list)
    if (!prodData?.prodNumber) return
    try {
      const storageKey = `pending_defects_${prodData.prodNumber}_${currentMachineId}`
      if (list && list.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(list))
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch (e) {
      console.warn('Gagal sync pendingDefects ke localStorage:', e)
    }
  }, [prodData?.prodNumber, currentMachineId])

  const totalDefects = Object.values(defects).reduce((sum, arr) => sum + arr.length, 0)

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }

  // Helper untuk refresh info roll antar mesin
  const refreshMultiMachineStats = useCallback(async (prodId) => {
    if (!prodId) return
    const machineId = String(user?.machine_id || user?.machineId || '1')
    try {
      const stats = await getNextRollInfo(prodId, machineId)
      if (stats) {
        setExistingDbRolls(stats.lines || [])
        setRollsByMachine(stats.rollsByMachine || {})
        setMaxRollNumber(stats.maxRoll || 0)
      }
      return stats
    } catch (err) {
      console.warn('Gagal memuat statistik multi-mesin:', err)
      return null
    }
  }, [user])

  /**
   * Handle selesai scan barcode / input manual:
   * 1. Otomatis simpan nomor produksi ke tabel CountingKainHeader database
   * 2. Ambil info lines & multi-mesin yang sudah ada
   * 3. Siapkan nomor roll lanjutan yang unik (bebas duplikat)
   * 4. Simpan order aktif ke session agar tidak hilang saat refresh
   */
  async function handleScanComplete(scannedInput, isRestoring = false) {
    setShowScan(false)
    setLoadingScan(true)

    // Parsing input: mendukung objek hasil ScanModal atau string "ProdId;NoWO(seqment);cust code;design code;color"
    let parsed
    if (typeof scannedInput === 'object' && scannedInput !== null) {
      parsed = scannedInput
    } else {
      const raw = String(scannedInput || SCAN_DATA.prodNumber).trim()
      if (raw.includes(';')) {
        const parts = raw.split(';').map((p) => p.trim())
        parsed = {
          prodId: parts[0] || '',
          seqmentNum: parts[1] || parts[0] || '',
          noWo: parts[1] || parts[0] || '',
          customer: parts[2] || '',
          custCode: parts[2] || '',
          design: parts[3] || '',
          designCode: parts[3] || '',
          color: parts[4] || '',
          recidProdId: parts[5] || '',
          recidSalesId: parts[6] || '',
          recidItemId: parts[7] || '',
          orderQty: parseFormattedNumber(parts[8]),
          stockQty: parseFormattedNumber(parts[9]),
          k3lNumber: parts[10] || '',
          k3lName: parts[11] || '',
          K3LNumber: parts[10] || '',
          K3LName: parts[11] || '',
        }
      } else {
        parsed = {
          prodId: raw,
          seqmentNum: raw,
          noWo: raw,
          customer: '',
          custCode: '',
          design: '',
          designCode: '',
          color: '',
          recidProdId: '',
          recidSalesId: '',
          recidItemId: '',
          orderQty: 0,
          stockQty: 0,
          k3lNumber: '',
          k3lName: '',
          K3LNumber: '',
          K3LName: '',
        }
      }
    }

    const targetProdId = (parsed.prodId || SCAN_DATA.prodNumber).trim()
    const targetSeqment = (parsed.seqmentNum || parsed.noWo || targetProdId).trim()
    const targetCustomer = (parsed.custCode || parsed.customer || '').trim()
    const targetDesign = (parsed.designCode || parsed.design || '').trim()
    const targetColor = (parsed.color || '').trim()
    const targetRecidProdId = (parsed.recidProdId || '').trim()
    const targetRecidSalesId = (parsed.recidSalesId || '').trim()
    const targetRecidItemId = (parsed.recidItemId || '').trim()
    const targetOrderQty = parseFormattedNumber(parsed.orderQty)
    const targetStockQty = parseFormattedNumber(parsed.stockQty)
    const targetK3LNumber = (parsed.k3lNumber || parsed.K3LNumber || '').trim()
    const targetK3LName = (parsed.k3lName || parsed.K3LName || '').trim()
    const machineId = String(user?.machine_id || user?.machineId || '1')
    const userId = user?.username || user?.name || 'operator'

    // Simpan data order aktif ke session & local storage
    try {
      const storageKey = `mpm_active_order_${machineId}`
      const sessionPayload = {
        prodId: targetProdId,
        seqmentNum: targetSeqment,
        noWo: targetSeqment,
        customer: targetCustomer,
        custCode: targetCustomer,
        design: targetDesign,
        designCode: targetDesign,
        color: targetColor,
        recidProdId: targetRecidProdId,
        recidSalesId: targetRecidSalesId,
        recidItemId: targetRecidItemId,
        orderQty: targetOrderQty,
        stockQty: targetStockQty,
        k3lNumber: targetK3LNumber,
        k3lName: targetK3LName,
        K3LNumber: targetK3LNumber,
        K3LName: targetK3LName,
        startRollNumber: parsed.startRollNumber || startRollNumber || null,
        scannedAt: new Date().toISOString(),
      }
      sessionStorage.setItem(storageKey, JSON.stringify(sessionPayload))
      localStorage.setItem(storageKey, JSON.stringify(sessionPayload))
    } catch (e) {
      console.warn('Gagal menyimpan sesi order produksi:', e)
    }

    try {
      // 1. Simpan langsung nomor produksi ke tabel CountingKainHeader
      let headerSaveSuccess = false
      try {
        await saveCountingHeader({
          ProdId: targetProdId,
          NoMesin: machineId,
          UserId: userId,
          SeqmentNum: targetSeqment,
          CustCode: targetCustomer,
          DesignCode: targetDesign,
          Color: targetColor,
          RecidProdId: targetRecidProdId,
          RecidSalesId: targetRecidSalesId,
          RecidItemId: targetRecidItemId,
          OrderQty: targetOrderQty,
          StockQty: targetStockQty,
          K3LNumber: targetK3LNumber,
          K3LName: targetK3LName,
        })
        headerSaveSuccess = true
      } catch (headErr) {
        console.warn('Simpan CountingKainHeader:', headErr.message)
      }

      // 2. Ambil data dari database PostgreSQL difilter khusus NoMesin yang login
      const dbRecord = await getCountingData(targetProdId, machineId)

      // 3. Ambil statistik multi-mesin untuk order ini
      const multiStats = await refreshMultiMachineStats(targetProdId)

      // Cari roll tertinggi milik mesin lain
      const allDbLines = dbRecord?.allLines || multiStats?.lines || []
      const otherMachineLines = allDbLines.filter(
        (l) => String(l.NoMesin || '').trim() !== machineId
      )
      const maxOtherRoll = otherMachineLines.length > 0
        ? Math.max(...otherMachineLines.map((l) => l.RoolNumber || 0))
        : 0
      setMaxOtherRollNumber(maxOtherRoll)

      if (dbRecord && (dbRecord.lines?.length > 0 || headerSaveSuccess || allDbLines.length > 0)) {
        // === KONDISI: TERSIMPAN / DITEMUKAN DI DATABASE ===
        setProdData({
          ...SCAN_DATA,
          prodNumber: dbRecord.ProdId || targetProdId,
          seqmentNum: dbRecord.SeqmentNum || targetSeqment || dbRecord.ProdId || targetProdId,
          customer: dbRecord.CustCode || targetCustomer || SCAN_DATA.customer,
          custCode: dbRecord.CustCode || targetCustomer || '',
          fabricType: dbRecord.DesignCode || targetDesign || SCAN_DATA.fabricType,
          designCode: dbRecord.DesignCode || targetDesign || '',
          color: dbRecord.Color || targetColor || SCAN_DATA.color,
          recidProdId: dbRecord.RecidProdId || targetRecidProdId || '',
          recidSalesId: dbRecord.RecidSalesId || targetRecidSalesId || '',
          recidItemId: dbRecord.RecidItemId || targetRecidItemId || '',
          orderQty: dbRecord.OrderQty !== undefined && dbRecord.OrderQty !== null ? parseFormattedNumber(dbRecord.OrderQty) : targetOrderQty,
          stockQty: dbRecord.StockQty !== undefined && dbRecord.StockQty !== null ? parseFormattedNumber(dbRecord.StockQty) : targetStockQty,
          k3lNumber: dbRecord.K3LNumber || targetK3LNumber || '',
          k3lName: dbRecord.K3LName || targetK3LName || '',
          K3LNumber: dbRecord.K3LNumber || targetK3LNumber || '',
          K3LName: dbRecord.K3LName || targetK3LName || '',
          noMesin: machineId,
          userId: dbRecord.UserId || userId,
          isFromDb: true,
        })

        // Map baris roll dari tabel CountingKainLines (HANYA MILIK MESIN YANG LOGIN)
        const loadedRolls = (dbRecord.lines || []).map((l) => {
          let parsedBs = 0
          if (l.Description) {
            const match = l.Description.match(/BS:\s*([\d.]+)/i)
            if (match) {
              parsedBs = parseFloat(match[1]) || 0
            }
          }
          return {
            id: l.RoolNumber,
            length: parseFloat(l.Length) || 0,
            bsQty: parsedBs,
            noMesin: String(l.NoMesin || machineId),
            isPrinted: Boolean(l.isPrinted),
            description: l.Description || `Roll #${l.RoolNumber}`,
            isExecute: Boolean(l.IsExecute),
            isStock: Boolean(l.isStock),
            qrNum: l.QrNum || l.qrNum || '',
          }
        })

        // Map titik cacat dari tabel CountingKainDefect
        const loadedDefects = {}
        if (Array.isArray(dbRecord.defects)) {
          for (const d of dbRecord.defects) {
            const rId = d.RoolNumber
            if (!loadedDefects[rId]) loadedDefects[rId] = []
            const displayCode = d.Description && d.Description !== d.Code
              ? `${d.Code} – ${d.Description}`
              : d.Code
            loadedDefects[rId].push({
              id: d.LineNumber || Date.now() + Math.random(),
              yard: parseFloat(d.LengthPoint) || 0,
              code: displayCode,
              isExecuted: Boolean(d.IsExecuted),
              lineNumber: d.LineNumber,
            })
          }
        }

        setRolls(loadedRolls)
        setDefects(loadedDefects)
        setScanned(true)

        // ATURAN MULTI-MESIN:
        // Cek apakah order ini dibuka pertama kali oleh mesin lain
        const firstMachineId = String(dbRecord.NoMesin || '').trim()
        const isOtherMachineOwner = Boolean(firstMachineId && firstMachineId !== String(machineId).trim())

        // WAJIB ISI STARTING ROLL JIKA:
        // 1. Sudah ada roll dari mesin lain (allDbLines.length > 0) dan untuk mesin ini masih 0
        // ATAU
        // 2. Belum ada roll sama sekali, TAPI order ini dibuka pertama kali oleh mesin lain (isOtherMachineOwner === true)!
        const shouldTriggerMandatoryReserve = loadedRolls.length === 0 && (
          allDbLines.length > 0 || isOtherMachineOwner
        )

        if (shouldTriggerMandatoryReserve) {
          const fallbackMachineBlock = String(machineId).trim() === '2' ? 51 : (String(machineId).trim() === '3' ? 101 : 51)
          const defaultStart = maxOtherRoll > 0
            ? maxOtherRoll + 10
            : (isOtherMachineOwner ? fallbackMachineBlock : 1)

          if (parsed.startRollNumber) {
            setStartRollNumber(parsed.startRollNumber)
          } else {
            setStartRollNumber(defaultStart)
            setMandatoryReserveModal({
              prodId: targetProdId,
              currentMachineId: machineId,
              firstMachineId: firstMachineId,
              suggestedStart: defaultStart,
              maxOtherRoll,
            })
            showToast(
              maxOtherRoll > 0
                ? `ℹ️ Order '${targetProdId}' aktif di mesin lain. Mesin #${machineId} wajib mengisi starting roll (Rekomendasi: #${defaultStart}).`
                : `ℹ️ Order '${targetProdId}' dibuka pertama kali oleh Mesin #${firstMachineId}. Mesin #${machineId} wajib menentukan starting roll.`
            )
          }
        } else if (loadedRolls.length > 0) {
          showToast(isRestoring
            ? `✓ Sesi order '${targetProdId}' dipulihkan (${loadedRolls.length} roll untuk Mesin #${machineId}).`
            : `✓ Order '${targetProdId}' aktif (${loadedRolls.length} roll untuk Mesin #${machineId}).`
          )
        } else {
          showToast(isRestoring
            ? `✓ Sesi order '${targetProdId}' dipulihkan. Siap produksi!`
            : `✓ Order '${targetProdId}' siap diproduksi!`
          )
        }
      } else {
        // === KONDISI B: ORDER BARU ===
        setProdData({
          ...SCAN_DATA,
          prodNumber: targetProdId,
          seqmentNum: targetSeqment || targetProdId,
          customer: targetCustomer || SCAN_DATA.customer,
          custCode: targetCustomer || '',
          fabricType: targetDesign || SCAN_DATA.fabricType,
          designCode: targetDesign || '',
          color: targetColor || SCAN_DATA.color,
          recidProdId: targetRecidProdId || '',
          recidSalesId: targetRecidSalesId || '',
          recidItemId: targetRecidItemId || '',
          orderQty: targetOrderQty,
          stockQty: targetStockQty,
          k3lNumber: targetK3LNumber,
          k3lName: targetK3LName,
          K3LNumber: targetK3LNumber,
          K3LName: targetK3LName,
          noMesin: machineId,
          userId: userId,
          isFromDb: true,
        })

        setRolls([])
        setDefects({})
        setScanned(true)
        showToast(isRestoring
          ? `✓ Sesi order '${targetProdId}' dipulihkan. Siap produksi!`
          : `✓ Nomor '${targetProdId}' siap diproduksi!`
        )
      }
    } catch (err) {
      console.error('Error saat memeriksa barcode di database:', err)
      setProdData({
        ...SCAN_DATA,
        prodNumber: targetProdId,
        seqmentNum: targetSeqment || targetProdId,
        customer: targetCustomer || SCAN_DATA.customer,
        custCode: targetCustomer || '',
        fabricType: targetDesign || SCAN_DATA.fabricType,
        designCode: targetDesign || '',
        color: targetColor || SCAN_DATA.color,
        recidProdId: targetRecidProdId || '',
        recidSalesId: targetRecidSalesId || '',
        recidItemId: targetRecidItemId || '',
        orderQty: targetOrderQty,
        stockQty: targetStockQty,
        k3lNumber: targetK3LNumber,
        k3lName: targetK3LName,
        K3LNumber: targetK3LNumber,
        K3LName: targetK3LName,
        isFromDb: false,
      })
      setRolls([])
      setScanned(true)
      showToast(isRestoring
        ? `Sesi order '${targetProdId}' dimuat kembali.`
        : `Nomor '${targetProdId}' disiapkan sebagai order baru.`
      )
    } finally {
      // Muat catatan cacat sementara untuk order ini jika pernah tersimpan di browser
      try {
        const savedPending = localStorage.getItem(`pending_defects_${targetProdId}_${machineId}`)
        if (savedPending) {
          const parsed = JSON.parse(savedPending)
          setPendingDefects(Array.isArray(parsed) ? parsed : [])
        } else {
          setPendingDefects([])
        }
      } catch {
        setPendingDefects([])
      }
      setLoadingScan(false)
    }
  }

  /**
   * Simpan Manual semua data ke PostgreSQL
   */
  async function handleSave() {
    if (rolls.length === 0) {
      showToast('Tidak ada data roll untuk disimpan.')
      return
    }

    setSaving(true)
    try {
      const prodId = prodData.prodNumber
      const noMesin = String(user?.machine_id || user?.machineId || '1')
      const userId = user?.username || user?.name || 'user'

      const linesPayload = rolls.map((r) => ({
        RoolNumber: r.id,
        Description: `Roll #${r.id} (${r.length} yard)`,
        Length: r.length,
        IsExecute: Boolean(r.isExecute || false),
        NoMesin: String(r.noMesin || noMesin),
        isPrinted: Boolean(r.isPrinted || false),
        isStock: Boolean(r.isStock || false),
        QrNum: r.qrNum || undefined,
      }))

      const result = await saveCountingData({
        ProdId: prodId,
        NoMesin: noMesin,
        UserId: userId,
        SeqmentNum: prodData.seqmentNum || '',
        CustCode: prodData.custCode || prodData.customer || '',
        DesignCode: prodData.designCode || prodData.fabricType || '',
        Color: prodData.color || '',
        RecidProdId: prodData.recidProdId || '',
        RecidSalesId: prodData.recidSalesId || '',
        RecidItemId: prodData.recidItemId || '',
        OrderQty: prodData.orderQty || 0,
        StockQty: prodData.stockQty || 0,
        K3LNumber: prodData.k3lNumber || prodData.K3LNumber || '',
        K3LName: prodData.k3lName || prodData.K3LName || '',
        lines: linesPayload,
      })

      setProdData((prev) => ({ ...prev, isFromDb: true }))
      await refreshMultiMachineStats(prodId)

      showToast(`✓ Data berhasil disimpan (${result.data?.linesCount || rolls.length} roll)!`)
    } catch (err) {
      console.error('Error saat menyimpan data counting:', err)
      showToast(`Gagal menyimpan: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Tarik Data Mesin:
   * Step 1: Jalankan API untuk mengambil data dari sensor mesin (tanpa flush/hapus)
   */
  async function handleFetchSensor(machineId) {
    return await getAutonicData(machineId)
  }

  /**
   * Step 2: Simpan roll ke tabel CountingKainLines, lalu FLUSH setelah data tersimpan
   */
  async function handleSaveRollFromSensor(sensorData, assignedRollId) {
    const machineId = String(user?.machine_id || user?.machineId || 1)
    const prodId = prodData.prodNumber
    const lengthVal = parseFloat(sensorData?.Length ?? sensorData?.length) || 0

    // Tentukan nomor roll berikutnya
    let nextId = assignedRollId
    if (!nextId) {
      const allUsedRolls = new Set([
        ...rolls.map((r) => r.id),
        ...existingDbRolls.map((r) => r.RoolNumber),
      ])
      const machineRolls = rolls.filter(
        (r) => String(r.noMesin || machineId) === String(machineId)
      )
      const localMachineMax = machineRolls.length > 0 ? Math.max(...machineRolls.map((r) => r.id)) : 0
      const dbMachineRolls = (rollsByMachine[machineId]?.rolls) || []
      const dbMachineMax = dbMachineRolls.length > 0 ? Math.max(...dbMachineRolls) : 0
      const activeMachineMax = Math.max(localMachineMax, dbMachineMax)

      if (startRollNumber) {
        nextId = startRollNumber
      } else if (activeMachineMax > 0) {
        nextId = activeMachineMax + 1
      } else {
        const globalMax = Math.max(
          rolls.length > 0 ? Math.max(...rolls.map((r) => r.id)) : 0,
          maxRollNumber || 0
        )
        nextId = machineId === '1' && globalMax === 0 ? 1 : (globalMax > 0 ? globalMax + 1 : 1)
      }

      while (allUsedRolls.has(nextId)) {
        nextId += 1
      }
    }

    const newRoll = {
      id: nextId,
      length: lengthVal,
      bsQty: 0,
      noMesin: machineId,
      isPrinted: false,
      isExecute: false,
    }

    // 1. Simpan data roll ke database PostgreSQL tabel CountingKainLines
    const saveRes = await saveCountingData({
      ProdId: prodId,
      NoMesin: machineId,
      UserId: user?.username || user?.name || 'operator',
      SeqmentNum: prodData.seqmentNum || '',
      CustCode: prodData.custCode || prodData.customer || '',
      DesignCode: prodData.designCode || prodData.fabricType || '',
      Color: prodData.color || '',
      RecidProdId: prodData.recidProdId || '',
      RecidSalesId: prodData.recidSalesId || '',
      RecidItemId: prodData.recidItemId || '',
      OrderQty: prodData.orderQty || 0,
      StockQty: prodData.stockQty || 0,
      K3LNumber: prodData.k3lNumber || prodData.K3LNumber || '',
      K3LName: prodData.k3lName || prodData.K3LName || '',
      lines: [
        {
          RoolNumber: nextId,
          Description: `Roll #${nextId} (${lengthVal} yard)`,
          Length: lengthVal,
          IsExecute: false,
          NoMesin: machineId,
          isPrinted: false,
          isStock: false,
        },
      ],
    })

    const savedLine = saveRes?.data?.lines?.[0]
    const finalIsStock = Boolean(savedLine?.isStock ?? false)
    const createdRoll = {
      ...newRoll,
      isStock: finalIsStock,
      qrNum: savedLine?.QrNum || '',
    }

    // Update state frontend
    setRolls((prev) => [...prev, createdRoll])
    if (startRollNumber !== null && nextId >= startRollNumber) {
      updateStartRollNumber(nextId + 1)
    }

    if (finalIsStock) {
      showToast(`📦 Roll #${nextId} (${lengthVal} yd) dicatat sebagai Kain Stock (Kuota Order terpenuhi)`)
    }

    // 2. Hubungkan catatan cacat sementara (jika ada) ke roll baru
    if (pendingDefects.length > 0) {
      const defectsToSave = pendingDefects.map((d, idx) => ({
        id: d.id || Date.now() + idx,
        yard: parseFloat(d.yard) || 0,
        code: d.code,
        isExecuted: false,
        lineNumber: idx + 1,
      }))

      try {
        await saveRollDefectsApi(prodId, nextId, defectsToSave)
        setDefects((prev) => ({
          ...prev,
          [nextId]: defectsToSave,
        }))
        updatePendingDefects([])
        showToast(`✓ Data Mesin #${machineId} (${lengthVal} yd) tersimpan di Roll #${nextId} & ${defectsToSave.length} titik cacat tersimpan di.`)
      } catch (errDefect) {
        console.error('Error saat menyimpan cacat sementara:', errDefect)
        setDefects((prev) => ({
          ...prev,
          [nextId]: defectsToSave,
        }))
        updatePendingDefects([])
        showToast(`Roll #${nextId} tersimpan. Cacat tersimpan lokal (Gagal simpan: ${errDefect.message})`)
      }
    } else {
      showToast(`✓ Data Mesin #${machineId} (${lengthVal} yd) berhasil disimpan di Roll #${nextId}.`)
    }

    // 3. SETELAH data berhasil tersimpan di tabel tadi, baru jalankan flush!
    try {
      await flushAutonicData(machineId)
      console.log(`[Flush] Antrean sensor Mesin #${machineId} berhasil diflush setelah tersimpan di CountingKainLines.`)
    } catch (flushErr) {
      console.warn('[Flush Warning] Gagal flush antrean mesin:', flushErr.message)
    }

    await refreshMultiMachineStats(prodId)
  }

  // Alias untuk kompatibilitas jika dipanggil langsung
  async function handleGetData() {
    const machineId = String(user?.machine_id || user?.machineId || 1)
    const sensorData = await handleFetchSensor(machineId)
    await handleSaveRollFromSensor(sensorData)
  }

  /**
   * Hapus Roll:
   * Otomatis langsung hapus baris roll dari database (CountingKainLines)
   */
  async function handleDeleteRoll(rollId) {
    const prodId = prodData.prodNumber

    try {
      // Hapus otomatis langsung dari database PostgreSQL
      await deleteRollApi(prodId, rollId)

      setRolls((prev) => prev.filter((r) => r.id !== rollId))
      setDefects((prev) => {
        const next = { ...prev }
        delete next[rollId]
        return next
      })

      await refreshMultiMachineStats(prodId)
      showToast(`✓ Roll #${rollId} berhasil dihapus.`)
    } catch (err) {
      console.error('Error saat menghapus roll:', err)
      // Fallback update frontend jika belum ada di
      setRolls((prev) => prev.filter((r) => r.id !== rollId))
      showToast(`Roll #${rollId} dihapus dari daftar lokal (${err.message})`)
    }
  }

  /**
   * Cetak E-Ticket:
   * Saat E-Ticket dicetak, otomatis update field isPrinted = true di database
   */
  async function handlePrintRoll(roll) {
    const prodId = prodData.prodNumber
    try {
      await markRollTicketPrinted(prodId, roll.id)

      setRolls((prev) =>
        prev.map((r) => (r.id === roll.id ? { ...r, isPrinted: true } : r))
      )

      showToast(`✓ E-Ticket Roll #${roll.id} berhasil dicetak.`)
    } catch (err) {
      console.error('Error saat update status cetak di database:', err)
      showToast(`E-Ticket dicetak (namun status gagal diperbarui: ${err.message})`)
    }
  }

  /**
   * Tambah Roll Manual dengan pencegahan duplikat
   */
  async function handleAddManualRoll(newRoll) {
    const prodId = prodData.prodNumber
    const machineId = String(user?.machine_id || user?.machineId || '1')

    const allUsedRolls = new Set([
      ...rolls.map((r) => r.id),
      ...existingDbRolls.map((r) => r.RoolNumber),
    ])

    if (allUsedRolls.has(newRoll.id)) {
      showToast(`⚠️ Nomor Roll #${newRoll.id} sudah ada dalam daftar order ini!`)
      return
    }

    const fullRoll = {
      ...newRoll,
      noMesin: machineId,
      isPrinted: false,
      isExecute: false,
    }

    try {
      // Simpan langsung ke DB
      const saveRes = await saveCountingData({
        ProdId: prodId,
        NoMesin: machineId,
        UserId: user?.username || user?.name || 'operator',
        SeqmentNum: prodData.seqmentNum || '',
        CustCode: prodData.custCode || prodData.customer || '',
        DesignCode: prodData.designCode || prodData.fabricType || '',
        Color: prodData.color || '',
        RecidProdId: prodData.recidProdId || '',
        RecidSalesId: prodData.recidSalesId || '',
        RecidItemId: prodData.recidItemId || '',
        OrderQty: prodData.orderQty || 0,
        StockQty: prodData.stockQty || 0,
        K3LNumber: prodData.k3lNumber || prodData.K3LNumber || '',
        K3LName: prodData.k3lName || prodData.K3LName || '',
        lines: [
          {
            RoolNumber: fullRoll.id,
            Description: `Roll #${fullRoll.id} (${fullRoll.length} yard)`,
            Length: fullRoll.length,
            IsExecute: false,
            NoMesin: machineId,
            isPrinted: false,
            isStock: Boolean(fullRoll.isStock),
          },
        ],
      })

      const savedLine = saveRes?.data?.lines?.[0]
      const savedRoll = {
        ...fullRoll,
        isStock: Boolean(savedLine?.isStock ?? fullRoll.isStock),
        qrNum: savedLine?.QrNum || '',
      }

      setRolls((prev) => [...prev, savedRoll])
      if (startRollNumber !== null && fullRoll.id >= startRollNumber) {
        setStartRollNumber(fullRoll.id + 1)
      }

      // Jika ada catatan cacat sementara saat roll belum terbentuk, simpan ke roll manual ini
      if (pendingDefects.length > 0) {
        const defectsToSave = pendingDefects.map((d, idx) => ({
          id: d.id || Date.now() + idx,
          yard: parseFloat(d.yard) || 0,
          code: d.code,
          isExecuted: false,
          lineNumber: idx + 1,
        }))

        try {
          await saveRollDefectsApi(prodId, fullRoll.id, defectsToSave)
          setDefects((prev) => ({
            ...prev,
            [fullRoll.id]: defectsToSave,
          }))
          updatePendingDefects([])
          showToast(`✓ Roll #${fullRoll.id} (${fullRoll.length} yd) & ${defectsToSave.length} titik cacat berhasil ditambahkan & tersimpan!`)
        } catch (errDefect) {
          console.error('Error saat simpan cacat :', errDefect)
          setDefects((prev) => ({
            ...prev,
            [fullRoll.id]: defectsToSave,
          }))
          updatePendingDefects([])
          showToast(`Roll #${fullRoll.id} ditambahkan. Cacat tersimpan lokal (${errDefect.message})`)
        }
      } else {
        showToast(`✓ Roll #${fullRoll.id} (${fullRoll.length} yard) berhasil ditambahkan ke Mesin #${machineId}!`)
      }

      await refreshMultiMachineStats(prodId)
    } catch (err) {
      console.error('Error saat simpan roll manual:', err)
      setRolls((prev) => [...prev, fullRoll])
      showToast(`Roll #${fullRoll.id} ditambahkan ke daftar lokal (${err.message})`)
    }
  }

  /**
   * Edit Line Roll (Length & BS Qty)
   * ATURAN KHUSUS: Ketika update lines jika isExecute = true di update jadi false!
   */
  async function handleEditRoll(rollId, { length, bsQty }) {
    const prodId = prodData.prodNumber
    const parsedLength = parseFloat(length)
    const parsedBs = parseFloat(bsQty !== undefined && bsQty !== null ? bsQty : 0)
    const machineId = String(user?.machine_id || user?.machineId || '1')

    if (isNaN(parsedLength) || parsedLength <= 0) {
      showToast('⚠️ Panjang roll harus berupa angka lebih dari 0.')
      return
    }

    if (isNaN(parsedBs) || parsedBs < 0) {
      showToast('⚠️ BS Qty tidak boleh bernilai negatif.')
      return
    }

    if (parsedBs >= parsedLength) {
      showToast(`⚠️ BS Qty (${parsedBs} yd) harus di bawah panjang roll (${parsedLength} yd).`)
      return
    }

    const currentRoll = rolls.find((r) => r.id === rollId)
    const wasExecuted = Boolean(currentRoll?.isExecute)
    // ATURAN: jika isExecute = true di update jadi false!
    const newIsExecute = wasExecuted ? false : Boolean(currentRoll?.isExecute)

    const updatedDescription = parsedBs > 0
      ? `Roll #${rollId} (${parsedLength} yard) | BS: ${parsedBs} yd`
      : `Roll #${rollId} (${parsedLength} yard)`

    const updatedRoll = {
      ...(currentRoll || {}),
      id: rollId,
      length: parsedLength,
      bsQty: parsedBs,
      description: updatedDescription,
      isExecute: newIsExecute,
      noMesin: currentRoll?.noMesin || machineId,
      isPrinted: Boolean(currentRoll?.isPrinted),
    }

    // 1. Update state rolls lokal
    setRolls((prev) => prev.map((r) => (r.id === rollId ? updatedRoll : r)))

    // 2. Simpan update ke database PostgreSQL
    try {
      await updateRollLineApi(prodId, rollId, {
        length: parsedLength,
        bsQty: parsedBs,
        description: updatedDescription,
        isExecute: newIsExecute,
        noMesin: updatedRoll.noMesin,
        isPrinted: updatedRoll.isPrinted,
      })

      if (wasExecuted) {
        showToast(`✓ Roll #${rollId} berhasil diupdate (${parsedLength} yd, BS: ${parsedBs} yd). isExecute diubah jadi false.`)
      } else {
        showToast(`✓ Roll #${rollId} berhasil diupdate (${parsedLength} yd, BS: ${parsedBs} yd).`)
      }

      await refreshMultiMachineStats(prodId)
    } catch (err) {
      console.error('Error saat update roll di database:', err)
      showToast(`Roll #${rollId} diupdate lokal (${err.message})`)
    }
  }

  function handleUpdateBsQty(rollId, newBsQty) {
    const roll = rolls.find((r) => r.id === rollId)
    if (roll) {
      handleEditRoll(rollId, { length: roll.length, bsQty: newBsQty })
    }
  }

  /**
   * Toggle status isStock roll (Stock S vs Order O) dan update format QrNum
   */
  async function handleToggleStock(rollId, isStock) {
    const prodId = prodData.prodNumber
    try {
      const res = await updateRollStockApi(prodId, rollId, isStock)
      const updatedLine = res?.data
      const updatedQr = updatedLine?.QrNum || ''

      setRolls((prev) =>
        prev.map((r) =>
          r.id === rollId
            ? {
              ...r,
              isStock: Boolean(updatedLine?.isStock ?? isStock),
              qrNum: updatedQr || r.qrNum,
            }
            : r
        )
      )

      showToast(
        `✓ Roll #${rollId} diubah ke ${isStock ? 'Kain Stock' : 'Order'}${updatedQr ? ` • ${updatedQr}` : ''}`
      )
    } catch (err) {
      console.error('Error saat update isStock:', err)
      showToast(`⚠️ Gagal mengubah status stock: ${err.message}`)
    }
  }

  async function saveDefects(rollId, list) {
    setDefects((prev) => ({ ...prev, [rollId]: list }))
    setDefectModal(null)

    const prodId = prodData.prodNumber
    if (!prodId) return

    try {
      await saveRollDefectsApi(prodId, rollId, list)
      showToast(`✓ Catatan cacat Roll #${rollId} (${list.length} titik) berhasil disimpan.`)
    } catch (err) {
      console.error('Error saat menyimpan cacat :', err)
      showToast(`Cacat Roll #${rollId} tersimpan lokal (Gagal simpan: ${err.message})`)
    }
  }

  // Pulihkan sesi order produksi dari session storage saat pertama kali mount / refresh
  useEffect(() => {
    if (initialSavedOrder?.prodId) {
      handleScanComplete(initialSavedOrder, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleResetScan() {
    try {
      const storageKey = `mpm_active_order_${currentMachineId}`
      sessionStorage.removeItem(storageKey)
      localStorage.removeItem(storageKey)
    } catch (e) {
      console.warn('Gagal menghapus sesi order:', e)
    }
    setScanned(false)
    setDefects({})
    setRolls([])
    updatePendingDefects([])
    setStartRollNumber(null)
    setExistingDbRolls([])
    setRollsByMachine({})
    setMaxRollNumber(0)
    setMaxOtherRollNumber(0)
    setMandatoryReserveModal(null)
    setProdData(SCAN_DATA)
  }

  return (
    <div className={styles.wrapper}>
      <AppHeader
        user={user}
        onLogout={onLogout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <main className={styles.content}>
        {loadingScan ? (
          <div className={styles.idleWrap}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>
                🔄
              </div>
              <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text)' }}>
                Memuat data produksi…
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                Menyiapkan informasi order & roll
              </div>
            </div>
          </div>
        ) : !scanned ? (
          <div className={styles.idleWrap}>
            <ScanIdle user={user} onScan={() => setShowScan(true)} />
          </div>
        ) : (
          <>
            <InfoCards
              data={prodData}
              user={user}
              totalDefects={totalDefects}
              pendingDefectsCount={pendingDefects.length}
              rollsCount={rolls.length}
            />

            <RollTable
              rolls={rolls}
              defects={defects}
              pendingDefects={pendingDefects}
              prodData={prodData}
              user={user}
              startRollNumber={startRollNumber}
              existingDbRolls={existingDbRolls}
              rollsByMachine={rollsByMachine}
              maxRollNumber={maxRollNumber}
              maxOtherRollNumber={maxOtherRollNumber}
              onCatatCacat={(roll) => setDefectModal(roll)}
              onCatatCacatPreRoll={(targetId) => setDefectModal({ isPreRoll: true, id: targetId })}
              onFetchSensor={handleFetchSensor}
              onSaveRollFromSensor={handleSaveRollFromSensor}
              onGetData={handleSaveRollFromSensor}
              onDeleteRoll={handleDeleteRoll}
              onAddRoll={handleAddManualRoll}
              onEditRoll={handleEditRoll}
              onUpdateBsQty={handleUpdateBsQty}
              onToggleStock={handleToggleStock}
              onPrintRoll={handlePrintRoll}
              onSetStartRoll={(val) => updateStartRollNumber(val)}
              showToast={showToast}
            />

            {/* Action Bar (Button Send Data telah dihilangkan sesuai permintaan) */}
            <div className={styles.actionBar}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleResetScan}
                disabled={saving}
              >
                ↩ Scan Ulang
              </button>

              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '13px 32px', fontSize: '15px' }}
                onClick={handleSave}
                disabled={saving}
                title="Simpan perubahan roll & BS Qty"
              >
                {saving ? '⏳ Menyimpan…' : '💾 Simpan Data'}
              </button>
            </div>
          </>
        )}
      </main>

      {/* ── Modals ── */}
      {showScan && (
        <ScanModal
          initialProdId={prodData.prodNumber}
          onDone={handleScanComplete}
          onCancel={() => setShowScan(false)}
        />
      )}

      {defectModal && (
        <DefectModal
          roll={defectModal}
          isPreRoll={Boolean(defectModal.isPreRoll)}
          initDefects={defectModal.isPreRoll ? pendingDefects : (defects[defectModal.id] || [])}
          onSave={(list) => {
            if (defectModal.isPreRoll) {
              updatePendingDefects(list)
              setDefectModal(null)
              showToast(
                list.length > 0
                  ? `✓ Catatan sementara (${list.length} titik cacat) tersimpan. Akan otomatis masuk saat Get Data.`
                  : 'Catatan cacat sementara telah dikosongkan.'
              )
            } else {
              saveDefects(defectModal.id, list)
            }
          }}
          onClose={() => setDefectModal(null)}
        />
      )}

      {/* Modal Wajib Isi Starting Roll untuk Multi-Mesin */}
      {mandatoryReserveModal && (
        <MultiMachineReserveModal
          prodId={mandatoryReserveModal.prodId}
          currentMachineId={mandatoryReserveModal.currentMachineId}
          currentStartRoll={mandatoryReserveModal.suggestedStart}
          firstMachineId={mandatoryReserveModal.firstMachineId}
          existingRolls={existingDbRolls}
          rollsByMachine={rollsByMachine}
          maxRollNumber={maxRollNumber}
          maxOtherRollNumber={mandatoryReserveModal.maxOtherRoll}
          isMandatory={true}
          onApplyStartRoll={(startVal) => {
            updateStartRollNumber(startVal)
            setMandatoryReserveModal(null)
            showToast(`✓ Starting roll Mesin #${mandatoryReserveModal.currentMachineId} disetel ke #${startVal}.`)
          }}
          onClose={() => setMandatoryReserveModal(null)}
          onCancelScan={() => {
            setMandatoryReserveModal(null)
            handleResetScan()
          }}
        />
      )}

      {toastMsg && <Toast message={toastMsg} />}
    </div>
  )
}
