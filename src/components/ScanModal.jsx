import { useState, useEffect } from 'react'
import styles from './ScanModal.module.css'

const SAMPLE_BARCODES = [
  { id: 'OP.022026.000674', label: 'OP.022026.000674 (Ada di DB)' },
  { id: 'OP.012026.001113', label: 'OP.012026.001113 (Ada di DB)' },
  { id: 'OP.102026.000999', label: 'OP.102026.000999 (Data Baru)' },
]

export default function ScanModal({ initialProdId, onDone, onCancel }) {
  // Status scan: 'scanning' | 'failed' | 'success'
  // Sesuai permintaan user: "sekarang buat jadi gagal dulu aja"
  const [scanStatus, setScanStatus] = useState('scanning')
  const [barcode, setBarcode] = useState(initialProdId || '')
  const [error, setError] = useState('')

  // Simulasi proses scanning kamera/barcode reader
  useEffect(() => {
    let t
    if (scanStatus === 'scanning') {
      t = setTimeout(() => {
        // Default hasil scan diatur GAGAL terlebih dahulu
        setScanStatus('failed')
      }, 1800)
    }
    return () => clearTimeout(t)
  }, [scanStatus])

  function handleRetryScan(forceStatus = 'failed') {
    setError('')
    setScanStatus('scanning')
    // Setelah scanning selesai, arahkan ke status yang diinginkan
    setTimeout(() => {
      setScanStatus(forceStatus)
    }, 1800)
  }

  function handleSelectSample(val) {
    setBarcode(val)
    setError('')
  }

  function handleSubmit(e) {
    if (e) e.preventDefault()
    const trimmed = barcode.trim()
    if (!trimmed) {
      setError('Nomor order produksi wajib diisi.')
      return
    }
    onDone(trimmed)
  }

  return (
    <div className={styles.overlay} onClick={onCancel} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        {/* Header Modal */}
        <div className={styles.head}>
          <div className={styles.headTitle}>
            <span>📷 Pemindai Barcode Order</span>
            {scanStatus === 'scanning' && <span className={styles.badgeScanning}>Sedang Memindai…</span>}
            {scanStatus === 'failed' && <span className={styles.badgeFailed}>Scan Gagal</span>}
            {scanStatus === 'success' && <span className={styles.badgeSuccess}>Scan Berhasil</span>}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onCancel}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* ── 1. KONDISI: SEDANG SCANNING ── */}
        {scanStatus === 'scanning' && (
          <div className={styles.body}>
            <div className={styles.scanViewport}>
              <div className={styles.scanLaser} />
              <div className={styles.scanCameraIcon}>📷</div>
            </div>

            <div className={styles.titleText}>Mendeteksi Barcode Order…</div>
            <div className={styles.subText}>
              Arahkan barcode kain ke kamera pemindai
            </div>

            <div className={styles.progressTrack}>
              <div className={styles.progressBar} />
            </div>

            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '12px' }}
              onClick={onCancel}
            >
              Batal
            </button>
          </div>
        )}

        {/* ── 2. KONDISI: SCAN GAGAL (INPUT MANUAL) ── */}
        {scanStatus === 'failed' && (
          <form onSubmit={handleSubmit} className={styles.body}>
            <div className={styles.failedIconWrap}>
              <div className={styles.failedIcon}>❌</div>
            </div>

            <div className={styles.statusBannerFailed}>
              <div className={styles.statusTitle}>Scan Barcode Gagal Terbaca</div>
              <div className={styles.statusDesc}>
                Barcode tidak terdeteksi atau label barcode rusak. Silakan masukkan nomor order produksi secara manual di bawah ini:
              </div>
            </div>

            {error && <div className={styles.errorAlert}>⚠️ {error}</div>}

            <div className={styles.formGroup}>
              <label className={styles.label}>
                Nomor Order Produksi (OP)
                <span className={styles.req}>*Wajib diisi</span>
              </label>

              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>📝</span>
                <input
                  type="text"
                  className={styles.manualInput}
                  placeholder="Contoh: OP.022026.000674"
                  value={barcode}
                  onChange={(e) => {
                    setBarcode(e.target.value)
                    setError('')
                  }}
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Quick Sample Selector */}
            {/* <div className={styles.sampleSection}>
              <div className={styles.sampleLabel}>Pilih Cepat / Sampel Barcode:</div>
              <div className={styles.sampleGrid}>
                {SAMPLE_BARCODES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`${styles.sampleChip} ${barcode === s.id ? styles.sampleChipActive : ''}`}
                    onClick={() => handleSelectSample(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div> */}

            <div className={styles.actionButtons}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '13px', fontSize: '15px' }}
              >
                💾 Simpan ke Header & Lanjut →
              </button>

              <div className={styles.secondaryRow}>
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={() => handleRetryScan('failed')}
                >
                  🔄 Coba Scan Ulang
                </button>
                <button
                  type="button"
                  className={styles.testSuccessBtn}
                  onClick={() => handleRetryScan('success')}
                  title="Uji coba jika scan berhasil"
                >
                  ⚡ Tes Scan Berhasil
                </button>
              </div>
            </div>
          </form>
        )}

        {/* ── 3. KONDISI: SCAN BERHASIL ── */}
        {scanStatus === 'success' && (
          <div className={styles.body}>
            <div className={styles.successIconWrap}>
              <div className={styles.successIcon}>✅</div>
            </div>

            <div className={styles.statusBannerSuccess}>
              <div className={styles.statusSuccessTitle}>Scan Barcode Berhasil!</div>
              <div className={styles.statusDesc}>
                Nomor Order Produksi berhasil terdeteksi dari barcode:
              </div>
            </div>

            <div className={styles.detectedCard}>
              <div className={styles.detectedLabel}>Nomor Terbaca:</div>
              <div className={styles.detectedValue}>{barcode || 'OP.022026.000674'}</div>
            </div>

            <div className={styles.actionButtons}>
              <button
                type="button"
                className="btn btn-success"
                style={{ width: '100%', padding: '13px', fontSize: '15px' }}
                onClick={handleSubmit}
              >
                💾 Simpan ke Header & Muat Data →
              </button>

              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => handleRetryScan('failed')}
              >
                ↩ Uji Scan Gagal (Input Manual)
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
