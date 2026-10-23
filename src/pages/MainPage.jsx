import { useState, useCallback } from 'react'
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
} from '../services/api.js'
import styles from './MainPage.module.css'

export default function MainPage({ user, onLogout, theme, onToggleTheme }) {
  const [scanned, setScanned] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [loadingScan, setLoadingScan] = useState(false)

  // Data order produksi aktif (bisa dari DB atau order baru)
  const [prodData, setProdData] = useState(SCAN_DATA)

  // Daftar roll kain lokal
  const [rolls, setRolls] = useState([])
  const [defectModal, setDefectModal] = useState(null) // roll object | null
  const [defects, setDefects] = useState({}) // { rollId: [{id, yard, code}] }
  const [toastMsg, setToastMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // State untuk Multi-Mesin & Roll Reserve
  const [startRollNumber, setStartRollNumber] = useState(null)
  const [existingDbRolls, setExistingDbRolls] = useState([])
  const [rollsByMachine, setRollsByMachine] = useState({})
  const [maxRollNumber, setMaxRollNumber] = useState(0)
  const [maxOtherRollNumber, setMaxOtherRollNumber] = useState(0)
  const [mandatoryReserveModal, setMandatoryReserveModal] = useState(null)

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
   */
  async function handleScanComplete(scannedBarcode) {
    setShowScan(false)
    setLoadingScan(true)

    const targetProdId = (scannedBarcode || SCAN_DATA.prodNumber).trim()
    const machineId = String(user?.machine_id || user?.machineId || '1')
    const userId = user?.username || user?.name || 'operator'

    try {
      // 1. Simpan langsung nomor produksi ke tabel CountingKainHeader
      let headerSaveSuccess = false
      try {
        await saveCountingHeader({
          ProdId: targetProdId,
          NoMesin: machineId,
          UserId: userId,
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
          seqmentNum: dbRecord.ProdId || targetProdId,
          noMesin: machineId,
          userId: dbRecord.UserId || userId,
          isFromDb: true,
        })

        // Map baris roll dari tabel CountingKainLines (HANYA MILIK MESIN YANG LOGIN)
        const loadedRolls = (dbRecord.lines || []).map((l) => ({
          id: l.RoolNumber,
          length: parseFloat(l.Length) || 0,
          bsQty: 0,
          noMesin: String(l.NoMesin || machineId),
          isPrinted: Boolean(l.isPrinted),
          description: l.Description || `Roll #${l.RoolNumber}`,
          isExecute: Boolean(l.IsExecute),
        }))

        setRolls(loadedRolls)
        setDefects({})
        setScanned(true)

        // SYARAT KHUSUS: Jika order sudah ada datanya di DB (allDbLines > 0)
        // namun untuk mesin ini masih kosong (loadedRolls === 0),
        // WAJIB mengisi starting rollnya (default +10 dari roll terakhir mesin lain yang paling tinggi)
        if (allDbLines.length > 0 && loadedRolls.length === 0) {
          const defaultStart = maxOtherRoll > 0 ? maxOtherRoll + 10 : 1
          setStartRollNumber(defaultStart)
          setMandatoryReserveModal({
            prodId: targetProdId,
            currentMachineId: machineId,
            suggestedStart: defaultStart,
            maxOtherRoll,
          })
          showToast(`ℹ️ Order '${targetProdId}' ada di DB. Mesin #${machineId} wajib mengisi starting roll (Rekomendasi: #${defaultStart}).`)
        } else if (loadedRolls.length > 0) {
          showToast(`✓ Order '${targetProdId}' aktif (${loadedRolls.length} roll untuk Mesin #${machineId}).`)
        } else {
          showToast(`✓ Order '${targetProdId}' tersimpan di Header database. Siap produksi!`)
        }
      } else {
        // === KONDISI B: ORDER BARU ===
        setProdData({
          ...SCAN_DATA,
          prodNumber: targetProdId,
          seqmentNum: targetProdId,
          isFromDb: true,
        })

        setRolls([])
        setDefects({})
        setScanned(true)
        showToast(`✓ Nomor '${targetProdId}' tersimpan di Header database. Siap produksi!`)
      }
    } catch (err) {
      console.error('Error saat memeriksa barcode di database:', err)
      setProdData({
        ...SCAN_DATA,
        prodNumber: targetProdId,
        seqmentNum: targetProdId,
        isFromDb: false,
      })
      setRolls([])
      setScanned(true)
      showToast(`Nomor '${targetProdId}' disiapkan sebagai order baru.`)
    } finally {
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
      }))

      const result = await saveCountingData({
        ProdId: prodId,
        NoMesin: noMesin,
        UserId: userId,
        lines: linesPayload,
      })

      setProdData((prev) => ({ ...prev, isFromDb: true }))
      await refreshMultiMachineStats(prodId)

      showToast(`✓ Data berhasil disimpan ke database (${result.data?.linesCount || rolls.length} roll)!`)
    } catch (err) {
      console.error('Error saat menyimpan data counting:', err)
      showToast(`Gagal menyimpan: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Tarik Data Mesin:
   * 1. Ambil data dari sensor mesin autonic
   * 2. Otomatis langsung hapus data di tabel autonicmachine database
   * 3. Alokasikan nomor roll unik (bebas duplikat multi-mesin)
   * 4. Otomatis simpan roll baru langsung ke database (CountingKainLines)
   */
  async function handleGetData() {
    const machineId = String(user?.machine_id || user?.machineId || 1)
    const prodId = prodData.prodNumber

    try {
      // 1. Tarik data dari mesin (otomatis terhapus di database autonicmachine)
      const res = await getAutonicData(machineId)
      const lengthVal = parseFloat(res?.Length) || 0

      // 2. Tentukan nomor roll berikutnya yang belum pernah terpakai sesuai mesin aktif
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

      let nextId
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

      const newRoll = {
        id: nextId,
        length: lengthVal,
        bsQty: 0,
        noMesin: machineId,
        isPrinted: false,
        isExecute: false,
      }

      // 3. Otomatis langsung simpan ke database CountingKainLines
      await saveCountingData({
        ProdId: prodId,
        NoMesin: machineId,
        UserId: user?.username || user?.name || 'operator',
        lines: [
          {
            RoolNumber: nextId,
            Description: `Roll #${nextId} (${lengthVal} yard)`,
            Length: lengthVal,
            IsExecute: false,
            NoMesin: machineId,
            isPrinted: false,
          },
        ],
      })

      // Update state frontend
      setRolls((prev) => [...prev, newRoll])
      if (startRollNumber !== null && nextId >= startRollNumber) {
        setStartRollNumber(nextId + 1)
      }
      await refreshMultiMachineStats(prodId)
      await flushAutonicData(machineId)
      showToast(`✓ Data Mesin #${machineId} (${lengthVal} yd) ditarik ke Roll #${nextId} & otomatis tersimpan di DB.`)
    } catch (err) {
      console.error('Error saat mengambil data mesin:', err)
      showToast(`Gagal menarik data mesin: ${err.message}`)
      throw err
    }
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
      showToast(`✓ Roll #${rollId} berhasil dihapus langsung dari database.`)
    } catch (err) {
      console.error('Error saat menghapus roll dari DB:', err)
      // Fallback update frontend jika belum ada di DB
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

      showToast(`✓ E-Ticket Roll #${roll.id} dicetak. Status isPrinted telah diupdate di database.`)
    } catch (err) {
      console.error('Error saat update status cetak di database:', err)
      showToast(`E-Ticket dicetak (namun status DB gagal diperbarui: ${err.message})`)
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
      showToast(`⚠️ Nomor Roll #${newRoll.id} sudah ada dalam database / daftar order ini!`)
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
      await saveCountingData({
        ProdId: prodId,
        NoMesin: machineId,
        UserId: user?.username || user?.name || 'operator',
        lines: [
          {
            RoolNumber: fullRoll.id,
            Description: `Roll #${fullRoll.id} (${fullRoll.length} yard)`,
            Length: fullRoll.length,
            IsExecute: false,
            NoMesin: machineId,
            isPrinted: false,
          },
        ],
      })

      setRolls((prev) => [...prev, fullRoll])
      if (startRollNumber !== null && fullRoll.id >= startRollNumber) {
        setStartRollNumber(fullRoll.id + 1)
      }
      await refreshMultiMachineStats(prodId)
      showToast(`✓ Roll #${fullRoll.id} (${fullRoll.length} yard) berhasil ditambahkan ke Mesin #${machineId} & tersimpan di DB!`)
    } catch (err) {
      console.error('Error saat simpan roll manual:', err)
      setRolls((prev) => [...prev, fullRoll])
      showToast(`Roll #${fullRoll.id} ditambahkan ke daftar lokal (${err.message})`)
    }
  }

  function handleUpdateBsQty(rollId, newBsQty) {
    setRolls((prev) =>
      prev.map((r) => (r.id === rollId ? { ...r, bsQty: newBsQty } : r))
    )
    showToast(`BS Qty Roll #${rollId} diubah menjadi ${newBsQty} yard`)
  }

  function saveDefects(rollId, list) {
    setDefects((prev) => ({ ...prev, [rollId]: list }))
    setDefectModal(null)
  }

  function handleResetScan() {
    setScanned(false)
    setDefects({})
    setRolls([])
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
                Memeriksa data produksi di database…
              </div>
              <div style={{ fontSize: '13px', color: 'var(--muted)', marginTop: '4px' }}>
                Mengecek CountingKainHeader & Lines
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
              rollsCount={rolls.length}
            />

            <RollTable
              rolls={rolls}
              defects={defects}
              prodData={prodData}
              user={user}
              startRollNumber={startRollNumber}
              existingDbRolls={existingDbRolls}
              rollsByMachine={rollsByMachine}
              maxRollNumber={maxRollNumber}
              maxOtherRollNumber={maxOtherRollNumber}
              onCatatCacat={(roll) => setDefectModal(roll)}
              onGetData={handleGetData}
              onDeleteRoll={handleDeleteRoll}
              onAddRoll={handleAddManualRoll}
              onUpdateBsQty={handleUpdateBsQty}
              onPrintRoll={handlePrintRoll}
              onSetStartRoll={(val) => setStartRollNumber(val)}
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
                title="Simpan perubahan roll & BS Qty ke database"
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
          initDefects={defects[defectModal.id]}
          onSave={(list) => saveDefects(defectModal.id, list)}
          onClose={() => setDefectModal(null)}
        />
      )}

      {/* Modal Wajib Isi Starting Roll untuk Multi-Mesin */}
      {mandatoryReserveModal && (
        <MultiMachineReserveModal
          prodId={mandatoryReserveModal.prodId}
          currentMachineId={mandatoryReserveModal.currentMachineId}
          currentStartRoll={mandatoryReserveModal.suggestedStart}
          existingRolls={existingDbRolls}
          rollsByMachine={rollsByMachine}
          maxRollNumber={maxRollNumber}
          maxOtherRollNumber={mandatoryReserveModal.maxOtherRoll}
          isMandatory={true}
          onApplyStartRoll={(startVal) => {
            setStartRollNumber(startVal)
            setMandatoryReserveModal(null)
            showToast(`✓ Starting roll Mesin #${mandatoryReserveModal.currentMachineId} disetel ke #${startVal} (+10 dari roll tertinggi mesin lain).`)
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
