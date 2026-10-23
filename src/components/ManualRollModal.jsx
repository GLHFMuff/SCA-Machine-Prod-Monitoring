import { useState } from 'react'
import styles from './ManualRollModal.module.css'

export default function ManualRollModal({ defaultRollId, onSave, onClose }) {
  const [rollId, setRollId] = useState(defaultRollId || 1)
  const [length, setLength] = useState('')
  const [bsQty, setBsQty] = useState('0')
  const [error, setError] = useState('')

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

    onSave({
      id: parseInt(rollId, 10),
      length: parsedLength,
      bsQty: parsedBs,
    })
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={e => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <h3 className={styles.title}>➕ Input Roll Manual</h3>
            <p className={styles.sub}>Masukkan data roll & BS QTY produksi</p>
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
                Nomor Roll
                <span className={styles.req}>*Otomatis berurutan</span>
              </label>
              <div className={styles.inputWrap}>
                <input
                  type="number"
                  min="1"
                  className={styles.input}
                  value={rollId}
                  onChange={e => setRollId(e.target.value)}
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
                  onChange={e => {
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
                  onChange={e => {
                    setBsQty(e.target.value)
                    setError('')
                  }}
                />
                <span className={styles.unit}>Yard</span>
              </div>
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
            >
              💾 Simpan Roll
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
