import { useState } from 'react'
import { DEFECT_CODES } from '../data/dummyData.js'
import styles from './DefectModal.module.css'

export default function DefectModal({ roll, initDefects, onSave, onClose }) {
  const [list, setList] = useState(initDefects || [])
  const [yard, setYard] = useState('')
  const [code, setCode] = useState(DEFECT_CODES[0])

  function addDefect() {
    if (!yard) return
    setList(prev => [...prev, { id: Date.now(), yard: parseFloat(yard), code }])
    setYard('')
  }

  function removeDefect(id) {
    setList(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>

        {/* Header */}
        <div className={styles.head}>
          <div>
            <div className={styles.title}>Catat Cacat — Roll #{roll.id}</div>
            <div className={styles.headSub}>Panjang: {roll.length} yard</div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Existing defect list */}
          {list.length === 0 ? (
            <p className={styles.empty}>Belum ada catatan cacat pada roll ini</p>
          ) : (
            <div className={styles.defectList}>
              {list.map(d => (
                <div className={styles.defectItem} key={d.id}>
                  <div>
                    <div className={styles.defectCode}>⚠️ {d.code}</div>
                    <div className={styles.defectYard}>Posisi yard {d.yard}</div>
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => removeDefect(d.id)}
                    aria-label="Hapus cacat"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new defect form */}
          <div className={styles.addForm}>
            <div className={styles.addFormLabel}>+ Tambah Titik Cacat</div>
            <div className={styles.formRow}>
              <div>
                <label className={styles.fieldLabel}>Posisi (Yard)</label>
                <input
                  className={styles.fieldInput}
                  type="number"
                  placeholder="mis. 45.5"
                  value={yard}
                  min="0"
                  max={roll.length}
                  step="0.1"
                  onChange={e => setYard(e.target.value)}
                />
              </div>
              <div>
                <label className={styles.fieldLabel}>Kode Cacat</label>
                <select
                  className={styles.fieldInput}
                  value={code}
                  onChange={e => setCode(e.target.value)}
                >
                  {DEFECT_CODES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <button className="btn btn-warning btn-sm" style={{ width: '100%' }} onClick={addDefect}>
              ＋ Tambah
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(list)}>💾 Simpan</button>
        </div>

      </div>
    </div>
  )
}
