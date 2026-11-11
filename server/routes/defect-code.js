import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

/**
 * Tabel master: "DefectCode" ("Code" varchar PK, "Defect" varchar NULL)
 * Dipakai sebagai sumber dropdown kode cacat kain.
 */

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 500;

function parsePagination(limit, offset) {
  const parsedLimit  = parseInt(limit,  10);
  const parsedOffset = parseInt(offset, 10);
  return {
    limit:  Number.isFinite(parsedLimit)  && parsedLimit  > 0 ? Math.min(parsedLimit,  MAX_LIMIT) : DEFAULT_LIMIT,
    offset: Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0,
  };
}

/**
 * GET /api/defect-code
 * Query params (opsional):
 *   - search  : pencarian partial pada Code / Defect (case-insensitive)
 *   - code    : filter exact match Code
 *   - limit   : jumlah maksimal baris (default 500, maks 1000)
 *   - offset  : offset pagination (default 0)
 *
 * Respon: { success, count, total, limit, offset, data: [{ Code, Defect }] }
 */
router.get('/', async (req, res) => {
  try {
    const { search, code, Code, limit, offset } = req.query;
    const { limit: limitVal, offset: offsetVal } = parsePagination(limit, offset);

    const conditions = [];
    const values     = [];

    const targetCode = String(Code ?? code ?? '').trim();
    if (targetCode) {
      values.push(targetCode);
      conditions.push(`UPPER(BTRIM("Code")) = UPPER(BTRIM($${values.length}))`);
    }

    const targetSearch = String(search ?? '').trim();
    if (targetSearch) {
      values.push(`%${targetSearch}%`);
      conditions.push(`("Code" ILIKE $${values.length} OR COALESCE("Defect", '') ILIKE $${values.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM "DefectCode" ${whereClause}`,
      values
    );

    const dataRes = await pool.query(
      `SELECT "Code", "Defect"
       FROM "DefectCode"
       ${whereClause}
       ORDER BY "Code" ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limitVal, offsetVal]
    );

    return res.status(200).json({
      success: true,
      count:   dataRes.rows.length,
      total:   countRes.rows[0]?.total ?? 0,
      limit:   limitVal,
      offset:  offsetVal,
      data:    dataRes.rows,
    });
  } catch (err) {
    console.error('[Get Defect Code Error]:', err);
    return res.status(500).json({
      success: false,
      error:   'Internal Server Error',
      message: err.message,
    });
  }
});

/**
 * GET /api/defect-code/:code
 * Mengambil satu data defect code berdasarkan Code (case-insensitive).
 */
router.get('/:code', async (req, res) => {
  try {
    const { code } = req.params;

    if (!String(code).trim()) {
      return res.status(400).json({
        success: false,
        error:   'Bad Request',
        message: 'Code wajib diisi.',
      });
    }

    const result = await pool.query(
      `SELECT "Code", "Defect"
       FROM "DefectCode"
       WHERE UPPER(BTRIM("Code")) = UPPER(BTRIM($1))
       LIMIT 1`,
      [String(code).trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   'Not Found',
        message: `DefectCode dengan Code '${code}' tidak ditemukan.`,
      });
    }

    return res.status(200).json({
      success: true,
      data:    result.rows[0],
    });
  } catch (err) {
    console.error('[Get Defect Code Detail Error]:', err);
    return res.status(500).json({
      success: false,
      error:   'Internal Server Error',
      message: err.message,
    });
  }
});

/**
 * POST /api/defect-code
 * Tambah data defect code baru ke master DefectCode
 */
router.post('/', async (req, res) => {
  try {
    const { Code, Defect } = req.body || {};
    const cleanCode = String(Code || '').trim();
    const cleanDefect = String(Defect || '').trim();

    if (!cleanCode) {
      return res.status(400).json({ success: false, message: 'Kode inspeksi (Code) wajib diisi.' });
    }

    const checkExist = await pool.query(
      `SELECT "Code" FROM "DefectCode" WHERE UPPER(BTRIM("Code")) = UPPER(BTRIM($1)) LIMIT 1`,
      [cleanCode]
    );

    if (checkExist.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `Kode inspeksi '${cleanCode}' sudah terdaftar. Gunakan kode lain.`,
      });
    }

    const insertResult = await pool.query(
      `INSERT INTO "DefectCode" ("Code", "Defect") VALUES ($1, $2) RETURNING "Code", "Defect"`,
      [cleanCode, cleanDefect || null]
    );

    return res.status(201).json({
      success: true,
      message: `Kode inspeksi '${cleanCode}' berhasil ditambahkan.`,
      data: insertResult.rows[0],
    });
  } catch (err) {
    console.error('[Create Defect Code Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal menambahkan kode inspeksi.' });
  }
});

/**
 * PUT /api/defect-code/:code
 * Perbarui data defect code
 */
router.put('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const { newCode, Defect } = req.body || {};
    const targetCode = String(code || '').trim();
    const updatedCode = newCode ? String(newCode).trim() : targetCode;
    const cleanDefect = Defect !== undefined ? String(Defect).trim() : null;

    if (!targetCode) {
      return res.status(400).json({ success: false, message: 'Code target wajib diisi.' });
    }

    const result = await pool.query(
      `UPDATE "DefectCode"
       SET "Code" = $1, "Defect" = $2
       WHERE UPPER(BTRIM("Code")) = UPPER(BTRIM($3))
       RETURNING "Code", "Defect"`,
      [updatedCode, cleanDefect, targetCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Kode inspeksi '${targetCode}' tidak ditemukan.` });
    }

    return res.json({
      success: true,
      message: `Kode inspeksi '${result.rows[0].Code}' berhasil diperbarui.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Update Defect Code Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal memperbarui kode inspeksi.' });
  }
});

/**
 * DELETE /api/defect-code/:code
 * Hapus data defect code
 */
router.delete('/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const targetCode = String(code || '').trim();

    if (!targetCode) {
      return res.status(400).json({ success: false, message: 'Code wajib diisi.' });
    }

    const result = await pool.query(
      `DELETE FROM "DefectCode" WHERE UPPER(BTRIM("Code")) = UPPER(BTRIM($1)) RETURNING "Code"`,
      [targetCode]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: `Kode inspeksi '${targetCode}' tidak ditemukan.` });
    }

    return res.json({
      success: true,
      message: `Kode inspeksi '${targetCode}' berhasil dihapus.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Delete Defect Code Error]:', err);
    return res.status(500).json({ success: false, message: err.message || 'Gagal menghapus kode inspeksi.' });
  }
});

export default router;

