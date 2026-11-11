import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { toDDMMYYYY } from '../utils/dateUtils.js'
import { getAvailablePrintersApi, directPrintRollLabelApi } from '../services/api.js'
import styles from './RollLabelModal.module.css'

export default function RollLabelModal({
  roll,
  prodData,
  joinedPieces = [],
  user,
  onPrint,
  onClose,
}) {
  const [printing, setPrinting] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const printIframeRef = useRef(null)

  // ── State untuk Cetak Langsung (Direct Print tanpa Windows Print) ──
  const currentMachineId = user?.machineId || user?.machine_id || prodData?.machineId || prodData?.noMesin || roll?.noMesin || null
  const machineNum = user?.machine || user?.machine_num || (currentMachineId ? `Mesin ${currentMachineId}` : '')

  const [machinePrinter, setMachinePrinter] = useState(() => {
    return (user?.printerName || user?.printer_name || '').trim()
  })
  const [showAllPrinters, setShowAllPrinters] = useState(false)
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState(() => {
    return (user?.printerName || user?.printer_name || '').trim() || localStorage.getItem('mpm_direct_printer') || 'ZDesigner ZD230-203dpi ZPL'
  })
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [directPrinting, setDirectPrinting] = useState(false)
  const [printStatus, setPrintStatus] = useState(null)

  // Status Kain Stock (isStock)
  const isStockRoll = Boolean(roll?.isStock || roll?.is_stock || roll?.IsStock)

  // ── Derive initial values from props or sensible defaults ──
  const initialRollNum = String(roll?.id ?? roll?.roolNumber ?? 1).padStart(2, '0')

  // Kode Design
  const rawDesign =
    prodData?.fabricType ||
    prodData?.design ||
    prodData?.designCode ||
    roll?.fabricType ||
    roll?.design ||
    'A0301'

  const initialKodeDesign =
    String(rawDesign).trim().replace(/^CD\s*[-–:]?\s*/i, '') || 'A0301'

  // Motif / Warna
  const rawColor =
    prodData?.color ||
    roll?.color ||
    prodData?.motif ||
    roll?.motif ||
    'WARNA WARNI'

  const initialColor = String(rawColor).trim().toUpperCase() || 'WARNA WARNI'

  // Date in DD/MM/YYYY
  const initialDate = toDDMMYYYY(roll?.transDate || roll?.TransDate || roll?.createdAt)

  // Length in inch (lebar kain standard 52")
  const initialLengthInch =
    prodData?.width && prodData.width.includes('52')
      ? '52"'
      : prodData?.width || roll?.width || '52"'

  // QTY in Yard
  const lengthVal =
    roll?.length !== undefined && roll?.length !== null ? String(roll.length) : '0'
  const initialQty = roll?.length ? `${roll.length} YARD` : '156 YARD'

  const joinedPieceLengths = joinedPieces
    .map((piece) => piece.LengthPoint ?? piece.lengthPoint ?? piece.yard)
    .filter((length) => length !== undefined && length !== null && String(length).trim() !== '')
  const initialBreakdown = joinedPieceLengths.length
    ? `X (${joinedPieceLengths.join(' + ')})`
    : (roll?.breakdown || '')

  // Barcode format: QrNum;RecidProdId;RecidSalesId;RecidItemId;Length;
  const qrNum = String(roll?.qrNum || roll?.QrNum || '').trim()
  const recidProdId = String(prodData?.recidProdId || prodData?.RecidProdId || '').trim()
  const recidSalesId = String(prodData?.recidSalesId || prodData?.RecidSalesId || '').trim()
  const recidItemId = String(prodData?.recidItemId || prodData?.RecidItemId || '').trim()

  const initialBarcode = `${qrNum};${recidProdId};${recidSalesId};${recidItemId};${lengthVal};`
  const initialQrLabel = ''

  // K3L Registration Number
  const initialK3L =
    prodData?.k3lNumber ||
    prodData?.K3LNumber ||
    roll?.k3lNumber ||
    roll?.K3LNumber ||
    '20-D-001909'

  // K3L Name / Header Title (dari CountingKainHeader)
  const initialK3LName =
    prodData?.k3lName ||
    prodData?.K3LName ||
    roll?.k3lName ||
    roll?.K3LName ||
    ''

  // ── State for live customizable values ──
  const [rollNum, setRollNum] = useState(initialRollNum)
  const [kodeDesign, setKodeDesign] = useState(initialKodeDesign)
  const [color, setColor] = useState(initialColor)
  const [dateStr, setDateStr] = useState(initialDate)
  const [lengthInchStr, setLengthInchStr] = useState(initialLengthInch)
  const [qtyStr, setQtyStr] = useState(initialQty)
  const [breakdownStr, setBreakdownStr] = useState(initialBreakdown)
  const [barcodeContent, setBarcodeContent] = useState(initialBarcode)
  const [qrLabel, setQrLabel] = useState(initialQrLabel)
  const [k3lNumber, setK3lNumber] = useState(initialK3L)
  const [k3lName, setK3lName] = useState(initialK3LName)

  // QR Code base64 DataURL
  const [qrDataUrl, setQrDataUrl] = useState('')

  // Generate crisp QR code whenever barcodeContent changes
  useEffect(() => {
    let isMounted = true
    const textToEncode = barcodeContent.trim() || 'QR.S.0000.00000000;;;;0;'

    QRCode.toDataURL(textToEncode, {
      width: 360,
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
        console.error('Error generating label QR code:', err)
      })

    return () => {
      isMounted = false
    }
  }, [barcodeContent])

  // Reset to original defaults
  function handleResetDefaults() {
    setRollNum(initialRollNum)
    setKodeDesign(initialKodeDesign)
    setColor(initialColor)
    setDateStr(initialDate)
    setLengthInchStr(initialLengthInch)
    setQtyStr(initialQty)
    setBreakdownStr(initialBreakdown)
    setBarcodeContent(initialBarcode)
    setQrLabel(initialQrLabel)
    setK3lNumber(initialK3L)
    setK3lName(initialK3LName)
  }

  // Format Header Title (diambil dari CountingKainHeader field K3LName, fallback ke Kode Design jika kosong)
  const rawK3LName = String(k3lName || '').trim()
  const cleanCode = kodeDesign.trim()
  const hasCdPrefix = /^CD\s*[-–:]?\s*/i.test(cleanCode)
  const innerCode = hasCdPrefix
    ? cleanCode.replace(/^CD\s*[-–:]?\s*/i, '').trim()
    : cleanCode
  const cdDesignTitle = rawK3LName
    ? rawK3LName.toUpperCase()
    : (hasCdPrefix ? `CD ${innerCode.toUpperCase()}` : `CD ${cleanCode.toUpperCase()}`)

  // Dynamic font sizing for header title & color
  let headerTitleFontSize = '15px'
  let printHeaderFontSize = '10pt'
  if (cdDesignTitle.length > 20 || color.length > 20) {
    headerTitleFontSize = '12px'
    printHeaderFontSize = '8pt'
  } else if (cdDesignTitle.length > 14 || color.length > 14) {
    headerTitleFontSize = '13.5px'
    printHeaderFontSize = '9pt'
  }

  // Handle printing via isolated iframe (100mm x 50mm landscape)
  async function handlePrintAction() {
    setPrinting(true)
    try {
      if (onPrint) {
        await onPrint(roll)
      }

      const iframe = printIframeRef.current
      if (iframe) {
        const doc = iframe.contentWindow.document
        doc.open()
        doc.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Label Roll #${rollNum}</title>
              <style>
                @page {
                  size: 100mm 50mm landscape;
                  margin: 0;
                }
                * {
                  box-sizing: border-box;
                  margin: 0;
                  padding: 0;
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
                  font-family: 'Times New Roman', Times, Georgia, serif;
                }
                .labelWrapper {
                  width: 100mm;
                  height: 50mm;
                  padding: 1mm;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                }
                .labelBorder {
                  width: 98mm;
                  height: 48mm;
                  border: 2px solid #000000;
                  padding: 1.2mm 2mm;
                  display: flex;
                  flex-direction: column;
                  justify-content: space-between;
                }
                /* Top Header (Centered, No Logos) */
                .headerArea {
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  height: 9mm;
                  width: 100%;
                }
                .companyInfo {
                  width: 100%;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  text-align: center;
                }
                .companyName {
                  font-size: ${printHeaderFontSize};
                  font-weight: 900;
                  letter-spacing: 0.3px;
                  line-height: 1.15;
                  margin: 0;
                  color: #000000;
                  text-align: center;
                  white-space: nowrap;
                }
                /* Body Area (QR + Details centered) */
                .bodyArea {
                  height: 30mm;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  gap: 5mm;
                  border-top: 0px solid #000000;
                  border-bottom: 0px solid #000000;
                  padding: 0mm 0;
                  box-sizing: border-box;
                }
                .qrColumn {
                  width: 25mm;
                  flex-shrink: 0;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
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
                .qrText {
                  font-family: Arial, Helvetica, sans-serif;
                  font-size: 4.8pt;
                  font-weight: 600;
                  color: #000000;
                  text-align: center;
                  margin-top: 0.4mm;
                  word-break: break-all;
                  line-height: 1.1;
                }
                .detailsColumn {
                  flex: 0 0 auto;
                  min-width: 0;
                  padding-top: 0;
                  display: flex;
                  flex-direction: column;
                  justify-content: center;
                }
                .detailsGrid {
                  display: grid;
                  grid-template-columns: max-content auto 1fr;
                  row-gap: 0.9mm;
                  align-items: baseline;
                }
                .labelCell {
                  font-size: 11pt;
                  font-weight: 900;
                  color: #000000;
                  white-space: nowrap;
                }
                .colonCell {
                  font-size: 11pt;
                  font-weight: 900;
                  color: #000000;
                  padding: 0 1.2mm;
                  text-align: center;
                }
                .valueCell {
                  font-size: 11pt;
                  font-weight: 600;
                  color: #000000;
                  white-space: nowrap;
                }
                .qtyContainer {
                  display: flex;
                  flex-direction: column;
                  align-items: flex-start;
                }
                .breakdownText {
                  font-size: 6pt;
                  font-weight: 500;
                  color: #000000;
                  margin-top: 0.2mm;
                  white-space: nowrap;
                }
                /* Bottom K3L Registration Area */
                .bottomSection {
                  width: 100%;
                  display: flex;
                  flex-direction: row;
                  align-items: center;
                  justify-content: space-between;
                  margin-top: 0.2mm;
                  box-sizing: border-box;
                }
                .bottomLeftCol {
                  width: 96%;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  text-align: center;
                }
                .bottomRightCol {
                  width: 4%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  text-align: center;
                }
                .k3lTitle,
                .k3lNumber {
                  font-size: 7pt;
                  font-weight: 500;
                  letter-spacing: 0.2px;
                  color: #000000;
                  line-height: 1.25;
                  text-align: center;
                  margin: 0;
                }
                .stockBadge {
                  font-family: 'Times New Roman', Times, Georgia, serif;
                  font-size: 11pt;
                  font-weight: 900;
                  line-height: 1;
                  color: #000000;
                  text-align: center;
                }
              </style>
            </head>
            <body>
              <div class="labelWrapper">
                <div class="labelBorder">
                  <!-- Header Area (Centered, No Logos) -->
                  <div class="headerArea">
                    <div class="companyInfo">
                      <div class="companyName">${cdDesignTitle}</div>
                      <div class="companyName">${color.toUpperCase()}</div>
                    </div>
                  </div>

                  <!-- Body Area (QR Code + Details centered) -->
                  <div class="bodyArea">
                    <div class="qrColumn">
                      <div class="qrWrapper">
                        <img src="${qrDataUrl}" alt="QR Code" class="qrImage" />
                      </div>
                      ${qrLabel && qrLabel.trim() ? `<div class="qrText">${qrLabel.trim()}</div>` : ''}
                    </div>

                    <div class="detailsColumn">
                      <div class="detailsGrid">
                        <span class="labelCell">NO. ROLL</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${rollNum}</span>

                        <span class="labelCell">KODE DESIGN</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${kodeDesign.toUpperCase()}</span>

                        <span class="labelCell">DATE</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${dateStr}</span>

                        <span class="labelCell">WIDTH</span>
                        <span class="colonCell">:</span>
                        <span class="valueCell">${lengthInchStr}</span>

                        <span class="labelCell">QTY</span>
                        <span class="colonCell">:</span>
                        <div class="qtyContainer">
                          <span class="valueCell">${qtyStr}</span>
                          ${breakdownStr && breakdownStr.trim() !== '' ? `<div class="breakdownText">${breakdownStr.trim()}</div>` : ''}
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Bottom Registration K3L Area -->
                  <div class="bottomSection">
                    <div class="bottomLeftCol">
                      <div class="k3lTitle">No Claim After Cutting  -  Setelah potong, klaim tidak diterima</div>
                      <div class="k3lTitle">NOMOR REGISTRASI BARANG K3L : ${k3lNumber}</div>
                    </div>
                    <div class="bottomRightCol">
                      ${isStockRoll ? '<span class="stockBadge">S</span>' : ''}
                    </div>
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

  // ── Ambil daftar printer yang terpasang dari backend ──
  async function fetchPrinters() {
    setLoadingPrinters(true)
    try {
      const res = await getAvailablePrintersApi(currentMachineId)
      const list = res?.printers || []
      setPrinters(list)

      // Cek apakah mesin ini memiliki printer khusus yang ditugaskan di database (machine_lists)
      const designatedPrinter = (res?.machinePrinter || user?.printerName || user?.printer_name || '').trim()

      if (designatedPrinter) {
        setMachinePrinter(designatedPrinter)
        setSelectedPrinter(designatedPrinter)
      } else {
        setMachinePrinter('')
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

  // ── Render label ke canvas base64 image (untuk printer Windows non-Zebra) ──
  async function generateLabelImageBase64(data) {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 800
      canvas.height = 400
      const ctx = canvas.getContext('2d')

      // Background putih
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, 800, 400)

      // Garis border luar
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 4
      ctx.strokeRect(16, 12, 768, 376)

      // Header Area (CD Title & Color)
      ctx.fillStyle = '#000000'
      ctx.textAlign = 'center'
      ctx.font = 'bold 26px "Times New Roman", serif'
      ctx.fillText(data.cdDesignTitle || '', 400, 48)
      ctx.fillText((data.color || '').toUpperCase(), 400, 80)

      // Draw QR Code
      if (data.qrDataUrl) {
        const qrImg = new Image()
        await new Promise((resolve, reject) => {
          qrImg.onload = resolve
          qrImg.onerror = reject
          qrImg.src = data.qrDataUrl
        })
        ctx.drawImage(qrImg, 45, 105, 175, 175)
      }

      if (data.qrLabel) {
        ctx.font = 'bold 12px Arial, sans-serif'
        ctx.fillText(data.qrLabel, 132, 305)
      }

      // Details Grid
      ctx.textAlign = 'left'
      ctx.font = 'bold 22px "Times New Roman", serif'
      const colX = 250
      const colonX = 445
      const valX = 470

      const rows = [
        ['NO. ROLL', data.rollNum],
        ['KODE DESIGN', (data.kodeDesign || '').toUpperCase()],
        ['DATE', data.dateStr],
        ['LENGTH', data.lengthInchStr],
        ['QTY', data.qtyStr],
      ]

      let y = 132
      for (const [lbl, val] of rows) {
        ctx.fillText(lbl, colX, y)
        ctx.fillText(':', colonX, y)
        ctx.fillText(val, valX, y)
        y += 32
      }

      if (data.breakdownStr) {
        ctx.font = '14px Arial, sans-serif'
        ctx.fillText(data.breakdownStr, valX, y - 6)
      }

      // Bottom Registration Area
      ctx.textAlign = 'center'
      ctx.font = '14px Arial, sans-serif'
      ctx.fillText('No Claim After Cutting  -  Setelah potong, klaim tidak diterima', 400, 345)
      ctx.fillText(`NOMOR REGISTRASI BARANG K3L : ${data.k3lNumber || ''}`, 400, 368)

      // Stock Roll Badge 'S'
      if (data.isStockRoll) {
        ctx.textAlign = 'right'
        ctx.font = 'bold 28px "Times New Roman", serif'
        ctx.fillText('S', 760, 365)
      }

      return canvas.toDataURL('image/png')
    } catch (err) {
      console.warn('Gagal render canvas label image:', err)
      return null
    }
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
        cdDesignTitle,
        color,
        kodeDesign,
        dateStr,
        lengthInchStr,
        qtyStr,
        breakdownStr,
        barcodeContent,
        qrLabel,
        k3lNumber,
        isStockRoll,
      }

      // Jika printer bukan Zebra / ZPL, generate image base64 untuk Windows GDI print
      let imageBase64 = null
      const isZebra = /ZDesigner|Zebra|ZPL/i.test(selectedPrinter)
      if (!isZebra) {
        imageBase64 = await generateLabelImageBase64({
          ...labelData,
          qrDataUrl,
        })
      }

      const res = await directPrintRollLabelApi({
        printerName: selectedPrinter,
        labelData,
        imageBase64,
      })

      // Update status cetak roll pada database/tabel
      if (onPrint) {
        await onPrint(roll)
      }

      setPrintStatus({
        type: 'success',
        message: res?.message || `✓ Berhasil dikirim ke printer: "${selectedPrinter}"`,
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
        {/* Modal Controls */}
        <div className={styles.topBar}>
          <div className={styles.topTitle}>
            <span>🏷️ Label Roll #{rollNum}</span>
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
        <div className={styles.ticketArea} id="printable-label-roll">
          {/* Notice & Customization Toggle */}
          <div className={styles.previewNotice}>
            <span>Format Label Roll</span>
            <button
              type="button"
              className={styles.toggleEditBtn}
              onClick={() => setShowEditor(!showEditor)}
            >
              {showEditor ? '▲ Tutup Pengaturan' : '✏️ Sesuaikan Data Label'}
            </button>
          </div>

          {/* Optional In-Place Field Editor */}
          {showEditor && (
            <div className={styles.editDrawer}>
              <div className={styles.editGrid}>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>No. Roll (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={rollNum}
                    readOnly
                    placeholder="Contoh: 01"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Kode Design</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={kodeDesign}
                    onChange={(e) => setKodeDesign(e.target.value)}
                    placeholder="Contoh: A0301"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Motif / Warna</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="Contoh: WARNA WARNI"
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
                  <label className={styles.editLabel}>Width (Lebar) (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={lengthInchStr}
                    readOnly
                    placeholder='52"'
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>QTY (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={qtyStr}
                    readOnly
                    placeholder="156 YARD"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Sambungan (Breakdown)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={breakdownStr}
                    onChange={(e) => setBreakdownStr(e.target.value)}
                    placeholder="Contoh: X (100 + 56)"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>No. Registrasi K3L (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={k3lNumber}
                    readOnly
                    placeholder="20-D-001909"
                  />
                </div>
                <div className={styles.editGroup}>
                  <label className={styles.editLabel}>Nama K3L (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={k3lName}
                    readOnly
                    placeholder="Contoh: K3L NAME"
                  />
                </div>
                <div className={styles.editGroupFull}>
                  <label className={styles.editLabel}>Isi QR Code (Barcode) (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={barcodeContent}
                    readOnly
                    placeholder="QrNum;RecidProdId;RecidSalesId;RecidItemId;Length;"
                  />
                </div>
                <div className={styles.editGroupFull}>
                  <label className={styles.editLabel}>Teks Bawah QR Code (Readonly)</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={qrLabel}
                    readOnly
                    placeholder="Kosongkan jika tidak ada teks"
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
              PREVIEW KARTU LABEL 90 x 50 MM (9x5 cm) LANDSCAPE
          ───────────────────────────────────────────────────────────── */}
          <div className={styles.previewWrapper}>
            <div className={styles.labelCard}>
              <div className={styles.labelBorder}>
                {/* 1. Header Section (Centered, No Logos) */}
                <div className={styles.headerArea}>
                  <div className={styles.companyInfo}>
                    <div
                      className={styles.companyName}
                      style={{ fontSize: headerTitleFontSize }}
                    >
                      {cdDesignTitle}
                    </div>
                    <div
                      className={styles.companyName}
                      style={{ fontSize: headerTitleFontSize }}
                    >
                      {color.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* 2. Body Section (QR Code on Left, Specifications on Right) */}
                <div className={styles.bodyArea}>
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
                    {qrLabel && qrLabel.trim() ? (
                      <div className={styles.qrText}>{qrLabel.trim()}</div>
                    ) : null}
                  </div>

                  {/* Right Details Column */}
                  <div className={styles.detailsColumn}>
                    <div className={styles.detailsGrid}>
                      <span className={styles.labelCell}>NO. ROLL</span>
                      <span className={styles.colonCell}>:</span>
                      <span className={styles.valueCell}>{rollNum}</span>

                      <span className={styles.labelCell}>KODE DESIGN</span>
                      <span className={styles.colonCell}>:</span>
                      <span className={styles.valueCell}>{kodeDesign.toUpperCase()}</span>

                      <span className={styles.labelCell}>DATE</span>
                      <span className={styles.colonCell}>:</span>
                      <span className={styles.valueCell}>{dateStr}</span>

                      <span className={styles.labelCell}>WIDTH</span>
                      <span className={styles.colonCell}>:</span>
                      <span className={styles.valueCell}>{lengthInchStr}</span>

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

                {/* 3. Bottom Registration Area */}
                <div className={styles.bottomSection}>
                  <div className={styles.bottomLeftCol}>
                    <div className={styles.k3lTitle}>No Claim After Cutting  -  Setelah potong, klaim tidak diterima</div>
                    <div className={styles.k3lTitle}>NOMOR REGISTRASI BARANG K3L : {k3lNumber}</div>
                  </div>
                  <div className={styles.bottomRightCol}>
                    {isStockRoll && <span className={styles.stockBadge}>S</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons & Direct Print Controls */}
        <div className={styles.footerBar}>
          {/* Status Alert Notification */}
          {printStatus && (
            <div
              className={`${styles.statusMessage} ${printStatus.type === 'success'
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
              <label htmlFor="printer-select" className={styles.printerSelectLabel}>
                Printer:
              </label>

              {machinePrinter && !showAllPrinters ? (
                // JIKA MESIN MEMILIKI PRINTER DI machine_lists: Tampilkan printer itu saja (terkunci per mesin)
                <>
                  <select
                    id="printer-select"
                    className={styles.printerSelect}
                    value={machinePrinter}
                    disabled
                    title={`Printer ini terikat otomatis untuk ${machineNum || 'mesin ini'} di tabel database`}
                  >
                    <option value={machinePrinter}>
                      {machinePrinter}
                    </option>
                  </select>
                  <span className={styles.printerMachineBadge} title={`Terkunci untuk ${machineNum}`}>
                    🔒 {machineNum || 'Mesin'}
                  </span>
                  <button
                    type="button"
                    className={styles.unlockPrinterBtn}
                    onClick={() => setShowAllPrinters(true)}
                    title="Buka pilihan semua printer lain jika printer mesin bermasalah"
                  >
                    Ganti
                  </button>
                </>
              ) : (
                // JIKA BELUM DITENTUKAN DI DATABASE ATAU INGIN MEMILIH PRINTER LAIN:
                <>
                  <select
                    id="printer-select"
                    className={styles.printerSelect}
                    value={selectedPrinter}
                    onChange={handlePrinterChange}
                    disabled={directPrinting || printing}
                  >
                    {machinePrinter && (
                      <option value={machinePrinter}>
                        ★ {machinePrinter} (Printer {machineNum})
                      </option>
                    )}
                    {printers.length > 0 ? (
                      printers
                        .filter((p) => p.name !== machinePrinter)
                        .map((p) => (
                          <option key={p.name} value={p.name}>
                            {p.name} {p.isZebra ? '⚡ (ZPL Thermal)' : ''} {p.isDefault ? '• Default' : ''}
                          </option>
                        ))
                    ) : (
                      <option value={selectedPrinter || 'ZDesigner ZD230-203dpi ZPL'}>
                        {selectedPrinter || 'ZDesigner ZD230-203dpi ZPL'}
                      </option>
                    )}
                  </select>
                  {machinePrinter && (
                    <button
                      type="button"
                      className={styles.unlockPrinterBtn}
                      onClick={() => {
                        setSelectedPrinter(machinePrinter)
                        setShowAllPrinters(false)
                      }}
                      title="Kembalikan ke printer khusus mesin"
                    >
                      Kunci Mesin
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.refreshPrintersBtn}
                    onClick={fetchPrinters}
                    title="Segarkan daftar printer terpasang"
                    disabled={loadingPrinters || directPrinting}
                  >
                    {loadingPrinters ? '⏳' : '🔄'}
                  </button>
                </>
              )}
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

      {/* Hidden isolated iframe for 100% accurate 100mm x 50mm landscape label printing */}
      <iframe
        ref={printIframeRef}
        title="Print Label Roll Frame"
        style={{
          position: 'fixed',
          top: '-9999px',
          left: '-9999px',
          width: '100mm',
          height: '50mm',
          border: 'none',
        }}
      />
    </div>
  )
}
