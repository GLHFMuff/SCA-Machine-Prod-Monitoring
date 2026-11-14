import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const SETTINGS_FILE_PATH = path.resolve(__dirname, '../data/app-settings.json');

export const DEFAULT_APP_SETTINGS = {
  session: {
    idleTimeoutMinutes: 120,
    idleWarningSeconds: 60,
    sessionExpiresDays: 30,
    applyIdleToAdmin: false,
  },
  shifts: [
    { id: 1, name: 'Shift 1', start: '07:00', end: '15:00' },
    { id: 2, name: 'Shift 2', start: '15:00', end: '23:00' },
    { id: 3, name: 'Shift 3', start: '23:00', end: '07:00' },
  ],
  autonic: {
    baseUrl: 'http://192.168.40.215:5678',
    getDataEndpoint: '/webhook/getdataautonic',
    flushDataEndpoint: '/webhook/deletedataautonic',
    bearerToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub21lc2luIjoiMSJ9.RbhwKIJJqRxD2uP_on5Ch3tJOoR2rLfrz45D_E0IR_0',
  },
  updatedAt: null,
};

let cachedSettings = null;
let writeQueue = Promise.resolve();

function cloneDefaultSettings() {
  return JSON.parse(JSON.stringify(DEFAULT_APP_SETTINGS));
}

export function isValidTimeHHMM(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

export function timeToMinutes(hhmm) {
  const [hh, mm] = String(hhmm).trim().split(':').map(Number);
  return hh * 60 + mm;
}

/**
 * Determine which shift is active at `now` based on server local time.
 * Supports overnight shifts where start > end (e.g. 23:00 - 07:00).
 */
export function resolveActiveShift(shifts = [], now = new Date()) {
  if (!Array.isArray(shifts) || shifts.length === 0) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (const shift of shifts) {
    if (!shift || !isValidTimeHHMM(shift.start) || !isValidTimeHHMM(shift.end)) continue;
    const startMins = timeToMinutes(shift.start);
    const endMins = timeToMinutes(shift.end);

    if (startMins < endMins) {
      if (nowMinutes >= startMins && nowMinutes < endMins) return shift;
    } else if (startMins > endMins) {
      if (nowMinutes >= startMins || nowMinutes < endMins) return shift;
    }
  }

  return null;
}

/**
 * Validate and normalize incoming settings while preserving any extra custom JSON fields.
 */
export function validateAndNormalizeSettings(rawInput = {}, existing = {}) {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    throw new Error('Format pengaturan harus berupa objek JSON.');
  }

  const defaults = cloneDefaultSettings();
  const baseSession = existing?.session && typeof existing.session === 'object' ? existing.session : {};
  const inputSession = rawInput.session && typeof rawInput.session === 'object' ? rawInput.session : {};

  const rawIdleMinutes = inputSession.idleTimeoutMinutes ?? baseSession.idleTimeoutMinutes ?? defaults.session.idleTimeoutMinutes;
  const idleTimeoutMinutes = Number(rawIdleMinutes);
  if (!Number.isFinite(idleTimeoutMinutes) || !Number.isInteger(idleTimeoutMinutes) || idleTimeoutMinutes < 0 || idleTimeoutMinutes > 10080) {
    throw new Error('Batas tidak aktif (idleTimeoutMinutes) harus berupa bilangan bulat antara 0 dan 10080 menit.');
  }

  const rawWarningSeconds = inputSession.idleWarningSeconds ?? baseSession.idleWarningSeconds ?? defaults.session.idleWarningSeconds;
  const idleWarningSeconds = Number(rawWarningSeconds);
  if (!Number.isFinite(idleWarningSeconds) || !Number.isInteger(idleWarningSeconds) || idleWarningSeconds < 0 || idleWarningSeconds > 600) {
    throw new Error('Waktu peringatan logout (idleWarningSeconds) harus berupa bilangan bulat antara 0 dan 600 detik.');
  }

  const rawExpiresDays = inputSession.sessionExpiresDays ?? baseSession.sessionExpiresDays ?? defaults.session.sessionExpiresDays;
  const sessionExpiresDays = Number(rawExpiresDays);
  if (!Number.isFinite(sessionExpiresDays) || !Number.isInteger(sessionExpiresDays) || sessionExpiresDays < 1 || sessionExpiresDays > 3650) {
    throw new Error('Masa berlaku maksimal token (sessionExpiresDays) harus antara 1 dan 3650 hari.');
  }

  const applyIdleToAdmin = inputSession.applyIdleToAdmin !== undefined
    ? Boolean(inputSession.applyIdleToAdmin)
    : Boolean(baseSession.applyIdleToAdmin ?? defaults.session.applyIdleToAdmin);

  const rawShifts = Array.isArray(rawInput.shifts)
    ? rawInput.shifts
    : (Array.isArray(existing.shifts) ? existing.shifts : defaults.shifts);

  if (!Array.isArray(rawShifts) || rawShifts.length === 0) {
    throw new Error('Minimal harus ada 1 jadwal shift.');
  }

  const seenIds = new Set();
  const normalizedShifts = rawShifts.map((item, idx) => {
    const id = Number(item?.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`ID shift pada baris #${idx + 1} harus berupa angka bulat positif.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`ID shift #${id} duplikat. Setiap shift harus memiliki ID unik.`);
    }
    seenIds.add(id);

    const name = String(item?.name || '').trim();
    if (!name) {
      throw new Error(`Nama shift untuk ID #${id} tidak boleh kosong.`);
    }

    const start = String(item?.start || '').trim();
    const end = String(item?.end || '').trim();
    if (!isValidTimeHHMM(start) || !isValidTimeHHMM(end)) {
      throw new Error(`Jam mulai & selesai untuk '${name}' harus memakai format HH:mm (contoh 07:00).`);
    }
    if (start === end) {
      throw new Error(`Jam mulai dan jam selesai untuk '${name}' tidak boleh sama.`);
    }

    return {
      ...item,
      id,
      name,
      start,
      end,
    };
  });

  // Preserve extra top-level and session keys so JSON remains extensible without DB migrations.
  const baseAutonic = existing?.autonic && typeof existing.autonic === 'object' ? existing.autonic : {};
  const inputAutonic = rawInput.autonic && typeof rawInput.autonic === 'object' ? rawInput.autonic : {};

  const rawBaseUrl = inputAutonic.baseUrl ?? baseAutonic.baseUrl ?? defaults.autonic.baseUrl;
  const rawGetDataEp = inputAutonic.getDataEndpoint ?? baseAutonic.getDataEndpoint ?? defaults.autonic.getDataEndpoint;
  const rawFlushDataEp = inputAutonic.flushDataEndpoint ?? baseAutonic.flushDataEndpoint ?? defaults.autonic.flushDataEndpoint;
  const rawToken = inputAutonic.bearerToken ?? baseAutonic.bearerToken ?? defaults.autonic.bearerToken;

  const baseUrl = String(rawBaseUrl || '').trim().replace(/\/+$/, '');
  const getDataEndpoint = String(rawGetDataEp || '').trim();
  const flushDataEndpoint = String(rawFlushDataEp || '').trim();
  const bearerToken = String(rawToken || '').trim();

  const normalizedGetDataEndpoint = getDataEndpoint
    ? (getDataEndpoint.startsWith('/') ? getDataEndpoint : `/${getDataEndpoint}`)
    : '';
  const normalizedFlushDataEndpoint = flushDataEndpoint
    ? (flushDataEndpoint.startsWith('/') ? flushDataEndpoint : `/${flushDataEndpoint}`)
    : '';

  const merged = {
    ...existing,
    ...rawInput,
    session: {
      ...baseSession,
      ...inputSession,
      idleTimeoutMinutes,
      idleWarningSeconds,
      sessionExpiresDays,
      applyIdleToAdmin,
    },
    shifts: normalizedShifts,
    autonic: {
      baseUrl,
      getDataEndpoint: normalizedGetDataEndpoint,
      flushDataEndpoint: normalizedFlushDataEndpoint,
      bearerToken,
    },
  };

  return merged;
}

async function readSettingsFromDisk() {
  try {
    const rawText = await fs.readFile(SETTINGS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(rawText);
    return validateAndNormalizeSettings(parsed, cloneDefaultSettings());
  } catch (err) {
    if (err.code === 'ENOENT') {
      return cloneDefaultSettings();
    }
    console.warn('[AppSettings] Gagal membaca/memvalidasi file setting, memakai default:', err.message);
    return cloneDefaultSettings();
  }
}

async function writeSettingsAtomically(data) {
  const dir = path.dirname(SETTINGS_FILE_PATH);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = `${SETTINGS_FILE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, SETTINGS_FILE_PATH);
}

/**
 * Get current app settings (cached in memory after first read).
 */
export async function getAppSettings() {
  if (cachedSettings) {
    return cachedSettings;
  }
  const loaded = await readSettingsFromDisk();
  cachedSettings = loaded;
  return loaded;
}

/**
 * Validate, persist to JSON file atomically, and update in-memory cache.
 */
export async function saveAppSettings(rawInput) {
  const runWrite = async () => {
    const current = await getAppSettings();
    const normalized = validateAndNormalizeSettings(rawInput, current);
    normalized.updatedAt = new Date().toISOString();
    await writeSettingsAtomically(normalized);
    cachedSettings = normalized;
    return normalized;
  };

  const pending = writeQueue.then(runWrite, runWrite);
  writeQueue = pending.catch(() => {});
  return pending;
}

