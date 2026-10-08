import styles from './ConfirmDeleteModal.module.css'

export default function ConfirmDeleteModal({ roll, defectCount, onConfirm, onCancel }) {
  if (!roll) return null

  return (
    <div className={styles.overlay} onClick={onCancel} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={e => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.iconWrap}>🗑️</div>
          <div>
            <h3 className={styles.title}>Hapus Roll #{roll.id}?</h3>
            <p className={styles.sub}>Konfirmasi penghapusan baris data roll</p>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Nomor Roll:</span>
            <span className={styles.infoVal}>Roll #{roll.id}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Panjang Kain:</span>
            <span className={styles.infoVal}>{roll.length} yard</span>
          </div>

          {defectCount > 0 ? (
            <div className={styles.warningBox}>
              ⚠️ <strong>Perhatian:</strong> Roll ini memiliki <strong>{defectCount} cacat</strong> yang juga akan ikut terhapus.
            </div>
          ) : (
            <p className={styles.note}>Data roll ini akan dihapus dari antrean produksi saat ini.</p>
          )}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onCancel}
          >
            Batal
          </button>
          <button
            type="button"
            className={`btn btn-sm ${styles.confirmBtn}`}
            onClick={onConfirm}
          >
            🗑️ Ya, Hapus Baris
          </button>
        </div>
      </div>
    </div>
  )
}
