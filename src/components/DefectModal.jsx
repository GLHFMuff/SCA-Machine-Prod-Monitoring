import { DEFECT_CODES } from '../data/dummyData.js'
import { useEffect, useRef, useState } from 'react'
import styles from './DefectModal.module.css'
import { getDefectCodeList } from '../services/api'
import {
  buildInitialInspectionList,
  ensureJpDefectOption,
  extractDefectCode,
  isJoinedPieceCode,
  splitInspectionsByType,
  validateAndBuildInspectionItem,
} from '../utils/inspectionHelpers.js'

function parseDummyDefectCodes() {
  return DEFECT_CODES.map(item => {
    const [c, ...rest] = item.split('–')
    return { Code: c.trim(), Defect: rest.join('–').trim() }
  })
}

export default function DefectModal({
  roll,
  isPreRoll = false,
  initDefects,
  initJoinedPieces = [],
  onSave,
  onClose,
}) {
  const [list, setList] = useState(() =>
    buildInitialInspectionList(initDefects, initJoinedPieces, isPreRoll)
  )
  const [yard, setYard] = useState('')
  const [yardTo, setYardTo] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [defectOptions, setDefectOptions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)

  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    getDefectCodeList()
      .then(res => {
        if (res?.data && res.data.length > 0) {
          setDefectOptions(ensureJpDefectOption(res.data))
        } else {
          setDefectOptions(ensureJpDefectOption(parseDummyDefectCodes()))
        }
      })
      .catch(err => {
        console.error('[DefectModal] gagal load defect codes:', err)
        setDefectOptions(ensureJpDefectOption(parseDummyDefectCodes()))
      })
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
      return () => {
        clearTimeout(timer)
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('touchstart', handleClickOutside)
      }
    }
  }, [isDropdownOpen])

  function selectDefectCode(nextCode) {
    setCode(nextCode)
    setIsDropdownOpen(false)
    setSearchQuery('')
    setError('')
    if (isJoinedPieceCode(nextCode)) {
      setYardTo('')
    }
  }

  function addDefect() {
    const result = validateAndBuildInspectionItem({
      yard,
      yardTo,
      code,
      isPreRoll,
      rollLength: roll?.length,
    })

    if (result.error) {
      setError(result.error)
      return
    }

    setError('')
    setList(prev => [...prev, result.item])
    setYard('')
    setYardTo('')
    setCode('')
    setSearchQuery('')
    setIsDropdownOpen(false)
  }

  function removeDefect(itemKey) {
    setList(prev => prev.filter(d => (d._uid || d.id) !== itemKey))
  }

  function handleSave() {
    const { defects, joinedPieces } = splitInspectionsByType(list)
    onSave(defects, joinedPieces)
  }

  const isJpSelected = isJoinedPieceCode(code)
  const selectedDefect = defectOptions.find(
    d => String(d.Code || '').trim().toUpperCase() === extractDefectCode(code).toUpperCase()
  )

  const filteredDefects = defectOptions.filter(d => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    const codeMatch = d.Code ? d.Code.toLowerCase().includes(q) : false
    const defectMatch = d.Defect ? d.Defect.toLowerCase().includes(q) : false
    return codeMatch || defectMatch
  })

  return (
    <div className={styles.overlay}>
      <div className={styles.box}>

        {/* Header */}
        <div className={styles.head}>
          <div>
            <div className={styles.title}>
              {isPreRoll
                ? 'Catat Inspeksi — Roll Belum Terbentuk'
                : `Catat Inspeksi — Roll #${roll?.id}`}
            </div>
            <div className={styles.headSub}>
              {isPreRoll
                ? `Target Roll #${roll?.id || 'Berikutnya'} • Disimpan otomatis saat Get Data`
                : `Panjang: ${roll?.length} yard`}
            </div>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Tutup">✕</button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Existing defect & joined piece list */}
          {list.length === 0 ? (
            <p className={styles.empty}>
              {isPreRoll
                ? 'Belum ada catatan inspeksi sementara pada roll yang sedang berjalan'
                : 'Belum ada catatan inspeksi pada roll ini'}
            </p>
          ) : (
            <div className={styles.defectList}>
              {list.map(d => {
                const itemKey = d._uid || d.id
                const isJp = isJoinedPieceCode(d.code) || Boolean(d.isJoinedPiece)
                const baseCode = extractDefectCode(d.code)
                const defectDetail = defectOptions.find(
                  o => String(o.Code || '').trim().toUpperCase() === baseCode.toUpperCase()
                )
                const hasDescInCode = /\s+[–-]\s+/.test(String(d.code || ''))
                const resolvedDesc = !hasDescInCode
                  ? (defectDetail?.Defect || (isJp ? 'Joined Piece' : ''))
                  : ''

                return (
                  <div className={styles.defectItem} key={itemKey}>
                    <div>
                      <div className={`${styles.defectCode} ${isJp ? styles.jpCode : ''}`}>
                        <span>
                          {isJp ? '🧵' : '⚠️'} {d.code}
                          {resolvedDesc ? ` – ${resolvedDesc}` : ''}
                        </span>
                        {isJp && <span className={styles.jpBadge}>Joined Piece</span>}
                      </div>
                      <div className={styles.defectYard}>
                        {isJp
                          ? `Panjang / Posisi yard ${d.yard}`
                          : `Posisi yard ${d.yard}${d.yardTo > 0 && d.yardTo != d.yard ? ` sampai yard ${d.yardTo}` : ''}`}
                      </div>
                    </div>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => removeDefect(itemKey)}
                      aria-label={isJp ? 'Hapus joined piece' : 'Hapus inspeksi'}
                    >
                      🗑
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add new defect / joined piece form */}
          <div className={styles.addForm}>
            <div className={styles.addFormLabel}>+ Tambah Titik Inspeksi</div>
            {error && <div className={styles.errorBanner}>⚠️ {error}</div>}
            <div className={styles.formRow}>
              <div>
                <label className={styles.fieldLabel}>
                  {isJpSelected ? 'From Length / Posisi (Yard)' : 'Posisi From (Yard)'}
                </label>
                <input
                  className={styles.fieldInput}
                  type="number"
                  placeholder="mis. 45.5"
                  value={yard}
                  min="0.1"
                  {...(!isPreRoll && roll?.length ? { max: Math.max(0, roll.length - 0.1) } : {})}
                  step="0.1"
                  onChange={e => {
                    setYard(e.target.value)
                    setError('')
                  }}
                />
              </div>
              <div>
                <label className={styles.fieldLabel}>
                  Posisi To (Yard) <span className={styles.optionalHint}>(Opsional)</span>
                </label>
                <input
                  className={styles.fieldInput}
                  type="number"
                  placeholder={isJpSelected ? 'Tidak diperlukan untuk JP' : 'Opsional'}
                  value={isJpSelected ? '' : yardTo}
                  disabled={isJpSelected}
                  min="0.1"
                  {...(!isPreRoll && roll?.length ? { max: Math.max(0, roll.length - 0.1) } : {})}
                  step="0.1"
                  onChange={e => {
                    setYardTo(e.target.value)
                    setError('')
                  }}
                />
              </div>
            </div>

            {/* Searchable Select Kode Inspeksi */}
            <div className={styles.selectWrapper} ref={dropdownRef}>
              <label className={styles.fieldLabel}>Kode Inspeksi</label>
              <button
                type="button"
                className={`${styles.selectTrigger} ${isDropdownOpen ? styles.selectTriggerActive : ''}`}
                onClick={() => {
                  setIsDropdownOpen(prev => !prev)
                  setSearchQuery('')
                }}
              >
                <span className={code ? styles.selectedText : styles.placeholderText}>
                  {selectedDefect
                    ? `${selectedDefect.Code} – ${selectedDefect.Defect}`
                    : (code || '-- Pilih / Cari Kode Inspeksi --')}
                </span>
                <span className={styles.triggerIcons}>
                  {code && (
                    <span
                      className={styles.clearIcon}
                      title="Hapus pilihan"
                      onClick={e => {
                        e.stopPropagation()
                        setCode('')
                        setError('')
                      }}
                    >
                      ✕
                    </span>
                  )}
                  <span className={styles.arrowIcon}>{isDropdownOpen ? '▲' : '▼'}</span>
                </span>
              </button>

              {isDropdownOpen && (
                <div className={styles.dropdownMenu}>
                  <div className={styles.searchBox}>
                    <span className={styles.searchIcon}>🔍</span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className={styles.searchInput}
                      placeholder="Ketik kode atau nama inspeksi..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setIsDropdownOpen(false)
                        } else if (e.key === 'Enter') {
                          e.preventDefault()
                          if (filteredDefects.length > 0) {
                            selectDefectCode(filteredDefects[0].Code)
                          }
                        }
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        className={styles.clearSearchBtn}
                        onClick={() => setSearchQuery('')}
                        title="Hapus pencarian"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className={styles.optionsList}>
                    {filteredDefects.length === 0 ? (
                      <div className={styles.noOption}>Tidak ada kode inspeksi yang cocok</div>
                    ) : (
                      filteredDefects.map(d => {
                        const isSelected =
                          String(d.Code || '').trim().toUpperCase() ===
                          extractDefectCode(code).toUpperCase()
                        return (
                          <div
                            key={d.Code}
                            className={`${styles.optionItem} ${isSelected ? styles.optionSelected : ''}`}
                            onClick={() => selectDefectCode(d.Code)}
                          >
                            <span className={styles.optionCode}>{d.Code}</span>
                            <span className={styles.optionDefect}>{d.Defect}</span>
                            {isSelected && <span className={styles.checkmark}>✓</span>}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {isJpSelected && (
              <div className={styles.jpNotice}>
                🧵 Kode <strong>JP</strong> akan disimpan ke <strong>Joined Piece</strong> (hanya menggunakan From length).
              </div>
            )}

            <button className="btn btn-warning btn-sm" style={{ width: '100%' }} onClick={addDefect}>
              {isJpSelected ? '＋ Tambah Joined Piece' : '＋ Tambah Titik Inspeksi'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>
            {isPreRoll ? '💾 Simpan Catatan Sementara' : '💾 Simpan'}
          </button>
        </div>

      </div>
    </div>
  )
}
