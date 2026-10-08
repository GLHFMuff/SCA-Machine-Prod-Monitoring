import { useState, useEffect } from 'react'
import { SCAN_DATA } from '../data/dummyData.js'
import styles from './ScanModal.module.css'

export default function ScanModal({ onDone, onCancel }) {
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDone(true), 2600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        {!done ? (
          <div className={styles.body}>
            <div className={styles.scanAnim}>📷</div>
            <div className={styles.text}>Mendeteksi Barcode…</div>
            <div className={styles.sub}>Arahkan kamera ke barcode produksi</div>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} />
            </div>
            <button className="btn btn-outline" style={{ width: '100%', marginTop: '8px' }} onClick={onCancel}>
              Batal
            </button>
          </div>
        ) : (
          <div className={styles.body}>
            <div className={styles.successIcon}>✅</div>
            <div className={styles.text}>Scan Berhasil!</div>
            <div className={styles.sub}>Terdeteksi: {SCAN_DATA.prodNumber}</div>
            <button className="btn btn-success" style={{ width: '100%' }} onClick={onDone}>
              Lihat Detail →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
