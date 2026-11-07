import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import logoCunda from '../img/lg_cunda.png'
import logoHalal from '../img/lg_halal.png'
import logoTkdn from '../img/lg_tkdn.png'
import { toDDMMYYYY } from '../utils/dateUtils.js'
import { getAvailablePrintersApi, directPrintRollLabelApi } from '../services/api.js'
import styles from './ETicketModal.module.css'

export default function ETicketModal({
  roll,
  prodData,
  user,
  defects = [],
  joinedPieces = [],
  onPrint,
  onClose,
}) {
  const [printing, setPrinting] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const printIframeRef = useRef(null)

  // ── State untuk Cetak Langsung (Direct Print tanpa Windows Print) ──
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    return localStorage.getItem('mpm_direct_printer') || 'ZDesigner ZD230-203dpi ZPL'
  })
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [directPrinting, setDirectPrinting] = useState(false)
  const [printStatus, setPrintStatus] = useState(null)

  // ── Derive initial values from props or sensible defaults matching reference ──
  const initialRollNum = String(roll?.id ?? 1).padStart(2, '0')

  // Design / Jenis Kain:
  // "cd itu design, jadi CD Design (jenis kain), kode design jg sama jenis kain"
  const rawDesign =
    prodData?.fabricType ||
    prodData?.design ||
    prodData?.designCode ||
    roll?.fabricType ||
    roll?.design ||
    'A0301'

  // Bersihkan prefiks 'CD' jika ada di data awal agar tidak dobel
  const initialKodeDesign =
    String(rawDesign).trim().replace(/^CD\s*[-–:]?\s*/i, '') || 'A0301'

  // Motif / Warna: diambil dari prodData.color atau fallback 'WARNA WARNI'
  const initialMotif =
    prodData?.color && prodData.color.trim() !== ''
      ? prodData.color.toUpperCase()
      : 'WARNA WARNI'

  // Date in DD/MM/YYYY
  const initialDate = toDDMMYYYY(roll?.transDate || roll?.TransDate || roll?.createdAt)

  // Width / Length (lebar kain, standard 52")
  const initialLength =
    prodData?.width && prodData.width.includes('52')
      ? '52"'
      : prodData?.width || '52"'

  // QTY
  const initialQty = roll?.length ? `${roll.length} YARD` : '156 YARD'

  // Sambungan breakdown from joined pieces for this roll
  const joinedPieceLengths = joinedPieces
    .map((piece) => piece.LengthPoint ?? piece.lengthPoint ?? piece.yard)
    .filter((length) => length !== undefined && length !== null && String(length).trim() !== '')
  const initialBreakdown = joinedPieceLengths.length
    ? `X (${joinedPieceLengths.join(' + ')})`
    : ''

  // QR Link & Label
  const initialQrLink = 'https://linktr.ee/rayoncunda'
  const initialQrLabel = 'linktr.ee/rayoncunda'

  // K3L Number
  const initialK3L = '20-D-001909'

  // ── State for live customizable values ──
  const [rollNum, setRollNum] = useState(initialRollNum)
  const [kodeDesign, setKodeDesign] = useState(initialKodeDesign)
  const [motif, setMotif] = useState(initialMotif)
  const [dateStr, setDateStr] = useState(initialDate)
  const [lengthStr, setLengthStr] = useState(initialLength)
  const [qtyStr, setQtyStr] = useState(initialQty)
  const [breakdownStr, setBreakdownStr] = useState(initialBreakdown)
  const [qrUrl, setQrUrl] = useState(initialQrLink)
  const [qrLabel, setQrLabel] = useState(initialQrLabel)
  const [k3lNumber, setK3lNumber] = useState(initialK3L)

  // QR Code base64 DataURL
  const [qrDataUrl, setQrDataUrl] = useState('')

  // Generate crisp QR code whenever qrUrl changes
  useEffect(() => {
    let isMounted = true
    const textToEncode = qrUrl.trim() || 'https://linktr.ee/rayoncunda'

    QRCode.toDataURL(textToEncode, {
      width: 280,
      margin: 1,
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
        console.error('Error generating QR code:', err)
      })

    return () => {
      isMounted = false
    }
  }, [qrUrl])

  // Reset to original defaults
  function handleResetDefaults() {
    setRollNum(initialRollNum)
    setKodeDesign(initialKodeDesign)
    setMotif(initialMotif)
    setDateStr(initialDate)
    setLengthStr(initialLength)
    setQtyStr(initialQty)
    setBreakdownStr(initialBreakdown)
    setQrUrl(initialQrLink)
    setQrLabel(initialQrLabel)
    setK3lNumber(initialK3L)
  }

  // Format Kode Design / Jenis Kain:
  // "cd itu design, jadi CD Design (jenis kain), kode design jg sama jenis kain"
  const cleanCode = kodeDesign.trim()
  const hasCdPrefix = /^CD\s*[-–:]?\s*/i.test(cleanCode)
  const innerCode = hasCdPrefix
    ? cleanCode.replace(/^CD\s*[-–:]?\s*/i, '').trim()
    : cleanCode

  // Judul box atas: selalu "CD [Design / Jenis Kain]"
  const boxTopTitle = hasCdPrefix
    ? `CD ${innerCode.toUpperCase()}`
    : `CD ${cleanCode.toUpperCase()}`

  // Nilai baris tabel KODE DESIGN: jenis kain yang sama
  const tableKodeDesign = (innerCode || cleanCode).toUpperCase()

  // Dynamic font sizing for 7x11 cm (Portrait)
  const titleLength = boxTopTitle.length
  let boxTitleFontSize = '19px'
  let printTitleFontSize = '13pt'
  if (titleLength > 30) {
    boxTitleFontSize = '12px'
    printTitleFontSize = '8.5pt'
  } else if (titleLength > 20) {
    boxTitleFontSize = '14px'
    printTitleFontSize = '10pt'
  } else if (titleLength > 13) {
    boxTitleFontSize = '16px'
    printTitleFontSize = '11.5pt'
  }

  const motifLength = motif.length
  let motifFontSize = '16px'
  let printMotifFontSize = '11pt'
  if (motifLength > 30) {
    motifFontSize = '10.5px'
    printMotifFontSize = '7.5pt'
  } else if (motifLength > 20) {
    motifFontSize = '12.5px'
    printMotifFontSize = '9pt'
  } else if (motifLength > 14) {
    motifFontSize = '14px'
    printMotifFontSize = '10pt'
  }

  // Handle printing
  async function handlePrintAction() {
    setPrinting(true)
    try {
      if (onPrint) {
        await onPrint(roll)
      }
      // Iframe print terisolasi agar 100% pas ukuran kertas 70mm x 110mm (7x11 cm portrait)
      const iframe = printIframeRef.current
      if (iframe) {
        const doc = iframe.contentWindow.document
        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>E-Ticket Roll #${rollNum} - 7x11cm</title>
              <style>
                @page {
                  size: 70mm 110mm portrait;
                  margin: 0;
                }
                * {
                  box-sizing: border-box;
                  margin: 0;
                  padding: 0;
                  font-family: 'Times New Roman', Times, Georgia, serif;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                html, body {
                  width: 70mm;
                  height: 110mm;
                  background: #ffffff;
                  color: #000000;
                  overflow: hidden;
                  margin: 0;
                  padding: 0;
                }
                .labelCard {
                  width: 70mm;
                  height: 110mm;
                  padding: 3mm 3.5mm 2.5mm 3.5mm;
                  box-sizing: border-box;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                  background: #ffffff;
                }
                .labelHeader {
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  width: 100%;
                  height: 11mm;
                }
                .headerLeft {
                  display: flex;
                  align-items: center;
                  gap: 1.8mm;
                }
                .logoCunda {
                  width: 10.5mm;
                  height: 10.5mm;
                  object-fit: contain;
                  border-radius: 50%;
                  display: block;
                }
                .companyInfo {
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                }
                .companyName {
                  font-size: 8.5pt;
                  font-weight: 900;
                  letter-spacing: 0.3px;
                  line-height: 1.05;
                  margin: 0 0 0.3mm 0;
                  color: #000000;
                }
                .companyAddress {
                  font-size: 5pt;
                  font-weight: 400;
                  line-height: 1.15;
                  color: #000000;
                }
                .headerRight {
                  display: flex;
                  align-items: center;
                  gap: 1.5mm;
                }
                .logoHalal {
                  height: 10mm;
                  width: auto;
                  max-width: 9mm;
                  object-fit: contain;
                  display: block;
                }
                .logoTkdn {
                  height: 10mm;
                  width: auto;
                  max-width: 11mm;
                  object-fit: contain;
                  display: block;
                }
                .mainBox {
                  border: 1.8px solid #000000;
                  border-radius: 3.5mm;
                  padding: 2mm 2mm 2.2mm 2mm;
                  background: #ffffff;
                  box-sizing: border-box;
                  display: flex;
                  flex-direction: column;
                  flex: 1;
                  margin: 1.2mm 0;
                }
                .boxTitles {
                  text-align: center;
                  margin-bottom: 1.5mm;
                }
                .boxTitleCode {
                  font-size: ${printTitleFontSize};
                  font-weight: 900;
                  letter-spacing: 0.2px;
                  line-height: 1.1;
                  color: #000000;
                }
                .boxTitleMotif {
                  font-size: ${printMotifFontSize};
                  font-weight: 900;
                  letter-spacing: 0.3px;
                  line-height: 1.1;
                  color: #000000;
                  margin-top: 0.6mm;
                }
                .boxBody {
                  display: flex;
                  align-items: flex-start;
                  justify-content: space-between;
                  gap: 2mm;
                  flex: 1;
                }
                .qrColumn {
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  width: 23mm;
                  flex-shrink: 0;
                }
                .qrWrapper {
                  width: 23mm;
                  height: 23mm;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  background: #ffffff;
                }
                .qrImage {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  image-rendering: pixelated;
                  display: block;
                }
                .qrLinkText {
                  font-family: Arial, Helvetica, sans-serif;
                  font-size: 4.8pt;
                  font-weight: 600;
                  color: #000000;
                  text-align: center;
                  margin-top: 0.8mm;
                  word-break: break-all;
                  line-height: 1.1;
                }
                .detailsColumn {
                  flex: 1;
                  min-width: 0;
                  padding-top: 0.4mm;
                }
                .detailsGrid {
                  display: grid;
                  grid-template-columns: max-content auto 1fr;
                  row-gap: 1.4mm;
                  align-items: baseline;
                }
                .labelCell {
                  font-size: 7.2pt;
                  font-weight: 900;
                  color: #000000;
                  white-space: nowrap;
                }
                .colonCell {
                  font-size: 7.2pt;
                  font-weight: 900;
                  color: #000000;
                  padding: 0 1mm;
                  text-align: center;
                }
                .valueCell {
                  font-size: 7.2pt;
                  font-weight: 600;
                  color: #000000;
                  white-space: nowrap;
                }
                .valueCellDesign {
                  font-size: 7.2pt;
                  font-weight: 600;
                  color: #000000;
                  word-break: break-word;
                  line-height: 1.15;
                }
                .qtyContainer {
                  display: flex;
                  flex-direction: column;
                  align-items: flex-start;
                }
                .breakdownText {
                  font-size: 6.5pt;
                  font-weight: 600;
                  color: #000000;
                  margin-top: 0.4mm;
                  white-space: nowrap;
                }
                .bottomSection {
                  height: 5.5mm;
                  text-align: center;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                }
                .k3lTitle {
                  font-size: 5.2pt;
                  font-weight: 800;
                  letter-spacing: 0.3px;
                  color: #000000;
                  text-transform: uppercase;
                }
                .k3lNumber {
                  font-size: 5.2pt;
                  font-weight: 700;
                  letter-spacing: 0.2px;
                  color: #000000;
                  margin-top: 0.3mm;
                }
              </style>
            </head>
            <body>
              <div class="labelCard">
                <div class="labelHeader">
                  <div class="headerLeft">
                    <img src="${logoCunda}" alt="Rayon Cunda Logo" class="logoCunda" />
                    <div class="companyInfo">
                      <h1 class="companyName">RAYON CUNDA</h1>
                      <div class="companyAddress">Tersono, Kec. Tersono</div>
                      <div class="companyAddress">Kabupaten Batang</div>
                    </div>
                  </div>
                  <div class="headerRight">
                    <img src="${logoHalal}" alt="Halal Indonesia" class="logoHalal" />
                    <img src="${logoTkdn}" alt="TKDN" class="logoTkdn" />
                  </div>
                </div>

                <div class="mainBox">
                  <div class="boxTitles">
                    <div class="boxTitleCode">${boxTopTitle}</div>
                    <div class="boxTitleMotif">${motif.toUpperCase()}</div>
                  </div>

                  <div class="boxBody">
                    <div class="qrColumn">
                      <div class="qrWrapper">
                        <img src="${qrDataUrl}" alt="QR Code" class="qrImage" />
                      </div>
                      <div class="qrLinkText">${qrLabel}</div>
                    </div>

                    <div class="detailsColumn">
                      <div class="detailsGrid">
                        <span class="labelCell">NO. ROLL</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${rollNum}</span>

                        <span class="labelCell">KODE DESIGN</span>
                        <span class="colonCell">:</span>
                        <span class="valueCellDesign">${tableKodeDesign}</span>

                        <span class="labelCell">DATE</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${dateStr}</span>

                        <span class="labelCell">LENGTH</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${lengthStr}</span>

                        <span class="labelCell">QTY</span>
                        <span class="colonCell">:</span>
                        <div class="qtyContainer">
                          <span class="valueCell">${qtyStr}</span>
                          ${breakdownStr && breakdownStr.trim() !== '' ? `<div class="breakdownText">${breakdownStr.trim()}</div>` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="bottomSection">
                  <div class="k3lTitle">NOMOR REGISTRASI BARANG K3L</div>
                  <div class="k3lNumber">${k3lNumber}</div>
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
        // Fallback trigger native browser print
        window.print()
      }
    } catch (err) {
      console.error('Print error:', err)
    } finally {
      setPrinting(false)
    }
  }

  // ── Ambil daftar printer yang terpasang dari backend ──
  async function fetchPrinters() {
    setLoadingPrinters(true)
    try {
      const res = await getAvailablePrintersApi()
      const list = res?.printers || []
      setPrinters(list)

      const savedPrinter = localStorage.getItem('mpm_direct_printer')
      const exists = list.some((p) => p.name === savedPrinter)

      if (savedPrinter && exists) {
        setSelectedPrinter(savedPrinter)
      } else if (res?.zebraPrinter) {
        setSelectedPrinter(res.zebraPrinter)
        localStorage.setItem('mpm_direct_printer', res.zebraPrinter)
      } else if (res?.defaultPrinter) {
        setSelectedPrinter(res.defaultPrinter)
      } else if (list.length > 0) {
        setSelectedPrinter(list[0].name)
      }
    } catch (err) {
      console.warn('Gagal memuat daftar printer:', err)
    } finally {
      setLoadingPrinters(false)
    }
  }

  useEffect(() => {
    fetchPrinters()
  }, [])

  function handlePrinterChange(e) {
    const val = e.target.value
    setSelectedPrinter(val)
    localStorage.setItem('mpm_direct_printer', val)
    setPrintStatus(null)
  }

  // ── Render E-Ticket ke Canvas (70x110 mm portrait pada 203 DPI = 560x880 px) ──
  async function renderETicketToCanvas() {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 560
      canvas.height = 880
      const ctx = canvas.getContext('2d')

      // Background putih
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 560, 880)

      const loadImage = (src) =>
        new Promise((resolve) => {
          if (!src) return resolve(null)
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = src
        })

      const [cundaImg, halalImg, tkdnImg, qrImg] = await Promise.all([
        loadImage(logoCunda),
        loadImage(logoHalal),
        loadImage(logoTkdn),
        loadImage(qrDataUrl),
      ])

      // 1. Header Area
      if (cundaImg) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(60, 55, 36, 0, Math.PI * 2)
        ctx.closePath()
        ctx.clip()
        ctx.drawImage(cundaImg, 24, 19, 72, 72)
        ctx.restore()
      }

      ctx.fillStyle = '#000000'
      ctx.textAlign = 'left'
      ctx.font = 'bold 22px "Times New Roman", serif'
      ctx.fillText('RAYON CUNDA', 108, 44)
      ctx.font = '13.5px "Times New Roman", serif'
      ctx.fillText('Tersono, Kec. Tersono', 108, 64)
      ctx.fillText('Kabupaten Batang', 108, 82)

      if (halalImg) {
        ctx.drawImage(halalImg, 408, 22, 54, 66)
      }
      if (tkdnImg) {
        ctx.drawImage(tkdnImg, 470, 22, 66, 66)
      }

      // 2. Main Box (Rounded rectangle)
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 3.5
      ctx.beginPath()
      const bx = 16
      const by = 98
      const bw = 528
      const bh = 712
      const r = 20
      ctx.moveTo(bx + r, by)
      ctx.lineTo(bx + bw - r, by)
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r)
      ctx.lineTo(bx + bw, by + bh - r)
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh)
      ctx.lineTo(bx + r, by + bh)
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r)
      ctx.lineTo(bx, by + r)
      ctx.quadraticCurveTo(bx, by, bx + r, by)
      ctx.closePath()
      ctx.stroke()

      // Box Titles
      ctx.textAlign = 'center'
      ctx.font = 'bold 28px "Times New Roman", serif'
      ctx.fillText(boxTopTitle, 280, 146)
      ctx.font = 'bold 24px "Times New Roman", serif'
      ctx.fillText(motif.toUpperCase(), 280, 182)

      // QR Code
      if (qrImg) {
        ctx.drawImage(qrImg, 34, 218, 175, 175)
      }
      if (qrLabel) {
        ctx.font = 'bold 12px Arial, sans-serif'
        ctx.fillText(qrLabel, 122, 412)
      }

      // Details Grid
      ctx.textAlign = 'left'
      ctx.font = 'bold 19px "Times New Roman", serif'
      const colX = 225
      const colonX = 370
      const valX = 390

      const rows = [
        ['NO. ROLL', rollNum],
        ['KODE DESIGN', tableKodeDesign],
        ['DATE', dateStr],
        ['LENGTH', lengthStr],
        ['QTY', qtyStr],
      ]

      let y = 240
      for (const [lbl, val] of rows) {
        ctx.fillText(lbl, colX, y)
        ctx.fillText(':', colonX, y)
        ctx.fillText(val, valX, y)
        y += 36
      }

      if (breakdownStr) {
        ctx.font = 'bold 13.5px Arial, sans-serif'
        ctx.fillText(breakdownStr, valX, y - 6)
      }

      // 3. Bottom Section
      ctx.textAlign = 'center'
      ctx.font = 'bold 14px "Times New Roman", serif'
      ctx.fillText('NOMOR REGISTRASI BARANG K3L', 280, 836)
      ctx.font = '13.5px "Times New Roman", serif'
      ctx.fillText(k3lNumber, 280, 856)

      return canvas
    } catch (err) {
      console.warn('Gagal render canvas e-ticket:', err)
      return null
    }
  }

  // ── Konversi Canvas 1-bit ke format ZPL ^GFA Hex untuk printer Zebra ──
  function canvasToZplGf(canvas, threshold = 160) {
    if (!canvas) return null
    const ctx = canvas.getContext('2d')
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const { data, width, height } = imgData
    const bytesPerRow = Math.ceil(width / 8)
    const totalBytes = bytesPerRow * height
    let hex = ''

    for (let y = 0; y < height; y++) {
      for (let b = 0; b < bytesPerRow; b++) {
        let byteVal = 0
        for (let bit = 0; bit < 8; bit++) {
          const x = b * 8 + bit
          if (x < width) {
            const idx = (y * width + x) * 4
            const r = data[idx]
            const g = data[idx + 1]
            const bVal = data[idx + 2]
            const a = data[idx + 3]
            const lum = 0.299 * r + 0.587 * g + 0.114 * bVal
            if (a > 64 && lum < threshold) {
              byteVal |= 1 << (7 - bit)
            }
          }
        }
        hex += byteVal.toString(16).padStart(2, '0').toUpperCase()
      }
    }
    return `^XA^PW${width}^LL${height}^LH0,0^FO0,0^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hex}^FS^XZ`
  }

  // ── Eksekusi Cetak Langsung (Direct Print) ke printer yang dipilih ──
  async function handleDirectPrintAction() {
    if (!selectedPrinter) {
      setPrintStatus({
        type: 'error',
        message: 'Pilih printer tujuan terlebih dahulu.',
      })
      return
    }

    setDirectPrinting(true)
    setPrintStatus(null)

    try {
      const labelData = {
        rollNum,
        boxTopTitle,
        motif,
        tableKodeDesign,
        kodeDesign,
        dateStr,
        lengthStr,
        qtyStr,
        breakdownStr,
        qrUrl,
        qrLabel,
        k3lNumber,
      }

      const canvas = await renderETicketToCanvas()
      const imageBase64 = canvas ? canvas.toDataURL('image/png') : null
      const isZebra = /ZDesigner|Zebra|ZPL/i.test(selectedPrinter)
      const rawZpl = isZebra && canvas ? canvasToZplGf(canvas) : null

      const res = await directPrintRollLabelApi({
        printerName: selectedPrinter,
        labelData,
        rawZpl,
        imageBase64,
        ticketType: 'eticket',
      })

      if (onPrint) {
        await onPrint(roll)
      }

      setPrintStatus({
        type: 'success',
        message: res?.message || `✓ E-Ticket berhasil dicetak langsung ke "${selectedPrinter}"!`,
      })
    } catch (err) {
      console.error('Direct print failed:', err)
      setPrintStatus({
        type: 'error',
        message: `Gagal cetak langsung: ${err.message || 'Printer tidak merespon'}. Silakan periksa koneksi atau gunakan Windows Print.`,
      })
    } finally {
      setDirectPrinting(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Modal Controls (Hidden during print) */}
        <div className={styles.topBar}>
          <div className={styles.topTitle}>
            <span>🏷️ Cetak E-Ticket Roll #{rollNum} (7x11 cm)</span>
            {roll?.isPrinted && (
              <span className={styles.alreadyPrintedBadge}>✓ Sudah Pernah Dicetak</span>
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

        {/* Printable Ticket Area */}
        <div className={styles.ticketArea} id="printable-e-ticket">
          {/* Notice & Customization Toggle (Hidden during print) */}
          <div className={styles.previewNotice}>
            <span>Format Standar Label Rayon Cunda (7x11 cm Portrait)</span>
            <button
              type="button"
              className={styles.toggleEditBtn}
              onClick={() => setShowEditor(!showEditor)}
            >
              {showEditor ? '▲ Tutup Pengaturan' : '✏️ Sesuaikan Data Label'}
            </button>
          </div>

          {/* Optional In-Place Field Editor (Hidden during print) */}
          {showEditor && (
            <div className={styles.editDrawer}>
              <div className={styles.editGrid}>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Design / Jenis Kain</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={kodeDesign}
                    onChange={(e) => setKodeDesign(e.target.value)}
                    placeholder="Contoh: A0301 atau Rayon Twill"
                  />
                  <span className={styles.editHint}>
                    Tampil sebagai &quot;CD [Design]&quot; di judul &amp; &quot;KODE DESIGN&quot; di tabel
                  </span>
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Motif / Warna</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Contoh: WARNA WARNI"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>No. Roll</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={rollNum}
                    onChange={(e) => setRollNum(e.target.value)}
                    placeholder="Contoh: 01"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Tanggal (DD/MM/YYYY)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    placeholder="06/11/2026"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Length (Lebar)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={lengthStr}
                    onChange={(e) => setLengthStr(e.target.value)}
                    placeholder='52"'
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>QTY</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={qtyStr}
                    onChange={(e) => setQtyStr(e.target.value)}
                    placeholder="156 YARD"
                  />
                </div>
                <div className={styles.editGroupFull}>
                  <label className={styles.editLabel}>Sambungan / Potongan (Opsional)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={breakdownStr}
                    onChange={(e) => setBreakdownStr(e.target.value)}
                    placeholder="Contoh: X (100 + 56) atau kosongkan"
                  />
                </div>
                <div className={styles.editGroupFull}>
                  <label className={styles.editLabel}>Target URL QR Code</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={qrUrl}
                    onChange={(e) => {
                      setQrUrl(e.target.value)
                      setQrLabel(e.target.value.replace(/^https?:\/\//, ''))
                    }}
                    placeholder="https://linktr.ee/rayoncunda"
                  />
                </div>
              </div>
              <button
                type="button"
                className={styles.resetBtn}
                onClick={handleResetDefaults}
              >
                ↺ Reset ke Default
              </button>
            </div>
          )}

          {/* ─────────────────────────────────────────────────────────────
              THE EXACT RAYON CUNDA PHYSICAL STICKER LABEL
          ───────────────────────────────────────────────────────────── */}
          <div className={styles.labelCard}>
            {/* 1. Header Section with Logos and Company Info */}
            <div className={styles.labelHeader}>
              <div className={styles.headerLeft}>
                <img
                  src={logoCunda}
                  alt="Rayon Cunda Logo"
                  className={styles.logoCunda}
                />
                <div className={styles.companyInfo}>
                  <h1 className={styles.companyName}>RAYON CUNDA</h1>
                  <div className={styles.companyAddress}>Tersono, Kec. Tersono</div>
                  <div className={styles.companyAddress}>Kabupaten Batang</div>
                </div>
              </div>

              <div className={styles.headerRight}>
                <img
                  src={logoHalal}
                  alt="Halal Indonesia"
                  className={styles.logoHalal}
                />
                <img
                  src={logoTkdn}
                  alt="TKDN Tingkat Komponen Dalam Negeri"
                  className={styles.logoTkdn}
                />
              </div>
            </div>

            {/* 2. Center Rounded Box */}
            <div className={styles.mainBox}>
              {/* Box Titles */}
              <div className={styles.boxTitles}>
                <div
                  className={styles.boxTitleCode}
                  style={{ fontSize: boxTitleFontSize }}
                >
                  {boxTopTitle}
                </div>
                <div
                  className={styles.boxTitleMotif}
                  style={{ fontSize: motifFontSize }}
                >
                  {motif.toUpperCase()}
                </div>
              </div>

              {/* Box Body: Left QR & Right Specification List */}
              <div className={styles.boxBody}>
                {/* Left QR Column */}
                <div className={styles.qrColumn}>
                  <div className={styles.qrWrapper}>
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="QR Code"
                        className={styles.qrImage}
                      />
                    ) : (
                      <div style={{ fontSize: '10px', color: '#666' }}>Memuat QR…</div>
                    )}
                  </div>
                  <div className={styles.qrLinkText}>{qrLabel}</div>
                </div>

                {/* Right Details Column */}
                <div className={styles.detailsColumn}>
                  <div className={styles.detailsGrid}>
                    <span className={styles.labelCell}>NO. ROLL</span>
                    <span className={styles.colonCell}>:</span>
                    <span className={styles.valueCell}>{rollNum}</span>

                    <span className={styles.labelCell}>KODE DESIGN</span>
                    <span className={styles.colonCell}>:</span>
                    <span className={styles.valueCellDesign}>{tableKodeDesign}</span>

                    <span className={styles.labelCell}>DATE</span>
                    <span className={styles.colonCell}>:</span>
                    <span className={styles.valueCell}>{dateStr}</span>

                    <span className={styles.labelCell}>LENGTH</span>
                    <span className={styles.colonCell}>:</span>
                    <span className={styles.valueCell}>{lengthStr}</span>

                    <span className={styles.labelCell}>QTY</span>
                    <span className={styles.colonCell}>:</span>
                    <div className={styles.qtyContainer}>
                      <span className={styles.valueCell}>{qtyStr}</span>
                      {breakdownStr && breakdownStr.trim() !== '' && (
                        <div className={styles.breakdownText}>
                          {breakdownStr.trim()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Bottom Registration */}
            <div className={styles.bottomSection}>
              <div className={styles.k3lTitle}>NOMOR REGISTRASI BARANG K3L</div>
              <div className={styles.k3lNumber}>{k3lNumber}</div>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons & Direct Print Controls (Hidden during print) */}
        <div className={styles.footerBar}>
          {/* Status Alert Notification */}
          {printStatus && (
            <div
              className={`${styles.statusMessage} ${
                printStatus.type === 'success'
                  ? styles.statusMessageSuccess
                  : styles.statusMessageError
              }`}
            >
              <span>{printStatus.message}</span>
              <button
                type="button"
                className={styles.closeAlertBtn}
                onClick={() => setPrintStatus(null)}
                aria-label="Tutup notifikasi"
              >
                ✕
              </button>
            </div>
          )}

          <div className={styles.footerControlsRow}>
            {/* Printer Selection Dropdown */}
            <div className={styles.printerSelectArea}>
              <span className={styles.printerSelectIcon} title="Printer Tujuan">
                🖨️
              </span>
              <label htmlFor="eticket-printer-select" className={styles.printerSelectLabel}>
                Printer:
              </label>
              <select
                id="eticket-printer-select"
                className={styles.printerSelect}
                value={selectedPrinter}
                onChange={handlePrinterChange}
                disabled={directPrinting || printing}
              >
                {printers.length > 0 ? (
                  printers.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} {p.isZebra ? '⚡ (ZPL Thermal)' : ''} {p.isDefault ? '★ Default' : ''}
                    </option>
                  ))
                ) : (
                  <option value={selectedPrinter || 'ZDesigner ZD230-203dpi ZPL'}>
                    {selectedPrinter || 'ZDesigner ZD230-203dpi ZPL'}
                  </option>
                )}
              </select>
              <button
                type="button"
                className={styles.refreshPrintersBtn}
                onClick={fetchPrinters}
                title="Segarkan daftar printer terpasang"
                disabled={loadingPrinters || directPrinting}
              >
                {loadingPrinters ? '⏳' : '🔄'}
              </button>
            </div>

            {/* Action Buttons */}
            <div className={styles.footerActionButtons}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={onClose}
                disabled={directPrinting || printing}
              >
                Tutup
              </button>

              {/* Tombol Windows Print (Fallback) */}
              <button
                type="button"
                className={styles.btnWindowsPrint}
                onClick={handlePrintAction}
                disabled={directPrinting || printing}
                title="Buka dialog printer Windows / browser standar"
              >
                {printing ? '⏳ Menyiapkan…' : '📄 Windows Print'}
              </button>

              {/* TOMBOL CETAK LANGSUNG (Direct Print tanpa Windows Print Dialog) */}
              <button
                type="button"
                className={styles.btnDirectPrint}
                onClick={handleDirectPrintAction}
                disabled={directPrinting || printing || !selectedPrinter}
                title={`Cetak langsung ke ${selectedPrinter} tanpa dialog Windows`}
              >
                {directPrinting ? '⏳ Mencetak…' : '⚡ Cetak Langsung'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden isolated iframe for 100% accurate 70mm x 110mm portrait e-ticket printing */}
      <iframe
        ref={printIframeRef}
        title="Print E-Ticket Frame"
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '70mm', height: '110mm', border: 'none' }}
      />
    </div>
  )
}
