import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import styles from './ScanModal.module.css'

export const SAMPLE_QR_CODES = [
  {
    label: 'OP.012026.001113 (Ada di DB)',
    value: 'OP.012026.001113;SPM.2026.DES.018;CUST-SCA-01;SCA 100% PE 102 X 52;Putih Reguler',
  },
  {
    label: 'OP.022026.000674 (Ada di DB)',
    value: 'OP.022026.000674;SPM.2026.DES.019;CUST-SCA-02;Rayon Twill 30s Motif Garis;Navy',
  },
  {
    label: 'OP.102026.000999 (Data Baru)',
    value: 'OP.102026.000999;SPM.2026.DES.020;CUST-NEW;Cotton Combed 24s;Hitam Reaktif',
  },
]

/**
 * Helper to parse QR content with format:
 * ProdId;NoWO(seqment);cust code;design code;color
 */
export function parseQrContent(rawString) {
  if (!rawString) return null
  const text = String(rawString).trim()
  if (!text) return null

  if (text.includes(';')) {
    const parts = text.split(';').map((p) => p.trim())
    return {
      raw: text,
      prodId: parts[0] || '',
      seqmentNum: parts[1] || parts[0] || '',
      noWo: parts[1] || parts[0] || '',
      customer: parts[2] || '',
      custCode: parts[2] || '',
      design: parts[3] || '',
      designCode: parts[3] || '',
      color: parts[4] || '',
      isQrBundle: true,
    }
  }

  // Single ProdId fallback
  return {
    raw: text,
    prodId: text,
    seqmentNum: text,
    noWo: text,
    customer: '',
    custCode: '',
    design: '',
    designCode: '',
    color: '',
    isQrBundle: false,
  }
}

export default function ScanModal({ initialProdId, onDone, onCancel }) {
  // Tabs: 'camera' | 'file' | 'manual'
  const [activeTab, setActiveTab] = useState('camera')
  const [scannedResult, setScannedResult] = useState(null) // parsed object
  const [manualInput, setManualInput] = useState(initialProdId || '')
  const [cameraError, setCameraError] = useState('')
  const [cameraLoading, setCameraLoading] = useState(true)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const qrReaderRef = useRef(null)
  const scannerInstanceRef = useRef(null)
  const fileInputRef = useRef(null)

  // Start live camera scanning
  useEffect(() => {
    let isMounted = true

    if (activeTab === 'camera' && !scannedResult) {
      setCameraLoading(true)
      setCameraError('')

      const elementId = 'html5qr-reader'
      const html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
        ],
        verbose: false,
      })

      scannerInstanceRef.current = html5QrCode

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      }

      // Gunakan kamera belakang (environment) secara default untuk HP
      html5QrCode
        .start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (!isMounted) return
            try {
              if (navigator.vibrate) navigator.vibrate(100)
            } catch {
              // ignore vibration error
            }

            const parsed = parseQrContent(decodedText)
            setScannedResult(parsed)
            // Stop scanning once detected
            if (html5QrCode.isScanning) {
              html5QrCode.stop().catch(() => { })
            }
          },
          () => {
            // Frame parse progress, ignore
          }
        )
        .then(() => {
          if (isMounted) setCameraLoading(false)
        })
        .catch((err) => {
          if (!isMounted) return
          console.warn('[Camera Start Warning]:', err)
          setCameraLoading(false)
          let msg = 'Kamera tidak dapat diakses.'
          if (err?.name === 'NotAllowedError') {
            msg = 'Izin kamera ditolak. Berikan izin kamera di browser Anda.'
          } else if (err?.name === 'NotFoundError') {
            msg = 'Tidak ada perangkat kamera yang terdeteksi.'
          } else if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            msg = 'Browser HP mewajibkan HTTPS untuk akses kamera langsung. Silakan gunakan tab "Ambil Foto" atau buka via HTTPS.'
          } else {
            msg = `Kamera gagal aktif (${err.message || 'Error'}). Silakan coba tab "Ambil Foto" atau "Input Manual".`
          }
          setCameraError(msg)
        })
    }

    return () => {
      isMounted = false
      if (scannerInstanceRef.current) {
        if (scannerInstanceRef.current.isScanning) {
          scannerInstanceRef.current.stop().catch(() => { }).finally(() => {
            scannerInstanceRef.current?.clear?.()
          })
        } else {
          try {
            scannerInstanceRef.current.clear?.()
          } catch {
            // ignore
          }
        }
      }
    }
  }, [activeTab, scannedResult])

  // Handle Scan from Image File or Native Camera Photo
  async function handleFileScan(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setIsProcessingFile(true)
    setErrorMsg('')

    try {
      const html5QrCode = new Html5Qrcode('html5qr-file-runner', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ],
        verbose: false,
      })

      const decodedText = await html5QrCode.scanFile(file, true)
      try {
        if (navigator.vibrate) navigator.vibrate(100)
      } catch {
        // ignore
      }

      const parsed = parseQrContent(decodedText)
      setScannedResult(parsed)
    } catch (err) {
      console.warn('File scan failed:', err)
      setErrorMsg('QR Code / Barcode tidak terdeteksi pada gambar. Pastikan gambar jelas dan tidak buram.')
    } finally {
      setIsProcessingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Handle Manual Form Submit
  function handleManualSubmit(e) {
    if (e) e.preventDefault()
    const trimmed = manualInput.trim()
    if (!trimmed) {
      setErrorMsg('Nomor Order Produksi atau isi QR wajib diisi.')
      return
    }

    const parsed = parseQrContent(trimmed)
    setScannedResult(parsed)
  }

  // Confirm and proceed to MainPage
  function handleConfirm() {
    if (!scannedResult || !scannedResult.prodId) {
      setErrorMsg('Data hasil scan tidak valid.')
      return
    }
    onDone(scannedResult)
  }

  // Reset to scan again
  function handleReset() {
    setScannedResult(null)
    setErrorMsg('')
    setCameraError('')
  }

  return (
    <div className={styles.overlay} onClick={onCancel} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        {/* Header Modal */}
        <div className={styles.head}>
          <div className={styles.headTitle}>
            <span>📷 Pemindai Barcode / QR Order</span>
            {scannedResult ? (
              <span className={styles.badgeSuccess}>✓ Terdeteksi</span>
            ) : (
              <span className={styles.badgeScanning}>Siap Scan</span>
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={onCancel} aria-label="Tutup">
            ✕
          </button>
        </div>

        {/* ── JIKA QR SUDAH TERDETEKSI / SELESAI DIPROSES ── */}
        {scannedResult ? (
          <div className={styles.body}>
            <div className={styles.successIconWrap}>
              <div className={styles.successIcon}>✅</div>
            </div>

            <div className={styles.statusBannerSuccess}>
              <div className={styles.statusSuccessTitle}>QR Code Berhasil Terbaca!</div>
              <div className={styles.statusDesc}>
                Data order produksi berhasil diurai dari QR Code:
              </div>
            </div>

            {/* Preview Field Cards */}
            <div className={styles.parsedCard}>
              <div className={styles.parsedRow}>
                <span className={styles.parsedKey}>OP Number:</span>
                <span className={styles.parsedValHighlight}>{scannedResult.prodId}</span>
              </div>
              <div className={styles.parsedRow}>
                <span className={styles.parsedKey}>DO Number (Seqment):</span>
                <span className={styles.parsedVal}>{scannedResult.noWo || scannedResult.seqmentNum || '-'}</span>
              </div>
              <div className={styles.parsedRow}>
                <span className={styles.parsedKey}>Cust Code:</span>
                <span className={styles.parsedVal}>{scannedResult.custCode || scannedResult.customer || '-'}</span>
              </div>
              <div className={styles.parsedRow}>
                <span className={styles.parsedKey}>Design Code:</span>
                <span className={styles.parsedVal}>{scannedResult.designCode || scannedResult.design || '-'}</span>
              </div>
              <div className={styles.parsedRow}>
                <span className={styles.parsedKey}>Color:</span>
                <span className={styles.parsedValHighlight}>{scannedResult.color || '-'}</span>
              </div>
            </div>

            <div className={styles.actionButtons}>
              <button
                type="button"
                className="btn btn-success"
                style={{ width: '100%', padding: '13px', fontSize: '15px' }}
                onClick={handleConfirm}
              >
                💾 Simpan ke Header & Muat Data →
              </button>

              <button
                type="button"
                className={styles.retryBtn}
                onClick={handleReset}
              >
                🔄 Scan Ulang QR Lain
              </button>
            </div>
          </div>
        ) : (
          /* ── AREA SELECTION TABS & SCANNER ── */
          <div className={styles.body}>
            {/* Navigasi Tab */}
            <div className={styles.tabNav}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'camera' ? styles.tabBtnActive : ''}`}
                onClick={() => {
                  setActiveTab('camera')
                  setErrorMsg('')
                }}
              >
                📹 Kamera Langsung
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'file' ? styles.tabBtnActive : ''}`}
                onClick={() => {
                  setActiveTab('file')
                  setErrorMsg('')
                }}
              >
                📸 Ambil Foto / Upload
              </button>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'manual' ? styles.tabBtnActive : ''}`}
                onClick={() => {
                  setActiveTab('manual')
                  setErrorMsg('')
                }}
              >
                ⌨️ Input / Barcode Gun
              </button>
            </div>

            {errorMsg && <div className={styles.errorAlert}>⚠️ {errorMsg}</div>}

            {/* TAB 1: LIVE CAMERA */}
            {activeTab === 'camera' && (
              <div className={styles.cameraTabArea}>
                <div className={styles.cameraFrameWrapper}>
                  {/* Container HTML5-QRCode */}
                  <div id="html5qr-reader" ref={qrReaderRef} className={styles.readerElement} />

                  {cameraLoading && (
                    <div className={styles.cameraOverlayLoading}>
                      <div className={styles.spinner} />
                      <span>Menghubungkan ke kamera HP…</span>
                    </div>
                  )}

                  {!cameraLoading && !cameraError && (
                    <div className={styles.laserOverlay}>
                      <div className={styles.scanLaser} />
                      <div className={styles.targetReticle} />
                    </div>
                  )}
                </div>

                {cameraError ? (
                  <div className={styles.cameraErrorBox}>
                    <div className={styles.cameraErrorTitle}>⚠️ Akses Kamera Tidak Tersedia</div>
                    <div className={styles.cameraErrorText}>{cameraError}</div>
                    <div className={styles.cameraErrorActions}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setActiveTab('file')}
                      >
                        📸 Buka Kamera via "Ambil Foto"
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setActiveTab('manual')}
                      >
                        ⌨️ Masukkan Nomor Manual
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.helperText}>
                    Arahkan kamera ke QR Code bertuliskan <code>ProdId;NoDO(seqment);cust code;design code;color</code>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: AMBIL FOTO / FILE SCAN */}
            {activeTab === 'file' && (
              <div className={styles.fileTabArea}>
                <div id="html5qr-file-runner" style={{ display: 'none' }} />

                <div className={styles.fileBox}>
                  <div className={styles.fileIcon}>📸</div>
                  <div className={styles.fileTitle}>Ambil Foto QR Code dengan HP</div>
                  <div className={styles.fileDesc}>
                    Buka kamera bawaan HP untuk memotret label barcode/QR kain, atau pilih file gambar dari galeri:
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleFileScan}
                  />

                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '12px', marginTop: '12px' }}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isProcessingFile}
                  >
                    {isProcessingFile ? '⏳ Memproses Gambar…' : '📷 Buka Kamera / Pilih Foto'}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: INPUT MANUAL / SCANNER GUN */}
            {activeTab === 'manual' && (
              <form onSubmit={handleManualSubmit} className={styles.manualTabArea}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Isi QR Code atau Nomor Order Produksi
                    <span className={styles.req}>*Wajib</span>
                  </label>
                  <div className={styles.inputWrap}>
                    <span className={styles.inputIcon}>📝</span>
                    <input
                      type="text"
                      className={styles.manualInput}
                      placeholder="Format: ProdId;NoDO(SeqmentNum);cust code;design code;color"
                      value={manualInput}
                      onChange={(e) => {
                        setManualInput(e.target.value)
                        setErrorMsg('')
                      }}
                      autoFocus
                    />
                  </div>
                  <div className={styles.inputHint}>
                    Mendukung tembakan barcode scanner gun atau paste format lengkap:
                    <br />
                    <code>ProdId;NoDO(SeqmentNum);cust code;design code;color</code>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', marginBottom: '14px' }}
                >
                  ⚡ Proses Barcode / QR →
                </button>

                {/* Sample QR Selector */}
                <div className={styles.sampleSection}>
                  <div className={styles.sampleLabel}>Pilih Cepat Sampel QR Lengkap:</div>
                  <div className={styles.sampleGrid}>
                    {SAMPLE_QR_CODES.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        className={`${styles.sampleChip} ${manualInput === s.value ? styles.sampleChipActive : ''}`}
                        onClick={() => {
                          setManualInput(s.value)
                          setErrorMsg('')
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>{s.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px', wordBreak: 'break-all' }}>
                          {s.value}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </form>
            )}

            {/* Tombol Tutup / Batal */}
            <button
              type="button"
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '16px' }}
              onClick={onCancel}
            >
              Batal
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
