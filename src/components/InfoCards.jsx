import { useMemo } from 'react'
import styles from './InfoCards.module.css'

function Card({ label, value, sub, accent, title }) {
  return (
    <div className={`${styles.card} ${accent ? styles[accent] : ''}`}>
      <div className={styles.label} title={typeof label === 'string' ? label : undefined}>{label}</div>
      <div className={styles.value} title={title}>{value}</div>
      {sub && <div className={styles.sub} title={typeof sub === 'string' ? sub : undefined}>{sub}</div>}
    </div>
  )
}

function sortMachines(list) {
  return [...list].sort((a, b) => {
    const na = Number(a.machine)
    const nb = Number(b.machine)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    if (!Number.isNaN(na)) return -1
    if (!Number.isNaN(nb)) return 1
    return String(a.machine).localeCompare(String(b.machine), undefined, { numeric: true })
  })
}

function aggregateLinesByMachine(lines = []) {
  const map = {}
  for (const line of lines) {
    const machine = String(line.NoMesin || line.noMesin || 'Unknown').trim() || 'Unknown'
    if (!map[machine]) {
      map[machine] = {
        machine,
        rollCount: 0,
        rollLength: 0,
        coProductCount: 0,
        coProductLength: 0,
        coProductByStatus: {},
      }
    }
    const len = parseFloat(line.Length ?? line.length) || 0
    if (Number(line.ProductType ?? line.productType ?? 5) === 1) {
      const statusKey = String(line.InventStatus || line.inventStatus || 'BS').trim().toUpperCase()
      map[machine].coProductCount += 1
      map[machine].coProductLength += len
      map[machine].coProductByStatus[statusKey] = (map[machine].coProductByStatus[statusKey] || 0) + 1
    } else {
      map[machine].rollCount += 1
      map[machine].rollLength += len
    }
  }
  return sortMachines(Object.values(map))
}

function formatRefreshTime(dateVal) {
  if (!dateVal) return '1m'
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal)
  if (Number.isNaN(d.getTime())) return '1m'
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatYard(val) {
  const num = Number(val) || 0
  const rounded = Math.round(num * 100) / 100
  return String(rounded)
}

export default function InfoCards({
  data,
  user,
  totalDefects,
  pendingDefectsCount = 0,
  rollsCount,
  rollsLength = 0,
  coProductsCount = 0,
  coProductsLength = 0,
  machineSummary = [],
  existingDbRolls = [],
  lastStatsUpdatedAt = null,
  refreshingStats = false,
  onRefreshStats,
}) {
  const currentMachineId = String(user?.machine_id ?? user?.machineId ?? '').trim()

  const resolvedMachines = useMemo(() => {
    if (Array.isArray(machineSummary) && machineSummary.length > 0) {
      return sortMachines(machineSummary)
    }
    if (Array.isArray(existingDbRolls) && existingDbRolls.length > 0) {
      return aggregateLinesByMachine(existingDbRolls)
    }
    if (!lastStatsUpdatedAt && currentMachineId && ((rollsCount || 0) > 0 || (coProductsCount || 0) > 0)) {
      return [{
        machine: currentMachineId,
        rollCount: rollsCount || 0,
        rollLength: rollsLength || 0,
        coProductCount: coProductsCount || 0,
        coProductLength: coProductsLength || 0,
        coProductByStatus: {},
      }]
    }
    return []
  }, [machineSummary, existingDbRolls, lastStatsUpdatedAt, currentMachineId, rollsCount, rollsLength, coProductsCount, coProductsLength])

  const { totalOpRolls, totalOpRollLength, totalOpCoProducts, totalOpCoProductLength } = useMemo(() => {
    return resolvedMachines.reduce(
      (acc, m) => ({
        totalOpRolls: acc.totalOpRolls + (Number(m.rollCount) || 0),
        totalOpRollLength: acc.totalOpRollLength + (Number(m.rollLength) || 0),
        totalOpCoProducts: acc.totalOpCoProducts + (Number(m.coProductCount) || 0),
        totalOpCoProductLength: acc.totalOpCoProductLength + (Number(m.coProductLength) || 0),
      }),
      { totalOpRolls: 0, totalOpRollLength: 0, totalOpCoProducts: 0, totalOpCoProductLength: 0 }
    )
  }, [resolvedMachines])

  const refreshTimeText = formatRefreshTime(lastStatsUpdatedAt)
  const designDisplay = String(data.fabricType || data.designCode || '').trim()
  const motifDisplay = String(data.patternCode || data.PatternCode || '').trim()
  const fabricDisplay = motifDisplay
    ? `${designDisplay || '-'} / ${motifDisplay}`
    : designDisplay
  const fabricSubText = `Warna: ${data.color || '-'}${(data.orderQty > 0 || data.stockQty > 0) ? ` · Order: ${data.orderQty} yd · Stock: ${data.stockQty} yd` : ''}`

  return (
    <div className={styles.container}>
      {/* Baris 1: 3 Kolom Ringkas (Nomor DO/OP & Customer, Jenis Kain, Total Inspeksi) */}
      <div className={styles.topRow}>
        <div className={styles.bannerCard}>
          <div className={styles.bannerLeft}>
            <span className={styles.bannerLabel}>Nomor DO</span>
            <span className={styles.bannerProd} title={data.seqmentNum || data.prodNumber}>
              {data.seqmentNum || data.prodNumber}
            </span>
          </div>
          <div className={styles.bannerRight}>
            <div className={styles.bannerCustomer} title={data.customer || data.custCode}>
              {data.customer || data.custCode}
            </div>
            <div className={styles.bannerSub} title={`Nomor OP: ${data.prodNumber}`}>
              Nomor OP: {data.prodNumber}
            </div>
          </div>
        </div>

        <div className={`${styles.card} ${styles.fabricCard}`}>
          <div className={styles.label}>Jenis Kain (Design / Motif)</div>
          <div className={styles.fabricValue} title={fabricDisplay}>{fabricDisplay}</div>
          <div className={styles.sub} title={fabricSubText}>
            Warna: <strong>{data.color || '-'}</strong>
            {(data.orderQty > 0 || data.stockQty > 0) && (
              <span style={{ marginLeft: '10px' }}>
                · Order: <strong>{data.orderQty}</strong> yd · Stock: <strong>{data.stockQty}</strong> yd
              </span>
            )}
          </div>
        </div>

        <Card
          label="Total Inspeksi Tercatat"
          value={
            <span style={{ color: (totalDefects > 0 || pendingDefectsCount > 0) ? 'var(--warning)' : 'var(--success)' }}>
              {totalDefects} titik
              {pendingDefectsCount > 0 && (
                <span style={{ fontSize: '12px', fontWeight: '500', marginLeft: '6px', opacity: 0.9 }}>
                  (+{pendingDefectsCount} berjalan)
                </span>
              )}
            </span>
          }
          sub={
            pendingDefectsCount > 0
              ? `${rollsCount ?? data.rolls.length} roll • ${pendingDefectsCount} sementara`
              : `${rollsCount ?? data.rolls.length} roll terdaftar`
          }
          accent="amber"
        />
      </div>

      {/* Baris 2: Full Width Info Roll & Co-Product Per Mesin (OP) */}
      <div className={`${styles.card} ${styles.indigo} ${styles.machineStatsCard}`}>
        <div className={styles.machineCardHeader}>
          <div className={styles.machineHeaderLeft}>
            <span className={`${styles.label} ${styles.machineCardTitle}`} title="Total Roll, Co-Products & Length per Mesin">
              Per Mesin (OP)
            </span>
            {resolvedMachines.length > 0 && (
              <span className={styles.machineCountBadge}>
                {resolvedMachines.length} Mesin
              </span>
            )}
          </div>

          <div className={styles.machineHeaderRight}>
            <span
              className={styles.totalRollBadge}
              title={`Total OP ${data.prodNumber}: ${totalOpRolls} Roll (${formatYard(totalOpRollLength)} yd)`}
            >
              {totalOpRolls} Roll · {formatYard(totalOpRollLength)} yd
            </span>
            <span
              className={`${styles.totalCoProdBadge} ${totalOpCoProducts > 0 ? styles.totalCoProdBadgeActive : ''}`}
              title={`Total Co-Product OP ${data.prodNumber}: ${totalOpCoProducts} Co-Product (${formatYard(totalOpCoProductLength)} yd)`}
            >
              {totalOpCoProducts} Co-Prod · {formatYard(totalOpCoProductLength)} yd
            </span>
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={onRefreshStats}
              disabled={refreshingStats || !onRefreshStats}
              title={`Auto-refresh setiap 1 menit • Klik untuk refresh sekarang${lastStatsUpdatedAt ? ` (Terakhir: ${refreshTimeText})` : ''}`}
              aria-label="Refresh info roll dan co-product per mesin"
            >
              <span className={refreshingStats ? styles.spin : ''}>↻</span>
              <span>{refreshTimeText}</span>
            </button>
          </div>
        </div>

        <div className={styles.machineStrip}>
          {resolvedMachines.length === 0 ? (
            <div className={styles.emptyMachine}>
              Belum ada roll / co-product untuk OP ini
            </div>
          ) : (
            resolvedMachines.map((m) => {
              const isCurrent = Boolean(currentMachineId && String(m.machine).trim() === currentMachineId)
              const statusEntries = Object.entries(m.coProductByStatus || {})
              const statusDetail = statusEntries.length > 0
                ? `: ${statusEntries.map(([k, v]) => `${k} ${v}`).join(', ')}`
                : ''
              const machineTitle = `Mesin ${m.machine}${isCurrent ? ' (Mesin Anda)' : ''}: ${m.rollCount} Roll (${formatYard(m.rollLength)} yd) • ${m.coProductCount} Co-Product (${formatYard(m.coProductLength)} yd${statusDetail})`

              return (
                <div
                  key={m.machine}
                  className={`${styles.machineChip} ${isCurrent ? styles.machineChipActive : ''}`}
                  title={machineTitle}
                >
                  <div className={styles.machineChipSide}>
                    <span className={styles.machineChipName}>
                      {m.machine === 'Unknown' ? 'Lain' : `M-${m.machine}`}
                    </span>
                    {isCurrent && (
                      <span className={styles.activeBadge} aria-label="Mesin aktif">
                        <span className={styles.activeDot} />
                        Aktif
                      </span>
                    )}
                  </div>
                  <div className={styles.machineChipBody}>
                    <div className={styles.machineChipRow}>
                      <span className={styles.rollStat}>{m.rollCount} Roll</span>
                      <span className={styles.rollLengthVal}>{formatYard(m.rollLength)} yd</span>
                    </div>
                    <div className={`${styles.machineChipRow} ${m.coProductCount === 0 ? styles.machineChipRowMuted : ''}`}>
                      <span className={m.coProductCount > 0 ? styles.coProdStatActive : styles.coProdStatZero}>
                        {m.coProductCount} Co-Prod
                      </span>
                      <span className={m.coProductCount > 0 ? styles.coProdLengthActive : styles.coProdLengthZero}>
                        {formatYard(m.coProductLength)} yd
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
