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

function normalizeLine(item, parentProdId = '', parentNoMesin = '') {
  return {
    ProdId: (item.ProdId || item.prodId || item.prod_id || parentProdId || '').trim(),
    RoolNumber: parseInt(item.RoolNumber ?? item.roolNumber ?? item.rollNumber ?? item.roll_number ?? item.id ?? 0, 10),
    Description: (item.Description || item.description || `Roll #${item.RoolNumber || item.id || ''}`).trim(),
    Length: parseFloat(item.Length ?? item.length ?? 0),
    IsExecute: Boolean(item.IsExecute ?? item.isExecute ?? item.is_execute ?? false),
    NoMesin: String(item.NoMesin || item.noMesin || item.no_mesin || parentNoMesin || '').trim(),
    isPrinted: Boolean(item.isPrinted ?? item.is_printed ?? false),
  };
}

function normalizeDefect(item, parentProdId = '', parentRoolNumber = 0, defaultLineNumber = 1) {
  const rawCode = String(item.Code || item.code || '').trim();
  const parts = rawCode.split(/\s+[–-]\s+/);
  let code = parts[0]?.trim() || rawCode || 'DEFECT';
  let desc = parts.slice(1).join(' - ').trim();
  if (!desc) {
    desc = String(item.Description || item.description || code).trim();
  }

  return {
    ProdId: String(item.ProdId || item.prodId || item.prod_id || parentProdId || '').trim(),
    RoolNumber: parseInt(item.RoolNumber ?? item.roolNumber ?? item.rollNumber ?? parentRoolNumber ?? 0, 10),
    LengthPoint: parseFloat(item.LengthPoint ?? item.lengthPoint ?? item.yard ?? item.length ?? 0),
    Code: code,
    Description: desc,
    IsExecuted: Boolean(item.IsExecuted ?? item.isExecuted ?? true),
    LineNumber: parseInt(item.LineNumber ?? item.lineNumber ?? defaultLineNumber, 10),
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
       SET "Description" = $3, "Length" = $4, "IsExecute" = $5, "NoMesin" = $6, "isPrinted" = $7
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, line.IsExecute, line.NoMesin, line.isPrinted]
    );
    return { action: 'updated', data: res.rows[0] };
  } else {
    const res = await client.query(
      `INSERT INTO "CountingKainLines" ("ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, line.IsExecute, line.NoMesin, line.isPrinted]
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
      const line = normalizeLine(rawLine, header.ProdId, header.NoMesin);
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
    const targetMachine = String(req.query.noMesin || req.query.machineId || '').trim();

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

    const header = headerRes.rows[0];
    const headerMachine = String(header.NoMesin || '').trim();

    const linesRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1
       ORDER BY "RoolNumber" ASC`,
      [prodId]
    );

    const allLines = linesRes.rows.map((line) => {
      // Normalisasi jika NoMesin di baris null, gunakan NoMesin dari Header
      const resolvedMachine = line.NoMesin ? String(line.NoMesin).trim() : headerMachine;
      return {
        ...line,
        NoMesin: resolvedMachine,
      };
    });

    // Jika targetMachine disediakan, hanya tampilkan lines milik targetMachine
    const lines = targetMachine
      ? allLines.filter((l) => String(l.NoMesin || '').trim() === targetMachine)
      : allLines;

    // Ambil seluruh titik cacat kain untuk ProdId ini
    const defectsRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber"
       FROM "CountingKainDefect"
       WHERE "ProdId" = $1
       ORDER BY "RoolNumber" ASC, "LineNumber" ASC`,
      [prodId]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...header,
        lines,
        allLines,
        defects: defectsRes.rows,
        targetMachine: targetMachine || null,
        machineLinesCount: lines.length,
        totalLinesCount: allLines.length,
        totalDefectsCount: defectsRes.rows.length,
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
    await client.query('DELETE FROM "CountingKainDefect" WHERE "ProdId" = $1', [prodId]);
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
      SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted"
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted"
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
  const client = await pool.connect();
  try {
    const { prodId, roolNumber } = req.params;
    const rollNum = parseInt(roolNumber, 10);

    await client.query('BEGIN');

    // Hapus titik cacat terkait roll ini terlebih dahulu
    await client.query(
      'DELETE FROM "CountingKainDefect" WHERE "ProdId" = $1 AND "RoolNumber" = $2',
      [prodId, rollNum]
    );

    const result = await client.query(
      `DELETE FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber"`,
      [prodId, rollNum]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: `Line with ProdId '${prodId}' and RoolNumber '${roolNumber}' not found.`,
      });
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Line #${roolNumber} of ProdId '${prodId}' and associated defects deleted successfully.`,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Delete Line Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * PATCH /api/counting/lines/:prodId/:roolNumber/print
 * Update isPrinted = true when E-Ticket is printed
 */
router.patch('/lines/:prodId/:roolNumber/print', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;

    const result = await pool.query(
      `UPDATE "CountingKainLines"
       SET "isPrinted" = true
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted"`,
      [prodId, parseInt(roolNumber, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Line ProdId '${prodId}' with RoolNumber '${roolNumber}' not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Line #${roolNumber} E-Ticket marked as printed.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Update isPrinted Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 4. COUNTING KAIN DEFECTS CRUD
// ============================================================

/**
 * GET /api/counting/defects/:prodId
 * Query params: ?roolNumber=...
 * Returns list of defects for a production order or a specific roll
 */
router.get('/defects/:prodId', async (req, res) => {
  try {
    const { prodId } = req.params;
    const { roolNumber, rollNumber } = req.query;
    const targetRoll = parseInt(roolNumber || rollNumber || 0, 10);

    let query = `
      SELECT "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber"
      FROM "CountingKainDefect"
      WHERE "ProdId" = $1
    `;
    const params = [prodId];

    if (targetRoll > 0) {
      params.push(targetRoll);
      query += ` AND "RoolNumber" = $${params.length}`;
    }

    query += ' ORDER BY "RoolNumber" ASC, "LineNumber" ASC';

    const result = await pool.query(query, params);

    // Group defects by RoolNumber for easy frontend consumption
    const grouped = {};
    for (const d of result.rows) {
      if (!grouped[d.RoolNumber]) grouped[d.RoolNumber] = [];
      grouped[d.RoolNumber].push(d);
    }

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
      grouped,
    });
  } catch (err) {
    console.error('[Get Defects Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/counting/defects
 * Body: { ProdId, RoolNumber, defects: [ { yard / LengthPoint, code / Code, Description, ... } ] }
 * Replaces all defects for the specified roll with the provided list (atomic transaction)
 */
router.post('/defects', async (req, res) => {
  const prodId = String(req.body.ProdId || req.body.prodId || '').trim();
  const roolNumber = parseInt(req.body.RoolNumber ?? req.body.roolNumber ?? req.body.rollNumber ?? 0, 10);
  const rawDefects = Array.isArray(req.body.defects) ? req.body.defects : [];

  if (!prodId) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'ProdId is required.',
    });
  }

  if (roolNumber <= 0) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Valid RoolNumber (> 0) is required.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Hapus titik cacat lama untuk roll ini (overwrite)
    await client.query(
      'DELETE FROM "CountingKainDefect" WHERE "ProdId" = $1 AND "RoolNumber" = $2',
      [prodId, roolNumber]
    );

    // 2. Insert titik cacat baru
    const inserted = [];
    for (let i = 0; i < rawDefects.length; i++) {
      const norm = normalizeDefect(rawDefects[i], prodId, roolNumber, i + 1);
      const insRes = await client.query(
        `INSERT INTO "CountingKainDefect" 
         ("ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber"`,
        [norm.ProdId, norm.RoolNumber, norm.LengthPoint, norm.Code, norm.Description, norm.IsExecuted, norm.LineNumber]
      );
      inserted.push(insRes.rows[0]);
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Berhasil menyimpan ${inserted.length} titik cacat untuk Roll #${roolNumber}.`,
      count: inserted.length,
      data: inserted,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Save Defects Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/counting/defects/:prodId/:roolNumber
 * Delete all defects for a specific roll
 */
router.delete('/defects/:prodId/:roolNumber', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;
    const rollNum = parseInt(roolNumber, 10);

    const result = await pool.query(
      `DELETE FROM "CountingKainDefect"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber"`,
      [prodId, rollNum]
    );

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.rows.length} defect(s) for Roll #${rollNum} of ProdId '${prodId}'.`,
      deletedCount: result.rows.length,
    });
  } catch (err) {
    console.error('[Delete Defects Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/counting/next-roll/:prodId
 * Multi-machine roll reservation helper: returns existing rolls, max roll, and per-machine stats
 */
router.get('/next-roll/:prodId', async (req, res) => {
  try {
    const { prodId } = req.params;
    const targetMachine = String(req.query.noMesin || req.query.machineId || '').trim();

    const query = `
      SELECT 
        "RoolNumber",
        "NoMesin",
        "Length",
        "isPrinted",
        "Description"
      FROM "CountingKainLines"
      WHERE "ProdId" = $1
      ORDER BY "RoolNumber" ASC
    `;

    const result = await pool.query(query, [prodId]);
    const lines = result.rows;

    const maxRoll = lines.length > 0 ? Math.max(...lines.map((l) => l.RoolNumber || 0)) : 0;
    const nextSuggestedRoll = maxRoll + 1;

    // Aggregate by machine
    const rollsByMachine = {};
    for (const line of lines) {
      const m = String(line.NoMesin || 'Unknown').trim();
      if (!rollsByMachine[m]) {
        rollsByMachine[m] = {
          machine: m,
          count: 0,
          totalLength: 0,
          rolls: [],
          maxRoll: 0,
          nextRoll: 1,
        };
      }
      rollsByMachine[m].count += 1;
      rollsByMachine[m].totalLength += parseFloat(line.Length) || 0;
      rollsByMachine[m].rolls.push(line.RoolNumber);
      if (line.RoolNumber > rollsByMachine[m].maxRoll) {
        rollsByMachine[m].maxRoll = line.RoolNumber;
        rollsByMachine[m].nextRoll = line.RoolNumber + 1;
      }
    }

    // Hitung khusus untuk targetMachine jika disediakan
    let machineMaxRoll = 0;
    let machineNextRoll = 1;
    let machineRollsCount = 0;

    if (targetMachine) {
      const mData = rollsByMachine[targetMachine];
      if (mData) {
        machineMaxRoll = mData.maxRoll;
        machineNextRoll = mData.nextRoll;
        machineRollsCount = mData.count;
      } else {
        machineMaxRoll = 0;
        machineNextRoll = 1;
        machineRollsCount = 0;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        prodId,
        targetMachine: targetMachine || null,
        maxRoll,
        nextSuggestedRoll,
        machineMaxRoll,
        machineNextRoll,
        machineRollsCount,
        totalRolls: lines.length,
        rollsByMachine,
        existingRollNumbers: lines.map((l) => l.RoolNumber),
        lines,
      },
    });
  } catch (err) {
    console.error('[Get Next Roll Info Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/counting/autonic/get-and-delete
 * Body: { machineId, prodId }
 * Pulls machine length and automatically deletes record from database
 */
router.post('/autonic/get-and-delete', async (req, res) => {
  const machineId = parseInt(req.body.machineId || req.body.nomesin || 1, 10);
  const client = await pool.connect();

  try {
    let reading = null;

    // 1. Coba hubungi webhook Autonic eksternal terlebih dahulu
    try {
      const webhookRes = await fetch('http://192.168.23.61:5678/webhook/getdataautonic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub21lc2luIjoiMSJ9.RbhwKIJJqRxD2uP_on5Ch3tJOoR2rLfrz45D_E0IR_0',
        },
        body: JSON.stringify({ nomesin: machineId }),
      });

      if (webhookRes.ok) {
        reading = await webhookRes.json();
      }
    } catch (whErr) {
      console.warn('[Autonic Webhook Fallback to DB]:', whErr.message);
    }

    // 2. Jika webhook gagal atau tidak mengembalikan data, baca langsung dari tabel database autonicmachine_${machineId}
    const tableName = `autonicmachine_${machineId}`;
    if (!reading || !reading.Length) {
      const directRes = await client.query(
        `SELECT createdatetime, length FROM "${tableName}" ORDER BY createdatetime DESC LIMIT 1`
      );
      if (directRes.rows.length > 0) {
        reading = {
          DateTimeCreated: directRes.rows[0].createdatetime,
          Length: String(directRes.rows[0].length),
        };
      }
    }

    const lengthVal = parseFloat(reading?.Length || 0);
    const dt = reading?.DateTimeCreated;

    // 3. Hapus data otomatis langsung dari database agar tidak terbaca ulang
    // await client.query('BEGIN');
    // let deletedCount = 0;

    // if (dt) {
    //   const delTbl = await client.query(
    //     `DELETE FROM "${tableName}" WHERE createdatetime <= $1 RETURNING createdatetime`,
    //     [dt]
    //   );
    //   deletedCount += delTbl.rows.length;

    //   // Juga bersihkan dari tabel gabungan autonicmachine jika ada
    //   await client.query(
    //     `DELETE FROM "autonicmachine" WHERE createdatetime <= $1`,
    //     [dt]
    //   );
    // } else {
    //   // Hapus row terbaru jika tidak ada timestamp pasti
    //   const delLatest = await client.query(
    //     `DELETE FROM "${tableName}" WHERE ctid IN (SELECT ctid FROM "${tableName}" ORDER BY createdatetime DESC LIMIT 1) RETURNING createdatetime`
    //   );
    //   deletedCount += delLatest.rows.length;
    // }

    // await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Data Mesin #${machineId} berhasil ditarik (${lengthVal} yard) dan otomatis dihapus dari database.`,
      data: {
        Length: lengthVal,
        DateTimeCreated: dt || new Date().toISOString(),
        deletedCount,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Autonic Get-and-Delete Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Gagal memproses data mesin',
      message: err.message,
    });
  } finally {
    client.release();
  }
});

export default router;
