import { useState, useEffect } from 'react'
import { getNextRollInfo, getInventoryStatusList } from '../services/api.js'
import { toDDMMYYYY, getTodayYYYYMMDD } from '../utils/dateUtils.js'
import { computeNextRollNumber } from '../utils/rollNumberHelpers.js'
import styles from './GetDataConfirmModal.module.css'

export default function GetDataConfirmModal({
  machineId,
  targetRollId,
  prodNumber,
  length,
  pendingDefectsCount = 0,
  rolls = [],
  rollsByMachine = {},
  existingDbRolls = [],
  allDbRollNumbers = [],
  maxRollNumber = 0,
  machineMaxRoll = 0,
  startRollNumber = null,
  onConfirm,
  onClose,
  loading = false,
}) {
  const [transDate, setTransDate] = useState(getTodayYYYYMMDD())
  const [resolvedRollId, setResolvedRollId] = useState(targetRollId || 1)
  const [grade, setGrade] = useState('A')
  const [gradeOptions, setGradeOptions] = useState([])
  const [loadingDb, setLoadingDb] = useState(false)

  useEffect(() => {
    setResolvedRollId(targetRollId || 1)
  }, [targetRollId])

  useEffect(() => {
    let isMounted = true
    getInventoryStatusList({ badStock: false })
      .then((res) => {
        if (!isMounted) return
        const rawList = res?.data || []
        const validList = rawList.filter((d) => d.BadStock === false || String(d.BadStock) === 'false' || !d.BadStock)
        setGradeOptions(validList)
      })
      .catch((err) => {
        console.error('[GetDataConfirmModal] Gagal load inventory status:', err)
      })

    return () => {
      isMounted = false
    }
  }, [])

  // Sinkronisasi langsung dengan database CountingKainLines saat modal konfirmasi dibuka
  // agar Target Nomor Roll mengabaikan status soft delete roll sebelumnya
  useEffect(() => {
    let isMounted = true

    async function syncTargetRollFromDb() {
      if (!prodNumber || !machineId) return
      setLoadingDb(true)
      try {
        const stats = await getNextRollInfo(prodNumber, machineId)
        if (!isMounted || !stats) return

        const { nextRollId } = computeNextRollNumber({
          currentMachineId: machineId,
          rolls,
          rollsByMachine: stats.rollsByMachine || rollsByMachine,
          existingDbRolls: stats.lines || existingDbRolls,
          allDbRollNumbers: Array.isArray(stats.allRollNumbers)
            ? stats.allRollNumbers
            : allDbRollNumbers,
          maxRollNumber: Math.max(maxRollNumber || 0, stats.maxRoll || 0),
          machineMaxRoll: Math.max(machineMaxRoll || 0, stats.machineMaxRoll || 0),
          startRollNumber,
        })

        setResolvedRollId(nextRollId || targetRollId || 1)
      } catch (err) {
        console.warn('Gagal sinkronisasi target roll Get Data:', err)
      } finally {
        if (isMounted) setLoadingDb(false)
      }
    }

    syncTargetRollFromDb()

    return () => {
      isMounted = false
    }
  }, [
    prodNumber,
    machineId,
    targetRollId,
    rolls,
    rollsByMachine,
    existingDbRolls,
    allDbRollNumbers,
    maxRollNumber,
    machineMaxRoll,
    startRollNumber,
  ])

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.head}>
          <div className={styles.iconWrap}>🔄</div>
          <div>
            <h3 className={styles.title}>Konfirmasi Ambil Data Mesin</h3>
            <p className={styles.sub}>Verifikasi penarikan data dari sensor / mesin autonic</p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={loading}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Body info */}
        <div className={styles.body}>
          <div className={styles.infoCard}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Nomor Mesin</span>
              <span className={styles.infoValHighlight}>Mesin #{machineId}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Order Produksi</span>
              <span className={styles.infoVal}>{prodNumber || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Target Nomor Roll</span>
              <span className={styles.infoValBadge}>
                {loadingDb ? '🔄 Memeriksa…' : `Roll #${resolvedRollId}`}
              </span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Panjang Hasil Sensor</span>
              <span className={styles.infoValHighlight} style={{ color: 'var(--success)', fontSize: '16px', fontWeight: '700' }}>
                {length !== undefined && length !== null ? `${length} yard` : '-'}
              </span>
            </div>
            <div className={styles.infoRow} style={{ alignItems: 'center' }}>
              <span className={styles.infoLabel}>Grade</span>
              <select
                className={styles.selectInput}
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
              >
                {(gradeOptions.some((opt) => opt.StatusId === 'A')
                  ? gradeOptions
                  : [{ StatusId: 'A', Name: 'A', BadStock: false }, ...gradeOptions]
                ).map((opt) => (
                  <option key={opt.StatusId} value={opt.StatusId}>
                    {opt.StatusId}{opt.Name && opt.Name !== opt.StatusId ? ` – ${opt.Name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.infoRow} style={{ alignItems: 'center' }}>
              <span className={styles.infoLabel}>Date (Tanggal Roll)</span>
              <input
                type="date"
                value={transDate}
                onChange={(e) => setTransDate(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface2, #1e293b)',
                  color: 'var(--text, #f8fafc)',
                  fontSize: '13px',
                  fontWeight: '600',
                  outline: 'none',
                }}
              />
            </div>
            {pendingDefectsCount > 0 && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Catatan Inspeksi Sementara</span>
                <span className={styles.infoValWarn}>⚠️ {pendingDefectsCount} Titik Inspeksi</span>
              </div>
            )}
          </div>

          {pendingDefectsCount > 0 && (
            <div className={styles.pendingDefectBox}>
              <div className={styles.pendingDefectIcon}>📝</div>
              <div className={styles.pendingDefectText}>
                <strong>{pendingDefectsCount} titik inspeksi sementara</strong> yang telah dicatat akan otomatis dihubungkan ke <strong>Roll #{resolvedRollId}</strong> dan tersimpan ke sistem.
              </div>
            </div>
          )}

          <div className={styles.alertBox}>
            <div className={styles.alertIcon}>⚠️</div>
            <div className={styles.alertText}>
              <strong>Perhatian:</strong> Data meter/yard mesin yang ditarik akan{' '}
              <strong>otomatis direset dari antrean mesin</strong> agar tidak ditarik ulang.
              <strong>Pastikan doffing / gulungan roll pada mesin telah selesai.</strong>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className={styles.footer}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(toDDMMYYYY(transDate), resolvedRollId, grade)}
            disabled={loading || loadingDb}
          >
            {loading ? (
              <>
                <span className={styles.spin}>🔄</span> Menarik & Memproses data…
              </>
            ) : (
              '✓ Ambil data'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
