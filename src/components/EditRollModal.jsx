import { useState, useEffect } from 'react'
import styles from './EditRollModal.module.css'

export default function EditRollModal({
  roll,
  prodId,
  machineId,
  loading = false,
  onSave,
  onClose,
}) {
  const [length, setLength] = useState(roll?.length !== undefined ? String(roll.length) : '')
  const [bsQty, setBsQty] = useState(roll?.bsQty !== undefined && roll?.bsQty !== null ? String(roll.bsQty) : '0')
  const [error, setError] = useState('')

  useEffect(() => {
    if (roll) {
      setLength(roll.length !== undefined ? String(roll.length) : '')
      setBsQty(roll.bsQty !== undefined && roll.bsQty !== null ? String(roll.bsQty) : '0')
      setError('')
    }
  }, [roll])

  if (!roll) return null

  const isExecuted = Boolean(roll.isExecute)
  const rollMachine = roll.noMesin || machineId || '1'

  function handleSubmit(e) {
    e.preventDefault()
    const parsedLength = parseFloat(length)
    const parsedBs = parseFloat(bsQty || 0)

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

    setError('')
    onSave({
      length: parsedLength,
      bsQty: parsedBs,
    })
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>
              <span>✏️ Edit Line</span>
              <span>Roll #{roll.id}</span>
            </h3>
            <p className={styles.sub}>
              Edit panjang kain (length) dan BS Qty {prodId ? `Order: ${prodId}` : ''}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Tutup"
            disabled={loading}
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {/* Status & Mesin Badge */}
            <div className={styles.badgeRow}>
              <span className={`${styles.badge} ${styles.badgeMachine}`}>
                🏭 Mesin #{rollMachine}
              </span>
              <span
                className={`${styles.badge} ${
                  isExecuted ? styles.badgeExecTrue : styles.badgeExecFalse
                }`}
              >
                {isExecuted ? '⚡ isExecute = TRUE' : '✓ isExecute = FALSE'}
              </span>
              {roll.isPrinted && (
                <span className={`${styles.badge}`} style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                  🖨️ E-Ticket Dicetak
                </span>
              )}
            </div>

            {/* Notice jika isExecute = true */}
            {isExecuted && (
              <div className={styles.executeNotice}>
                <span className={styles.executeNoticeIcon}>ℹ️</span>
                <div>
                  <strong>Aturan Update:</strong> Baris ini saat ini berstatus <code>isExecute = true</code>.
                  Ketika disimpan/di-update, status <code>isExecute</code> akan otomatis diubah menjadi <strong>false</strong>.
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

            {/* Input 1: Panjang Kain (Length) */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                Panjang Kain (Length)
                <span className={styles.req}>*Wajib diisi</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  className={styles.input}
                  placeholder="Contoh: 112.5"
                  value={length}
                  onChange={(e) => {
                    setLength(e.target.value)
                    setError('')
                  }}
                  required
                  autoFocus
                  disabled={loading}
                />
                <span className={styles.unit}>Yard</span>
              </div>
              <span className={styles.hint}>
                Panjang awal tercatat: {roll.length} yard
              </span>
            </div>

            {/* Input 2: BS Qty (Yard) */}
            <div className={styles.formGroup}>
              <label className={styles.label}>
                BS Qty (Kain Rusak / BS)
                <span className={styles.req}>*Di bawah panjang kain</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max={Math.max(0, (parseFloat(length) || 1000) - 0.1)}
                  className={styles.input}
                  placeholder="Contoh: 0.5"
                  value={bsQty}
                  onChange={(e) => {
                    setBsQty(e.target.value)
                    setError('')
                  }}
                  disabled={loading}
                />
                <span className={styles.unit}>Yard</span>
              </div>
              <span className={styles.hint}>
                Maksimal BS Qty harus lebih kecil dari panjang roll (&lt; {parseFloat(length) || 0} yd)
              </span>
            </div>
          </div>

          {/* Modal Footer */}
          <div className={styles.foot}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </button>
            <button
              type="submit"
              className={styles.btnSave}
              disabled={loading}
            >
              {loading && <span className={styles.spin}>🔄</span>}
              <span>{loading ? 'Menyimpan…' : 'Simpan Perubahan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
