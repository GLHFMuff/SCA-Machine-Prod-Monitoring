import styles from './Toast.module.css'

export default function Toast({ message }) {
  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.icon}>✅</span>
      <span className={styles.text}>{message}</span>
    </div>
  )
}
