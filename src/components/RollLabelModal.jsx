import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import styles from './RollLabelModal.module.css'

export default function RollLabelModal({
  roll,
  prodData,
  user,
  onPrint,
  onClose,
}) {
  const [printing, setPrinting] = useState(false)
  const printIframeRef = useRef(null)

  // ── Nilai dari props ──
  const rollNum = String(roll?.id ?? roll?.roolNumber ?? 1)
  const lengthVal = roll?.length !== undefined && roll?.length !== null ? String(roll.length) : '0'

  const designCode =
    prodData?.designCode ||
    prodData?.design ||
    prodData?.fabricType ||
    roll?.designCode ||
    roll?.fabricType ||
    ''

  const color = prodData?.color || roll?.color || ''

  const qrNum = String(roll?.qrNum || roll?.QrNum || '').trim()
  const recidProdId = String(prodData?.recidProdId || prodData?.RecidProdId || '').trim()
  const recidSalesId = String(prodData?.recidSalesId || prodData?.RecidSalesId || '').trim()
  const recidItemId = String(prodData?.recidItemId || prodData?.RecidItemId || '').trim()

  // Teks K3L di bagian bawah
  const k3lTitle = 'Registrasi barang K3L'
  const noticeLine1 = 'No Claim After Cutting'
  const noticeLine2 = 'Setelah potong , klaim tidak diterima'

  // QR Code base64 Data URL
  const [qrDataUrl, setQrDataUrl] = useState('')

  // Format Barcode: QrNum(lines);RecidProdid(header);RecidSalesId(header);RecidItemId(header);Length(line);
  const barcodeContent = `${qrNum};${recidProdId};${recidSalesId};${recidItemId};${lengthVal};`

  // Generate crisp QR code beresolusi tinggi
  useEffect(() => {
    let isMounted = true
    const textToEncode = barcodeContent || 'QR.S.0000.00000000;;;;0;'

    QRCode.toDataURL(textToEncode, {
      width: 480,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (isMounted) setQrDataUrl(url)
      })
      .catch((err) => {
        console.error('Error generating label QR code:', err)
      })

    return () => {
      isMounted = false
    }
  }, [barcodeContent])

  // Handle printing
  async function handlePrintAction() {
    setPrinting(true)
    try {
      if (onPrint) {
        await onPrint(roll)
      }

      // Iframe print terisolasi agar 100% pas proporsi 100mm x 47mm landscape
      const iframe = printIframeRef.current
      if (iframe) {
        const doc = iframe.contentWindow.document
        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Label Roll #${rollNum} - 11x7cm</title>
              <style>
                @page {
                  size: 100mm 50mm landscape;
                  margin: 0;
                }
                * {
                  box-sizing: border-box;
                  margin: 0;
                  padding: 0;
                  font-family: Arial, Helvetica, sans-serif;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                html, body {
                  width: 100mm;
                  height: 50mm;
                  background: #ffffff;
                  color: #000000;
                  overflow: hidden;
                  margin: 0;
                  padding: 0;
                }
                .labelWrapper {
                  width: 100mm;
                  height: 50mm;
                  padding: 2.5mm;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                }
                .labelBorder {
                  width: 97mm;
                  height: 47mm;
                  border: 2.5px solid #000000;
                  padding: 3.5mm 4.5mm;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                }
                .topSection {
                  display: flex;
                  flex-direction: row;
                  justify-content: space-between;
                  align-items: flex-start;
                  height: 41mm;
                  gap: 3mm;
                }
                .qrWrapper {
                  width: 26mm;
                  height: 26mm;
                  flex-shrink: 0;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .qrImage {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  image-rendering: pixelated;
                }
                .infoColumn {
                  flex: 1;
                  height: 26mm;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                  padding-left: 2mm;
                }
                .lengthText {
                  font-size: 18pt;
                  font-weight: 900;
                  line-height: 1.05;
                }
                .metaItem {
                  font-size: 10pt;
                  font-weight: 700;
                  line-height: 1.25;
                  text-transform: uppercase;
                }
                .metaLabel {
                  font-weight: 800;
                }
                .rollNumText {
                  font-size: 15pt;
                  font-weight: 900;
                  line-height: 1;
                }
                .bottomSection {
                  display: flex;
                  flex-direction: column;
                  gap: 0.5mm;
                  padding-top: 1.5mm;
                }
                .k3lHeading {
                  font-size: 9pt;
                  font-weight: 800;
                  line-height: 1.25;
                }
                .k3lText {
                  font-size: 7.5pt;
                  font-weight: 500;
                  line-height: 1.2;
                }
              </style>
            </head>
            <body>
              <div class="labelWrapper">
                <div class="labelBorder">
                  <div class="topSection">
                    <div class="qrWrapper">
                      <img src="${qrDataUrl}" alt="QR Code" class="qrImage" />
                    </div>
                    <div class="infoColumn">
                      <div class="lengthText">${lengthVal} Yd</div>
                      <div class="metaItem"><span class="metaLabel">DESIGN </span>${designCode || '-'}</div>
                      <div class="metaItem"><span class="metaLabel">COLOR </span>${color || '-'}</div>
                      <div class="rollNumText">${rollNum}</div>
                    </div>
                  </div>
                  <div class="bottomSection">
                    <div class="k3lHeading">${k3lTitle}</div>
                    <div class="k3lText">${noticeLine1}</div>
                    <div class="k3lText">${noticeLine2}</div>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `)
        doc.close()
        iframe.contentWindow.focus()
        setTimeout(() => {
          iframe.contentWindow.print()
        }, 200)
      } else {
        window.print()
      }
    } catch (err) {
      console.error('Print error:', err)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.topBar}>
          <div className={styles.topTitle}>
            <span>🏷️ Cetak Label Roll #{rollNum}</span>
            {roll?.isPrinted && (
              <span className={styles.alreadyPrintedBadge}>✓ Pernah Dicetak</span>
            )}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Content Area: Focused solely on the Label Preview */}
        <div className={styles.contentArea}>
          <div className={styles.previewWrapper}>
            <div className={styles.labelCard} id="printable-roll-label">
              <div className={styles.labelBorder}>
                {/* Top Section: QR Code on Left, Specs on Right */}
                <div className={styles.topSection}>
                  <div className={styles.qrWrapper}>
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Barcode QR" className={styles.qrImage} />
                    ) : (
                      <div className={styles.qrLoading}>Membuat QR...</div>
                    )}
                  </div>

                  <div className={styles.infoColumn}>
                    <div className={styles.lengthText}>{lengthVal} Yd</div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>DESIGN </span>
                      <span className={styles.metaValue}>{designCode || '-'}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <span className={styles.metaLabel}>COLOR </span>
                      <span className={styles.metaValue}>{color || '-'}</span>
                    </div>
                    <div className={styles.rollNumText}>{rollNum}</div>
                  </div>
                </div>

                {/* Bottom Section: Registrasi barang K3L & Disclaimers */}
                <div className={styles.bottomSection}>
                  <div className={styles.k3lHeading}>{k3lTitle}</div>
                  <div className={styles.k3lText}>{noticeLine1}</div>
                  <div className={styles.k3lText}>{noticeLine2}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className={styles.footerBar}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
            disabled={printing}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handlePrintAction}
            disabled={printing || !qrDataUrl}
          >
            {printing ? '⏳ Menyiapkan...' : '🖨️ Cetak Label'}
          </button>
        </div>
      </div>

      {/* Hidden isolated iframe for 100% accurate 100mm x 47mm label printing */}
      <iframe
        ref={printIframeRef}
        title="Print Label Frame"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '100mm', height: '47mm', border: 'none' }}
      />
    </div>
  )
}
