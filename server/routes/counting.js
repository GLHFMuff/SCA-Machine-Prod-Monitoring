import express from 'express';
import { pool } from '../config/db.js';
import { generateNextQrNum, parseDatePeriod } from '../services/sequence.js';

const router = express.Router();

const ACTIVE_LINE_FILTER = 'COALESCE("isDeleted", false) = false';
const ACTIVE_LINE_ALIASED_FILTER = 'COALESCE(l."isDeleted", false) = false';
const DEFAULT_DELETED_AT = '1900-01-01 00:00:00';

function matchChildRows(existingRows, incomingItems, isSameContent) {
  const matchedExistingIdx = new Set();
  const matchedPairs = new Map();

  incomingItems.forEach((item, inIdx) => {
    const exIdx = existingRows.findIndex(
      (ex, idx) => !matchedExistingIdx.has(idx) && Number(ex.LineNumber) === Number(item.LineNumber) && isSameContent(ex, item)
    );
    if (exIdx !== -1) {
      matchedExistingIdx.add(exIdx);
      matchedPairs.set(inIdx, existingRows[exIdx]);
    }
  });

  incomingItems.forEach((item, inIdx) => {
    if (matchedPairs.has(inIdx)) return;
    const exIdx = existingRows.findIndex(
      (ex, idx) => !matchedExistingIdx.has(idx) && isSameContent(ex, item)
    );
    if (exIdx !== -1) {
      matchedExistingIdx.add(exIdx);
      matchedPairs.set(inIdx, existingRows[exIdx]);
    }
  });

  const toSoftDelete = existingRows.filter((_, idx) => !matchedExistingIdx.has(idx));
  return { matchedPairs, toSoftDelete };
}

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
    K3LNumber: clean(body.K3LNumber || body.k3lNumber || body.k3l_number, 40),
    K3LName: clean(body.K3LName || body.k3lName || body.k3l_name, 50),
  };
}

/**
 * Normalizer helper to ensure TransDate is formatted as DD/MM/YYYY
 */
function formatTransDate(val) {
  if (!val) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  const s = String(val).trim();
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const dd = ddmmyyyy[1].padStart(2, '0');
    const mm = ddmmyyyy[2].padStart(2, '0');
    const yyyy = ddmmyyyy[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  const yyyymmdd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (yyyymmdd) {
    const yyyy = yyyymmdd[1];
    const mm = yyyymmdd[2].padStart(2, '0');
    const dd = yyyymmdd[3].padStart(2, '0');
    return `${dd}/${mm}/${yyyy}`;
  }
  const ddmmyyyyDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyyDash) {
    const dd = ddmmyyyyDash[1].padStart(2, '0');
    const mm = ddmmyyyyDash[2].padStart(2, '0');
    const yyyy = ddmmyyyyDash[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = parsed.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  return s;
}

function normalizeLine(item, parentProdId = '', parentNoMesin = '') {
  const productType = Number(item.ProductType ?? item.productType ?? 5);
  const inventStatus = String(item.InventStatus || item.inventStatus || (productType === 1 ? 'BS' : 'A')).trim().toUpperCase();
  if (![1, 5].includes(productType)) throw new Error('ProductType must be 1 (Co-Product) or 5 (roll).');
  if (productType === 1 && Number(item.RoolNumber ?? item.roolNumber ?? item.rollNumber ?? item.roll_number ?? item.id ?? 0) < 9001) {
    throw new Error('Co-Product requires roll number >= 9001 and InventStatus BS, JABLAK, or KECILAN.');
  }
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
    ProductType: productType,
    InventStatus: inventStatus,
    CreatedBy: String(item.CreatedBy ?? item.createdBy ?? item.created_by ?? '').trim() || null,
    Shift: item.Shift ?? item.shift ?? item.shift_id ?? null,
    TransDate: formatTransDate(item.TransDate || item.transDate || item.Date || item.date),
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
    LengthPointTo: parseFloat(item.LengthPointTo ?? item.lengthPointTo ?? item.yardTo ?? item.length ?? 0),
    Code: code,
    Description: desc,
    IsExecuted: Boolean(item.IsExecuted ?? item.isExecuted ?? true),
    LineNumber: parseInt(item.LineNumber ?? item.lineNumber ?? defaultLineNumber, 10),
  };
}

/**
 * Upsert single header logic with all 14 columns
 */
async function upsertHeaderQuery(client, header) {
  const check = await client.query(
    'SELECT 1 FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1',
    [header.ProdId]
  );

  if (check.rows.length > 0) {
    const res = await client.query(
      `UPDATE "CountingKainHeader"
       SET "NoMesin" = COALESCE(NULLIF("NoMesin", ''), $2),
           "UserId" = COALESCE(NULLIF("UserId", ''), $3),
           "SeqmentNum" = COALESCE(NULLIF($4::text, ''), "SeqmentNum"),
           "CustCode" = COALESCE(NULLIF($5::text, ''), "CustCode"),
           "DesignCode" = COALESCE(NULLIF($6::text, ''), "DesignCode"),
           "Color" = COALESCE(NULLIF($7::text, ''), "Color"),
           "RecidProdId" = COALESCE(NULLIF($8::text, ''), "RecidProdId"),
           "RecidSalesId" = COALESCE(NULLIF($9::text, ''), "RecidSalesId"),
           "RecidItemId" = COALESCE(NULLIF($10::text, ''), "RecidItemId"),
           "OrderQty" = CASE WHEN $11::numeric IS NOT NULL AND $11::numeric > 0 THEN $11::numeric ELSE "OrderQty" END,
           "StockQty" = CASE WHEN $12::numeric IS NOT NULL AND $12::numeric > 0 THEN $12::numeric ELSE "StockQty" END,
           "K3LNumber" = COALESCE(NULLIF($13::text, ''), "K3LNumber"),
           "K3LName" = COALESCE(NULLIF($14::text, ''), "K3LName")
       WHERE "ProdId" = $1
       RETURNING "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode", "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty", "K3LNumber", "K3LName"`,
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
        header.K3LNumber,
        header.K3LName,
      ]
    );
    return { action: 'updated', data: res.rows[0] };
  } else {
    const res = await client.query(
      `INSERT INTO "CountingKainHeader" (
         "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode",
         "DesignCode", "Color", "RecidProdId", "RecidSalesId",
         "RecidItemId", "OrderQty", "StockQty", "K3LNumber", "K3LName"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::numeric, $12::numeric, $13, $14)
       RETURNING "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode", "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty", "K3LNumber", "K3LName"`,
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
        header.K3LNumber,
        header.K3LName,
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
           AND (l."isStock" IS FALSE OR l."isStock" IS NULL)
           AND ${ACTIVE_LINE_ALIASED_FILTER}`,
        [recidSalesId]
      );
      totalLength = parseFloat(sumRes.rows[0]?.total_length) || 0;
    } else {
      const sumRes = await client.query(
        `SELECT COALESCE(SUM("Length"), 0) AS total_length
         FROM "CountingKainLines"
         WHERE "ProdId" = $1
           AND ("isStock" IS FALSE OR "isStock" IS NULL)
           AND ${ACTIVE_LINE_FILTER}`,
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
    `SELECT "IsExecute", "QrNum", "isStock", "ProductType", "InventStatus", "TransDate"
     FROM "CountingKainLines"
     WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
     LIMIT 1`,
    [line.ProdId, line.RoolNumber]
  );

  if (check.rows.length > 0) {
    if (line.ProductType === 1) {
      throw new Error(`Nomor Co-Product #${line.RoolNumber} sudah terdaftar.`)
    }
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

    const finalTransDate = line.TransDate || existing.TransDate || formatTransDate();
    const targetPeriod = parseDatePeriod(finalTransDate).period;

    let finalQrNum = line.QrNum || existing.QrNum;
    if (!finalQrNum) {
      finalQrNum = await generateNextQrNum(client, finalIsStock, finalTransDate);
    } else {
      const match = finalQrNum.match(/^QR\.[SO]\.(\d{4})\./);
      if (match && match[1] !== targetPeriod) {
        // Bulan TransDate berbeda (misal backdate)! Generate nomor sequence baru sesuai periode TransDate
        finalQrNum = await generateNextQrNum(client, finalIsStock, finalTransDate);
      } else if (finalQrNum.startsWith('QR.O.')) {
        finalQrNum = finalQrNum.replace(/^QR\.O\./, 'QR.S.');
      }
    }

    const res = await client.query(
      `UPDATE "CountingKainLines"
       SET "Description" = $3, "Length" = $4, "IsExecute" = $5, "NoMesin" = $6, "isPrinted" = $7, "isStock" = $8, "QrNum" = $9, "ProductType" = $10, "InventStatus" = $11, "CreatedBy" = $12, "Shift" = $13, "TransDate" = $14
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "CreatedBy", "Shift", "TransDate"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, finalIsExecute, line.NoMesin, line.isPrinted, finalIsStock, finalQrNum, line.ProductType, line.InventStatus, line.CreatedBy ?? null, line.Shift ?? null, finalTransDate]
    );
    return { action: 'updated', data: res.rows[0], isExecuteReset: currentIsExecute === true };
  } else {
    // Validasi otomatis isStock saat CREATE:
    // Jika akumulasi length atas RecidSalesId sudah melebihi/mencapai OrderQty, otomatis tandai sebagai isStock!
    const isStockVal = await checkShouldBeStock(client, line.ProdId, Boolean(line.isStock));
    const transDateVal = line.TransDate || formatTransDate();
    const targetPeriod = parseDatePeriod(transDateVal).period;

    let generatedQrNum = line.QrNum;
    if (!generatedQrNum) {
      generatedQrNum = await generateNextQrNum(client, isStockVal, transDateVal);
    } else {
      const match = generatedQrNum.match(/^QR\.[SO]\.(\d{4})\./);
      if (match && match[1] !== targetPeriod) {
        generatedQrNum = await generateNextQrNum(client, isStockVal, transDateVal);
      } else if (generatedQrNum.startsWith('QR.O.')) {
        generatedQrNum = generatedQrNum.replace(/^QR\.O\./, 'QR.S.');
      }
    }

    const res = await client.query(
      `INSERT INTO "CountingKainLines" ("ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "CreatedBy", "Shift", "TransDate", "DeletedAt", "isDeleted")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::timestamp, false)
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "CreatedBy", "Shift", "TransDate"`,
      [line.ProdId, line.RoolNumber, line.Description, line.Length, line.IsExecute, line.NoMesin, line.isPrinted, isStockVal, generatedQrNum, line.ProductType, line.InventStatus, line.CreatedBy ?? null, line.Shift ?? null, transDateVal, DEFAULT_DELETED_AT]
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
             "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty",
             "K3LNumber", "K3LName"
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
              "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty",
              "K3LNumber", "K3LName"
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "CreatedBy", "Shift", "TransDate"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
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

    // Ambil seluruh titik cacat kain aktif untuk ProdId ini
    const defectsRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber","LengthPointTo"
       FROM "CountingKainDefect"
       WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
       ORDER BY "RoolNumber" ASC, "LineNumber" ASC`,
      [prodId]
    );

    // Ambil seluruh joined pieces aktif untuk ProdId ini
    const joinedPiecesRes = await pool.query(
      `SELECT "ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber"
       FROM "CountingKainJoinedPiece"
       WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
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
        joinedPieces: joinedPiecesRes.rows,
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
    await client.query('DELETE FROM "CountingKainJoinedPiece" WHERE "ProdId" = $1', [prodId]);
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

    if (req.query.includeDeleted !== 'true') {
      conditions.push(ACTIVE_LINE_FILTER);
    }
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
      SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "CreatedBy", "Shift", "TransDate"
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "CreatedBy", "Shift", "TransDate"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
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
 * Soft delete baris roll (DeletedAt = NOW(), isDeleted = true, IsExecute = false)
 * beserta catatan inspeksi dan joined pieces terkait.
 */
router.delete('/lines/:prodId/:roolNumber', async (req, res) => {
  const client = await pool.connect();
  try {
    const { prodId, roolNumber } = req.params;
    const rollNum = parseInt(roolNumber, 10);

    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE "CountingKainLines"
       SET "DeletedAt" = NOW(),
           "isDeleted" = true,
           "IsExecute" = false
       WHERE "ProdId" = $1
         AND "RoolNumber" = $2
         AND ${ACTIVE_LINE_FILTER}
       RETURNING "ProdId", "RoolNumber", "DeletedAt", "isDeleted", "IsExecute"`,
      [prodId, rollNum]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: `Line with ProdId '${prodId}' and RoolNumber '${roolNumber}' not found.`,
      });
    }

    // Soft delete titik cacat terkait roll ini
    await client.query(
      `UPDATE "CountingKainDefect"
       SET "DeletedAt" = NOW(),
           "isDeleted" = true,
           "IsExecuted" = false
       WHERE "ProdId" = $1
         AND "RoolNumber" = $2
         AND ${ACTIVE_LINE_FILTER}`,
      [prodId, rollNum]
    );

    // Soft delete joined pieces terkait roll ini
    await client.query(
      `UPDATE "CountingKainJoinedPiece"
       SET "DeletedAt" = NOW(),
           "isDeleted" = true,
           "IsExecuted" = false
       WHERE "ProdId" = $1
         AND "RoolNumber" = $2
         AND ${ACTIVE_LINE_FILTER}`,
      [prodId, rollNum]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Line #${roolNumber} of ProdId '${prodId}' soft-deleted successfully.`,
      data: result.rows[0],
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
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "TransDate"`,
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "TransDate"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       LIMIT 1`,
      [prodId, rollNum]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Baris Roll #${rollNum} untuk Order '${prodId}' tidak ditemukan.`,
      });
    }

    const existing = checkRes.rows[0];
    let finalQrNum = existing.QrNum;

    if (!finalQrNum) {
      finalQrNum = await generateNextQrNum(pool, isStock, existing.TransDate);
    } else if (finalQrNum.startsWith('QR.O.')) {
      finalQrNum = finalQrNum.replace(/^QR\.O\./, 'QR.S.');
    }

    const updateRes = await pool.query(
      `UPDATE "CountingKainLines"
       SET "isStock" = $3, "QrNum" = $4
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "TransDate"`,
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
      `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus", "TransDate"
       FROM "CountingKainLines"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       LIMIT 1`,
      [prodId, rollNum]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Baris Roll #${rollNum} untuk Order '${prodId}' tidak ditemukan.`,
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

    const rawDate = req.body.TransDate ?? req.body.transDate ?? req.body.Date ?? req.body.date;
    const finalTransDate = rawDate ? formatTransDate(rawDate) : (existing.TransDate || formatTransDate());
    const targetPeriod = parseDatePeriod(finalTransDate).period;

    let finalQrNum = req.body.QrNum || req.body.qrNum;
    if (!finalQrNum) {
      const existingQr = existing.QrNum;
      if (existingQr) {
        const periodMatch = existingQr.match(/^QR\.[SO]\.(\d{4})\./);
        if (periodMatch && periodMatch[1] !== targetPeriod) {
          // Periode bulan/tahun berubah (misal backdate)! Generate nomor sequence baru sesuai periode TransDate
          finalQrNum = await generateNextQrNum(pool, finalIsStock, finalTransDate);
        } else {
          finalQrNum = existingQr.startsWith('QR.O.') ? existingQr.replace(/^QR\.O\./, 'QR.S.') : existingQr;
        }
      } else {
        finalQrNum = await generateNextQrNum(pool, finalIsStock, finalTransDate);
      }
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
       SET "Length" = $3, "Description" = $4, "IsExecute" = $5, "NoMesin" = $6, "isPrinted" = $7, "isStock" = $8, "QrNum" = $9, "TransDate" = $10
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       RETURNING "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin", "isPrinted", "isStock", "QrNum", "TransDate"`,
      [prodId, rollNum, lengthVal, newDescription, finalIsExecute, noMesin, isPrinted, finalIsStock, finalQrNum, finalTransDate]
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
 * GET /api/counting/defect-report/:prodId
 * Aggregate header, all lines across all machines, all CountingKainDefect rows
 * enriched with master DefectCode descriptions, and joined pieces for one OP.
 */
router.get('/defect-report/:prodId', async (req, res) => {
  try {
    const prodId = String(req.params.prodId || '').trim();
    if (!prodId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'ProdId is required.',
      });
    }

    const [headerRes, linesRes, defectsRes, joinedPiecesRes] = await Promise.all([
      pool.query(
        `SELECT "ProdId", "NoMesin", "UserId", "SeqmentNum", "CustCode", "DesignCode",
                "Color", "RecidProdId", "RecidSalesId", "RecidItemId", "OrderQty", "StockQty",
                "K3LNumber", "K3LName"
         FROM "CountingKainHeader"
         WHERE "ProdId" = $1
         LIMIT 1`,
        [prodId]
      ),
      pool.query(
        `SELECT "ProdId", "RoolNumber", "Description", "Length", "IsExecute", "NoMesin",
                "isPrinted", "isStock", "QrNum", "ProductType", "InventStatus",
                "CreatedBy", "Shift", "TransDate"
         FROM "CountingKainLines"
         WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
         ORDER BY "RoolNumber" ASC`,
        [prodId]
      ),
      pool.query(
        `SELECT d."ProdId", d."RoolNumber", d."LengthPoint", d."LengthPointTo",
                d."Code", d."Description", d."IsExecuted", d."LineNumber",
                dc."Defect" AS "MasterDefect"
         FROM "CountingKainDefect" d
         LEFT JOIN "DefectCode" dc
           ON UPPER(BTRIM(d."Code")) = UPPER(BTRIM(dc."Code"))
         WHERE d."ProdId" = $1
           AND COALESCE(d."isDeleted", false) = false
         ORDER BY d."RoolNumber" ASC, d."LengthPoint" ASC, d."LengthPointTo" ASC, d."LineNumber" ASC`,
        [prodId]
      ),
      pool.query(
        `SELECT "ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber"
         FROM "CountingKainJoinedPiece"
         WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
         ORDER BY "RoolNumber" ASC, "LineNumber" ASC`,
        [prodId]
      ),
    ]);

    if (
      headerRes.rows.length === 0 &&
      linesRes.rows.length === 0 &&
      defectsRes.rows.length === 0
    ) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Data OP '${prodId}' tidak ditemukan.`,
      });
    }

    const header = headerRes.rows[0] || { ProdId: prodId };
    const headerMachine = String(header.NoMesin || '').trim();
    const lines = linesRes.rows.map((line) => ({
      ...line,
      NoMesin: line.NoMesin ? String(line.NoMesin).trim() : headerMachine,
    }));

    return res.status(200).json({
      success: true,
      data: {
        header,
        lines,
        defects: defectsRes.rows,
        joinedPieces: joinedPiecesRes.rows,
      },
    });
  } catch (err) {
    console.error('[Get Defect Report Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

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
      SELECT "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber","LengthPointTo"
      FROM "CountingKainDefect"
      WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
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

    // 1. Ambil seluruh titik cacat aktif saat ini untuk roll ini
    const existingRes = await client.query(
      `SELECT ctid, "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber", "LengthPointTo"
       FROM "CountingKainDefect"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       ORDER BY "LineNumber" ASC
       FOR UPDATE`,
      [prodId, roolNumber]
    );

    const normalizedList = rawDefects.map((raw, i) => normalizeDefect(raw, prodId, roolNumber, i + 1));
    const { matchedPairs, toSoftDelete } = matchChildRows(
      existingRes.rows,
      normalizedList,
      (ex, norm) =>
        String(ex.Code || '').trim().toUpperCase() === norm.Code.toUpperCase() &&
        Math.abs((Number(ex.LengthPoint) || 0) - norm.LengthPoint) < 0.0001 &&
        Math.abs((Number(ex.LengthPointTo) || 0) - (norm.LengthPointTo || 0)) < 0.0001
    );

    // 2. Soft delete baris yang dihapus user (DeletedAt = NOW(), isDeleted = true, IsExecuted = false)
    for (const row of toSoftDelete) {
      await client.query(
        `UPDATE "CountingKainDefect"
         SET "DeletedAt" = NOW(), "isDeleted" = true, "IsExecuted" = false
         WHERE ctid = $1`,
        [row.ctid]
      );
    }

    // 3. Pertahankan baris yang cocok (update LineNumber/Description jika bergeser) & insert baris baru
    const savedRows = [];
    for (let i = 0; i < normalizedList.length; i++) {
      const norm = normalizedList[i];
      const matched = matchedPairs.get(i);
      if (matched) {
        if (
          Number(matched.LineNumber) !== norm.LineNumber ||
          String(matched.Description || '').trim() !== norm.Description
        ) {
          const updRes = await client.query(
            `UPDATE "CountingKainDefect"
             SET "LineNumber" = $2, "Description" = $3
             WHERE ctid = $1
             RETURNING "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber", "LengthPointTo"`,
            [matched.ctid, norm.LineNumber, norm.Description]
          );
          savedRows.push(updRes.rows[0]);
        } else {
          const { ctid: _ctid, ...rest } = matched;
          savedRows.push(rest);
        }
      } else {
        const insRes = await client.query(
          `INSERT INTO "CountingKainDefect"
           ("ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber", "LengthPointTo", "DeletedAt", "isDeleted")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamp, false)
           RETURNING "ProdId", "RoolNumber", "LengthPoint", "Code", "Description", "IsExecuted", "LineNumber", "LengthPointTo"`,
          [norm.ProdId, norm.RoolNumber, norm.LengthPoint, norm.Code, norm.Description, false, norm.LineNumber, norm.LengthPointTo, DEFAULT_DELETED_AT]
        );
        savedRows.push(insRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Berhasil menyimpan ${savedRows.length} titik inspeksi untuk Roll #${roolNumber}.`,
      count: savedRows.length,
      data: savedRows,
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
      `UPDATE "CountingKainDefect"
       SET "DeletedAt" = NOW(), "isDeleted" = true, "IsExecuted" = false
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
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

    const linesQuery = `
      SELECT 
        "RoolNumber",
        "NoMesin",
        "Length",
        "isPrinted",
        "Description",
        "isStock",
        "QrNum",
        "ProductType",
        "InventStatus",
        "TransDate"
      FROM "CountingKainLines"
      WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
      ORDER BY "RoolNumber" ASC
    `;

    const [linesResult, headerRes] = await Promise.all([
      pool.query(linesQuery, [prodId]),
      pool.query(
        `SELECT "NoMesin", "RecidSalesId", "OrderQty" FROM "CountingKainHeader" WHERE "ProdId" = $1 LIMIT 1`,
        [prodId]
      ).catch((hErr) => {
        console.warn('[next-roll Header Query Warn]:', hErr.message);
        return { rows: [] };
      }),
    ]);

    const headerRow = headerRes.rows[0] || null;
    const headerMachine = String(headerRow?.NoMesin || '').trim();
    const lines = linesResult.rows.map((line) => ({
      ...line,
      NoMesin: String(line.NoMesin || headerMachine || 'Unknown').trim() || 'Unknown',
    }));

    const rollLines = lines.filter((line) => Number(line.ProductType ?? 5) === 5);
    const coProductLines = lines.filter((line) => Number(line.ProductType ?? 5) === 1);

    const maxRoll = rollLines.length > 0 ? Math.max(...rollLines.map((l) => l.RoolNumber || 0)) : 0;
    const nextSuggestedRoll = maxRoll + 1;

    // Aggregate rolls by machine (ProductType = 5)
    const rollsByMachine = {};
    for (const line of rollLines) {
      const m = line.NoMesin;
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

    // Aggregate both rolls & co-products per machine for InfoCards summary
    const machineSummaryMap = {};
    for (const line of lines) {
      const m = line.NoMesin;
      if (!machineSummaryMap[m]) {
        machineSummaryMap[m] = {
          machine: m,
          rollCount: 0,
          rollLength: 0,
          coProductCount: 0,
          coProductLength: 0,
          coProductByStatus: {},
        };
      }
      const len = parseFloat(line.Length) || 0;
      if (Number(line.ProductType ?? 5) === 1) {
        const statusKey = String(line.InventStatus || 'BS').trim().toUpperCase();
        machineSummaryMap[m].coProductCount += 1;
        machineSummaryMap[m].coProductLength += len;
        machineSummaryMap[m].coProductByStatus[statusKey] =
          (machineSummaryMap[m].coProductByStatus[statusKey] || 0) + 1;
      } else {
        machineSummaryMap[m].rollCount += 1;
        machineSummaryMap[m].rollLength += len;
      }
    }

    const machineSummary = Object.values(machineSummaryMap).sort((a, b) => {
      const na = Number(a.machine);
      const nb = Number(b.machine);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      if (!Number.isNaN(na)) return -1;
      if (!Number.isNaN(nb)) return 1;
      return String(a.machine).localeCompare(String(b.machine), undefined, { numeric: true });
    });

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
      if (headerRow) {
        orderQty = parseFloat(headerRow.OrderQty) || 0;
        recidSalesId = (headerRow.RecidSalesId || '').trim();
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
             AND (l."isStock" IS FALSE OR l."isStock" IS NULL)
             AND ${ACTIVE_LINE_ALIASED_FILTER}`,
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
        totalRolls: rollLines.length,
        totalCoProducts: coProductLines.length,
        rollsByMachine,
        machineSummary,
        existingRollNumbers: rollLines.map((l) => l.RoolNumber),
        lines,
        orderQty,
        recidSalesId,
        accumulatedSalesLength,
        isOrderExceeded,
        remainingOrderQty,
        fetchedAt: new Date().toISOString(),
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

    const tableName = `autonicmachine_${machineId}`;
    if (!reading || !reading.Length) {
      const directRes = await client.query(
        `SELECT createdatetime, length FROM "${tableName}" ORDER BY length DESC LIMIT 1`
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

// ============================================================
// 5. COUNTING KAIN JOINED PIECES CRUD
// ============================================================

/**
 * GET /api/counting/joined-pieces/:prodId
 * Query params: ?roolNumber=...
 * Returns list of joined pieces for a production order or a specific roll
 */
router.get('/joined-pieces/:prodId', async (req, res) => {
  try {
    const { prodId } = req.params;
    const { roolNumber, rollNumber } = req.query;
    const targetRoll = parseInt(roolNumber || rollNumber || 0, 10);

    let query = `
      SELECT "ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber"
      FROM "CountingKainJoinedPiece"
      WHERE "ProdId" = $1 AND ${ACTIVE_LINE_FILTER}
    `;
    const params = [prodId];

    if (targetRoll > 0) {
      params.push(targetRoll);
      query += ` AND "RoolNumber" = $${params.length}`;
    }

    query += ' ORDER BY "RoolNumber" ASC, "LineNumber" ASC';

    const result = await pool.query(query, params);

    // Group joined pieces by RoolNumber for easy frontend consumption
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
    console.error('[Get Joined Pieces Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/counting/joined-pieces
 * Body: { ProdId, RoolNumber, pieces: [ { yard / LengthPoint } ] }
 * Replaces all joined pieces for the specified roll with the provided list (atomic transaction)
 */
router.post('/joined-pieces', async (req, res) => {
  const prodId = String(req.body.ProdId || req.body.prodId || '').trim();
  const roolNumber = parseInt(req.body.RoolNumber ?? req.body.roolNumber ?? req.body.rollNumber ?? 0, 10);
  const rawPieces = Array.isArray(req.body.pieces) ? req.body.pieces : [];

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

    // 1. Ambil seluruh joined pieces aktif saat ini untuk roll ini
    const existingRes = await client.query(
      `SELECT ctid, "ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber"
       FROM "CountingKainJoinedPiece"
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       ORDER BY "LineNumber" ASC
       FOR UPDATE`,
      [prodId, roolNumber]
    );

    const normalizedPieces = rawPieces.map((raw, i) => ({
      LengthPoint: parseFloat(raw.yard ?? raw.LengthPoint ?? raw.lengthPoint ?? 0),
      LineNumber: i + 1,
    }));

    const { matchedPairs, toSoftDelete } = matchChildRows(
      existingRes.rows,
      normalizedPieces,
      (ex, norm) => Math.abs((Number(ex.LengthPoint) || 0) - norm.LengthPoint) < 0.0001
    );

    // 2. Soft delete joined pieces yang dihapus user (DeletedAt = NOW(), isDeleted = true, IsExecuted = false)
    for (const row of toSoftDelete) {
      await client.query(
        `UPDATE "CountingKainJoinedPiece"
         SET "DeletedAt" = NOW(), "isDeleted" = true, "IsExecuted" = false
         WHERE ctid = $1`,
        [row.ctid]
      );
    }

    // 3. Pertahankan baris yang cocok (update LineNumber jika bergeser) & insert baris baru
    const savedRows = [];
    for (let i = 0; i < normalizedPieces.length; i++) {
      const piece = normalizedPieces[i];
      const matched = matchedPairs.get(i);
      if (matched) {
        if (Number(matched.LineNumber) !== piece.LineNumber) {
          const updRes = await client.query(
            `UPDATE "CountingKainJoinedPiece"
             SET "LineNumber" = $2
             WHERE ctid = $1
             RETURNING "ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber"`,
            [matched.ctid, piece.LineNumber]
          );
          savedRows.push(updRes.rows[0]);
        } else {
          const { ctid: _ctid, ...rest } = matched;
          savedRows.push(rest);
        }
      } else {
        const insRes = await client.query(
          `INSERT INTO "CountingKainJoinedPiece"
           ("ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber", "DeletedAt", "isDeleted")
           VALUES ($1, $2, $3, $4, $5, $6::timestamp, false)
           RETURNING "ProdId", "RoolNumber", "LengthPoint", "IsExecuted", "LineNumber"`,
          [prodId, roolNumber, piece.LengthPoint, false, piece.LineNumber, DEFAULT_DELETED_AT]
        );
        savedRows.push(insRes.rows[0]);
      }
    }

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Berhasil menyimpan ${savedRows.length} joined piece(s) untuk Roll #${roolNumber}.`,
      count: savedRows.length,
      data: savedRows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Save Joined Pieces Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

/**
 * DELETE /api/counting/joined-pieces/:prodId/:roolNumber
 * Delete all joined pieces for a specific roll
 */
router.delete('/joined-pieces/:prodId/:roolNumber', async (req, res) => {
  try {
    const { prodId, roolNumber } = req.params;
    const rollNum = parseInt(roolNumber, 10);

    const result = await pool.query(
      `UPDATE "CountingKainJoinedPiece"
       SET "DeletedAt" = NOW(), "isDeleted" = true, "IsExecuted" = false
       WHERE "ProdId" = $1 AND "RoolNumber" = $2 AND ${ACTIVE_LINE_FILTER}
       RETURNING "ProdId", "RoolNumber"`,
      [prodId, rollNum]
    );

    return res.status(200).json({
      success: true,
      message: `Deleted ${result.rows.length} joined piece(s) for Roll #${rollNum} of ProdId '${prodId}'.`,
      deletedCount: result.rows.length,
    });
  } catch (err) {
    console.error('[Delete Joined Pieces Error]:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

