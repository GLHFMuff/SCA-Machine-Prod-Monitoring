import { DEFECT_CODES } from '../data/dummyData.js'
import { useEffect, useRef, useState } from 'react'
import styles from './DefectModal.module.css'
import { getDefectCodeList } from '../services/api';

export default function DefectModal({ roll, isPreRoll = false, initDefects, onSave, onClose }) {
  const [list, setList] = useState(initDefects || [])
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
          setDefectOptions(res.data)
        } else {
          setDefectOptions(
            DEFECT_CODES.map(item => {
              const [c, ...rest] = item.split('–')
              return { Code: c.trim(), Defect: rest.join('–').trim() }
            })
          )
        }
      })
      .catch(err => {
        console.error('[DefectModal] gagal load defect codes:', err)
        setDefectOptions(
          DEFECT_CODES.map(item => {
            const [c, ...rest] = item.split('–')
            return { Code: c.trim(), Defect: rest.join('–').trim() }
          })
        )
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

  function addDefect() {
    if (!yard) {
      setError('Masukkan posisi cacat dalam yard.')
      return
    }
    const parsedYard = parseFloat(yard)
    if (isNaN(parsedYard) || parsedYard <= 0) {
      setError('Posisi cacat harus berupa angka lebih dari 0.')
      return
    }
    if (!isPreRoll && roll?.length && parsedYard >= roll.length) {
      setError(`Posisi cacat (${parsedYard} yd) harus di bawah panjang roll (${roll.length} yd).`)
      return
    }
    const parsedYardTo = parseFloat(yardTo)
    if (isNaN(parsedYardTo) || parsedYardTo <= 0) {
      setError('Posisi cacat to harus berupa angka lebih dari 0.')
      return
    }
    if (!isPreRoll && roll?.length && parsedYardTo >= roll.length) {
      setError(`Posisi cacat to (${parsedYardTo} yd) harus di bawah panjang roll (${roll.length} yd).`)
      return
    }
    if (parsedYardTo < parsedYard) {
      setError(`Posisi cacat to harus berupa angka lebih dari ${parsedYard}.`)
      return
    }
    if (!code) {
      setError('Pilih kode cacat terlebih dahulu.')
      return
    }
    setError('')
    setList(prev => [...prev, { id: Date.now() + Math.random(), yard: parsedYard, yardTo: parsedYardTo, code }])
    setYard('')
    setYardTo('')
    setCode('')
    setSearchQuery('')
    setIsDropdownOpen(false)
  }

  function removeDefect(id) {
    setList(prev => prev.filter(d => d.id !== id))
  }

  const selectedDefect = defectOptions.find(d => d.Code === code)

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
                ? 'Catat Cacat — Roll Belum Terbentuk'
                : `Catat Cacat — Roll #${roll?.id}`}
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
          {/* Existing defect list */}
          {list.length === 0 ? (
            <p className={styles.empty}>
              {isPreRoll
                ? 'Belum ada catatan cacat sementara pada roll yang sedang berjalan'
                : 'Belum ada catatan cacat pada roll ini'}
            </p>
          ) : (
            <div className={styles.defectList}>
              {list.map(d => {
                const defectDetail = defectOptions.find(o => o.Code === d.code)
                return (
                  <div className={styles.defectItem} key={d.id}>
                    <div>
                      <div className={styles.defectCode}>
                        ⚠️ {d.code} {defectDetail?.Defect ? `– ${defectDetail.Defect}` : ''}
                      </div>
                      <div className={styles.defectYard}>
                        Posisi yard {d.yard}{d.yardTo != d.yard && ` sampai yard ${d.yardTo}`}
                      </div>
                    </div>
                    <button
                      className={styles.deleteBtn}
                      onClick={() => removeDefect(d.id)}
                      aria-label="Hapus cacat"
                    >
                      🗑
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Add new defect form */}
          <div className={styles.addForm}>
            <div className={styles.addFormLabel}>+ Tambah Titik Cacat</div>
            {error && <div className={styles.errorBanner}>⚠️ {error}</div>}
            <div className={styles.formRow}>
              <div>
                <label className={styles.fieldLabel}>Posisi From(Yard)</label>
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
                    if (!yardTo || yardTo == 0) {
                      setYardTo(e.target.value)
                    }
                    setError('')
                  }}
                />
              </div>
              <div>
                <label className={styles.fieldLabel}>Posisi To(Yard)</label>
                <input
                  className={styles.fieldInput}
                  type="number"
                  placeholder="mis. 45.5"
                  value={yardTo}
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

            {/* Searchable Select Kode Cacat */}
            <div className={styles.selectWrapper} ref={dropdownRef}>
              <label className={styles.fieldLabel}>Kode Cacat</label>
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
                    : '-- Pilih / Cari Kode Cacat --'}
                </span>
                <span className={styles.triggerIcons}>
                  {code && (
                    <span
                      className={styles.clearIcon}
                      title="Hapus pilihan"
                      onClick={e => {
                        e.stopPropagation()
                        setCode('')
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
                      placeholder="Ketik kode atau nama cacat..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setIsDropdownOpen(false)
                        } else if (e.key === 'Enter') {
                          e.preventDefault()
                          if (filteredDefects.length > 0) {
                            setCode(filteredDefects[0].Code)
                            setIsDropdownOpen(false)
                            setSearchQuery('')
                            setError('')
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
                      <div className={styles.noOption}>Tidak ada kode cacat yang cocok</div>
                    ) : (
                      filteredDefects.map(d => {
                        const isSelected = d.Code === code
                        return (
                          <div
                            key={d.Code}
                            className={`${styles.optionItem} ${isSelected ? styles.optionSelected : ''}`}
                            onClick={() => {
                              setCode(d.Code)
                              setIsDropdownOpen(false)
                              setSearchQuery('')
                              setError('')
                            }}
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

            <button className="btn btn-warning btn-sm" style={{ width: '100%' }} onClick={addDefect}>
              ＋ Tambah Titik Cacat
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className="btn btn-outline btn-sm" onClick={onClose}>Batal</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(list)}>
            {isPreRoll ? '💾 Simpan Catatan Sementara' : '💾 Simpan'}
          </button>
        </div>

      </div>
    </div>
  )
}
