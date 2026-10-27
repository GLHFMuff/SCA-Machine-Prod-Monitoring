import styles from './GetDataConfirmModal.module.css'

export default function GetDataConfirmModal({
  machineId,
  targetRollId,
  prodNumber,
  pendingDefectsCount = 0,
  onConfirm,
  onClose,
  loading = false,
}) {
  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.head}>
          <div className={styles.iconWrap}>🔄</div>
          <div>
            <h3 className={styles.title}>Konfirmasi Ambil Data Mesin</h3>
            <p className={styles.sub}>Verifikasi penarikan data dari sensor / mesin autonic</p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            disabled={loading}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Body info */}
        <div className={styles.body}>
          <div className={styles.infoCard}>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Nomor Mesin</span>
              <span className={styles.infoValHighlight}>Mesin #{machineId}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Order Produksi</span>
              <span className={styles.infoVal}>{prodNumber || '-'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Target Nomor Roll</span>
              <span className={styles.infoValBadge}>Roll #{targetRollId}</span>
            </div>
            {pendingDefectsCount > 0 && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Catatan Cacat Sementara</span>
                <span className={styles.infoValWarn}>⚠️ {pendingDefectsCount} Titik Cacat</span>
              </div>
            )}
          </div>

          {pendingDefectsCount > 0 && (
            <div className={styles.pendingDefectBox}>
              <div className={styles.pendingDefectIcon}>📝</div>
              <div className={styles.pendingDefectText}>
                <strong>{pendingDefectsCount} titik cacat sementara</strong> yang telah dicatat akan otomatis dihubungkan ke <strong>Roll #{targetRollId}</strong> dan tersimpan ke tabel database.
              </div>
            </div>
          )}

          <div className={styles.alertBox}>
            <div className={styles.alertIcon}>⚠️</div>
            <div className={styles.alertText}>
              <strong>Perhatian:</strong> Data meter/yard mesin yang ditarik akan{' '}
              <strong>otomatis langsung dihapus dari database antrian mesin</strong> agar tidak ditarik ulang.
              Pastikan doffing / gulungan roll pada mesin telah selesai.
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className={styles.footer}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={loading}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className={styles.spin}>🔄</span> Menarik & Memproses DB…
              </>
            ) : (
              '✓ Ya, Ambil Data Sekarang'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
