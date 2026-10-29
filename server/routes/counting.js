import express from 'express';
import { pool } from '../config/db.js';
import { generateNextQrNum } from '../services/sequence.js';

const router = express.Router();

/**
 * Normalizer helper to extract field values regardless of casing
 */
function normalizeHeader(body, user) {
  const parseQty = (val) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const cleanStr = String(val).replace(/,/g, '').trim();
    const n = parseFloat(cleanStr);
    return isNaN(n) ? 0 : n;
  };

  const clean = (val, maxLen) => {
    const s = String(val || '').trim();
    return maxLen ? s.slice(0, maxLen) : s;
  };

  return {
    ProdId: clean(body.ProdId || body.prodId || body.prod_id, 50),
    NoMesin: clean(body.NoMesin || body.noMesin || body.no_mesin || body.machine_id || user?.machine_id, 50),
    UserId: clean(body.UserId || body.userId || body.user_id || user?.username || user?.id, 50),
    SeqmentNum: clean(body.SeqmentNum || body.seqmentNum || body.seqment_num || body.noWo || body.NoWo, 50),
    CustCode: clean(body.CustCode || body.custCode || body.cust_code || body.customer, 10),
    DesignCode: clean(body.DesignCode || body.designCode || body.design_code || body.design || body.fabricType, 10),
    Color: clean(body.Color || body.color, 20),
    RecidProdId: clean(body.RecidProdId || body.recidProdId || body.recid_prod_id, 30),
    RecidSalesId: clean(body.RecidSalesId || body.recidSalesId || body.recid_sales_id, 30),
    RecidItemId: clean(body.RecidItemId || body.recidItemId || body.recid_item_id, 30),
    OrderQty: parseQty(body.OrderQty ?? body.orderQty),
    StockQty: parseQty(body.StockQty ?? body.stockQty),
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
    isStock: item.isStock !== undefined ? Boolean(item.isStock) : (item.is_stock !== undefined ? Boolean(item.is_stock) : false),
    QrNum: (item.QrNum || item.qrNum || item.qr_num || '').trim() || null,
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
 * Upsert single header logic with all 12 columns
 */
async function upsertHeaderQuery(client, header) {
  const check = await client.query(
    'SELECT 1 FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1',
    [header.ProdId]
  );

  if (check.rows.length > 0) {
    const res = await client.query(
      `UPDATE "CountingKainHeader"
       SET "NoMesin" = $2,
           "UserId" = $3,
           "SeqmentNum" = COALESCE(NULLIF($4::text, ''), "SeqmentNum"),
           "CustCode" = COALESCE(NULLIF($5::text, ''), "CustCode"),
           "DesignCode" = COALESCE(NULLIF($6::text, ''), "DesignCode"),
           "Color" = COALESCE(NULLIF($7::text, ''), "Color"),
           "RecidProdId" = COALESCE(NULLIF($8::text, ''), "RecidProdId"),
           "RecidSalesId" = COALESCE(NULLIF($9::text, ''), "RecidSalesId"),
           "RecidItemId" = COALESCE(NULLIF($10::text, ''), "RecidItemId"),
           "OrderQty" = CASE WHEN $11::numeric IS NOT NULL AND $11::numeric > 0 THEN $11::numeric ELSE "OrderQty" END,
           "StockQty" = CASE WHEN $12::numeric IS NOT NULL AND $12::numeric > 0 THEN $12::numeric ELSE "StockQty" END
       WHERE "ProdId" = $1
       RETURNING "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode", "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty"`,
      [
        header.ProdId,
        header.NoMesin,
        header.UserId,
        header.SeqmentNum,
        header.CustCode,
        header.DesignCode,
        header.Color,
        header.RecidProdId,
        header.RecidSalesId,
        header.RecidItemId,
        header.OrderQty,
        header.StockQty,
      ]
    );
    return { action: 'updated', data: res.rows[0] };
  } else {
    const res = await client.query(
      `INSERT INTO "CountingKainHeader" (
         "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode",
         "DesignCode", "Color", "RecidProdId", "RecidSalesId",
         "RecidItemId", "OrderQty", "StockQty"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::numeric, $12::numeric)
       RETURNING "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode", "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty"`,
      [
        header.ProdId,
        header.NoMesin,
        header.UserId,
        header.SeqmentNum,
        header.CustCode,
        header.DesignCode,
        header.Color,
        header.RecidProdId,
        header.RecidSalesId,
        header.RecidItemId,
        header.OrderQty,
        header.StockQty,
      ]
    );
    return { action: 'created', data: res.rows[0] };
  }
}

/**
 * Helper untuk memeriksa apakah roll baru yang akan dibuat harus berstatus isStock.
 * Aturan:
 * Jika pemanggil secara eksplisit menandai isStock = true, langsung kembalikan true.
 * Jika tidak, cek header untuk ProdId ini:
 * - Ambil OrderQty dan RecidSalesId.
 * - Jika OrderQty > 0:
 *   Hitung total akumulasi panjang (SUM("Length")) dari seluruh roll pesanan (isStock IS NOT TRUE)
 *   atas RecidSalesId tersebut (lintas semua ProdId yang berbagi RecidSalesId yang sama).
 *   Jika total panjang sudah mencapai atau melebihi OrderQty (totalLength >= orderQty),
 *   maka roll baru yang dibuat otomatis berstatus isStock = true!
 */
async function checkShouldBeStock(client, prodId, explicitIsStock = false) {
  if (explicitIsStock === true) {
    return true;
  }

  if (!prodId) {
    return false;
  }

  try {
    // 1. Ambil data header untuk prodId ini
    const headerRes = await client.query(
      `SELECT "RecidSalesId", "OrderQty" FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1`,
      [prodId]
    );

    if (headerRes.rows.length === 0) {
      return false;
    }

    const header = headerRes.rows[0];
    let orderQty = parseFloat(header.OrderQty) || 0;
    const recidSalesId = (header.RecidSalesId || '').trim();

    // Fallback: Jika OrderQty di header prodId ini 0 tapi ada RecidSalesId, cari MAX("OrderQty") dari RecidSalesId yang sama
    if (orderQty <= 0 && recidSalesId) {
      const salesRes = await client.query(
        `SELECT MAX("OrderQty") AS max_qty FROM "CountingKainHeader" WHERE "RecidSalesId" = $1`,
        [recidSalesId]
      );
      orderQty = parseFloat(salesRes.rows[0]?.max_qty) || 0;
    }

    if (orderQty <= 0) {
      return false;
    }

    // 2. Hitung total panjang roll non-stock yang sudah ada atas RecidSalesId ini (atau ProdId jika RecidSalesId kosong)
    let totalLength = 0;
    if (recidSalesId) {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM(l."Length"), 0) AS total_length
         FROM "CountingKainLines" l
         JOIN "CountingKainHeader" h ON l."ProdId" = h."ProdId"
         WHERE h."RecidSalesId" = $1
           AND (l."isStock" IS FALSE OR l."isStock" IS NULL)`,
        [recidSalesId]
      );
      totalLength = parseFloat(sumRes.rows[0]?.total_length) || 0;
    } else {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM("Length"), 0) AS total_length
         FROM "CountingKainLines"
         WHERE "ProdId" = $1
           AND ("isStock" IS FALSE OR "isStock" IS NULL)`,
        [prodId]
      );
      totalLength = parseFloat(sumRes.rows[0]?.total_length) || 0;
    }

    return totalLength >= orderQty;
  } catch (err) {
    console.error('[checkShouldBeStock Error]:', err);
    return false;
  }
}

/**
 * Upsert single line logic
 */
async function upsertLineQuery(client, line) {
  const check = await client.query(
    `SELECT "IsExecute", "QrNum", "isStock" FROM "CountingKainLines" 
     WHERE "ProdId" = $1 AND "RoolNumber" = $2 LIMIT 1`,
    [line.ProdId, line.RoolNumber]
  );

  if (check.rows.length > 0) {
    // ATURAN: Ketika update lines jika isExecute = true di update jadi false
    const existing = check.rows[0];
    const currentIsExecute = Boolean(existing.IsExecute);
    let finalIsExecute = line.IsExecute;
    if (currentIsExecute === true) {
      finalIsExecute = false;
    }

    const finalIsStock = line.isStock !== undefined 
      ? Boolean(line.isStock) 
      : (existing.isStock !== null ? Boolean(existing.isStock) : false);

    let finalQrNum = line.QrNum || existing.QrNum;
    if (!finalQrNum) {
      finalQrNum = await generateNextQrNum(client, finalIsStock);
    } else if (finalQrNum.startsWith('QR.O.')) {
      finalQrNum = finalQrNum.replace(/^QR\.O\./, 'QR.S.');
    }

    const res = await client.query(
      `UPDATE "CountingKainLines"
       SET "Description" = $3, "Length" = $4, "IsExecute" = $5, "NoMesin" = $6, "isPrinted" = $7, "isStock" = $8, "QrNum" = $9
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, finalIsExecute, line.NoMesin, line.isPrinted, finalIsStock, finalQrNum]
    );
    return { action: 'updated', data: res.rows[0], isExecuteReset: currentIsExecute === true };
  } else {
    // Validasi otomatis isStock saat CREATE:
    // Jika akumulasi length atas RecidSalesId sudah melebihi/mencapai OrderQty, otomatis tandai sebagai isStock!
    const isStockVal = await checkShouldBeStock(client, line.ProdId, Boolean(line.isStock));

    let generatedQrNum = line.QrNum || (await generateNextQrNum(client, isStockVal));
    if (generatedQrNum && generatedQrNum.startsWith('QR.O.')) {
      generatedQrNum = generatedQrNum.replace(/^QR\.O\./, 'QR.S.');
    }

    const res = await client.query(
      `INSERT INTO "CountingKainLines" ("ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, line.IsExecute, line.NoMesin, line.isPrinted, isStockVal, generatedQrNum]
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
      SELECT "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode", 
             "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty"
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
      `SELECT "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode", 
              "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty"
       FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1`,
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"
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
      SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"
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
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"`,
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

/**
 * PATCH /api/counting/lines/:prodId/:roolNumber/stock
 * Update isStock = true/false per baris roll dan sesuaikan format QrNum (QR.S... / QR.O...)
 */
router.patch('/lines/:prodId/:roolNumber/stock', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;
    const rollNum = parseInt(roolNumber, 10);
    const isStock = Boolean(req.body.isStock);

    const checkRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 LIMIT 1`,
      [prodId, rollNum]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Baris Roll #${rollNum} untuk Order '${prodId}' tidak ditemukan di database.`,
      });
    }

    const existing = checkRes.rows[0];
    let finalQrNum = existing.QrNum;

    if (!finalQrNum) {
      finalQrNum = await generateNextQrNum(pool, isStock);
    } else if (finalQrNum.startsWith('QR.O.')) {
      finalQrNum = finalQrNum.replace(/^QR\.O\./, 'QR.S.');
    }

    const updateRes = await pool.query(
      `UPDATE "CountingKainLines"
       SET "isStock" = $3, "QrNum" = $4
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"`,
      [prodId, rollNum, isStock, finalQrNum]
    );

    return res.status(200).json({
      success: true,
      message: `Status stock Roll #${rollNum} berhasil diubah (${isStock ? 'Kain Stock' : 'Order'}).`,
      data: updateRes.rows[0],
    });
  } catch (err) {
    console.error('[Update isStock Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/counting/lines/:prodId/:roolNumber
 * Update / Edit data baris roll (Length dan BS Qty / Description).
 * ATURAN: Ketika update lines jika isExecute = true di update jadi false!
 */
router.put('/lines/:prodId/:roolNumber', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;
    const rollNum = parseInt(roolNumber, 10);
    const lengthVal = parseFloat(req.body.Length ?? req.body.length);
    const bsVal = parseFloat(req.body.bsQty ?? req.body.BsQty ?? req.body.bs ?? 0);

    if (isNaN(lengthVal) || lengthVal <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Panjang kain (Length) harus berupa angka lebih dari 0.',
      });
    }

    if (isNaN(bsVal) || bsVal < 0) {
      return res.status(400).json({
        success: false,
        error: 'BS Qty tidak boleh bernilai negatif.',
      });
    }

    if (bsVal >= lengthVal) {
      return res.status(400).json({
        success: false,
        error: `BS Qty (${bsVal} yd) harus di bawah nilai panjang kain (${lengthVal} yd).`,
      });
    }

    // 1. Cek baris saat ini di database
    const checkRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 LIMIT 1`,
      [prodId, rollNum]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Baris Roll #${rollNum} untuk Order '${prodId}' tidak ditemukan di database.`,
      });
    }

    const existing = checkRes.rows[0];
    const wasExecuted = Boolean(existing.IsExecute);

    // ATURAN WAJIB: Ketika update lines jika isExecute = true di update jadi false!
    let finalIsExecute = Boolean(req.body.IsExecute ?? req.body.isExecute ?? existing.IsExecute);
    if (wasExecuted) {
      finalIsExecute = false;
    }

    const finalIsStock = req.body.isStock !== undefined 
      ? Boolean(req.body.isStock) 
      : (existing.isStock !== null ? Boolean(existing.isStock) : false);

    let finalQrNum = req.body.QrNum || req.body.qrNum || existing.QrNum;
    if (!finalQrNum) {
      finalQrNum = await generateNextQrNum(pool, finalIsStock);
    } else if (finalQrNum.startsWith('QR.O.')) {
      finalQrNum = finalQrNum.replace(/^QR\.O\./, 'QR.S.');
    }

    // Susun format Description (sertakan info BS agar awet di DB)
    let newDescription = req.body.Description || req.body.description;
    if (!newDescription) {
      newDescription = bsVal > 0
        ? `Roll #${rollNum} (${lengthVal} yard) | BS: ${bsVal} yd`
        : `Roll #${rollNum} (${lengthVal} yard)`;
    } else if (bsVal > 0 && !newDescription.includes('BS:')) {
      newDescription = `${newDescription} | BS: ${bsVal} yd`;
    }

    const noMesin = String(req.body.NoMesin || req.body.noMesin || existing.NoMesin || '').trim();
    const isPrinted = req.body.isPrinted !== undefined ? Boolean(req.body.isPrinted) : Boolean(existing.isPrinted);

    const updateRes = await pool.query(
      `UPDATE "CountingKainLines"
       SET "Length" = $3, "Description" = $4, "IsExecute" = $5, "NoMesin" = $6, "isPrinted" = $7, "isStock" = $8, "QrNum" = $9
       WHERE "ProdId" = $1 AND "RoolNumber" = $2
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum"`,
      [prodId, rollNum, lengthVal, newDescription, finalIsExecute, noMesin, isPrinted, finalIsStock, finalQrNum]
    );

    return res.status(200).json({
      success: true,
      message: `Line #${rollNum} berhasil diperbarui.${wasExecuted ? ' (isExecute = true diupdate jadi false)' : ''}`,
      data: {
        ...updateRes.rows[0],
        bsQty: bsVal,
      },
      isExecuteReset: wasExecuted,
    });
  } catch (err) {
    console.error('[Update Line Error]:', err);
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
        "Description",
        "isStock",
        "QrNum"
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

    // Ambil info OrderQty & RecidSalesId untuk verifikasi kuota order
    let orderQty = 0;
    let recidSalesId = '';
    let accumulatedSalesLength = 0;
    try {
      const headerRes = await pool.query(
        `SELECT "RecidSalesId", "OrderQty" FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1`,
        [prodId]
      );
      if (headerRes.rows.length > 0) {
        orderQty = parseFloat(headerRes.rows[0].OrderQty) || 0;
        recidSalesId = (headerRes.rows[0].RecidSalesId || '').trim();
      }

      if (orderQty <= 0 && recidSalesId) {
        const salesRes = await pool.query(
          `SELECT MAX("OrderQty") AS max_qty FROM "CountingKainHeader" WHERE "RecidSalesId" = $1`,
          [recidSalesId]
        );
        orderQty = parseFloat(salesRes.rows[0]?.max_qty) || 0;
      }

      if (recidSalesId) {
        const sumRes = await pool.query(
          `SELECT COALESCE(SUM(l."Length"), 0) AS total_length
           FROM "CountingKainLines" l
           JOIN "CountingKainHeader" h ON l."ProdId" = h."ProdId"
           WHERE h."RecidSalesId" = $1
             AND (l."isStock" IS FALSE OR l."isStock" IS NULL)`,
          [recidSalesId]
        );
        accumulatedSalesLength = parseFloat(sumRes.rows[0]?.total_length) || 0;
      } else {
        accumulatedSalesLength = lines
          .filter((l) => !l.isStock)
          .reduce((sum, l) => sum + (parseFloat(l.Length) || 0), 0);
      }
    } catch (hErr) {
      console.warn('[next-roll Header Query Warn]:', hErr.message);
    }

    const isOrderExceeded = orderQty > 0 && accumulatedSalesLength >= orderQty;
    const remainingOrderQty = orderQty > 0 ? Math.max(0, orderQty - accumulatedSalesLength) : 0;

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
        orderQty,
        recidSalesId,
        accumulatedSalesLength,
        isOrderExceeded,
        remainingOrderQty,
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
      message: `Data Mesin #${machineId} berhasil ditarik (${lengthVal} yard).`,
      data: {
        Length: lengthVal,
        DateTimeCreated: dt || new Date().toISOString(),
        deletedCount: 0,
      },
    });
  } catch (err) {
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

/**
 * POST /api/counting/autonic/flush
 * Body: { machineId }
 * Flushes / deletes autonic machine queue data
 */
router.post('/autonic/flush', async (req, res) => {
  const machineId = parseInt(req.body.machineId || req.body.nomesin || 1, 10);
  const client = await pool.connect();

  try {
    // 1. Coba panggil webhook delete Autonic eksternal
    try {
      await fetch('http://192.168.23.61:5678/webhook/deletedataautonic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub21lc2luIjoiMSJ9.RbhwKIJJqRxD2uP_on5Ch3tJOoR2rLfrz45D_E0IR_0',
        },
        body: JSON.stringify({ nomesin: machineId }),
      });
    } catch (whErr) {
      console.warn('[Autonic Flush Webhook Warning]:', whErr.message);
    }

    // 2. Bersihkan baris di tabel database autonicmachine_${machineId} jika ada
    const tableName = `autonicmachine_${machineId}`;
    try {
      await client.query(`DELETE FROM "${tableName}"`);
    } catch {
      // ignore if table doesn't exist
    }

    return res.status(200).json({
      success: true,
      message: `Data antrean Mesin #${machineId} berhasil diflush.`,
    });
  } catch (err) {
    console.error('[Autonic Flush Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Gagal flush data mesin',
      message: err.message,
    });
  } finally {
    client.release();
  }
});

export default router;

