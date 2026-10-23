// ── Dummy operator / user data ──────────────────────────────
export const USERS = [
  { id: 'OPR001', name: 'Budi Santoso', machine: 'M-12', machineType: 'Rapier Loom' },
  { id: 'OPR002', name: 'Siti Rahayu', machine: 'M-07', machineType: 'Air Jet Loom' },
  { id: 'OPR003', name: 'Ahmad Fauzi', machine: 'M-21', machineType: 'Water Jet Loom' },
]

// ── Dummy scan result (simulates barcode scan) ────────────────
export const SCAN_DATA = {
  prodNumber: 'OP.122025.001257',
  seqmentNum: 'SPM.2025.DES.018 B',
  fabricType: 'SCA 100% PE 102 X 52 Putih Reguler Gabardine Bulova',
  color: 'Putih 08BG',
  construction: '75D x 150D / 92 x 72',
  width: '102 X 52',
  weight: '185 gsm',
  customer: 'LL / CUST CODE ',
  rolls: [
    { id: 1, length: 112.5, bsQty: 0 },
    { id: 2, length: 108.0, bsQty: 1.5 },
    { id: 3, length: 115.2, bsQty: 0 },
    { id: 4, length: 109.8, bsQty: 0.8 },
    { id: 5, length: 98.4, bsQty: 0 },
  ],
}

// ── Defect / cacat codes ──────────────────────────────────────
export const DEFECT_CODES = [
  'BB01 – Benang Bintik',
  'BB02 – Benang Bolong',
  'DD03 – Double Dobby',
  'HP04 – Hole/Lubang',
  'PR05 – Patah Rajut',
  'SK06 – Salah Konstruksi',
  'TN07 – Tenunan Lepas',
  'WF08 – Warna Flek',
]
