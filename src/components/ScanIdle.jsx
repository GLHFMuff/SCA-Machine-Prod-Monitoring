import styles from './ScanIdle.module.css'

export default function ScanIdle({ user, onScan }) {
  return (
    <div className={styles.container}>
      <div className={styles.icon}>📦</div>
      <h2 className={styles.title}>Siap Memulai Produksi</h2>
      <p className={styles.sub}>Scan barcode pada order produksi untuk memulai pencatatan</p>

      <button
        className={`btn btn-primary ${styles.scanBtn}`}
        onClick={onScan}
      >
        📷 Mulai Scanning
      </button>

      <div className={styles.machineInfo}>
        Mesin aktif:{' '}
        <strong>{user.machine} – {user.machineType}</strong>
      </div>
    </div>
  )
}
