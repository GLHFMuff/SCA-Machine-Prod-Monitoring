import { useState, useEffect } from 'react'
import styles from './MultiMachineReserveModal.module.css'

export default function MultiMachineReserveModal({
  prodId,
  currentMachineId,
  currentStartRoll,
  existingRolls = [],
  rollsByMachine = {},
  maxRollNumber = 0,
  maxOtherRollNumber = 0,
  isMandatory = false,
  onApplyStartRoll,
  onClose,
  onCancelScan,
}) {
  // Rekomendasi default: +10 dari roll terakhir mesin lain yang paling tinggi
  const recommendedDefault = currentStartRoll || (
    maxOtherRollNumber > 0
      ? maxOtherRollNumber + 10
      : (maxRollNumber > 0 ? maxRollNumber + 1 : 1)
  )

  const [startRollInput, setStartRollInput] = useState(recommendedDefault)
  const [error, setError] = useState('')

  useEffect(() => {
    if (recommendedDefault) {
      setStartRollInput(recommendedDefault)
    }
  }, [recommendedDefault])

  // Check if roll number already exists
  const existingSet = new Set(existingRolls.map((r) => Number(r.RoolNumber || r.id)))

  function handleSubmit(e) {
    e.preventDefault()
    const val = parseInt(startRollInput, 10)

    if (isNaN(val) || val < 1) {
      setError('Nomor roll awal harus berupa bilangan bulat positif mulai dari 1.')
      return
    }

    if (existingSet.has(val)) {
      const match = existingRolls.find((r) => Number(r.RoolNumber || r.id) === val)
      const usedBy = match?.NoMesin ? `Mesin ${match.NoMesin}` : 'mesin lain'
      setError(`Roll #${val} sudah terdaftar untuk ${usedBy}. Nomor roll tidak boleh duplikat!`)
      return
    }

    if (onApplyStartRoll) {
      onApplyStartRoll(val)
    }
    onClose()
  }

  function handleQuickSet(val) {
    setStartRollInput(val)
    setError('')
  }

  const machineList = Object.values(rollsByMachine)

  return (
    <div
      className={styles.overlay}
      onClick={() => {
        if (!isMandatory) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        {/* Head */}
        <div className={styles.head}>
          <div className={styles.iconWrap}>{isMandatory ? '⚙️' : '🏭'}</div>
          <div>
            <h3 className={styles.title}>
              {isMandatory
                ? `Wajib Tentukan Starting Roll (Mesin #${currentMachineId})`
                : 'Multi-Mesin & Roll Reserve'}
            </h3>
            <p className={styles.sub}>
              {isMandatory
                ? 'Order sudah memiliki data dari mesin lain. Wajib tentukan nomor roll awal.'
                : 'Atur alokasi nomor roll untuk 1 Order Produksi (OP)'}
            </p>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={() => {
              if (isMandatory && onCancelScan) {
                onCancelScan()
              } else {
                onClose()
              }
            }}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.body}>
            {error && <div className={styles.errorBanner}>⚠️ {error}</div>}

            {/* Mandatory Alert Banner */}
            {isMandatory && (
              <div className={styles.mandatoryBanner}>
                ⚠️ <strong>Wajib Mengisi Starting Roll:</strong> Order <strong>{prodId}</strong> sudah
                memiliki data roll dari mesin lain (Roll tertinggi mesin lain: <strong>#{maxOtherRollNumber || maxRollNumber}</strong>).
                Mesin #{currentMachineId} wajib menentukan nomor roll awal. Sistem merekomendasikan default{' '}
                <strong>#{maxOtherRollNumber > 0 ? maxOtherRollNumber + 10 : 1}</strong> (+10 dari roll tertinggi mesin lain).
              </div>
            )}

            {/* Current Machine & OP info */}
            <div className={styles.infoRow}>
              <div>
                <div className={styles.labelMuted}>Order Produksi</div>
                <div className={styles.boldVal}>{prodId}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={styles.labelMuted}>Mesin Saat Ini</div>
                <div className={styles.activeMachineBadge}>Mesin #{currentMachineId}</div>
              </div>
            </div>

            {/* Distribution across machines */}
            <div className={styles.sectionTitle}>
              📊 Distribusi Roll per Mesin ({existingRolls.length} Roll Terdaftar)
            </div>

            {machineList.length === 0 ? (
              <div className={styles.emptyMachine}>
                Belum ada roll yang tercatat untuk OP ini.
              </div>
            ) : (
              <div className={styles.machineCards}>
                {machineList.map((m) => (
                  <div
                    key={m.machine}
                    className={`${styles.machineCard} ${
                      String(m.machine) === String(currentMachineId) ? styles.currentMachineCard : ''
                    }`}
                  >
                    <div className={styles.machineCardHeader}>
                      <span className={styles.machineName}>
                        Mesin {m.machine} {String(m.machine) === String(currentMachineId) ? '(Mesin Ini)' : ''}
                      </span>
                      <span className={styles.rollCountBadge}>{m.count} Roll</span>
                    </div>
                    <div className={styles.machineDetails}>
                      <div>
                        Total: <strong>{(m.totalLength || 0).toFixed(1)} yd</strong>
                      </div>
                      <div>
                        Roll:{' '}
                        <strong>
                          #{m.rolls && m.rolls.length > 0 ? Math.min(...m.rolls) : 0} – #{m.rolls && m.rolls.length > 0 ? Math.max(...m.rolls) : 0}
                        </strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Start Roll Configuration */}
            <div className={styles.configBox}>
              <label className={styles.configLabel}>
                🔢 Nomor Roll Mulai Mesin Ini
                <span className={styles.hintText}>(Mencegah bentrok nomor roll antar mesin)</span>
              </label>

              <div className={styles.inputWrap}>
                <span className={styles.prefix}>Roll #</span>
                <input
                  type="number"
                  min="1"
                  className={styles.input}
                  value={startRollInput}
                  onChange={(e) => {
                    setStartRollInput(e.target.value)
                    setError('')
                  }}
                  required
                  autoFocus
                />
              </div>

              {/* Quick suggestion buttons */}
              <div className={styles.quickButtons}>
                {maxOtherRollNumber > 0 && (
                  <button
                    type="button"
                    className={`${styles.quickBtn} ${styles.recommendBtn}`}
                    onClick={() => handleQuickSet(maxOtherRollNumber + 10)}
                    title={`Rekomendasi default: Roll #${maxOtherRollNumber} (tertinggi mesin lain) + 10`}
                  >
                    ⭐ Rekomendasi: Mesin Lain + 10 (#{maxOtherRollNumber + 10})
                  </button>
                )}
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => handleQuickSet(maxRollNumber + 1)}
                  title="Gunakan roll lanjutan tertinggi + 1"
                >
                  ⚡ Lanjutan Terakhir (#{maxRollNumber + 1})
                </button>
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => handleQuickSet(51)}
                  title="Reserve Blok 51-100"
                >
                  Blok Mesin 2 (#51)
                </button>
                <button
                  type="button"
                  className={styles.quickBtn}
                  onClick={() => handleQuickSet(101)}
                  title="Reserve Blok 101-150"
                >
                  Blok Mesin 3 (#101)
                </button>
              </div>
            </div>

            <div className={styles.noteBox}>
              💡 <strong>Tips Operasional:</strong> Setiap mesin yang mengerjakan OP yang sama
              harus memiliki alokasi nomor roll terpisah agar tidak terjadi nomor ganda.
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                if (isMandatory && onCancelScan) {
                  onCancelScan()
                } else {
                  onClose()
                }
              }}
            >
              {isMandatory ? '✕ Batal Scan' : 'Tutup'}
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
            >
              ✓ {isMandatory ? 'Simpan & Mulai Produksi' : 'Terapkan Nomor Mulai'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
