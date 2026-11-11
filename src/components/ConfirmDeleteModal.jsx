import styles from './ConfirmDeleteModal.module.css'

export default function ConfirmDeleteModal({ roll, defectCount, loading = false, onConfirm, onCancel }) {
  if (!roll) return null

  return (
    <div className={styles.overlay} onClick={() => !loading && onCancel?.()} role="dialog" aria-modal="true">
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
              ⚠️ <strong>Perhatian:</strong> Roll ini memiliki <strong>{defectCount} inspeksi</strong> yang juga akan ikut dihapus dari data aktif.
            </div>
          ) : (
            <p className={styles.note}>Data roll ini akan dihapus dari daftar produksi aktif.</p>
          )}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onCancel}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            className={`btn btn-sm ${styles.confirmBtn}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Menghapus...' : '🗑️ Ya, Hapus Baris'}
          </button>
        </div>
      </div>
    </div>
  )
}
