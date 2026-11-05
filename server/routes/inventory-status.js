import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

/**
 * Tabel master: "InventoryStatus" ("StatusId" varchar(20) PK, "Name" varchar(60) NULL)
 * Dipakai sebagai sumber dropdown status inventory (A/UTUH, BS, JABLAK, KECILAN, dst.)
 *
 * Catatan: StatusId bersifat case-sensitive varchar dan bisa mengandung spasi
 * (contoh: "BAGUS 1-4"), sehingga pencarian dilakukan secara case-insensitive
 * namun tetap mengembalikan nilai asli dari database.
 */

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

/**
 * Normalisasi nilai limit/offset dari query string
 */
function parsePagination(limit, offset) {
  const parsedLimit = parseInt(limit, 10);
  const parsedOffset = parseInt(offset, 10);

  return {
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, MAX_LIMIT) : DEFAULT_LIMIT,
    offset: Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
  };
}

/**
 * GET /api/inventory-status
 * Query params (opsional):
 *   - search  : pencarian partial pada StatusId / Name (case-insensitive)
 *   - StatusId: filter exact match StatusId
 *   - limit   : jumlah maksimal baris (default 500, maks 1000)
 *   - offset  : offset pagination (default 0)
 *
 * Respon: { success, count, total, limit, offset, data: [{ StatusId, Name }] }
 */
router.get('/', async (req, res) => {
  try {
    const { search, StatusId, statusId, name, limit, offset } = req.query;
    const { limit: limitVal, offset: offsetVal } = parsePagination(limit, offset);

    const conditions = [];
    const values = [];

    const targetStatusId = String(StatusId ?? statusId ?? '').trim();
    if (targetStatusId) {
      values.push(targetStatusId);
      conditions.push(`UPPER(BTRIM("StatusId")) = UPPER(BTRIM($${values.length}))`);
    }

    const targetSearch = String(search ?? name ?? '').trim();
    if (targetSearch) {
      values.push(`%${targetSearch}%`);
      conditions.push(`("StatusId" ILIKE $${values.length} OR COALESCE("Name", '') ILIKE $${values.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Hitung total baris sesuai filter (untuk kebutuhan pagination di frontend)
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "InventoryStatus" ${whereClause}`,
      values
    );

    const dataRes = await pool.query(
      `SELECT "StatusId", "Name"
       FROM "InventoryStatus"
       ${whereClause}
       ORDER BY "StatusId" ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limitVal, offsetVal]
    );

    return res.status(200).json({
      success: true,
      count: dataRes.rows.length,
      total: countRes.rows[0]?.total ?? 0,
      limit: limitVal,
      offset: offsetVal,
      data: dataRes.rows,
    });
  } catch (err) {
    console.error('[Get Inventory Status Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err.message,
    });
  }
});

/**
 * GET /api/inventory-status/:statusId
 * Mengambil satu data status inventory berdasarkan StatusId (case-insensitive).
 */
router.get('/:statusId', async (req, res) => {
  try {
    const { statusId } = req.params;

    if (!statusId || !String(statusId).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'StatusId wajib diisi.',
      });
    }

    const result = await pool.query(
      `SELECT "StatusId", "Name"
       FROM "InventoryStatus"
       WHERE UPPER(BTRIM("StatusId")) = UPPER(BTRIM($1))
       LIMIT 1`,
      [String(statusId).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `InventoryStatus dengan StatusId '${statusId}' tidak ditemukan.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Get Inventory Status Detail Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err.message,
    });
  }
});

export default router;
