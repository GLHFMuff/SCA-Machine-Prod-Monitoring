import styles from './InfoCards.module.css'

function Card({ label, value, sub, accent }) {
  return (
    <div className={`${styles.card} ${accent ? styles[accent] : ''}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {sub && <div className={styles.sub}>{sub}</div>}
    </div>
  )
}

export default function InfoCards({ data, user, totalDefects, pendingDefectsCount = 0, rollsCount }) {
  return (
    <div className={styles.container}>
      {/* Banner Nomor Produksi */}
      <div className={styles.bannerCard}>
        <div className={styles.bannerLeft}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={styles.bannerLabel}>Nomor Produksi</span>
            {data.isFromDb ? (
              <span className="chip" style={{ fontSize: '11px', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--success)' }}>
                ✓ Dari Database
              </span>
            ) : (
              <span className="chip" style={{ fontSize: '11px', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent)' }}>
                ✨ Data Baru
              </span>
            )}
          </div>
          <span className={styles.bannerProd}>{data.seqmentNum || data.prodNumber}</span>
        </div>
        <div className={styles.bannerRight}>
          <div className={styles.bannerCustomer}>{data.customer}</div>
          <div className={styles.bannerSub}>Ref: {data.prodNumber}</div>
        </div>
      </div>

      {/* Grid: Kolom Kiri Jenis Kain (rowspan 2), Kolom Kanan Mesin & Total Cacat */}
      <div className={styles.grid}>
        <div className={`${styles.card} ${styles.fabricCard}`}>
          <div className={styles.label}>Jenis Kain</div>
          <div className={styles.fabricValue}>{data.fabricType}</div>
          <div className={styles.sub}>Warna: {data.color}</div>
        </div>

        <Card
          label="Mesin Operator"
          value={user.machine}
          sub={`${user.machineType} · ${user.name}`}
          accent="green"
        />

        <Card
          label="Total Cacat Tercatat"
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
    </div>
  )
}
