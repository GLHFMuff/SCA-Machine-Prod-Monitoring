import { useState } from 'react'
import styles from './ETicketModal.module.css'

export default function ETicketModal({
  roll,
  prodData,
  user,
  defects = [],
  onPrint,
  onClose,
}) {
  const [printing, setPrinting] = useState(false)

  const printTime = new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const prodNumber = prodData?.prodNumber || 'OP-2024-001'
  const machineNumber = roll.noMesin || user?.machine_id || user?.machine || '1'
  const operatorName = user?.name || user?.username || 'Operator'
  const bsQty = parseFloat(roll.bsQty) || 0
  const netYard = Math.max(0, roll.length - bsQty).toFixed(1)
  const isOk = defects.length === 0

  async function handlePrintAction() {
    setPrinting(true)
    try {
      if (onPrint) {
        await onPrint(roll)
      }
      // Trigger native browser print
      window.print()
    } catch (err) {
      console.error('Print error:', err)
    } finally {
      setPrinting(false)
    }
  }

  // Generate SVG barcode representation for the roll
  const barcodeValue = `${prodNumber}-R${String(roll.id).padStart(3, '0')}`

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Modal Controls (Hidden during print) */}
        <div className={styles.topBar}>
          <div className={styles.topTitle}>
            <span>🏷️ Preview E-Ticket Roll #{roll.id}</span>
            {roll.isPrinted && (
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
          <div className={styles.ticketCard}>
            {/* Header */}
            <div className={styles.ticketHeader}>
              <div className={styles.brandTitle}>SCA TEXTILE INDUSTRY</div>
              <div className={styles.ticketSubtitle}>E-TICKET INSPEKSI & ROLL KAIN</div>
              <div className={styles.ticketDivider} />
            </div>

            {/* Barcode Graphic */}
            <div className={styles.barcodeSection}>
              <div className={styles.barcodeSvgWrap}>
                <svg
                  className={styles.barcodeSvg}
                  viewBox="0 0 240 50"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Stylized pseudo-barcode pattern */}
                  {[
                    4, 2, 6, 2, 4, 8, 3, 5, 2, 7, 3, 2, 6, 4, 2, 8, 3, 4, 6, 2,
                    5, 3, 7, 2, 4, 3, 8, 2, 5, 3, 6, 4, 2, 7, 3, 5, 2, 6, 4, 2,
                  ].map((w, idx) => (
                    <rect
                      key={idx}
                      x={idx * 6}
                      y="0"
                      width={w > 5 ? 3 : 1.5}
                      height="40"
                      fill="#000000"
                    />
                  ))}
                </svg>
              </div>
              <div className={styles.barcodeCode}>{barcodeValue}</div>
            </div>

            {/* Ticket Info Grid */}
            <div className={styles.ticketGrid}>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>NO. ORDER (OP)</span>
                <span className={styles.valStrong}>{prodNumber}</span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>NO. ROLL</span>
                <span className={styles.valRollHighlight}>#{roll.id}</span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>NO. MESIN</span>
                <span className={styles.val}>Mesin {machineNumber}</span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>OPERATOR</span>
                <span className={styles.val}>{operatorName}</span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>PANJANG GROSS</span>
                <span className={styles.valYard}>{roll.length} yd</span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>BS QTY</span>
                <span className={bsQty > 0 ? styles.valBsWarn : styles.val}>
                  {bsQty} yd
                </span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>NET GOOD YARD</span>
                <span className={styles.valNet}>{netYard} yd</span>
              </div>
              <div className={styles.gridItem}>
                <span className={styles.lbl}>STATUS KUALITAS</span>
                <span className={isOk ? styles.statusBadgeOk : styles.statusBadgeWarn}>
                  {isOk ? '✓ OK' : `⚠️ CACAT (${defects.length})`}
                </span>
              </div>
            </div>

            {/* Defect Details if any */}
            {defects.length > 0 && (
              <div className={styles.defectDetailBox}>
                <span className={styles.defectTitle}>Catatan Titik Cacat:</span>
                <div className={styles.defectTags}>
                  {defects.map((d, i) => (
                    <span key={i} className={styles.defectTag}>
                      {d.code} @ {d.yard} yd
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className={styles.ticketFooter}>
              <span>Waktu Cetak: {printTime}</span>
              <span>MPM System v1.0</span>
            </div>
          </div>
        </div>

        {/* Action Buttons (Hidden during print) */}
        <div className={styles.footerBar}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={printing}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minWidth: '160px' }}
            onClick={handlePrintAction}
            disabled={printing}
          >
            {printing ? '⏳ Memproses Cetak…' : '🖨️ Cetak E-Ticket'}
          </button>
        </div>
      </div>
    </div>
  )
}
