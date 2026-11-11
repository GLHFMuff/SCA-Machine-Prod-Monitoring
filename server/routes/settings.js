import express from 'express';
import { authenticateKeyAndTouch } from '../middleware/auth.js';
import { getAppSettings, saveAppSettings, resolveActiveShift } from '../services/appSettings.js';

const router = express.Router();

/**
 * GET /api/settings
 * Mengambil pengaturan aplikasi dan shift aktif saat ini berdasarkan jam server.
 */
router.get('/', async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const now = new Date();
    const activeShift = resolveActiveShift(settings.shifts, now);

    return res.json({
      success: true,
      data: {
        settings,
        activeShift,
        serverNow: now.toISOString(),
      },
    });
  } catch (err) {
    console.error('[Get App Settings Error]:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal memuat pengaturan aplikasi.',
    });
  }
});

/**
 * PUT /api/settings
 * Menyimpan pengaturan aplikasi ke file JSON di server (khusus Administrator).
 */
router.put('/', authenticateKeyAndTouch, async (req, res) => {
  if (String(req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak: Hanya Administrator yang dapat mengubah pengaturan aplikasi.',
    });
  }

  try {
    const updated = await saveAppSettings(req.body || {});
    const now = new Date();
    const activeShift = resolveActiveShift(updated.shifts, now);

    return res.json({
      success: true,
      message: 'Pengaturan aplikasi berhasil disimpan.',
      data: {
        settings: updated,
        activeShift,
        serverNow: now.toISOString(),
      },
    });
  } catch (err) {
    console.error('[Save App Settings Error]:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'Gagal menyimpan pengaturan aplikasi.',
    });
  }
});

export default router;

