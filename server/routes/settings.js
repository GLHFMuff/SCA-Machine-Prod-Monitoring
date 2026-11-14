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

/**
 * POST /api/settings/test-autonic
 * Menguji koneksi ke endpoint webhook Autonic sebelum disimpan (khusus Administrator).
 */
router.post('/test-autonic', authenticateKeyAndTouch, async (req, res) => {
  if (String(req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Akses ditolak: Hanya Administrator yang dapat menguji koneksi webhook.',
    });
  }

  const { baseUrl, getDataEndpoint, bearerToken, machineId = 1 } = req.body || {};
  const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
  const ep = String(getDataEndpoint || '/webhook/getdataautonic').trim();
  const cleanEp = ep.startsWith('/') ? ep : `/${ep}`;
  const targetUrl = `${cleanBase}${cleanEp}`;

  if (!cleanBase) {
    return res.status(400).json({
      success: false,
      message: 'Base URL Webhook tidak boleh kosong.',
    });
  }

  const startMs = Date.now();
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = String(bearerToken || '').trim();
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    const testRes = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ nomesin: Number(machineId) || 1 }),
      signal: AbortSignal.timeout(8000),
    });

    const elapsedMs = Date.now() - startMs;
    const resText = await testRes.text();
    let parsedBody = null;
    try {
      parsedBody = JSON.parse(resText);
    } catch {
      parsedBody = resText;
    }

    if (!testRes.ok) {
      return res.status(testRes.status).json({
        success: false,
        message: `Koneksi gagal: HTTP ${testRes.status} ${testRes.statusText} (${elapsedMs}ms)`,
        data: parsedBody,
        status: testRes.status,
        elapsedMs,
      });
    }

    return res.json({
      success: true,
      message: `✓ Terhubung ke Webhook (${testRes.status} OK) dalam ${elapsedMs}ms!`,
      data: parsedBody,
      status: testRes.status,
      elapsedMs,
    });
  } catch (err) {
    const elapsedMs = Date.now() - startMs;
    const isTimeout = err.name === 'TimeoutError' || String(err.message || '').includes('timeout');
    return res.status(504).json({
      success: false,
      message: isTimeout
        ? `Request timed out setelah 8 detik ke ${targetUrl}. Pastikan server/IP aktif & port terbuka.`
        : `Gagal menghubungi endpoint: ${err.message}`,
      elapsedMs,
    });
  }
});

export default router;

