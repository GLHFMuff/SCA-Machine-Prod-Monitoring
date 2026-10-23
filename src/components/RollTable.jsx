import { useState, useRef, useEffect } from 'react'
import ConfirmDeleteModal from './ConfirmDeleteModal.jsx'
import ManualRollModal from './ManualRollModal.jsx'
import styles from './RollTable.module.css'

export default function RollTable({
  rolls,
  defects,
  onCatatCacat,
  onGetData,
  onDeleteRoll,
  onAddRoll,
  onUpdateBsQty,
}) {
  const [loading, setLoading] = useState(false)
  const [rollToDelete, setRollToDelete] = useState(null)
  const [showManualModal, setShowManualModal] = useState(false)
  const [editingBsId, setEditingBsId] = useState(null)
  const [editBsValue, setEditBsValue] = useState('')
  const containerRef = useRef(null)
  const prevCountRef = useRef(rolls.length)

  const nextRollId = rolls.length > 0 ? Math.max(...rolls.map(r => r.id)) + 1 : 1

  useEffect(() => {
    if (rolls.length > prevCountRef.current && containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
    prevCountRef.current = rolls.length
  }, [rolls.length])

  function startEditingBs(roll) {
    setEditingBsId(roll.id)
    setEditBsValue(roll.bsQty !== undefined && roll.bsQty !== null ? String(roll.bsQty) : '0')
  }

  function handleSaveBs(rollId) {
    if (editingBsId === null) return
    const parsed = parseFloat(editBsValue)
    const val = isNaN(parsed) || parsed < 0 ? 0 : parsed
    if (onUpdateBsQty) {
      onUpdateBsQty(rollId, val)
    }
    setEditingBsId(null)
  }

  function handleKeyDownBs(e, rollId) {
    if (e.key === 'Enter') {
      handleSaveBs(rollId)
    } else if (e.key === 'Escape') {
      setEditingBsId(null)
    }
  }

  async function handleGetData() {
    setLoading(true)
    try {
      if (onGetData) {
        await onGetData()
      } else {
        await new Promise(resolve => setTimeout(resolve, 750))
      }
    } finally {
      setLoading(false)
    }
  }

  function handleConfirmDelete() {
    if (rollToDelete && onDeleteRoll) {
      onDeleteRoll(rollToDelete.id)
    }
    setRollToDelete(null)
  }

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.title}>📋 Data Roll Produksi</div>
          <button
            type="button"
            className={styles.getDataBtn}
            onClick={handleGetData}
            disabled={loading}
          >
            <span className={loading ? styles.spin : ''}>🔄</span>
            <span>{loading ? 'Mengambil...' : 'Get Data'}</span>
          </button>
          <button
            type="button"
            className={styles.addRollBtn}
            onClick={() => setShowManualModal(true)}
            title="Input Roll Manual"
          >
            <span>➕</span>
            <span>Input Roll</span>
          </button>
        </div>
        <span className={styles.badge}>{rolls.length} Roll</span>
      </div>

      <div className={styles.tableContainer} ref={containerRef}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '64px' }}>Roll</th>
              <th>Panjang</th>
              <th>BS Qty</th>
              <th>Status</th>
              <th>Cacat</th>
              <th className={styles.center} style={{ width: '160px' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rolls.length === 0 ? (
              <tr>
                <td colSpan="6" className={styles.emptyState}>
                  Tidak ada data roll. Klik <strong>Get Data</strong> atau <strong>Input Roll</strong> untuk menambahkan roll.
                </td>
              </tr>
            ) : (
              rolls.map(roll => {
                const rollDefects = defects[roll.id] || []
                const hasDefect = rollDefects.length > 0

                return (
                  <tr key={roll.id}>
                    <td>
                      <span className={styles.rollNum}>#{roll.id}</span>
                    </td>
                    <td>
                      <span className={styles.lengthVal}>{roll.length}</span>
                      {' '}<span className={styles.lengthUnit}>yard</span>
                    </td>
                    <td
                      className={styles.bsCell}
                      onDoubleClick={() => startEditingBs(roll)}
                      title="Double click untuk edit BS QTY"
                    >
                      {editingBsId === roll.id ? (
                        <div className={styles.inlineEditWrap}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            className={styles.inlineInput}
                            value={editBsValue}
                            onChange={e => setEditBsValue(e.target.value)}
                            onKeyDown={e => handleKeyDownBs(e, roll.id)}
                            onBlur={() => handleSaveBs(roll.id)}
                            autoFocus
                            onFocus={e => e.target.select()}
                          />
                          <span className={styles.inlineUnit}>yd</span>
                          <button
                            type="button"
                            className={styles.inlineSaveBtn}
                            onMouseDown={e => {
                              e.preventDefault()
                              handleSaveBs(roll.id)
                            }}
                            title="Simpan"
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <div className={styles.bsDisplayWrap}>
                          {roll.bsQty && roll.bsQty > 0 ? (
                            <span className={styles.bsValWarn}>
                              {roll.bsQty} <span className={styles.bsUnit}>yd</span>
                            </span>
                          ) : (
                            <span className={styles.bsValZero}>0</span>
                          )}
                          <span className={styles.editHintIcon} title="Double click untuk edit">✎</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {hasDefect ? (
                        <span className={styles.statusWarn}>
                          <span className={styles.dotWarn} /> Ada Cacat
                        </span>
                      ) : (
                        <span className={styles.statusOk}>
                          <span className={styles.dotOk} /> OK
                        </span>
                      )}
                    </td>
                    <td>
                      {hasDefect ? (
                        <span className={styles.defectBadge}>⚠ {rollDefects.length}</span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: '12px' }}>-</span>
                      )}
                    </td>
                    <td className={styles.center}>
                      <div className={styles.actionGroup}>
                        <button
                          type="button"
                          className={`btn btn-outline btn-sm ${styles.actionBtn}`}
                          onClick={() => onCatatCacat(roll)}
                        >
                          {hasDefect ? '✏️ Cacat' : '+ Cacat'}
                        </button>
                        <button
                          type="button"
                          className={styles.deleteRowBtn}
                          onClick={() => setRollToDelete(roll)}
                          title={`Hapus Roll #${roll.id}`}
                          aria-label={`Hapus Roll #${roll.id}`}
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {rollToDelete && (
        <ConfirmDeleteModal
          roll={rollToDelete}
          defectCount={(defects[rollToDelete.id] || []).length}
          onConfirm={handleConfirmDelete}
          onCancel={() => setRollToDelete(null)}
        />
      )}

      {showManualModal && (
        <ManualRollModal
          defaultRollId={nextRollId}
          onSave={newRoll => {
            if (onAddRoll) onAddRoll(newRoll)
            setShowManualModal(false)
          }}
          onClose={() => setShowManualModal(false)}
        />
      )}
    </div>
  )
}
