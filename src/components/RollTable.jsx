import { useState, useRef, useEffect } from 'react'
import ConfirmDeleteModal from './ConfirmDeleteModal.jsx'
import ManualRollModal from './ManualRollModal.jsx'
import GetDataConfirmModal from './GetDataConfirmModal.jsx'
import ETicketModal from './ETicketModal.jsx'
import RollLabelModal from './RollLabelModal.jsx'
import MultiMachineReserveModal from './MultiMachineReserveModal.jsx'
import EditRollModal from './EditRollModal.jsx'
import { getAutonicData } from '../services/autonicService.js'
import styles from './RollTable.module.css'

export default function RollTable({
  rolls,
  defects,
  pendingDefects = [],
  prodData,
  user,
  startRollNumber,
  existingDbRolls = [],
  rollsByMachine = {},
  maxRollNumber = 0,
  maxOtherRollNumber = 0,
  onCatatCacat,
  onCatatCacatPreRoll,
  onFetchSensor,
  onSaveRollFromSensor,
  onGetData,
  onDeleteRoll,
  onAddRoll,
  onEditRoll,
  onUpdateBsQty,
  onToggleStock,
  onPrintRoll,
  onSetStartRoll,
  showToast,
}) {
  const [loadingGetData, setLoadingGetData] = useState(false)

  function handleToggleStock(roll, checked) {
    if (onToggleStock) {
      onToggleStock(roll.id, checked)
    }
  }
  const [isFetchingSensor, setIsFetchingSensor] = useState(false)
  const [pendingSensorData, setPendingSensorData] = useState(null)
  const [showGetDataConfirm, setShowGetDataConfirm] = useState(false)
  const [rollToDelete, setRollToDelete] = useState(null)
  const [rollToEdit, setRollToEdit] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [ticketModalRoll, setTicketModalRoll] = useState(null)
  const [labelModalRoll, setLabelModalRoll] = useState(null)
  const [showReserveModal, setShowReserveModal] = useState(false)
  const [editingBsId, setEditingBsId] = useState(null)
  const [editBsValue, setEditBsValue] = useState('')

  const containerRef = useRef(null)
  const prevCountRef = useRef(rolls.length)

  const currentMachineId = String(user?.machine_id || user?.machineId || '1')

  // Hitung nomor roll berikutnya KHUSUS SESUAI MESIN AKTIF:
  // 1. Dari rolls lokal yang ada di state tabel untuk mesin ini
  const currentMachineRolls = rolls.filter(
    (r) => String(r.noMesin || currentMachineId) === currentMachineId
  )
  const localMachineMax = currentMachineRolls.length > 0
    ? Math.max(...currentMachineRolls.map((r) => r.id))
    : 0

  // 2. Dari database CountingKainLines untuk mesin ini (rollsByMachine)
  const dbMachineRolls = rollsByMachine[currentMachineId]?.rolls || []
  const dbMachineMax = dbMachineRolls.length > 0
    ? Math.max(...dbMachineRolls)
    : 0

  // Max roll yang sudah tercatat untuk mesin ini
  const activeMachineMax = Math.max(localMachineMax, dbMachineMax)

  // Max roll global untuk referensi fallback jika mesin belum punya roll
  const localGlobalMax = rolls.length > 0 ? Math.max(...rolls.map((r) => r.id)) : 0
  const effectiveMax = Math.max(localGlobalMax, maxRollNumber || 0)

  // Tentukan nomor roll berikutnya sesuai mesin aktif:
  let nextRollId
  if (startRollNumber) {
    nextRollId = startRollNumber
  } else if (activeMachineMax > 0) {
    nextRollId = activeMachineMax + 1
  } else {
    // Mesin belum pernah punya roll di OP ini
    nextRollId = currentMachineId === '1' && effectiveMax === 0 ? 1 : (effectiveMax > 0 ? effectiveMax + 1 : 1)
  }

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

  async function handleSaveEdit(editValues) {
    if (!rollToEdit) return
    setSavingEdit(true)
    try {
      if (onEditRoll) {
        await onEditRoll(rollToEdit.id, editValues)
      } else if (onUpdateBsQty) {
        onUpdateBsQty(rollToEdit.id, editValues.bsQty)
      }
      setRollToEdit(null)
    } catch (err) {
      console.error('Error saat simpan edit roll:', err)
      if (showToast) {
        showToast(`⚠️ Gagal menyimpan perubahan roll: ${err.message}`)
      }
    } finally {
      setSavingEdit(false)
    }
  }

  function handleSaveBs(roll) {
    if (editingBsId === null) return
    const parsed = parseFloat(editBsValue)
    const val = isNaN(parsed) || parsed < 0 ? 0 : parsed

    // VALIDASI: bsqty harus dibawah dari yard qty
    if (val >= roll.length) {
      if (showToast) {
        showToast(`⚠️ BS Qty (${val} yd) harus di bawah panjang roll (${roll.length} yd).`)
      }
      setEditingBsId(null)
      return
    }

    if (onEditRoll) {
      onEditRoll(roll.id, { length: roll.length, bsQty: val })
    } else if (onUpdateBsQty) {
      onUpdateBsQty(roll.id, val)
    }
    setEditingBsId(null)
  }

  function handleKeyDownBs(e, roll) {
    if (e.key === 'Enter') {
      handleSaveBs(roll)
    } else if (e.key === 'Escape') {
      setEditingBsId(null)
    }
  }

  // Step 1: Tarik data dari sensor saat tombol 'Get Data' diklik
  async function handleGetDataClick() {
    setIsFetchingSensor(true)
    try {
      let sensorResult
      if (onFetchSensor) {
        sensorResult = await onFetchSensor(currentMachineId)
      } else {
        sensorResult = await getAutonicData(currentMachineId)
      }

      const lengthVal = parseFloat(sensorResult?.Length ?? sensorResult?.length)
      if (isNaN(lengthVal)) {
        throw new Error('Data panjang dari sensor mesin tidak ditemukan / tidak valid.')
      }

      // Sukses: simpan data sensor dan buka modal konfirmasi
      setPendingSensorData({ ...sensorResult, length: lengthVal })
      setShowGetDataConfirm(true)
    } catch (err) {
      console.error('Error saat menarik data sensor:', err)
      if (showToast) {
        showToast(`⚠️ Gagal mengambil data mesin: ${err.message || 'Sensor tidak merespons'}`)
      }
      // PENTING: Jika ada error API, JANGAN membuka modal!
      setShowGetDataConfirm(false)
      setPendingSensorData(null)
    } finally {
      setIsFetchingSensor(false)
    }
  }

  // Step 2: Konfirmasi Ambil Data -> Simpan ke tabel countinglines dan flush antrean
  async function handleConfirmGetData() {
    if (!pendingSensorData) return
    setLoadingGetData(true)
    try {
      if (onSaveRollFromSensor) {
        await onSaveRollFromSensor(pendingSensorData, nextRollId)
      } else if (onGetData) {
        await onGetData(pendingSensorData, nextRollId)
      }
      setShowGetDataConfirm(false)
      setPendingSensorData(null)
    } catch (err) {
      console.error('Error saat menyimpan roll dari sensor:', err)
      if (showToast) {
        showToast(`⚠️ Gagal menyimpan roll: ${err.message}`)
      }
    } finally {
      setLoadingGetData(false)
    }
  }

  function handleConfirmDelete() {
    if (rollToDelete && onDeleteRoll) {
      onDeleteRoll(rollToDelete.id)
    }
    setRollToDelete(null)
  }

  async function handlePrintTicket(roll) {
    if (onPrintRoll) {
      await onPrintRoll(roll)
    }
  }

  return (
    <div className={styles.section}>
      {/* Header Toolbar */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.title}>📋 Data Roll Produksi</div>

          {/* Tombol Get Data */}
          <button
            type="button"
            className={styles.getDataBtn}
            onClick={handleGetDataClick}
            disabled={loadingGetData || isFetchingSensor}
            title="Tarik data otomatis dari mesin autonic"
          >
            <span className={(loadingGetData || isFetchingSensor) ? styles.spin : ''}>🔄</span>
            <span>{isFetchingSensor ? 'Menarik Sensor…' : (loadingGetData ? 'Menyimpan…' : 'Get Data')}</span>
          </button>

          {/* Tombol Catat Cacat Sebelum Doffing / Roll Belum Terbentuk */}
          <button
            type="button"
            className={`${styles.tempDefectBtn} ${pendingDefects.length > 0 ? styles.tempDefectActive : ''}`}
            onClick={() => {
              if (onCatatCacatPreRoll) {
                onCatatCacatPreRoll(nextRollId)
              } else if (onCatatCacat) {
                onCatatCacat({ isPreRoll: true, id: nextRollId })
              }
            }}
            title="Catat titik cacat saat roll belum terbentuk (otomatis tersimpan saat Get Data)"
          >
            <span>⚠️</span>
            <span>
              {pendingDefects.length > 0
                ? `Cacat Berjalan (${pendingDefects.length})`
                : '+ Cacat (Roll Berjalan)'}
            </span>
            {pendingDefects.length > 0 && <span className={styles.tempDefectBadgePulse} />}
          </button>

          {/* Tombol Input Roll Manual */}
          <button
            type="button"
            className={styles.addRollBtn}
            onClick={() => setShowManualModal(true)}
            title="Input Roll Manual"
          >
            <span>➕</span>
            <span>Input Roll</span>
          </button>

          {/* Tombol Multi-Mesin & Roll Reserve */}
          <button
            type="button"
            className={styles.reserveBtn}
            onClick={() => setShowReserveModal(true)}
            title="Kelola alokasi nomor roll untuk multi-mesin"
          >
            <span>🏭</span>
            <span>Multi-Mesin & Reserve</span>
          </button>
        </div>

        <span className={styles.badge}>{rolls.length} Roll Terinput</span>
      </div>

      {/* Banner Cacat Sementara jika ada cacat yang dicatat saat roll belum terbentuk */}
      {pendingDefects.length > 0 && (
        <div className={styles.pendingDefectsBanner}>
          <div className={styles.pendingDefectsContent}>
            <span className={styles.pendingDefectsIcon}>⚠️</span>
            <div className={styles.pendingDefectsText}>
              <strong>{pendingDefects.length} catatan cacat sementara</strong> telah dicatat untuk Roll berjalan (<strong>#{nextRollId}</strong>). Catatan ini akan otomatis masuk ke daftar roll saat Anda klik <strong>Get Data</strong>.
            </div>
          </div>
          <button
            type="button"
            className={styles.pendingDefectsBtn}
            onClick={() => {
              if (onCatatCacatPreRoll) {
                onCatatCacatPreRoll(nextRollId)
              } else if (onCatatCacat) {
                onCatatCacat({ isPreRoll: true, id: nextRollId })
              }
            }}
            title="Lihat atau edit catatan cacat sementara"
          >
            ✏️ Kelola Cacat
          </button>
        </div>
      )}

      {/* Table Data */}
      <div className={styles.tableContainer} ref={containerRef}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: '85px' }}>No. Roll</th>
              <th style={{ width: '80px' }}>Mesin</th>
              <th>Panjang</th>
              <th>BS Qty</th>
              <th style={{ width: '80px' }}>Stock</th>
              <th>Status</th>
              <th className={styles.center} style={{ width: '320px' }}>
                Aksi
              </th>
            </tr>
          </thead>
          <tbody>
            {rolls.length === 0 ? (
              <tr>
                <td colSpan="7" className={styles.emptyState}>
                  Tidak ada data roll. Klik <strong>Get Data</strong> atau{' '}
                  <strong>Input Roll</strong> untuk menambahkan roll produksi.
                </td>
              </tr>
            ) : (
              rolls.map((roll) => {
                const rollDefects = defects[roll.id] || []
                const hasDefect = rollDefects.length > 0
                const machineNo = roll.noMesin || user?.machine_id || '1'

                return (
                  <tr key={roll.id}>
                    <td>
                      <span className={styles.rollNum}>#{roll.id}</span>
                    </td>

                    <td>
                      <span className={styles.machineBadge}>M-{machineNo}</span>
                    </td>

                    <td>
                      <span className={styles.lengthVal}>{roll.length}</span>{' '}
                      <span className={styles.lengthUnit}>yard</span>
                    </td>

                    <td
                      className={styles.bsCell}
                      onDoubleClick={() => startEditingBs(roll)}
                      title="Double click untuk edit BS QTY (< panjang roll)"
                    >
                      {editingBsId === roll.id ? (
                        <div className={styles.inlineEditWrap}>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max={Math.max(0, roll.length - 0.1)}
                            className={styles.inlineInput}
                            value={editBsValue}
                            onChange={(e) => setEditBsValue(e.target.value)}
                            onKeyDown={(e) => handleKeyDownBs(e, roll)}
                            onBlur={() => handleSaveBs(roll)}
                            autoFocus
                            onFocus={(e) => e.target.select()}
                          />
                          <span className={styles.inlineUnit}>yd</span>
                          <button
                            type="button"
                            className={styles.inlineSaveBtn}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              handleSaveBs(roll)
                            }}
                            title="Simpan BS Qty"
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
                          <span
                            className={styles.editHintIcon}
                            title="Double click untuk edit BS QTY"
                          >
                            ✎
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Kolom Stock (isStock checkbox & indikator) */}
                    <td className={styles.stockCell}>
                      <label
                        className={styles.stockLabel}
                        title={roll.isStock ? 'Kain Stock (Format S)' : 'Order Non-Stock (Format O)'}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(roll.isStock)}
                          onChange={(e) => handleToggleStock(roll, e.target.checked)}
                          className={styles.stockCheckbox}
                        />
                      </label>
                    </td>

                    {/* Kolom Status (mewakili ada/tidaknya cacat & jumlah titik) */}
                    <td>
                      {hasDefect ? (
                        <span className={styles.statusWarn}>
                          <span className={styles.dotWarn} /> Cacat ({rollDefects.length})
                        </span>
                      ) : (
                        <span className={styles.statusOk}>
                          <span className={styles.dotOk} /> OK
                        </span>
                      )}
                    </td>

                    {/* Kolom Aksi */}
                    <td className={styles.center}>
                      <div className={styles.actionGroup}>
                        <button
                          type="button"
                          className={styles.editRowBtn}
                          onClick={() => setRollToEdit(roll)}
                          title={`Edit Panjang & BS Qty Roll #${roll.id}`}
                        >
                          <span className={styles.btnIcon}>✏️</span>
                          <span className={styles.btnLabel}>Edit</span>
                        </button>

                        <button
                          type="button"
                          className={`${styles.defectBtn} ${hasDefect ? styles.defectBtnActive : ''}`}
                          onClick={() => onCatatCacat(roll)}
                          title="Catat titik cacat kain"
                        >
                          <span className={styles.btnIcon}>{hasDefect ? '✏️' : '➕'}</span>
                          <span className={styles.btnLabel}>Cacat</span>
                        </button>

                        <button
                          type="button"
                          className={styles.printTicketBtn}
                          onClick={() => setTicketModalRoll(roll)}
                          title="Cetak E-Ticket per roll"
                        >
                          <span className={styles.btnIcon}>🖨️</span>
                          <span className={styles.btnLabel}>Cetak</span>
                        </button>

                        <button
                          type="button"
                          className={styles.printLabelBtn}
                          onClick={() => setLabelModalRoll(roll)}
                          title="Cetak Label Roll 11x7 cm"
                        >
                          <span className={styles.btnIcon}>🏷️</span>
                          <span className={styles.btnLabel}>Label</span>
                        </button>

                        <button
                          type="button"
                          className={styles.deleteRowBtn}
                          onClick={() => setRollToDelete(roll)}
                          title={`Hapus Roll #${roll.id} `}
                          aria-label={`Hapus Roll #${roll.id}`}
                        >
                          <span className={styles.btnIcon}>🗑️</span>
                          <span className={styles.btnLabel}>Hapus</span>
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

      {/* ── Modal Konfirmasi Get Data ── */}
      {showGetDataConfirm && (
        <GetDataConfirmModal
          machineId={user?.machine_id || '1'}
          targetRollId={nextRollId}
          prodNumber={prodData?.prodNumber}
          length={pendingSensorData?.length}
          pendingDefectsCount={pendingDefects.length}
          loading={loadingGetData}
          onConfirm={handleConfirmGetData}
          onClose={() => {
            setShowGetDataConfirm(false)
            setPendingSensorData(null)
          }}
        />
      )}

      {/* ── Modal Konfirmasi Hapus Roll ── */}
      {rollToDelete && (
        <ConfirmDeleteModal
          roll={rollToDelete}
          defectCount={(defects[rollToDelete.id] || []).length}
          onConfirm={handleConfirmDelete}
          onCancel={() => setRollToDelete(null)}
        />
      )}

      {/* ── Modal Input Roll Manual ── */}
      {showManualModal && (
        <ManualRollModal
          defaultRollId={nextRollId}
          prodId={prodData?.prodNumber}
          machineId={currentMachineId}
          rolls={rolls}
          onSave={(newRoll) => {
            if (onAddRoll) onAddRoll(newRoll)
            setShowManualModal(false)
          }}
          onClose={() => setShowManualModal(false)}
        />
      )}

      {/* ── Modal Print E-Ticket ── */}
      {ticketModalRoll && (
        <ETicketModal
          roll={ticketModalRoll}
          prodData={prodData}
          user={user}
          defects={defects[ticketModalRoll.id] || []}
          onPrint={handlePrintTicket}
          onClose={() => setTicketModalRoll(null)}
        />
      )}

      {/* ── Modal Cetak Label Roll 11x7 cm ── */}
      {labelModalRoll && (
        <RollLabelModal
          roll={labelModalRoll}
          prodData={prodData}
          user={user}
          onPrint={handlePrintTicket}
          onClose={() => setLabelModalRoll(null)}
        />
      )}

      {/* ── Modal Multi-Mesin & Roll Reserve ── */}
      {showReserveModal && (
        <MultiMachineReserveModal
          prodId={prodData?.prodNumber}
          currentMachineId={user?.machine_id || '1'}
          currentStartRoll={startRollNumber || nextRollId}
          existingRolls={existingDbRolls.length > 0 ? existingDbRolls : rolls}
          rollsByMachine={rollsByMachine}
          maxRollNumber={effectiveMax}
          maxOtherRollNumber={maxOtherRollNumber}
          isMandatory={false}
          onApplyStartRoll={(startVal) => {
            if (onSetStartRoll) onSetStartRoll(startVal)
            if (showToast) {
              showToast(`✓ Alokasi roll mesin ini dimulai dari Roll #${startVal}`)
            }
          }}
          onClose={() => setShowReserveModal(false)}
        />
      )}

      {/* ── Modal Edit Line Roll ── */}
      {rollToEdit && (
        <EditRollModal
          roll={rollToEdit}
          prodId={prodData?.prodNumber}
          machineId={currentMachineId}
          loading={savingEdit}
          onSave={handleSaveEdit}
          onClose={() => setRollToEdit(null)}
        />
      )}
    </div>
  )
}
