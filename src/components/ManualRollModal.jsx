import { useState, useEffect } from 'react'
import { getNextRollInfo } from '../services/api.js'
import styles from './ManualRollModal.module.css'

export default function ManualRollModal({
  defaultRollId,
  prodId,
  machineId,
  rolls = [],
  onSave,
  onClose,
}) {
  const [rollId, setRollId] = useState(defaultRollId || 1)
  const [loadingDb, setLoadingDb] = useState(false)
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)
  const [length, setLength] = useState('')
  const [bsQty, setBsQty] = useState('0')
  const [isStock, setIsStock] = useState(false)
  const [stockInfo, setStockInfo] = useState(null)
  const [error, setError] = useState('')

  // Sinkronisasi otomatis roll number sesuai mesin & prodId dari database CountingKainLines
  useEffect(() => {
    let isMounted = true

    async function syncRollIdFromDb() {
      if (!prodId || !machineId) return
      setLoadingDb(true)
      try {
        const stats = await getNextRollInfo(prodId, machineId)
        if (!isMounted || !stats) return

        // 1. Max roll dari database CountingKainLines untuk mesin ini
        const dbMachineMax = stats.machineMaxRoll || 0

        // 2. Max roll dari state rolls lokal untuk mesin ini
        const localMachineRolls = (rolls || []).filter(
          (r) => String(r.noMesin || machineId) === String(machineId)
        )
        const localMachineMax =
          localMachineRolls.length > 0 ? Math.max(...localMachineRolls.map((r) => r.id)) : 0

        const activeMachineMax = Math.max(dbMachineMax, localMachineMax)

        if (!isManuallyEdited) {
          if (activeMachineMax > 0) {
            setRollId(activeMachineMax + 1)
          } else if (defaultRollId) {
            setRollId(defaultRollId)
          } else if (stats.machineNextRoll) {
            setRollId(stats.machineNextRoll)
          }
        }

        // 3. Deteksi otomatis kuota OrderQty vs total produksi
        if (stats.isOrderExceeded) {
          setIsStock(true)
          setStockInfo({
            orderQty: stats.orderQty,
            accumulated: stats.accumulatedSalesLength,
          })
        }
      } catch (err) {
        console.warn('Gagal sinkronisasi nomor roll dari database:', err)
      } finally {
        if (isMounted) setLoadingDb(false)
      }
    }

    syncRollIdFromDb()

    return () => {
      isMounted = false
    }
  }, [prodId, machineId, defaultRollId, isManuallyEdited, rolls])

  function handleSubmit(e) {
    e.preventDefault()
    const parsedLength = parseFloat(length)
    const parsedBs = parseFloat(bsQty || 0)
    const parsedRollId = parseInt(rollId, 10)

    if (isNaN(parsedRollId) || parsedRollId <= 0) {
      setError('Nomor roll harus berupa angka positif mulai dari 1.')
      return
    }

    if (isNaN(parsedLength) || parsedLength <= 0) {
      setError('Panjang roll harus diisi dengan angka lebih dari 0.')
      return
    }

    if (isNaN(parsedBs) || parsedBs < 0) {
      setError('BS Qty tidak boleh bernilai negatif.')
      return
    }

    if (parsedBs >= parsedLength) {
      setError(`BS Qty (${parsedBs} yd) harus di bawah panjang roll (${parsedLength} yd).`)
      return
    }

    onSave({
      id: parsedRollId,
      length: parsedLength,
      bsQty: parsedBs,
      isStock: Boolean(isStock),
    })
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>➕ Input Roll Manual</h3>
            <p className={styles.sub}>
              Masukkan data roll & BS QTY produksi {machineId ? `(Mesin #${machineId})` : ''}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Nomor Roll {machineId ? `(Mesin #${machineId})` : ''}
                <span className={styles.req}>
                  {loadingDb ? '🔄 Memeriksa nomor roll…' : '*Sesuai urutan mesin & prodId'}
                </span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  type="number"
                  min="1"
                  className={styles.input}
                  value={rollId}
                  onChange={(e) => {
                    setRollId(e.target.value)
                    setIsManuallyEdited(true)
                    setError('')
                  }}
                  required
                />
                <span className={styles.unit}>Roll #</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Panjang Roll (Yard)
                <span className={styles.req}>*Wajib diisi</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  placeholder="Contoh: 110.5"
                  className={styles.input}
                  value={length}
                  onChange={(e) => {
                    setLength(e.target.value)
                    setError('')
                  }}
                  autoFocus
                  required
                />
                <span className={styles.unit}>Yard</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>
                BS QTY (Bad Stock / Potong)
                <span className={styles.req}>Default 0</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  className={styles.input}
                  value={bsQty}
                  onChange={(e) => {
                    setBsQty(e.target.value)
                    setError('')
                  }}
                />
                <span className={styles.unit}>Yard</span>
              </div>
            </div>

            <div className={styles.checkboxGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isStock}
                  onChange={(e) => setIsStock(e.target.checked)}
                  className={styles.checkboxInput}
                />
                <span>Tandai sebagai Kain Stock (isStock)</span>
              </label>
              {stockInfo ? (
                <div className={styles.stockNotice}>
                  ⚡ Kuota Order ({stockInfo.orderQty} yd) telah terpenuhi (Total: {stockInfo.accumulated} yd). Roll ini otomatis ditandai sebagai Kain Stock.
                </div>
              ) : (
                <span className={styles.checkboxHint}>
                  Format QrNum: <strong>QR.S.MMYY.xxxxxxxx</strong>
                </span>
              )}
            </div>
          </div>

          <div className={styles.footer}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onClose}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={loadingDb}
            >
              💾 Simpan Roll
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
