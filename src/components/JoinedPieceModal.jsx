import { useState } from 'react'
import styles from './DefectModal.module.css'

export default function JoinedPieceModal({ roll, initJoinedPieces, onSave, onClose }) {
  const [list, setList] = useState(initJoinedPieces || [])
  const [yard, setYard] = useState('')
  const [error, setError] = useState('')

  function addJoinedPiece() {
    if (!yard) {
      setError('Masukkan posisi joined piece dalam yard.')
      return
    }
    const parsedYard = parseFloat(yard)
    if (isNaN(parsedYard) || parsedYard <= 0) {
      setError('Posisi joined piece harus berupa angka lebih dari 0.')
      return
    }
    if (roll?.length && parsedYard >= roll.length) {
      setError(`Posisi joined piece (${parsedYard} yd) harus di bawah panjang roll (${roll.length} yd).`)
      return
    }
    setError('')
    setList(prev => [...prev, { id: Date.now() + Math.random(), yard: parsedYard }])
    setYard('')
  }

  function removeJoinedPiece(id) {
    setList(prev => prev.filter(d => d.id !== id))
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>

        {/* Header */}
        <div className={styles.head}>
          <div>
            <div className={styles.title}>
              {`Catat Joined Piece — Roll #${roll?.id}`}
            </div>
            <div className={styles.headSub}>
              {`Panjang: ${roll?.length} yard`}
            </div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Existing joined piece list */}
          {list.length === 0 ? (
            <p className={styles.empty}>
              Belum ada catatan joined piece pada roll ini
            </p>
          ) : (
            <div className={styles.defectList}>
              {list.map(d => (
                <div className={styles.defectItem} key={d.id}>
                  <div>
                    <div className={styles.defectCode}>🧵 Joined Piece</div>
                    <div className={styles.defectYard}>Posisi yard {d.yard}</div>
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => removeJoinedPiece(d.id)}
                    aria-label="Hapus joined piece"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new joined piece form */}
          <div className={styles.addForm}>
            <div className={styles.addFormLabel}>+ Tambah Joined Piece</div>
            {error && <div className={styles.errorBanner}>⚠️ {error}</div>}
            <div className={styles.formRow}>
              <div>
                <label className={styles.fieldLabel}>Posisi (Yard)</label>
                <input
                  className={styles.fieldInput}
                  type="number"
                  placeholder="mis. 45.5"
                  value={yard}
                  min="0.1"
                  {...(roll?.length ? { max: Math.max(0, roll.length - 0.1) } : {})}
                  step="0.1"
                  onChange={e => {
                    setYard(e.target.value)
                    setError('')
                  }}
                />
              </div>
            </div>
            <button className="btn btn-warning btn-sm" style={{ width: '100%' }} onClick={addJoinedPiece}>
              ＋ Tambah Joined Piece
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(list)}>
            💾 Simpan
          </button>
        </div>

      </div>
    </div>
  )
}
