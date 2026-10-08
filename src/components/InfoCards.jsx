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

export default function InfoCards({ data, user, totalDefects, rollsCount }) {
  return (
    <div className={styles.container}>
      {/* Banner Nomor Produksi */}
      <div className={styles.bannerCard}>
        <div className={styles.bannerLeft}>
          <span className={styles.bannerLabel}>Nomor Produksi</span>
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
            <span style={{ color: totalDefects > 0 ? 'var(--warning)' : 'var(--success)' }}>
              {totalDefects} titik
            </span>
          }
          sub={`${rollsCount ?? data.rolls.length} roll terdaftar`}
          accent="amber"
        />
      </div>
    </div>
  )
}
