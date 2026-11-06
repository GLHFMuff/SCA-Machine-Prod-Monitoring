import { useState, useEffect } from 'react'
import styles from './ManualRollModal.module.css'
import { getInventoryStatusList } from '../services/api';
import { toDDMMYYYY, getTodayYYYYMMDD } from '../utils/dateUtils.js';

export default function CoProductModal({ onSave, onClose, loading = false }) {
  const [length, setLength] = useState('')
  const [status, setStatus] = useState('BS')
  const [transDate, setTransDate] = useState(getTodayYYYYMMDD())
  const [error, setError] = useState('')
  const [InventStatusOptions, setInventStatusOption] = useState([])

  useEffect(() => {
    getInventoryStatusList()
      .then(res => setInventStatusOption(res.data))
      .catch(err => console.error('[InventoryStatus] gagal load inventory status:', err))
  }, [])

  function submit(e) {
    e.preventDefault()
    const value = Number(length)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Panjang harus diisi dengan angka lebih dari 0.')
      return
    }
    onSave({
      length: value,
      inventStatus: status,
      productType: 1,
      transDate: toDDMMYYYY(transDate),
    })
  }

  return <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
    <div className={styles.box} onClick={(e) => e.stopPropagation()}>
      <div className={styles.head}><div><h3 className={styles.title}>Input Co-Products</h3><p className={styles.sub}>Catat hasil BS, Jablak, atau Kecilan.</p></div><button type="button" className={styles.close} onClick={onClose} aria-label="Tutup">×</button></div>
      <form onSubmit={submit}>
        <div className={styles.body}>
          {error && <div className={styles.errorBanner}>{error}</div>}
          <div className={styles.formGroup}><label className={styles.label}>Panjang (Yard)</label><div className={styles.inputWrap}><input className={styles.input} type="number" min="0.1" step="0.1" value={length} onChange={e => { setLength(e.target.value); setError('') }} autoFocus required /><span className={styles.unit}>Yard</span></div></div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Jenis Co-Product</label>
            <select
              className={styles.input}
              value={InventStatusOptions.statusId}
              onChange={e => setStatus(e.target.value)}>

              {InventStatusOptions.map(d => (
                <option key={d.StatusId} value={d.StatusId}>
                  {d.StatusId} – {d.Name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label}>Date (Tanggal Transaksi)</label>
            <div className={styles.inputWrap}>
              <input
                className={styles.input}
                type="date"
                value={transDate}
                onChange={e => { setTransDate(e.target.value); setError('') }}
                required
              />
            </div>
          </div>
          <div className={styles.footer}><button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Batal</button><button type="submit" className="btn btn-primary btn-sm" disabled={loading}>{loading ? 'Menyimpan…' : 'Simpan Co-Product'}</button></div>
        </div>
      </form>
    </div>
  </div>
}
