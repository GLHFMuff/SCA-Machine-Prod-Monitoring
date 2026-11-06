import { pool } from '../config/db.js';

let tableEnsured = false;

/**
 * Pastikan tabel NumberSequences tersedia di database PostgreSQL
 * @param {object} [client] - pool atau client transaksi pg
 */
export async function ensureSequenceTable(client = pool) {
  if (tableEnsured) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS "NumberSequences" (
      "sequence_key" VARCHAR(50) PRIMARY KEY,
      "prefix" VARCHAR(20) NOT NULL,
      "type_code" VARCHAR(10) NOT NULL,
      "period" VARCHAR(10) NOT NULL,
      "last_number" BIGINT NOT NULL DEFAULT 0,
      "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  tableEnsured = true;
}

/**
 * Ekstrak komponen MM, YY, dan MMYY period dari targetDate (string DD/MM/YYYY, Date, dsb).
 * Mendukung backdate lintas bulan dan tahun secara akurat.
 */
export function parseDatePeriod(targetDate) {
  if (targetDate) {
    if (typeof targetDate === 'string') {
      const s = targetDate.trim();

      // Format DD/MM/YYYY atau DD-MM-YYYY (standar aplikasi, misal 06/10/2026 atau 15/10/2026)
      const ddmmyyyy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      if (ddmmyyyy) {
        const mm = ddmmyyyy[2].padStart(2, '0');
        const yy = ddmmyyyy[3].slice(-2);
        return { mm, yy, period: `${mm}${yy}` };
      }

      // Format YYYY-MM-DD atau YYYY/MM/DD (misal 2026-10-06)
      const yyyymmdd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
      if (yyyymmdd) {
        const yy = yyyymmdd[1].slice(-2);
        const mm = yyyymmdd[2].padStart(2, '0');
        return { mm, yy, period: `${mm}${yy}` };
      }

      // Format ISO string / parseable date
      const parsed = new Date(s);
      if (!isNaN(parsed.getTime())) {
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const yy = String(parsed.getFullYear()).slice(-2);
        return { mm, yy, period: `${mm}${yy}` };
      }
    }

    if (targetDate instanceof Date && !isNaN(targetDate.getTime())) {
      const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
      const yy = String(targetDate.getFullYear()).slice(-2);
      return { mm, yy, period: `${mm}${yy}` };
    }
  }

  // Fallback ke tanggal saat ini
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String(now.getFullYear()).slice(-2);
  return { mm, yy, period: `${mm}${yy}` };
}

/**
 * Generate nomor sequence QR otomatis untuk CountingKainLines
 * Format: QR.S.[MM][YY].[00000000]
 * - Selalu menggunakan kode 'S' (semua roll berawalan QR.S.)
 * - MM adalah 2 digit bulan dari TransDate (contoh: 10 untuk Oktober, 11 untuk November)
 * - YY adalah 2 digit tahun dari TransDate (contoh: 26)
 * - 8 digit nomor urut berurutan (00000001, dst), reset dan independen per bulan & tahun (MMYY)
 *
 * @param {object} client - pg client (bisa dalam transaksi BEGIN/COMMIT) atau pool
 * @param {boolean} [isStock] - parameter kompatibilitas (selalu menggunakan 'S')
 * @param {string|Date} [targetDate] - tanggal transaksi (TransDate). Mendukung backdate!
 * @returns {Promise<string>} contoh: "QR.S.1026.00000031"
 */
export async function generateNextQrNum(client = pool, isStock = false, targetDate = new Date()) {
  await ensureSequenceTable(client);

  const { mm, yy, period } = parseDatePeriod(targetDate);
  const typeCode = 'S'; // Semua roll menggunakan kode 'S'
  const prefix = 'QR';
  const sequenceKey = `${prefix}.${typeCode}.${period}`;

  // Pastikan sequence tidak pernah lebih kecil dari nomor yang sudah ada di CountingKainLines untuk periode ini
  let maxInDb = 0;
  try {
    const checkDbRes = await client.query(
      `SELECT COALESCE(MAX(NULLIF(regexp_replace(SUBSTRING("QrNum" FROM 11 FOR 8), '\\D', '', 'g'), '')::BIGINT), 0) AS max_num
       FROM "CountingKainLines"
       WHERE "QrNum" LIKE $1`,
      [`${prefix}.${typeCode}.${period}.%`]
    );
    maxInDb = parseInt(checkDbRes.rows[0]?.max_num || '0', 10);
  } catch (dbErr) {
    console.warn('[generateNextQrNum] Warn checking max in lines:', dbErr.message);
  }

  const query = `
    INSERT INTO "NumberSequences" ("sequence_key", "prefix", "type_code", "period", "last_number", "updated_at")
    VALUES ($1, $2, $3, $4, GREATEST(1, $5 + 1), CURRENT_TIMESTAMP)
    ON CONFLICT ("sequence_key")
    DO UPDATE SET 
      "last_number" = GREATEST("NumberSequences"."last_number", $5) + 1,
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING "last_number";
  `;

  const res = await client.query(query, [sequenceKey, prefix, typeCode, period, maxInDb]);
  const seq = parseInt(res.rows[0].last_number, 10);
  const paddedSeq = String(seq).padStart(8, '0');

  return `${prefix}.${typeCode}.${period}.${paddedSeq}`;
}
