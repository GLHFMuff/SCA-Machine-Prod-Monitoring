import { useState, useEffect } from 'react'
import { SCAN_DATA } from '../data/dummyData.js'
import styles from './ScanModal.module.css'

const SAMPLE_BARCODES = [
  { id: 'OP.022026.000674', label: 'OP.022026.000674 (Ada di DB)', isDb: true },
  { id: 'OP.012026.001113', label: 'OP.012026.001113 (Ada di DB)', isDb: true },
  { id: 'OP.122025.001257', label: 'OP.122025.001257 (Data Baru)', isDb: false },
]

export default function ScanModal({ initialProdId, onDone, onCancel }) {
  const [done, setDone] = useState(false)
  const [barcode, setBarcode] = useState(initialProdId || 'OP.022026.000674')

  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1800)
    return () => clearTimeout(t)
  }, [])

  function handleSelectBarcode(val) {
    setBarcode(val)
  }

  function handleConfirm() {
    onDone(barcode.trim() || SCAN_DATA.prodNumber)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        {!done ? (
          <div className={styles.body}>
            <div className={styles.scanAnim}>📷</div>
            <div className={styles.text}>Mendeteksi Barcode…</div>
            <div className={styles.sub}>Arahkan kamera ke barcode order produksi</div>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} />
            </div>
            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={onCancel}
            >
              Batal
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.successIcon}>✅</div>
            <div className={styles.text}>Scan Berhasil!</div>
            <div className={styles.sub}>Barcode / Nomor Produksi Terdeteksi:</div>

            <input
              type="text"
              className={styles.barcodeInput}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Masukkan nomor produksi"
            />

            <div className={styles.samplesGroup}>
              <div className={styles.samplesLabel}>Pilih Simulasi Barcode:</div>
              <div className={styles.samplesRow}>
                {SAMPLE_BARCODES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.sampleChip} ${barcode === s.id ? styles.sampleChipActive : ''}`}
                    onClick={() => handleSelectBarcode(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="btn btn-success"
              style={{ width: '100%', padding: '12px', fontSize: '15px' }}
              onClick={handleConfirm}
            >
              Periksa & Muat Data →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
