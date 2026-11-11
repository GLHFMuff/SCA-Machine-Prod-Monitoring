import styles from './IdleWarningModal.module.css';

export default function IdleWarningModal({
  remainingSeconds,
  idleTimeoutMinutes,
  machineLabel,
  onContinue,
  onLogoutNow,
}) {
  if (remainingSeconds === null || remainingSeconds === undefined) return null;

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="idle-warning-title">
      <div className={styles.modal}>
        <div className={styles.iconBadge} aria-hidden="true">⏳</div>
        <h2 id="idle-warning-title" className={styles.title}>
          Sesi Hampir Berakhir (Tidak Aktif)
        </h2>
        <p className={styles.message}>
          Tidak terdeteksi aktivitas operator{machineLabel ? ` di ${machineLabel}` : ''} mendekati batas{' '}
          <strong>{idleTimeoutMinutes} menit</strong>. Sesi akan otomatis logout dan melepas mesin dalam:
        </p>

        <div className={styles.countdownBox}>
          <span className={styles.countdownNumber}>{remainingSeconds}</span>
          <span className={styles.countdownUnit}>detik</span>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.logoutBtn} onClick={onLogoutNow}>
            Logout Sekarang
          </button>
          <button type="button" className={styles.continueBtn} onClick={onContinue} autoFocus>
            Saya Masih Bekerja (Lanjutkan)
          </button>
        </div>
      </div>
    </div>
  );
}

