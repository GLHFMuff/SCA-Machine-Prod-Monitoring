import styles from './SendModal.module.css'

export default function SendModal({ data, onConfirm, onClose }) {
  const totalLength = data.rolls.reduce((sum, r) => sum + r.length, 0)
  const totalBsQty = data.rolls.reduce((sum, r) => sum + (r.bsQty || 0), 0)
  const totalDefects = Object.values(data.defects).reduce((sum, arr) => sum + arr.length, 0)

  const rows = [
    ['No. Produksi', data.seqmentNumber || data.prodNumber],
    ['Operator', data.operator],
    ['Mesin', data.machine],
    ['Total Roll', `${data.rolls.length} roll`],
    ['Total Panjang', `${totalLength.toFixed(1)} yard`],
    ['Total BS Qty', `${totalBsQty.toFixed(1)} yard`],
    ['Total Cacat', `${totalDefects} titik`],
  ]

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>
        <div className={styles.head}>
          <div className={styles.title}>📤 Konfirmasi Kirim Data</div>
          <button className={styles.close} onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        <div className={styles.body}>
          {rows.map(([key, val]) => (
            <div className={styles.row} key={key}>
              <span className={styles.key}>{key}</span>
              <span className={styles.val}>{val}</span>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-success btn-sm" onClick={onConfirm}>📤 Kirim Sekarang</button>
        </div>
      </div>
    </div>
  )
}
