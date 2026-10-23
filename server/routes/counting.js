import express from 'express';
import { pool } from '../config/db.js';

const router = express.Router();

/**
 * Normalizer helper to extract field values regardless of casing
 */
function normalizeHeader(body, user) {
  return {
    ProdId: (body.ProdId || body.prodId || body.prod_id || '').trim(),
    NoMesin: String(body.NoMesin || body.noMesin || body.no_mesin || body.machine_id || user?.machine_id || '').trim(),
    UserId: String(body.UserId || body.userId || body.user_id || user?.username || user?.id || '').trim(),
  };
}

function normalizeLine(item, parentProdId = '') {
  return {
    ProdId: (item.ProdId || item.prodId || item.prod_id || parentProdId || '').trim(),
    RoolNumber: parseInt(item.RoolNumber ?? item.roolNumber ?? item.rollNumber ?? item.roll_number ?? item.id ?? 0, 10),
    Description: (item.Description || item.description || `Roll #${item.RoolNumber || item.id || ''}`).trim(),
    Length: parseFloat(item.Length ?? item.length ?? 0),
    IsExecute: Boolean(item.IsExecute ?? item.isExecute ?? item.is_execute ?? false),
  };
}

/**
 * Upsert single header logic
 */
async function upsertHeaderQuery(client, header) {
  const check = await client.query(
    'SELECT 1 FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1',
    [header.ProdId]
  );

  if (check.rows.length > 0) {
    const res = await client.query(
      `UPDATE "CountingKainHeader"
       SET "NoMesin" = $2, "UserId" = $3
       WHERE "ProdId" = $1
       RETURNING "ProdId", "NoMesin", "UserId"`,
      [header.ProdId, header.NoMesin, header.UserId]
    );
    return { action: 'updated', data: res.rows[0] };
  } else {
    const res = await client.query(
      `INSERT INTO "CountingKainHeader" ("ProdId", "NoMesin", "UserId")
       VALUES ($1, $2, $3)
       RETURNING "ProdId", "NoMesin", "UserId"`,
      [header.ProdId, header.NoMesin, header.UserId]
    );
    return { action: 'created', data: res.rows[0] };
  }
}

/**
 * Upsert single line logic
 */
async function upsertLineQuery(client, line) {
  const check = await client.query(
    `SELECT 1 FROM "CountingKainLines" 
     WHERE "ProdId" = $1 AND "RoolNumber" = $2 LIMIT 1`,
    [line.ProdId, line.RoolNumber]
  );

  if (check.rows.length > 0) {
    const res = await client.query(
      `UPDATE "CountingKainLines"
       SET "Description" = $3, "Length" = $4, "IsExecute" = $5
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, line.IsExecute]
    );
    return { action: 'updated', data: res.rows[0] };
  } else {
    const res = await client.query(
      `INSERT INTO "CountingKainLines" ("ProdId", "RoolNumber", "Description", "Length", "IsExecute")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, line.IsExecute]
    );
    return { action: 'created', data: res.rows[0] };
  }
}

// ============================================================
// 1. COMBINED BUNDLE (HEADER + ALL LINES)
// ============================================================

/**
 * POST /api/counting/upsert
 * Body: { ProdId, NoMesin, UserId, lines: [{ RoolNumber, Description, Length, IsExecute }] }
 * Upserts header and its lines atomically inside a transaction.
 */
router.post('/upsert', async (req, res) => {
  const header = normalizeHeader(req.body, req.user);
  const rawLines = Array.isArray(req.body.lines) ? req.body.lines : [];

  if (!header.ProdId) {
    return res.status(400).json({
      success: false,
      error: 'ProdId is required',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert header
    const headerResult = await upsertHeaderQuery(client, header);

    // 2. Upsert lines
    const lineResults = [];
    for (const rawLine of rawLines) {
      const line = normalizeLine(rawLine, header.ProdId);
      if (line.RoolNumber > 0) {
        const lineRes = await upsertLineQuery(client, line);
        lineResults.push(lineRes);
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: 'Header and lines upserted successfully.',
      data: {
        header: headerResult.data,
        headerAction: headerResult.action,
        linesCount: lineResults.length,
        lines: lineResults.map((l) => l.data),
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Counting Upsert Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: err.message,
    });
  } finally {
    client.release();
  }
});

// ============================================================
// 2. COUNTING KAIN HEADER CRUD
// ============================================================

/**
 * GET /api/counting/headers
 * Query params: ?ProdId=... & ?NoMesin=... & ?UserId=... & ?limit=50 & ?offset=0
 */
router.get('/headers', async (req, res) => {
  try {
    const { ProdId, NoMesin, UserId, limit = 50, offset = 0 } = req.query;

    const conditions = [];
    const values = [];

    if (ProdId) {
      values.push(`%${ProdId.trim()}%`);
      conditions.push(`"ProdId" ILIKE $${values.length}`);
    }
    if (NoMesin) {
      values.push(NoMesin.trim());
      conditions.push(`"NoMesin" = $${values.length}`);
    }
    if (UserId) {
      values.push(UserId.trim());
      conditions.push(`"UserId" = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit, 10) || 50);
    values.push(parseInt(offset, 10) || 0);

    const query = `
      SELECT "ProdId", "NoMesin", "UserId"
      FROM "CountingKainHeader"
      ${whereClause}
      ORDER BY "ProdId" DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error('[Get Headers Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/counting/headers/:prodId
 * Returns header details and its lines
 */
router.get('/headers/:prodId', async (req, res) => {
  try {
    const { prodId } = req.params;

    const headerRes = await pool.query(
      'SELECT "ProdId", "NoMesin", "UserId" FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1',
      [prodId]
    );

    if (headerRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Header with ProdId '${prodId}' not found.`,
      });
    }

    const linesRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1
       ORDER BY "RoolNumber" ASC`,
      [prodId]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...headerRes.rows[0],
        lines: linesRes.rows,
      },
    });
  } catch (err) {
    console.error('[Get Header Detail Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/counting/headers (or PUT /api/counting/headers)
 * Upsert CountingKainHeader
 */
router.post('/headers', async (req, res) => {
  const header = normalizeHeader(req.body, req.user);

  if (!header.ProdId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'ProdId is required.',
    });
  }

  const client = await pool.connect();
  try {
    const result = await upsertHeaderQuery(client, header);
    return res.status(200).json({
      success: true,
      message: `Header '${header.ProdId}' ${result.action} successfully.`,
      action: result.action,
      data: result.data,
    });
  } catch (err) {
    console.error('[Upsert Header Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/counting/headers/:prodId
 * Deletes header and optionally its lines
 */
router.delete('/headers/:prodId', async (req, res) => {
  const { prodId } = req.params;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM "CountingKainLines" WHERE "ProdId" = $1', [prodId]);
    const deleteRes = await client.query(
      'DELETE FROM "CountingKainHeader" WHERE "ProdId" = $1 RETURNING "ProdId"',
      [prodId]
    );
    await client.query('COMMIT');

    if (deleteRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Header with ProdId '${prodId}' not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Header '${prodId}' and associated lines deleted successfully.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Delete Header Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// 3. COUNTING KAIN LINES CRUD
// ============================================================

/**
 * GET /api/counting/lines
 * Query params: ?ProdId=... & ?RoolNumber=...
 */
router.get('/lines', async (req, res) => {
  try {
    const { ProdId, prodId, RoolNumber, roolNumber, limit = 100, offset = 0 } = req.query;
    const targetProdId = ProdId || prodId;
    const targetRool = RoolNumber || roolNumber;

    const conditions = [];
    const values = [];

    if (targetProdId) {
      values.push(targetProdId.trim());
      conditions.push(`"ProdId" = $${values.length}`);
    }
    if (targetRool) {
      values.push(parseInt(targetRool, 10));
      conditions.push(`"RoolNumber" = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(parseInt(limit, 10) || 100);
    values.push(parseInt(offset, 10) || 0);

    const query = `
      SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute"
      FROM "CountingKainLines"
      ${whereClause}
      ORDER BY "ProdId" DESC, "RoolNumber" ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const result = await pool.query(query, values);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (err) {
    console.error('[Get Lines Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/counting/lines/:prodId/:roolNumber
 */
router.get('/lines/:prodId/:roolNumber', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;

    const result = await pool.query(
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       LIMIT 1`,
      [prodId, parseInt(roolNumber, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Line ProdId '${prodId}' with RoolNumber '${roolNumber}' not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Get Line Item Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/counting/lines
 * Upsert single line OR array of lines
 */
router.post('/lines', async (req, res) => {
  const isArray = Array.isArray(req.body);
  const items = isArray ? req.body : [req.body];

  if (items.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Empty body',
      message: 'Provide at least one line object.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const results = [];
    for (const item of items) {
      const line = normalizeLine(item);
      if (!line.ProdId || !line.RoolNumber) {
        throw new Error('Both ProdId and RoolNumber are required for every line.');
      }
      const upserted = await upsertLineQuery(client, line);
      results.push(upserted);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Successfully upserted ${results.length} line(s).`,
      count: results.length,
      data: isArray ? results.map((r) => r.data) : results[0].data,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Upsert Lines Error]:', err);
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: err.message,
    });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/counting/lines/:prodId/:roolNumber
 */
router.delete('/lines/:prodId/:roolNumber', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;

    const result = await pool.query(
      `DELETE FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber"`,
      [prodId, parseInt(roolNumber, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Line with ProdId '${prodId}' and RoolNumber '${roolNumber}' not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Line #${roolNumber} of ProdId '${prodId}' deleted successfully.`,
    });
  } catch (err) {
    console.error('[Delete Line Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
