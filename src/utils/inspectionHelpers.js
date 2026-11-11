/**
 * Helpers for DefectModal & MainPage inspection/joined-piece routing.
 */

function generateUniqueKey(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Extract base defect code from either "JP" or "JP – Joined Piece".
 * @param {string} rawCode
 * @returns {string}
 */
export function extractDefectCode(rawCode) {
  const s = String(rawCode ?? '').trim()
  if (!s) return ''
  const parts = s.split(/\s+[–-]\s+/)
  return (parts[0] || s).trim()
}

/**
 * Return true if the inspection code corresponds to Joined Piece ("JP").
 * @param {string} rawCode
 * @returns {boolean}
 */
export function isJoinedPieceCode(rawCode) {
  return extractDefectCode(rawCode).toUpperCase() === 'JP'
}

/**
 * Ensure "JP" is always available in defect dropdown options (preserving DB entry if present).
 * @param {Array<{ Code: string, Defect?: string }>} options
 * @returns {Array<{ Code: string, Defect?: string }>}
 */
export function ensureJpDefectOption(options = []) {
  const list = Array.isArray(options) ? [...options] : []
  if (!list.some((o) => isJoinedPieceCode(o?.Code))) {
    list.push({ Code: 'JP', Defect: 'Joined Piece' })
  }
  return list
}

/**
 * Combine initial defects and joined pieces into a unified list for DefectModal,
 * assigning collision-free internal keys (_uid) for React rendering & removal.
 * @param {Array} initDefects
 * @param {Array} initJoinedPieces
 * @param {boolean} isPreRoll
 * @returns {Array}
 */
export function buildInitialInspectionList(
  initDefects = [],
  initJoinedPieces = [],
  isPreRoll = false
) {
  const fromDefects = (Array.isArray(initDefects) ? initDefects : []).map((d, idx) => ({
    ...d,
    isJoinedPiece: isJoinedPieceCode(d.code),
    _uid: `def-${idx}-${d.id ?? generateUniqueKey('d')}`,
  }))

  if (isPreRoll) {
    return fromDefects
  }

  const fromJoinedPieces = (Array.isArray(initJoinedPieces) ? initJoinedPieces : []).map(
    (jp, idx) => {
      const parsedYard = parseFloat(jp.yard) || 0
      return {
        id: jp.id ?? Date.now() + Math.random(),
        yard: parsedYard,
        yardTo: parsedYard,
        code: 'JP',
        isJoinedPiece: true,
        ...(jp.lineNumber ? { lineNumber: jp.lineNumber } : {}),
        _uid: `jp-${idx}-${jp.id ?? generateUniqueKey('j')}`,
      }
    }
  )

  return [...fromDefects, ...fromJoinedPieces]
}

/**
 * Validate DefectModal inputs and produce a normalized inspection item.
 * - "To" length is optional for all defect codes (defaults to "From" length when omitted).
 * - When code is "JP", only "From" length is used and item is flagged as isJoinedPiece.
 * @param {object} params
 * @returns {{ item?: object, error?: string }}
 */
export function validateAndBuildInspectionItem({
  yard,
  yardTo,
  code,
  isPreRoll = false,
  rollLength = null,
}) {
  const rawYard = String(yard ?? '').trim()
  if (!rawYard) {
    return { error: 'Masukkan posisi inspeksi dalam yard.' }
  }

  const parsedYard = parseFloat(rawYard)
  if (isNaN(parsedYard) || parsedYard <= 0) {
    return { error: 'Posisi inspeksi harus berupa angka lebih dari 0.' }
  }

  const parsedRollLength = parseFloat(rollLength)
  const hasMaxRollLength = !isPreRoll && Number.isFinite(parsedRollLength) && parsedRollLength > 0

  if (hasMaxRollLength && parsedYard >= parsedRollLength) {
    return {
      error: `Posisi inspeksi (${parsedYard} yd) harus di bawah panjang roll (${parsedRollLength} yd).`,
    }
  }

  const cleanCode = String(code ?? '').trim()
  if (!cleanCode) {
    return { error: 'Pilih kode inspeksi terlebih dahulu.' }
  }

  const id = Date.now() + Math.random()

  if (isJoinedPieceCode(cleanCode)) {
    return {
      item: {
        id,
        _uid: generateUniqueKey('jp'),
        yard: parsedYard,
        yardTo: parsedYard,
        code: cleanCode,
        isJoinedPiece: true,
      },
    }
  }

  const rawYardTo = String(yardTo ?? '').trim()
  let parsedYardTo = parsedYard

  if (rawYardTo !== '') {
    parsedYardTo = parseFloat(rawYardTo)
    if (isNaN(parsedYardTo) || parsedYardTo <= 0) {
      return { error: 'Posisi inspeksi to harus berupa angka lebih dari 0.' }
    }
    if (hasMaxRollLength && parsedYardTo >= parsedRollLength) {
      return {
        error: `Posisi inspeksi to (${parsedYardTo} yd) harus di bawah panjang roll (${parsedRollLength} yd).`,
      }
    }
    if (parsedYardTo < parsedYard) {
      return {
        error: `Posisi inspeksi to tidak boleh kurang dari ${parsedYard}.`,
      }
    }
  }

  return {
    item: {
      id,
      _uid: generateUniqueKey('def'),
      yard: parsedYard,
      yardTo: parsedYardTo,
      code: cleanCode,
      isJoinedPiece: false,
    },
  }
}

/**
 * Partition DefectModal list into CountingKainDefect items and CountingKainJoinedPiece items.
 * @param {Array} list
 * @returns {{ defects: Array, joinedPieces: Array }}
 */
export function splitInspectionsByType(list = []) {
  const defects = []
  const joinedPieces = []

  for (const item of Array.isArray(list) ? list : []) {
    if (isJoinedPieceCode(item.code) || item.isJoinedPiece) {
      joinedPieces.push({
        id: item.id ?? Date.now() + Math.random(),
        yard: parseFloat(item.yard) || 0,
        ...(item.lineNumber ? { lineNumber: item.lineNumber } : {}),
      })
    } else {
      const { _uid, isJoinedPiece, ...cleanDefect } = item
      defects.push(cleanDefect)
    }
  }

  return { defects, joinedPieces }
}

/**
 * Compare two defect lists for material equality.
 */
export function areDefectsEqual(a = [], b = []) {
  if (a.length !== b.length) return false
  return a.every((item, idx) => {
    const other = b[idx]
    if (!other) return false
    return (
      Number(item.yard) === Number(other.yard) &&
      Number(item.yardTo ?? item.yard) === Number(other.yardTo ?? other.yard) &&
      String(item.code || '').trim() === String(other.code || '').trim()
    )
  })
}

/**
 * Compare two joined piece lists for material equality.
 */
export function areJoinedPiecesEqual(a = [], b = []) {
  if (a.length !== b.length) return false
  return a.every((item, idx) => {
    const other = b[idx]
    if (!other) return false
    return Number(item.yard) === Number(other.yard)
  })
}

/**
 * Hitung LineNumber berikutnya untuk item child (Defect / Joined Piece),
 * mengabaikan status soft delete pada line sebelumnya.
 *
 * @param {Array} items
 * @param {number} [knownMaxLineNumber]
 * @returns {number}
 */
export function getNextChildLineNumber(items = [], knownMaxLineNumber = 0) {
  let maxLine = Number(knownMaxLineNumber) || 0
  for (const item of Array.isArray(items) ? items : []) {
    const ln = Number(item?.lineNumber ?? item?.LineNumber) || 0
    if (ln > maxLine) maxLine = ln
  }
  return maxLine + 1
}

/**
 * Map row CountingKainDefect dari API/DB menjadi objek UI state.
 * @param {object} d
 */
export function mapDbDefectToUi(d) {
  const displayCode = d?.Description && d.Description !== d.Code
    ? `${d.Code} – ${d.Description}`
    : d?.Code
  return {
    id: d?.LineNumber || Date.now() + Math.random(),
    yard: parseFloat(d?.LengthPoint) || 0,
    code: displayCode,
    isExecuted: Boolean(d?.IsExecuted),
    lineNumber: Number(d?.LineNumber) || undefined,
    yardTo: parseFloat(d?.LengthPointTo) || 0,
  }
}

/**
 * Map row CountingKainJoinedPiece dari API/DB menjadi objek UI state.
 * @param {object} jp
 */
export function mapDbJoinedPieceToUi(jp) {
  return {
    id: jp?.LineNumber || Date.now() + Math.random(),
    yard: parseFloat(jp?.LengthPoint) || 0,
    lineNumber: Number(jp?.LineNumber) || undefined,
  }
}

