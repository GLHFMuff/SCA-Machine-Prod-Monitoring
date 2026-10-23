import { useState } from 'react'
import { SCAN_DATA } from '../data/dummyData.js'
import AppHeader from '../components/AppHeader.jsx'
import ScanIdle from '../components/ScanIdle.jsx'
import InfoCards from '../components/InfoCards.jsx'
import RollTable from '../components/RollTable.jsx'
import ScanModal from '../components/ScanModal.jsx'
import DefectModal from '../components/DefectModal.jsx'
import SendModal from '../components/SendModal.jsx'
import Toast from '../components/Toast.jsx'
import { getAutonicData } from '../services/autonicService.js'
import { flushAutonicData } from '../services/autonicService.js'
import { saveCountingData, getCountingData } from '../services/api.js'
import styles from './MainPage.module.css'

export default function MainPage({ user, onLogout, theme, onToggleTheme }) {
  const [scanned, setScanned] = useState(false)
  const [showScan, setShowScan] = useState(false)
  const [loadingScan, setLoadingScan] = useState(false)

  // Data order produksi aktif (bisa dari DB atau order baru)
  const [prodData, setProdData] = useState(SCAN_DATA)

  // Daftar roll kain (dimuat dari DB jika ada, atau kosong jika order baru)
  const [rolls, setRolls] = useState([])
  const [defectModal, setDefectModal] = useState(null) // roll object | null
  const [defects, setDefects] = useState({}) // { rollId: [{id, yard, code}] }
  const [showSend, setShowSend] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const totalDefects = Object.values(defects).reduce((sum, arr) => sum + arr.length, 0)

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3500)
  }

  /**
   * Handle selesai scan barcode:
   * 1. Cek data ke database terlebih dahulu via getCountingData(prodId)
   * 2. Jika ada di database -> muat header & lines yang sudah tersimpan
   * 3. Jika belum ada di database -> jadikan lembar produksi baru
   */
  async function handleScanComplete(scannedBarcode) {
    setShowScan(false)
    setLoadingScan(true)

    const targetProdId = (scannedBarcode || SCAN_DATA.prodNumber).trim()

    try {
      // 1. Ambil data dari database PostgreSQL
      const dbRecord = await getCountingData(targetProdId)

      if (dbRecord) {
        // === KONDISI A: DITEMUKAN DI DATABASE ===
        setProdData({
          ...SCAN_DATA,
          prodNumber: dbRecord.ProdId,
          seqmentNum: dbRecord.ProdId,
          noMesin: dbRecord.NoMesin || user?.machine_id,
          userId: dbRecord.UserId || user?.username,
          isFromDb: true,
        })

        // Map baris roll dari tabel CountingKainLines
        const existingRolls = (dbRecord.lines || []).map((l) => ({
          id: l.RoolNumber,
          length: parseFloat(l.Length) || 0,
          bsQty: 0,
          description: l.Description || `Roll #${l.RoolNumber}`,
          isExecute: Boolean(l.IsExecute),
        }))

        setRolls(existingRolls)
        setDefects({})
        setScanned(true)

        if (existingRolls.length > 0) {
          showToast(`✓ Data '${targetProdId}' ditemukan di database (${existingRolls.length} roll dimuat).`)
        } else {
          showToast(`✓ Header '${targetProdId}' ditemukan di DB (belum ada roll terdaftar).`)
        }
      } else {
        // === KONDISI B: TIDAK ADA DI DATABASE (DATA BARU) ===
        setProdData({
          ...SCAN_DATA,
          prodNumber: targetProdId,
          seqmentNum: targetProdId,
          isFromDb: false,
        })

        // Mulai kosong untuk order produksi baru
        setRolls([])
        setDefects({})
        setScanned(true)

        showToast(`✨ Nomor '${targetProdId}' belum ada di database. Memulai data produksi baru!`)
      }
    } catch (err) {
      console.error('Error saat memeriksa barcode di database:', err)
      // Fallback
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
      }))

      const result = await saveCountingData({
        ProdId: prodId,
        NoMesin: noMesin,
        UserId: userId,
        lines: linesPayload,
      })

      // Update status isFromDb menjadi true setelah tersimpan
      setProdData((prev) => ({ ...prev, isFromDb: true }))

      showToast(`Data berhasil disimpan ke Header & Lines (${result.data?.linesCount || rolls.length} roll)!`)
    } catch (err) {
      console.error('Error saat menyimpan data counting:', err)
      showToast(`Gagal menyimpan: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSend() {
    setShowSend(false)
    setSaving(true)
    try {
      const prodId = prodData.prodNumber
      const noMesin = String(user?.machine_id || user?.machineId || '1')
      const userId = user?.username || user?.name || 'user'

      const linesPayload = rolls.map((r) => ({
        RoolNumber: r.id,
        Description: `Roll #${r.id} (${r.length} yard)`,
        Length: r.length,
        IsExecute: true,
      }))

      await saveCountingData({
        ProdId: prodId,
        NoMesin: noMesin,
        UserId: userId,
        lines: linesPayload,
      })

      showToast('Data berhasil dikirim dan tersimpan di database!')
      setTimeout(() => {
        setScanned(false)
        setDefects({})
        setRolls([])
        setProdData(SCAN_DATA)
      }, 3000)
    } catch (err) {
      console.error('Error saat kirim data:', err)
      showToast(`Gagal mengirim data: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleGetData() {
    // Ambil machine_id dari user yang sedang login
    const machineId = user?.machine_id || user?.machineId || 1

    try {
      const res = await getAutonicData(machineId)
      // Ambil Length dari response { DateTimeCreated, Length }
      const lengthVal = parseFloat(res?.Length) || 0

      setRolls((prev) => {
        const nextId = prev.length > 0 ? Math.max(...prev.map((r) => r.id)) + 1 : 1
        const newRoll = { id: nextId, length: lengthVal, bsQty: 0, isExecute: false }
        return [...prev, newRoll]
      })

      showToast(`Data Mesin #${machineId} berhasil ditarik: ${lengthVal} yard`)
    } catch (err) {
      console.error('Error saat mengambil data mesin:', err)
      showToast(`Gagal menarik data mesin: ${err.message}`)
    }
  }

  function handleDeleteRoll(rollId) {
    setRolls((prev) => prev.filter((r) => r.id !== rollId))
    setDefects((prev) => {
      const next = { ...prev }
      delete next[rollId]
      return next
    })
    showToast(`Roll #${rollId} berhasil dihapus`)
  }

  function handleAddManualRoll(newRoll) {
    setRolls((prev) => {
      const exists = prev.some((r) => r.id === newRoll.id)
      if (exists) {
        showToast(`Nomor Roll #${newRoll.id} sudah ada dalam daftar.`)
        return prev
      }
      showToast(`Roll #${newRoll.id} (${newRoll.length} yard) berhasil ditambahkan!`)
      return [...prev, newRoll]
    })
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
              <div style={{ fontSize: '36px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>🔄</div>
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
              onCatatCacat={(roll) => setDefectModal(roll)}
              onGetData={handleGetData}
              onDeleteRoll={handleDeleteRoll}
              onAddRoll={handleAddManualRoll}
              onUpdateBsQty={handleUpdateBsQty}
            />

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
                style={{ padding: '13px 28px', fontSize: '15px' }}
                onClick={handleSave}
                disabled={saving}
                title="Simpan data ke CountingKainHeader & CountingKainLines"
              >
                {saving ? '⏳ Menyimpan…' : '💾 Simpan Data'}
              </button>
              <button
                type="button"
                className="btn btn-success"
                style={{ padding: '13px 36px', fontSize: '15px' }}
                onClick={() => setShowSend(true)}
                disabled={saving}
              >
                📤 Send Data
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

      {showSend && (
        <SendModal
          data={{
            prodNumber: prodData.prodNumber,
            seqmentNumber: prodData.seqmentNum || prodData.prodNumber,
            operator: user.name,
            machine: user.machine,
            rolls,
            defects,
          }}
          onConfirm={handleSend}
          onClose={() => setShowSend(false)}
        />
      )}

      {toastMsg && <Toast message={toastMsg} />}
    </div>
  )
}
