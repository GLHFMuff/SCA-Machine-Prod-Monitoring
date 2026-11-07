import { Router } from 'express';
import { pool } from '../config/db.js';
import { listPrinters, printRollLabelDirect, generateRollLabelZpl } from '../services/printer.js';

const router = Router();

/**
 * GET /api/print/printers
 * List all available installed printers on the host machine.
 * Optional query: ?machineId=1 -> also returns machinePrinter
 */
router.get('/printers', async (req, res) => {
  try {
    const data = await listPrinters();
    const machineId = req.query.machineId || req.query.machine_id;
    let machinePrinter = null;

    if (machineId) {
      const q = await pool.query(
        'SELECT printer_name, machine_num FROM machine_lists WHERE machine_id = $1 LIMIT 1',
        [machineId]
      );
      if (q.rows.length && q.rows[0].printer_name) {
        machinePrinter = q.rows[0].printer_name.trim();
      }
    }

    return res.json({
      ...data,
      machinePrinter,
    });
  } catch (err) {
    console.error('[Print Router] Error listing printers:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal mendeteksi daftar printer: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * GET /api/print/machine-printer/:machineId
 * Get printer assigned to a specific machine from machine_lists
 */
router.get('/machine-printer/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    const q = await pool.query(
      'SELECT machine_id, machine_num, printer_name FROM machine_lists WHERE machine_id = $1 LIMIT 1',
      [machineId]
    );
    if (!q.rows.length) {
      return res.status(404).json({ success: false, message: 'Mesin tidak ditemukan' });
    }
    const row = q.rows[0];
    return res.json({
      success: true,
      machineId: row.machine_id,
      machineNum: row.machine_num,
      printerName: row.printer_name ? row.printer_name.trim() : null,
    });
  } catch (err) {
    console.error('[Print Router] Error fetching machine printer:', err);
    return res.status(500).json({ success: false, message: 'Gagal membaca printer mesin.' });
  }
});

/**
 * POST /api/print/direct
 * Print directly to a specific printer without Windows print dialog
 */
router.post('/direct', async (req, res) => {
  try {
    const { printerName, labelData, rawZpl, imageBase64, ticketType } = req.body || {};

    if (!printerName) {
      return res.status(400).json({
        success: false,
        message: 'Parameter "printerName" wajib diisi.',
      });
    }

    if (!labelData && !rawZpl && !imageBase64) {
      return res.status(400).json({
        success: false,
        message: 'Data label/tiket (labelData, rawZpl, atau imageBase64) belum disediakan.',
      });
    }

    const result = await printRollLabelDirect({
      printerName,
      labelData,
      rawZpl,
      imageBase64,
      ticketType: ticketType || 'roll-label',
    });

    return res.json({
      success: true,
      data: result,
      message: result.message || `Cetak langsung ke "${printerName}" berhasil dikirim.`,
    });
  } catch (err) {
    console.error('[Print Router] Error printing directly:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal mencetak langsung: ' + (err.message || 'Unknown error'),
    });
  }
});

/**
 * POST /api/print/preview-zpl
 * Generate ZPL code from label data
 */
router.post('/preview-zpl', (req, res) => {
  try {
    const { labelData } = req.body || {};
    if (!labelData) {
      return res.status(400).json({
        success: false,
        message: 'labelData wajib diisi.',
      });
    }

    const zpl = generateRollLabelZpl(labelData);
    return res.json({
      success: true,
      zpl,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal menghasilkan ZPL.',
    });
  }
});

export default router;

