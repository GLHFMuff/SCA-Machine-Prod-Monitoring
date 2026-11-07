import { Router } from 'express';
import { listPrinters, printRollLabelDirect, generateRollLabelZpl } from '../services/printer.js';

const router = Router();

/**
 * GET /api/print/printers
 * List all available installed printers on the host machine
 */
router.get('/printers', async (req, res) => {
  try {
    const data = await listPrinters();
    return res.json(data);
  } catch (err) {
    console.error('[Print Router] Error listing printers:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal mendeteksi daftar printer: ' + (err.message || 'Unknown error'),
    });
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

