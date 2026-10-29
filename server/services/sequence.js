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
 * Generate nomor sequence QR otomatis untuk CountingKainLines
 * Format: QR.S.[MM][YY].[00000000]
 * - Selalu menggunakan kode 'S' tanpa pembagian S atau O (semua roll berawalan QR.S.)
 * - MM adalah 2 digit bulan (contoh: 10 atau 09)
 * - YY adalah 2 digit tahun (contoh: 26)
 * - 8 digit nomor urut berurutan (00000001, dst), reset per bulan & tahun (MMYY)
 *
 * @param {object} client - pg client (bisa dalam transaksi BEGIN/COMMIT) atau pool
 * @param {boolean} [isStock] - parameter kompatibilitas (selalu menggunakan 'S')
 * @param {Date} [targetDate] - opsional, default ke waktu saat ini
 * @returns {Promise<string>} contoh: "QR.S.1026.00000001"
 */
export async function generateNextQrNum(client = pool, isStock = false, targetDate = new Date()) {
  await ensureSequenceTable(client);

  const d = targetDate instanceof Date && !isNaN(targetDate.getTime()) ? targetDate : new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const period = `${mm}${yy}`; // Contoh: "1026"
  const typeCode = 'S'; // Semua roll menggunakan kode 'S'
  const prefix = 'QR';
  const sequenceKey = `${prefix}.${typeCode}.${period}`;

  const query = `
    INSERT INTO "NumberSequences" ("sequence_key", "prefix", "type_code", "period", "last_number", "updated_at")
    VALUES ($1, $2, $3, $4, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("sequence_key")
    DO UPDATE SET 
      "last_number" = "NumberSequences"."last_number" + 1,
      "updated_at" = CURRENT_TIMESTAMP
    RETURNING "last_number";
  `;

  const res = await client.query(query, [sequenceKey, prefix, typeCode, period]);
  const seq = parseInt(res.rows[0].last_number, 10);
  const paddedSeq = String(seq).padStart(8, '0');

  return `${prefix}.${typeCode}.${period}.${paddedSeq}`;
}
