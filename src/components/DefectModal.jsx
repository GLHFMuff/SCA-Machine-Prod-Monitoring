import { DEFECT_CODES } from '../data/dummyData.js'
import { useEffect, useRef, useState } from 'react'
import styles from './DefectModal.module.css'
import { getDefectCodeList, getRollDefectsApi, getJoinedPiecesApi, getInventoryStatusList } from '../services/api'
import {
  buildInitialInspectionList,
  ensureJpDefectOption,
  extractDefectCode,
  getNextChildLineNumber,
  isJoinedPieceCode,
  splitInspectionsByType,
  validateAndBuildInspectionItem,
  DEFECT_POINT_OPTIONS,
  DEFECT_POINT_LABELS,
} from '../utils/inspectionHelpers.js'

function parseDummyDefectCodes() {
  return DEFECT_CODES.map(item => {
    const [c, ...rest] = item.split('–')
    return { Code: c.trim(), Defect: rest.join('–').trim() }
  })
}

const DEFAULT_INVENT_STATUS_OPTIONS = [
  { StatusId: 'BS', Name: 'BS' },
  { StatusId: 'JABLAK', Name: 'JABLAK' },
  { StatusId: 'KECILAN', Name: 'KECILAN' },
  { StatusId: 'SAMPLE', Name: 'SAMPLE' },
  { StatusId: 'BAGUS 1-4', Name: 'BAGUS 1-4' },
  { StatusId: 'BS 1-4', Name: 'BS 1-4' },
  { StatusId: 'BS KARUNG', Name: 'BS KARUNG' },
  { StatusId: 'UJUNG', Name: 'UJUNG' },
]

export default function DefectModal({
  roll,
  prodId = '',
  isPreRoll = false,
  isCutMode,
  initDefects,
  initJoinedPieces = [],
  maxDefectLine = 0,
  maxJoinedPieceLine = 0,
  canCreate = true,
  onSave,
  onClose,
}) {
  const effectiveCutMode =
    roll?.isCutMode !== undefined
      ? Boolean(roll.isCutMode)
      : isCutMode !== undefined
      ? Boolean(isCutMode)
      : true

  const [list, setList] = useState(() =>
    buildInitialInspectionList(initDefects, initJoinedPieces, isPreRoll)
  )
  const [dbMaxDefectLine, setDbMaxDefectLine] = useState(() =>
    Math.max(
      Number(maxDefectLine) || 0,
      ...(Array.isArray(initDefects) ? initDefects : [])
        .filter((d) => !isJoinedPieceCode(d?.code))
        .map((d) => Number(d?.lineNumber ?? d?.LineNumber) || 0)
    )
  )
  const [dbMaxJpLine, setDbMaxJpLine] = useState(() =>
    Math.max(
      Number(maxJoinedPieceLine) || 0,
      ...(Array.isArray(initJoinedPieces) ? initJoinedPieces : []).map(
        (jp) => Number(jp?.lineNumber ?? jp?.LineNumber) || 0
      )
    )
  )
  const [yard, setYard] = useState('')
  const [yardTo, setYardTo] = useState('')
  const [code, setCode] = useState('')
  const [point, setPoint] = useState(0)
  const [error, setError] = useState('')
  const [defectOptions, setDefectOptions] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isCutDefect, setIsCutDefect] = useState(() => (isPreRoll ? effectiveCutMode : false))
  const [isAutoJoin, setIsAutoJoin] = useState(() => (isPreRoll ? effectiveCutMode : false))
  const [coProductType, setCoProductType] = useState('BS')
  const [inventStatusOptions, setInventStatusOptions] = useState(DEFAULT_INVENT_STATUS_OPTIONS)
  const [deletedCoProductIds, setDeletedCoProductIds] = useState([])

  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (isPreRoll) {
      setIsCutDefect(effectiveCutMode)
      setIsAutoJoin(effectiveCutMode)
    }
  }, [isPreRoll, effectiveCutMode])

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
    getInventoryStatusList({ badStock: true })
      .then(res => {
        const rawList = res?.data || []
        const badStockList = rawList.filter(d => d.BadStock === true)
        if (badStockList.length > 0) {
          setInventStatusOptions(badStockList)
          if (!badStockList.some(d => d.StatusId === coProductType)) {
            const hasBs = badStockList.some(d => d.StatusId === 'BS')
            if (!hasBs) {
              setCoProductType(badStockList[0].StatusId)
            }
          }
        }
      })
      .catch(err => {
        console.error('[DefectModal] gagal load inventory status:', err)
      })
  }, [])

  // Sinkronkan max LineNumber dari DB (termasuk baris yang di-soft-delete) agar line baru tidak memakai ulang LineNumber terhapus
  useEffect(() => {
    let isMounted = true
    if (isPreRoll || !prodId || !roll?.id) return

    Promise.all([
      getRollDefectsApi(prodId, roll.id).catch(() => null),
      getJoinedPiecesApi(prodId, roll.id).catch(() => null),
    ]).then(([defRes, jpRes]) => {
      if (!isMounted) return
      const serverDefMax = Number(defRes?.maxLineNumber ?? defRes?.maxLineNumberByRoll?.[roll.id]) || 0
      const serverJpMax = Number(jpRes?.maxLineNumber ?? jpRes?.maxLineNumberByRoll?.[roll.id]) || 0
      if (serverDefMax > 0) {
        setDbMaxDefectLine((prev) => Math.max(prev, serverDefMax))
      }
      if (serverJpMax > 0) {
        setDbMaxJpLine((prev) => Math.max(prev, serverJpMax))
      }
    })

    return () => {
      isMounted = false
    }
  }, [isPreRoll, prodId, roll?.id])

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

  function buildPendingItemsFromInputs(currentList = list) {
    const rawYard = String(yard ?? '').trim()
    let cleanCode = String(code ?? '').trim()

    // Jika dropdown sedang terbuka atau searchQuery ada tapi belum ter-select, coba cari matching option
    if (!cleanCode && searchQuery.trim()) {
      const match = defectOptions.find(d =>
        String(d.Code || '').trim().toLowerCase() === searchQuery.trim().toLowerCase() ||
        String(d.Defect || '').trim().toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
      if (match) {
        cleanCode = match.Code
      }
    }

    // Jika seluruh form kosong
    if (!rawYard && !cleanCode && !String(yardTo ?? '').trim()) {
      return { items: [], hasInputs: false }
    }

    const parsedYardFrom = parseFloat(rawYard)
    const rawYardTo = String(yardTo ?? '').trim()
    const parsedYardTo = rawYardTo !== '' ? parseFloat(rawYardTo) : parsedYardFrom
    const isJp = isJoinedPieceCode(cleanCode)

    if (isPreRoll && !isJp && isCutDefect) {
      if (!rawYard) {
        return { error: 'Masukkan posisi From (Yard).' }
      }
      if (rawYardTo === '') {
        return { error: 'Posisi To (Yard) harus diisi untuk menentukan panjang kain cacat yang dipotong.' }
      }
      if (isNaN(parsedYardTo) || parsedYardTo <= parsedYardFrom) {
        return { error: `Posisi To (${parsedYardTo || rawYardTo} yd) harus lebih besar dari Posisi From (${parsedYardFrom} yd).` }
      }
    }

    const isCutting = Boolean(isPreRoll && !isJp && isCutDefect && (parsedYardTo > parsedYardFrom))
    const isJoining = Boolean(isPreRoll && !isJp && isAutoJoin && isCutting)

    const result = validateAndBuildInspectionItem({
      yard: rawYard,
      yardTo: rawYardTo,
      code: cleanCode,
      point: isJp ? null : (point !== undefined && point !== null && point !== '' ? Number(point) : 0),
      isPreRoll,
      rollLength: roll?.length,
      isCutDefect: Boolean(isPreRoll && !isJp && isCutDefect),
      coProductType: isCutting ? (coProductType || 'BS') : null,
    })

    if (result.error) {
      return { error: result.error }
    }

    const { defects: currentDefects, joinedPieces: currentJps } = splitInspectionsByType(currentList)

    const defId = Date.now() + Math.random()
    const jpId = Date.now() + Math.random() + 0.1

    if (result.item.isJoinedPiece) {
      const nextLineNumber = getNextChildLineNumber(currentJps, dbMaxJpLine)
      return {
        items: [{ ...result.item, lineNumber: nextLineNumber }],
        hasInputs: true,
      }
    } else {
      const nextDefLine = getNextChildLineNumber(currentDefects, dbMaxDefectLine)
      const nextJpLine = getNextChildLineNumber(currentJps, dbMaxJpLine)
      const cutQty = isCutting ? parseFloat((parsedYardTo - parsedYardFrom).toFixed(2)) : 0
      const selectedCpType = isCutting ? (coProductType || 'BS') : null

      const defItem = {
        ...result.item,
        id: defId,
        lineNumber: nextDefLine,
        isCutDefect: isCutting,
        cutLength: cutQty,
        coProductCreated: false,
        coProductType: selectedCpType,
        inventStatus: selectedCpType,
        linkedJpId: isJoining ? jpId : null,
      }

      const itemsToAdd = [defItem]

      if (isJoining) {
        itemsToAdd.push({
          id: jpId,
          _uid: `jp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          yard: parsedYardFrom,
          yardTo: parsedYardFrom,
          code: 'JP',
          isJoinedPiece: true,
          isAutoFromCut: true,
          linkedDefectId: defId,
          lineNumber: nextJpLine,
        })
      }

      return { items: itemsToAdd, hasInputs: true }
    }
  }

  function addDefect() {
    const buildResult = buildPendingItemsFromInputs(list)
    if (buildResult.error) {
      setError(buildResult.error)
      return
    }

    if (!buildResult.hasInputs || buildResult.items.length === 0) {
      setError('Silakan masukkan posisi yard dan pilih kode cacat terlebih dahulu.')
      return
    }

    setError('')
    setList(prev => [...prev, ...buildResult.items])
    setYard('')
    setYardTo('')
    setCode('')
    setPoint(0)
    setSearchQuery('')
    setIsDropdownOpen(false)
  }

  function removeDefect(itemKey) {
    const target = list.find(d => (d._uid || d.id) === itemKey)
    if (!target) return

    if (target.coProductId) {
      setDeletedCoProductIds(prev => [...prev, target.coProductId])
    }

    const linkedJpId = target.linkedJpId
    const linkedDefectId = target.linkedDefectId

    setList(prev => prev.filter(d => {
      const key = d._uid || d.id
      if (key === itemKey) return false
      if (linkedJpId && (d.id === linkedJpId || d._uid === linkedJpId)) return false
      if (linkedDefectId && (d.id === linkedDefectId || d._uid === linkedDefectId)) return false
      return true
    }))
  }

  function handleSave() {
    // 1. Cek apakah ada input di form yang belum di-klik "+ Potong Cacat & Sambung Kain"
    const buildResult = buildPendingItemsFromInputs(list)
    if (buildResult.error) {
      setError(buildResult.error)
      return
    }

    let finalList = [...list]
    if (buildResult.hasInputs && buildResult.items.length > 0) {
      finalList = [...finalList, ...buildResult.items]
    }

    if (finalList.length === 0 && deletedCoProductIds.length === 0) {
      setError('Silakan masukkan posisi yard dan pilih kode cacat terlebih dahulu sebelum menyimpan.')
      return
    }

    const { defects, joinedPieces } = splitInspectionsByType(finalList)
    const newCoProducts = finalList.filter(
      item =>
        isPreRoll &&
        item.isCutDefect &&
        !item.coProductCreated &&
        !item.coProductId &&
        !item.isJoinedPiece
    )
    onSave(defects, joinedPieces, newCoProducts, deletedCoProductIds)
  }

  const isJpSelected = isJoinedPieceCode(code)
  const selectedDefect = defectOptions.find(
    d => String(d.Code || '').trim().toUpperCase() === extractDefectCode(code).toUpperCase()
  )

  const parsedYardFrom = parseFloat(yard)
  const parsedYardTo = parseFloat(yardTo)
  const hasValidCut =
    isPreRoll &&
    !isJpSelected &&
    !isNaN(parsedYardFrom) &&
    parsedYardFrom > 0 &&
    !isNaN(parsedYardTo) &&
    parsedYardTo > parsedYardFrom
  const liveCutQty = hasValidCut ? parseFloat((parsedYardTo - parsedYardFrom).toFixed(2)) : 0

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
                ? (effectiveCutMode
                    ? `Catat Cacat & Potong Kain (BS) — Roll #${roll?.id || 'Berikutnya'}`
                    : `Catat Inspeksi & Joined Piece — Roll #${roll?.id || 'Berikutnya'}`)
                : (roll?.productType === 1 || Number(roll?.id) >= 9001)
                  ? `Catat Inspeksi — Co-Product (${roll?.inventStatus || 'BS'}) #${roll?.id}`
                  : `Catat Inspeksi — Roll #${roll?.id}`}
            </div>
            <div className={styles.headSub}>
              {isPreRoll
                ? (effectiveCutMode
                    ? 'Potongan cacat otomatis masuk Co-Product BS & tercatat sebagai Joined Piece'
                    : 'Cacat & Joined Piece dicatat di roll utama tanpa memotong kain (tanpa Co-Product BS)')
                : `Panjang: ${roll?.length} yard${roll?.noMesin ? ` • Mesin #${roll.noMesin}` : ''}`}
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
                ? (effectiveCutMode
                    ? 'Belum ada potongan cacat atau sambungan kain pada roll berjalan ini'
                    : 'Belum ada catatan cacat atau joined piece pada roll berjalan ini')
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
                const cutLengthVal = d.cutLength || (d.yardTo > d.yard ? parseFloat((d.yardTo - d.yard).toFixed(2)) : 0)

                return (
                  <div className={styles.defectItem} key={itemKey}>
                    <div>
                      <div className={`${styles.defectCode} ${isJp ? styles.jpCode : ''}`}>
                        <span>
                          {isJp ? '🧵' : '⚠️'} {d.code}
                          {resolvedDesc ? ` – ${resolvedDesc}` : ''}
                        </span>
                        {isJp && <span className={styles.jpBadge}>Joined Piece</span>}
                        {isJp && d.isAutoFromCut && (
                          <span className={styles.autoBadge}>Otomatis (Sambungan)</span>
                        )}
                        {!isJp && d.isCutDefect && (
                          <span className={`${styles.cutBadge} ${d.coProductId ? styles.cutCoProductBadge : ''}`}>
                            ✂️ {d.coProductId
                              ? `Co-Product ${d.coProductType || d.inventStatus || 'BS'} #${d.coProductId}`
                              : `Potong ${d.coProductType || d.inventStatus || 'BS'}`} ({cutLengthVal} yd)
                          </span>
                        )}
                        {!isJp && !d.isCutDefect && isPreRoll && (
                          <span className={styles.regularBadge}>
                            Inspeksi Biasa
                          </span>
                        )}
                        {!isJp && d.point !== undefined && d.point !== null && (
                          <span className={styles.pointBadge}>
                            Point {d.point} ({DEFECT_POINT_LABELS[d.point] || ''})
                          </span>
                        )}
                      </div>
                      <div className={styles.defectYard}>
                        {d.lineNumber ? `Line #${d.lineNumber} • ` : ''}
                        {isJp
                          ? `Titik Sambungan yard ${d.yard}`
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
          {canCreate && (
            <div className={styles.addForm}>
              <div className={styles.addFormLabel}>
                {isPreRoll
                  ? (effectiveCutMode
                      ? (isJpSelected ? '+ Tambah Joined Piece (Sambungan)' : '+ Potong Kain Cacat & Sambung')
                      : (isJpSelected ? '+ Tambah Joined Piece' : '+ Tambah Titik Cacat (Biasa)'))
                  : '+ Tambah Titik Inspeksi'}
              </div>
              {error && <div className={styles.errorBanner}>⚠️ {error}</div>}
              <div className={styles.formRow}>
                <div>
                  <label className={styles.fieldLabel}>
                    {isPreRoll && isCutDefect && !isJpSelected ? 'Posisi Awal / From (Yard)' : 'Posisi From (Yard)'}
                  </label>
                  <input
                    className={styles.fieldInput}
                    type="number"
                    placeholder="mis. 50"
                    value={yard}
                    min="0"
                    {...(!isPreRoll && roll?.length ? { max: roll.length } : {})}
                    step="0.1"
                    onChange={e => {
                      setYard(e.target.value)
                      setError('')
                    }}
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel}>
                    {isPreRoll && isCutDefect && !isJpSelected
                      ? 'Posisi Akhir / To (Yard)'
                      : <>Posisi To (Yard) <span className={styles.optionalHint}>(Opsional)</span></>}
                  </label>
                  <input
                    className={styles.fieldInput}
                    type="number"
                    placeholder={isJpSelected ? 'Tidak diperlukan untuk JP' : (isPreRoll && isCutDefect ? 'mis. 52' : 'Opsional')}
                    value={isJpSelected ? '' : yardTo}
                    disabled={isJpSelected}
                    min="0"
                    {...(!isPreRoll && roll?.length ? { max: roll.length } : {})}
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

              {/* Pilihan Point Cacat (Sistem 4-Point: 1, 2, 3, 4) */}
              {!isJpSelected && (
                <div className={styles.pointContainer}>
                  <div className={styles.pointHeader}>
                    <label className={styles.fieldLabel}>Point Cacat (Ukuran)</label>
                    <span className={styles.pointSelectedHint}>
                      Terpilih: <strong>Point {point}</strong> ({DEFECT_POINT_LABELS[point] || ''})
                    </span>
                  </div>
                  <div className={styles.pointRadioGrid} role="radiogroup" aria-label="Point Cacat">
                    {DEFECT_POINT_OPTIONS.map((opt) => {
                      const isSelected = Number(point) === opt.value
                      return (
                        <label
                          key={opt.value}
                          className={`${styles.pointRadioCard} ${isSelected ? styles.pointRadioSelected : ''}`}
                        >
                          <input
                            type="radio"
                            name="defectPoint"
                            value={opt.value}
                            checked={isSelected}
                            onChange={() => setPoint(opt.value)}
                            className={styles.pointRadioInput}
                          />
                          <div className={styles.pointRadioContent}>
                            <div className={styles.pointValueBadge}>
                              <span className={styles.pointDot} />
                              <span>Point {opt.value}</span>
                            </div>
                            <span className={styles.pointRangeLabel}>{opt.label}</span>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Pilihan Jenis Co-Product (BS, JABLAK, KECILAN, dsb.) */}
              {isPreRoll && isCutDefect && !isJpSelected && (
                <div className={styles.coProductTypeGroup}>
                  <div className={styles.pointHeader}>
                    <label className={styles.fieldLabel}>Jenis Co-Product</label>
                    <span className={styles.pointSelectedHint}>
                      Status: <strong>{coProductType}</strong>
                    </span>
                  </div>
                  <select
                    className={styles.fieldInput}
                    value={coProductType}
                    onChange={(e) => setCoProductType(e.target.value)}
                  >
                    {inventStatusOptions.map((opt) => (
                      <option key={opt.StatusId} value={opt.StatusId}>
                        {opt.StatusId} – {opt.Name || opt.StatusId}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isJpSelected && (
                <div className={styles.jpNotice}>
                  🧵 Kode <strong>JP</strong> akan disimpan ke <strong>Joined Piece</strong> (hanya menggunakan From length).
                </div>
              )}

              {/* Mode Biasa (Tanpa Potong) Notice */}
              {isPreRoll && !effectiveCutMode && (
                <div className={styles.regularNotice}>
                  ℹ️ <strong>Mode Inspeksi Biasa:</strong> Titik cacat atau Joined Piece tersimpan pada riwayat roll tanpa memotong kain (tidak membuat Co-Product).
                </div>
              )}

              {/* Ringkasan Potong & Sambung untuk Pre-Roll Cut Mode */}
              {isPreRoll && effectiveCutMode && !isJpSelected && hasValidCut && isCutDefect && (
                <div className={styles.cutPreviewBox}>
                  <div className={styles.cutPreviewHeader}>✂️ Ringkasan Potong & Sambung:</div>
                  <div className={styles.cutPreviewRow}>
                    <span>Panjang Cacat (Masuk Co-Product {coProductType}):</span>
                    <strong style={{ color: 'var(--danger, #ef4444)' }}>{liveCutQty} yard</strong>
                  </div>
                  {isAutoJoin && (
                    <div className={styles.cutPreviewRow}>
                      <span>Titik Sambungan (Joined Piece):</span>
                      <strong style={{ color: 'var(--accent, #3b82f6)' }}>Posisi {parsedYardFrom} yard</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Checkboxes untuk Potong BS & Sambung Kain (hanya muncul di Mode Potong) */}
              {isPreRoll && effectiveCutMode && !isJpSelected && (
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkboxInput}
                      checked={isCutDefect}
                      onChange={e => setIsCutDefect(e.target.checked)}
                    />
                    <span>Potong kain cacat → Masuk Co-Product {coProductType} {hasValidCut ? `(${liveCutQty} yd)` : ''}</span>
                  </label>
                  {isCutDefect && (
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        className={styles.checkboxInput}
                        checked={isAutoJoin}
                        onChange={e => setIsAutoJoin(e.target.checked)}
                      />
                      <span>Sambung kain setelah dipotong → Otomatis catat Joined Piece</span>
                    </label>
                  )}
                </div>
              )}

              <button className="btn btn-warning btn-sm" style={{ width: '100%' }} onClick={addDefect}>
                {isJpSelected
                  ? '＋ Tambah Joined Piece'
                  : (isPreRoll && isCutDefect
                    ? '＋ Potong Cacat & Sambung Kain'
                    : (isPreRoll ? '＋ Tambah Titik Cacat' : '＋ Tambah Titik Inspeksi'))}
              </button>
            </div>
          )}
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
