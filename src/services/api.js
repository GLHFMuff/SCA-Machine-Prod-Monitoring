/**
 * API Service for Machine Production Monitoring
 */

// Use relative path for Vite proxy, or fallback to backend port 5000 if needed
const API_BASE = import.meta.env.VITE_API_URL || '';

export const SESSION_ACTIVITY_EVENT = 'mpm:activity';

export function emitUserActivity() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_ACTIVITY_EVENT));
  }
}

export function clearOperatorOrderSnapshots() {
  if (typeof window === 'undefined') return;
  for (const storage of [localStorage, sessionStorage]) {
    const staleKeys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith('mpm_active_order_') || key?.startsWith('pending_defects_')) {
        staleKeys.push(key);
      }
    }
    staleKeys.forEach((key) => storage.removeItem(key));
  }
}

/**
 * Format backend user payload to match frontend UI component props
 * (AppHeader, InfoCards, ScanIdle expect user.name, user.machine, user.machineType)
 */
export function formatUser(rawUser, sessionKey = '') {
  if (!rawUser) return null;

  return {
    ...rawUser,
    id: rawUser.id,
    username: rawUser.username,
    name: rawUser.full_name || rawUser.username,
    email: rawUser.email,
    machineId: rawUser.machine_id,
    machine: rawUser.machine_num || `Mesin ${rawUser.machine_id}`,
    machineType: `Loom Machine #${rawUser.machine_id}`,
    role: rawUser.role,
    sessionKey: sessionKey,
    printerName: rawUser.printer_name || rawUser.printerName || '',
  };
}

/**
 * Perform login to backend API
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<object>} { success, user, key, message }
 */
export async function getMachinesApi() {
  const res = await fetch(`${API_BASE}/api/auth/machines`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.message || 'Gagal memuat daftar mesin.');
  return data.data || [];
}

export async function loginApi(username, password, machineId) {
  const url = `${API_BASE}/api/auth/login`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim(),
        password: password,
        machine_id: machineId,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const errorMsg = data?.message || data?.error || `Login gagal (Status ${res.status})`;
      throw new Error(errorMsg);
    }

    const { key, user, expires_at, last_used_at } = data.data;
    const formattedUser = formatUser(user, key);

    // Save session in localStorage
    localStorage.setItem('mpm_session_key', key);
    localStorage.setItem('mpm_user', JSON.stringify(formattedUser));
    localStorage.setItem('mpm_last_activity_at', String(Date.now()));

    return {
      success: true,
      user: formattedUser,
      key: key,
      session: {
        expires_at,
        last_used_at,
      },
    };
  } catch (err) {
    // If backend is unreachable
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Tidak dapat terhubung ke server backend API (Port 5000). Pastikan backend aktif.');
    }
    throw err;
  }
}

/**
 * Validate active session key with backend (returns status details so callers can detect 401 idle/revoked)
 * @param {string} sessionKey
 * @returns {Promise<{ status: 'valid'|'unauthorized'|'offline'|'none', user?: object|null, session?: object, reason?: string, code?: string }>}
 */
export async function checkSessionDetailedApi(sessionKey) {
  if (!sessionKey) return { status: 'none', user: null };

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${sessionKey}`,
      },
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      // Only discard the cached login for an explicitly invalid/expired/idle token.
      if (res.status === 401 || res.status === 403) {
        clearStoredSession();
        return {
          status: 'unauthorized',
          user: null,
          code: data?.code || 'SESSION_INVALID',
          reason: data?.message || 'Sesi berakhir atau tidak valid.',
        };
      }
      throw new Error(`Session check failed (${res.status})`);
    }

    if (data?.success && data?.data?.user) {
      const cachedUser = JSON.parse(localStorage.getItem('mpm_user') || 'null');
      const user = {
        ...formatUser(data.data.user, sessionKey),
        // Machine choice and shift are session selections, not returned by /me.
        machineId: cachedUser?.machineId || data.data.user.machine_id,
        shift: cachedUser?.shift,
      };
      localStorage.setItem('mpm_user', JSON.stringify(user));
      return {
        status: 'valid',
        user,
        session: data.data.session || null,
      };
    }
    return { status: 'none', user: null };
  } catch (error) {
    // Keep local login and machine assignment intact on temporary API/server failures.
    const stored = getStoredSession();
    if (stored?.key === sessionKey) {
      console.warn('[Session Restore Warning]: using cached session:', error.message);
      return { status: 'offline', user: stored.user };
    }
    console.error('[Session Restore Error]:', error.message);
    return { status: 'none', user: null };
  }
}

/**
 * Validate active session key with backend
 * @param {string} sessionKey
 * @returns {Promise<object>} formatted user object
 */
export async function checkSessionApi(sessionKey) {
  const result = await checkSessionDetailedApi(sessionKey);
  return result.user || null;
}

/**
 * Send active heartbeat so backend updates user_sessions.last_used_at
 * @param {string} sessionKey
 */
export async function sendHeartbeatApi(sessionKey) {
  if (!sessionKey) return { status: 'none' };

  try {
    const res = await fetch(`${API_BASE}/api/auth/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionKey}`,
      },
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return {
          status: 'unauthorized',
          code: data?.code || 'SESSION_INVALID',
          reason: data?.message || 'Sesi berakhir atau tidak valid.',
        };
      }
      return { status: 'offline' };
    }

    return {
      status: 'valid',
      session: data?.data?.session || null,
    };
  } catch {
    return { status: 'offline' };
  }
}

/**
 * Logout and invalidate session in backend
 * @param {string} sessionKey
 */
export async function logoutApi(sessionKey) {
  let logoutSucceeded = false;
  try {
    if (sessionKey) {
      const res = await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionKey}`,
        },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || `Logout server gagal (Status ${res.status})`);
      }
      logoutSucceeded = true;
    }
  } catch (err) {
    console.error('Logout API call failed; machine may remain occupied:', err);
  } finally {
    clearStoredSession();
  }
  return logoutSucceeded;
}

/**
 * Clear session from localStorage
 */
export function clearStoredSession() {
  localStorage.removeItem('mpm_session_key');
  localStorage.removeItem('mpm_user');
  localStorage.removeItem('mpm_last_activity_at');
  sessionStorage.removeItem('mpm_login_session');
  clearOperatorOrderSnapshots();
}

export function clearStoredAdminSession() {
  localStorage.removeItem('mpm_admin_session_key');
  localStorage.removeItem('mpm_admin_user');
  localStorage.removeItem('mpm_admin_last_activity_at');
}

export function getStoredAdminSession() {
  const key = localStorage.getItem('mpm_admin_session_key');
  const userJson = localStorage.getItem('mpm_admin_user');

  if (!key || !userJson) return null;

  try {
    const user = JSON.parse(userJson);
    return { key, user };
  } catch {
    clearStoredAdminSession();
    return null;
  }
}

/**
 * Login khusus administrator untuk URL /admin (tanpa pilih mesin atau shift)
 */
export async function adminLoginApi(username, password) {
  const url = `${API_BASE}/api/auth/admin-login`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: username.trim(),
        password: password,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const errorMsg = data?.message || data?.error || `Login admin gagal (Status ${res.status})`;
      throw new Error(errorMsg);
    }

    const { key, user } = data.data;
    const formattedUser = {
      ...user,
      id: user.id,
      username: user.username,
      name: user.full_name || user.username,
      email: user.email,
      role: user.role,
      sessionKey: key,
    };

    localStorage.setItem('mpm_admin_session_key', key);
    localStorage.setItem('mpm_admin_user', JSON.stringify(formattedUser));
    localStorage.setItem('mpm_admin_last_activity_at', String(Date.now()));

    return {
      success: true,
      user: formattedUser,
      key: key,
    };
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Tidak dapat terhubung ke server backend API (Port 5000). Pastikan backend aktif.');
    }
    throw err;
  }
}

/**
 * Validasi session key admin dengan backend (detail status)
 */
export async function checkAdminSessionDetailedApi(sessionKey) {
  if (!sessionKey) return { status: 'none', user: null };

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${sessionKey}`,
      },
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        clearStoredAdminSession();
        return {
          status: 'unauthorized',
          user: null,
          code: data?.code || 'SESSION_INVALID',
          reason: data?.message || 'Sesi Administrator berakhir atau tidak valid.',
        };
      }
      throw new Error(`Session check failed (${res.status})`);
    }

    if (data?.success && data?.data?.user) {
      const rawUser = data.data.user;
      if (String(rawUser.role || '').toLowerCase() !== 'admin') {
        clearStoredAdminSession();
        return { status: 'unauthorized', user: null, reason: 'Akun bukan Administrator.' };
      }
      const user = {
        ...rawUser,
        name: rawUser.full_name || rawUser.username,
        sessionKey,
      };
      localStorage.setItem('mpm_admin_user', JSON.stringify(user));
      return {
        status: 'valid',
        user,
        session: data.data.session || null,
      };
    }
    return { status: 'none', user: null };
  } catch (error) {
    const stored = getStoredAdminSession();
    if (stored?.key === sessionKey && String(stored?.user?.role || '').toLowerCase() === 'admin') {
      return { status: 'offline', user: stored.user };
    }
    return { status: 'none', user: null };
  }
}

/**
 * Validasi session key admin dengan backend
 */
export async function checkAdminSessionApi(sessionKey) {
  const res = await checkAdminSessionDetailedApi(sessionKey);
  return res.user || null;
}

/**
 * Ambil pengaturan aplikasi (jam shift & rule session)
 * @returns {Promise<{ settings: object, activeShift: object|null, serverNow: string }>}
 */
export async function getAppSettingsApi() {
  const url = `${API_BASE}/api/settings`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal memuat pengaturan aplikasi.');
  }
  return data.data;
}

/**
 * Simpan pengaturan aplikasi ke server (khusus Administrator)
 * @param {object} settingsPayload
 * @param {string} [sessionKey]
 */
export async function saveAppSettingsApi(settingsPayload, sessionKey = '') {
  const token = sessionKey || localStorage.getItem('mpm_admin_session_key') || '';
  const url = `${API_BASE}/api/settings`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(settingsPayload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `Gagal menyimpan pengaturan (Status ${res.status}).`);
  }
  return {
    ...data.data,
    message: data.message,
  };
}

/**
 * Logout admin session
 */
export async function adminLogoutApi(sessionKey) {
  try {
    if (sessionKey) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionKey}`,
        },
      });
    }
  } catch (err) {
    console.warn('[Admin Logout API Error]:', err);
  } finally {
    clearStoredAdminSession();
  }
}


/**
 * Read cached session from localStorage
 */
export function getStoredSession() {
  const key = localStorage.getItem('mpm_session_key');
  const userJson = localStorage.getItem('mpm_user');

  if (!key || !userJson) return null;

  try {
    const user = JSON.parse(userJson);
    return { key, user };
  } catch {
    clearStoredSession();
    return null;
  }
}

/**
 * Save / Upsert CountingKainHeader specifically
 * @param {object} payload - { ProdId, NoMesin, UserId }
 * @returns {Promise<object>}
 */
export async function saveCountingHeader(payload) {
  emitUserActivity();
  const url = `${API_BASE}/api/counting/headers`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const errorMsg = data?.message || data?.error || `Gagal menyimpan header (Status ${res.status})`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Tidak dapat terhubung ke server backend API (Port 5000). Pastikan server backend aktif.');
    }
    throw err;
  }
}

/**
 * Save / Upsert CountingKainHeader and CountingKainLines
 * @param {object} payload - { ProdId, NoMesin, UserId, lines: [...] }
 * @returns {Promise<object>}
 */
export async function saveCountingData(payload) {
  emitUserActivity();
  const url = `${API_BASE}/api/counting/upsert`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const errorMsg = data?.message || data?.error || `Gagal menyimpan data (Status ${res.status})`;
      const error = new Error(errorMsg);
      error.status = res.status;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Tidak dapat terhubung ke server backend API (Port 5000). Pastikan server backend aktif.');
    }
    throw err;
  }
}

/**
 * Get CountingKainHeader by ProdId including its lines (optionally filtered by machineId)
 * @param {string} prodId 
 * @param {string|number} [machineId]
 * @returns {Promise<object>}
 */
export async function getCountingData(prodId, machineId = '') {
  if (!prodId) return null;
  const param = machineId ? `?noMesin=${encodeURIComponent(String(machineId).trim())}` : '';
  const url = `${API_BASE}/api/counting/headers/${encodeURIComponent(prodId.trim())}${param}`;

  try {
    const res = await fetch(url);

    if (res.status === 404) {
      // Data does not exist in database yet (New record)
      return null;
    }

    const data = await res.json().catch(() => null);

    if (res.ok && data?.success && data?.data) {
      return data.data;
    }

    return null;
  } catch (err) {
    console.warn(`[getCountingData] Error fetching ProdId '${prodId}':`, err.message);
    return null;
  }
}

/**
 * Mark a roll line as printed (isPrinted = true) in the database
 * @param {string} prodId
 * @param {number} roolNumber
 * @returns {Promise<object>}
 */
export async function markRollTicketPrinted(prodId, roolNumber) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/lines/${encodeURIComponent(prodId.trim())}/${roolNumber}/print`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal memperbarui status cetak');
    }
    return data;
  } catch (err) {
    console.error(`[markRollTicketPrinted] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Get next roll number information & per-machine roll counts for an OP
 * @param {string} prodId
 * @param {string|number} [machineId]
 * @returns {Promise<object>}
 */
export async function getNextRollInfo(prodId, machineId = '') {
  if (!prodId) return null;
  const param = machineId ? `?noMesin=${encodeURIComponent(String(machineId).trim())}` : '';
  const url = `${API_BASE}/api/counting/next-roll/${encodeURIComponent(prodId.trim())}${param}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success && data?.data) {
      return data.data;
    }
    return null;
  } catch (err) {
    console.warn(`[getNextRollInfo] Error fetching for '${prodId}':`, err.message);
    return null;
  }
}

/**
 * Delete a single roll line from CountingKainLines in the database
 * @param {string} prodId
 * @param {number} roolNumber
 * @returns {Promise<object>}
 */
export async function deleteRollApi(prodId, roolNumber) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/lines/${encodeURIComponent(prodId.trim())}/${roolNumber}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      const error = new Error(data?.message || data?.error || 'Gagal menghapus roll');
      error.status = res.status;
      throw error;
    }
    return data;
  } catch (err) {
    console.error(`[deleteRollApi] Error deleting ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Update single roll line in CountingKainLines (length, bsQty, etc.)
 * Catatan: Jika isExecute = true, server akan mereset menjadi false.
 * @param {string} prodId
 * @param {number} roolNumber
 * @param {object} payload { length, bsQty, description, noMesin, isPrinted, isExecute }
 * @returns {Promise<object>}
 */
export async function updateRollLineApi(prodId, roolNumber, payload) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/lines/${encodeURIComponent(prodId.trim())}/${roolNumber}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal mengupdate roll');
    }
    return data;
  } catch (err) {
    console.error(`[updateRollLineApi] Error updating ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Pull machine data and automatically delete the record from PostgreSQL database
 * @param {number|string} machineId
 * @returns {Promise<{ Length: number, DateTimeCreated: string }>}
 */
export async function pullAndClearMachineData(machineId) {
  emitUserActivity();
  const url = `${API_BASE}/api/counting/autonic/get-and-delete`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        machineId: Number(machineId) || 1,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menarik data mesin dari server');
    }
    return data.data;
  } catch (err) {
    console.error('[pullAndClearMachineData] Error:', err);
    throw err;
  }
}

/**
 * Save / replace defects for a specific roll in CountingKainDefect
 * @param {string} prodId
 * @param {number} roolNumber
 * @param {Array<{ yard: number, code: string }>} defects
 * @returns {Promise<object>}
 */
export async function saveRollDefectsApi(prodId, roolNumber, defects = []) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/defects`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ProdId: String(prodId).trim(),
        RoolNumber: parseInt(roolNumber, 10),
        defects: defects.map((d, index) => ({
          yard: parseFloat(d.yard) || 0,
          code: d.code || '',
          lineNumber: index + 1,
          yardTo: parseFloat(d.yardTo) || 0,
        })),
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menyimpan catatan inspeksi');
    }
    return data;
  } catch (err) {
    console.error(`[saveRollDefectsApi] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Get defects for a production order or roll from CountingKainDefect
 * @param {string} prodId
 * @param {number} [roolNumber]
 * @returns {Promise<object>}
 */
export async function getRollDefectsApi(prodId, roolNumber) {
  if (!prodId) return null;
  const param = roolNumber ? `?roolNumber=${encodeURIComponent(roolNumber)}` : '';
  const url = `${API_BASE}/api/counting/defects/${encodeURIComponent(String(prodId).trim())}${param}`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn(`[getRollDefectsApi] Error for ${prodId}:`, err);
    return null;
  }
}

/**
 * Get aggregated OP defect report data (header, all lines across machines,
 * CountingKainDefect enriched with DefectCode, and joined pieces).
 * Falls back gracefully to existing endpoints if the report endpoint is unavailable.
 * @param {string} prodId
 * @returns {Promise<{ header: object, lines: Array, defects: Array, joinedPieces: Array }>}
 */
export async function getDefectReportDataApi(prodId) {
  const cleanProdId = String(prodId || '').trim();
  if (!cleanProdId) {
    throw new Error('Nomor OP (ProdId) tidak tersedia.');
  }

  const reportUrl = `${API_BASE}/api/counting/defect-report/${encodeURIComponent(cleanProdId)}`;
  try {
    const res = await fetch(reportUrl);
    const payload = await res.json().catch(() => null);
    if (res.ok && payload?.success && payload?.data) {
      return payload.data;
    }
    // Only throw if server responded with a real error other than missing route
    if (res.status !== 404 || payload?.message?.includes('tidak ditemukan')) {
      if (res.status >= 500) {
        throw new Error(payload?.message || payload?.error || 'Gagal mengambil data laporan inspeksi.');
      }
    }
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Tidak dapat terhubung ke server backend API. Pastikan server aktif.');
    }
    throw err;
  }

  // Fallback path using existing counting + defect-code endpoints
  const [countingData, defectRes, defectCodeRes] = await Promise.all([
    getCountingData(cleanProdId),
    getRollDefectsApi(cleanProdId),
    getDefectCodeList().catch(() => ({ data: [] })),
  ]);

  const masterMap = new Map();
  for (const dc of defectCodeRes?.data || []) {
    if (dc?.Code) {
      masterMap.set(String(dc.Code).trim().toUpperCase(), dc.Defect || '');
    }
  }

  const rawDefects = countingData?.defects || defectRes?.data || [];
  const enrichedDefects = rawDefects.map((d) => {
    const codeKey = String(d.Code || '').trim().toUpperCase();
    return {
      ...d,
      MasterDefect: d.MasterDefect || masterMap.get(codeKey) || '',
    };
  });

  return {
    header: countingData
      ? {
          ProdId: countingData.ProdId || cleanProdId,
          NoMesin: countingData.NoMesin || '',
          UserId: countingData.UserId || '',
          SeqmentNum: countingData.SeqmentNum || '',
          CustCode: countingData.CustCode || '',
          DesignCode: countingData.DesignCode || '',
          Color: countingData.Color || '',
          OrderQty: countingData.OrderQty || 0,
          StockQty: countingData.StockQty || 0,
          K3LNumber: countingData.K3LNumber || '',
          K3LName: countingData.K3LName || '',
        }
      : { ProdId: cleanProdId },
    lines: countingData?.allLines || countingData?.lines || [],
    defects: enrichedDefects,
    joinedPieces: countingData?.joinedPieces || [],
  };
}

/**
 * Delete defects for a specific roll from CountingKainDefect
 * @param {string} prodId
 * @param {number} roolNumber
 * @returns {Promise<object>}
 */
export async function deleteRollDefectsApi(prodId, roolNumber) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/defects/${encodeURIComponent(String(prodId).trim())}/${encodeURIComponent(roolNumber)}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menghapus inspeksi roll');
    }
    return data;
  } catch (err) {
    console.error(`[deleteRollDefectsApi] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Update status isStock = true / false untuk roll tertentu
 * Format QrNum tetap konsisten (QR.S...)
 * @param {string} prodId
 * @param {number} roolNumber
 * @param {boolean} isStock
 * @returns {Promise<object>}
 */
export async function updateRollStockApi(prodId, roolNumber, isStock) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/lines/${encodeURIComponent(String(prodId).trim())}/${encodeURIComponent(roolNumber)}/stock`;

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isStock: Boolean(isStock) }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal memperbarui status stock roll');
    }
    return data;
  } catch (err) {
    console.error(`[updateRollStockApi] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Save / replace joined pieces for a specific roll in CountingKainJoinedPieces
 * @param {string} prodId
 * @param {number} roolNumber
 * @param {Array<{ yard: number }>} pieces
 * @returns {Promise<object>}
 */
export async function saveJoinedPiecesApi(prodId, roolNumber, pieces = []) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/joined-pieces`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ProdId: String(prodId).trim(),
        RoolNumber: parseInt(roolNumber, 10),
        pieces: pieces.map((p, index) => ({
          yard: parseFloat(p.yard) || 0,
          lineNumber: index + 1,
        })),
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menyimpan joined pieces');
    }
    return data;
  } catch (err) {
    console.error(`[saveJoinedPiecesApi] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Get joined pieces for a production order or roll from CountingKainJoinedPieces
 * @param {string} prodId
 * @param {number} [roolNumber]
 * @returns {Promise<object>}
 */
export async function getJoinedPiecesApi(prodId, roolNumber) {
  if (!prodId) return null;
  const param = roolNumber ? `?roolNumber=${encodeURIComponent(roolNumber)}` : '';
  const url = `${API_BASE}/api/counting/joined-pieces/${encodeURIComponent(String(prodId).trim())}${param}`;

  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (res.ok && data?.success) {
      return data;
    }
    return null;
  } catch (err) {
    console.warn(`[getJoinedPiecesApi] Error for ${prodId}:`, err);
    return null;
  }
}

/**
 * Delete joined pieces for a specific roll from CountingKainJoinedPieces
 * @param {string} prodId
 * @param {number} roolNumber
 * @returns {Promise<object>}
 */
export async function deleteJoinedPiecesApi(prodId, roolNumber) {
  if (!prodId || !roolNumber) return null;
  emitUserActivity();
  const url = `${API_BASE}/api/counting/joined-pieces/${encodeURIComponent(String(prodId).trim())}/${encodeURIComponent(roolNumber)}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menghapus joined pieces roll');
    }
    return data;
  } catch (err) {
    console.error(`[deleteJoinedPiecesApi] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

// ============================================================
// INVENTORY STATUS
// ============================================================

/**
 * Ambil daftar Inventory Status dari tabel master InventoryStatus.
 * @param {object} [params]
 * @param {string} [params.search]    - Pencarian partial pada StatusId / Name (case-insensitive)
 * @param {string} [params.statusId]  - Filter exact match StatusId
 * @param {number} [params.limit]     - Jumlah baris (default 500, maks 1000)
 * @param {number} [params.offset]    - Offset pagination (default 0)
 * @returns {Promise<{ count: number, total: number, limit: number, offset: number, data: Array<{ StatusId: string, Name: string }> }>}
 */
export async function getInventoryStatusList({ search, statusId, limit, offset } = {}) {
  const url = new URL(`${API_BASE}/api/inventory-status`, window.location.origin);
  if (search)   url.searchParams.set('search',   search);
  if (statusId) url.searchParams.set('StatusId', statusId);
  if (limit)    url.searchParams.set('limit',    limit);
  if (offset)   url.searchParams.set('offset',   offset);

  try {
    const res  = await fetch(url.toString());
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal mengambil data Inventory Status');
    }
    return data;
  } catch (err) {
    console.error('[getInventoryStatusList] Error:', err);
    throw err;
  }
}

/**
 * Ambil satu Inventory Status berdasarkan StatusId.
 * @param {string} statusId
 * @returns {Promise<{ StatusId: string, Name: string }>}
 */
export async function getInventoryStatusById(statusId) {
  if (!statusId) throw new Error('statusId wajib diisi');

  const url = `${API_BASE}/api/inventory-status/${encodeURIComponent(statusId)}`;
  try {
    const res  = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || `InventoryStatus '${statusId}' tidak ditemukan`);
    }
    return data.data;
  } catch (err) {
    console.error(`[getInventoryStatusById] Error for '${statusId}':`, err);
    throw err;
  }
}

// ============================================================
// DEFECT CODE
// ============================================================

/**
 * Ambil daftar Defect Code dari tabel master DefectCode.
 * @param {object} [params]
 * @param {string} [params.search]  - Pencarian partial pada Code / Defect (case-insensitive)
 * @param {string} [params.code]    - Filter exact match Code
 * @param {number} [params.limit]   - Jumlah baris (default 500, maks 1000)
 * @param {number} [params.offset]  - Offset pagination (default 0)
 * @returns {Promise<{ count: number, total: number, limit: number, offset: number, data: Array<{ Code: string, Defect: string }> }>}
 */
export async function getDefectCodeList({ search, code, limit, offset } = {}) {
  const url = new URL(`${API_BASE}/api/defect-code`, window.location.origin);
  if (search) url.searchParams.set('search', search);
  if (code)   url.searchParams.set('code',   code);
  if (limit)  url.searchParams.set('limit',  limit);
  if (offset) url.searchParams.set('offset', offset);

  try {
    const res  = await fetch(url.toString());
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal mengambil data Defect Code');
    }
    return data;
  } catch (err) {
    console.error('[getDefectCodeList] Error:', err);
    throw err;
  }
}

/**
 * Ambil satu Defect Code berdasarkan Code.
 * @param {string} code
 * @returns {Promise<{ Code: string, Defect: string }>}
 */
export async function getDefectCodeById(code) {
  if (!code) throw new Error('code wajib diisi');

  const url = `${API_BASE}/api/defect-code/${encodeURIComponent(code)}`;
  try {
    const res  = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || `DefectCode '${code}' tidak ditemukan`);
    }
    return data.data;
  } catch (err) {
    console.error(`[getDefectCodeById] Error for '${code}':`, err);
    throw err;
  }
}

/**
 * Ambil daftar printer yang terpasang di sistem untuk cetak langsung
 * @param {string|number} [machineId] - Opsional ID mesin untuk mengambil printer spesifik mesin
 * @returns {Promise<{ printers: Array, defaultPrinter: string, zebraPrinter: string, machinePrinter?: string }>}
 */
export async function getAvailablePrintersApi(machineId = null) {
  const url = new URL(`${API_BASE}/api/print/printers`, window.location.origin);
  if (machineId) {
    url.searchParams.set('machineId', String(machineId));
  }
  try {
    const res = await fetch(url.toString());
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || 'Gagal mendeteksi daftar printer');
    }
    return data;
  } catch (err) {
    console.error('[getAvailablePrintersApi] Error:', err);
    throw err;
  }
}

/**
 * Ambil printer khusus mesin dari machine_lists
 * @param {string|number} machineId
 * @returns {Promise<{ machineId: number, machineNum: number, printerName: string|null }>}
 */
export async function getMachinePrinterApi(machineId) {
  if (!machineId) return null;
  const url = `${API_BASE}/api/print/machine-printer/${encodeURIComponent(machineId)}`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[getMachinePrinterApi] Error:', err);
    return null;
  }
}

/**
 * Kirim perintah cetak langsung ke printer tertentu tanpa dialog Windows
 * @param {object} payload { printerName, labelData, rawZpl, imageBase64 }
 * @returns {Promise<object>}
 */
export async function directPrintRollLabelApi(payload) {
  emitUserActivity();
  const url = `${API_BASE}/api/print/direct`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal mengirim perintah cetak langsung');
    }
    return data;
  } catch (err) {
    console.error('[directPrintRollLabelApi] Error:', err);
    throw err;
  }
}

/**
 * Ambil daftar user sistem untuk Admin Panel
 * @returns {Promise<Array>}
 */
export async function getUsersApi() {
  const url = `${API_BASE}/api/auth/users`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || 'Gagal memuat daftar user');
    }
    return data.data || [];
  } catch (err) {
    console.error('[getUsersApi] Error:', err);
    throw err;
  }
}

/**
 * Update printer yang di-assign ke mesin tertentu (khusus admin)
 * @param {string|number} machineId
 * @param {string} printerName
 * @returns {Promise<object>}
 */
export async function updateMachinePrinterApi(machineId, printerName) {
  const url = `${API_BASE}/api/auth/machines/${encodeURIComponent(machineId)}/printer`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer_name: printerName }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || 'Gagal memperbarui printer mesin');
    }
    return data;
  } catch (err) {
    console.error('[updateMachinePrinterApi] Error:', err);
    throw err;
  }
}

/**
 * Tambah Mesin Baru
 * @param {object} machineData - { machine_id, machine_num, autonic_table, printer_name }
 * @returns {Promise<object>}
 */
export async function createMachineApi(machineData) {
  const url = `${API_BASE}/api/auth/machines`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(machineData),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal menambahkan mesin baru.');
  }
  return data.data;
}

/**
 * Update Detail Mesin / Reset Sesi Operator
 * @param {string|number} machineId
 * @param {object} machineData - { machine_num, autonic_table, printer_name, user_active }
 * @returns {Promise<object>}
 */
export async function updateMachineApi(machineId, machineData) {
  const url = `${API_BASE}/api/auth/machines/${encodeURIComponent(machineId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(machineData),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal memperbarui data mesin.');
  }
  return data.data;
}

/**
 * Hapus Mesin
 * @param {string|number} machineId
 * @returns {Promise<object>}
 */
export async function deleteMachineApi(machineId) {
  const url = `${API_BASE}/api/auth/machines/${encodeURIComponent(machineId)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal menghapus mesin.');
  }
  return data.data;
}

/**
 * Tambah Kode Inspeksi Baru ke master DefectCode
 * @param {object} defectData - { Code, Defect }
 * @returns {Promise<object>}
 */
export async function createDefectCodeApi(defectData) {
  const url = `${API_BASE}/api/defect-code`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(defectData),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal menambahkan kode inspeksi.');
  }
  return data.data;
}

/**
 * Update Kode Inspeksi
 * @param {string} code
 * @param {object} defectData - { newCode, Defect }
 * @returns {Promise<object>}
 */
export async function updateDefectCodeApi(code, defectData) {
  const url = `${API_BASE}/api/defect-code/${encodeURIComponent(code)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(defectData),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal memperbarui kode inspeksi.');
  }
  return data.data;
}

/**
 * Hapus Kode Inspeksi
 * @param {string} code
 * @returns {Promise<object>}
 */
export async function deleteDefectCodeApi(code) {
  const url = `${API_BASE}/api/defect-code/${encodeURIComponent(code)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal menghapus kode inspeksi.');
  }
  return data.data;
}

/**
 * Tambah User Baru
 * @param {object} userData - { username, password, email, full_name, role, machine_id, is_active }
 * @returns {Promise<object>}
 */
export async function createUserApi(userData) {
  const url = `${API_BASE}/api/auth/users`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal menambahkan user baru.');
  }
  return data.data;
}

/**
 * Update User
 * @param {string} id
 * @param {object} userData - { username, password, email, full_name, role, machine_id, is_active }
 * @returns {Promise<object>}
 */
export async function updateUserApi(id, userData) {
  const url = `${API_BASE}/api/auth/users/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal memperbarui user.');
  }
  return data.data;
}

/**
 * Hapus User
 * @param {string} id
 * @returns {Promise<object>}
 */
export async function deleteUserApi(id) {
  const url = `${API_BASE}/api/auth/users/${encodeURIComponent(id)}`;
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || 'Gagal menghapus user.');
  }
  return data.data;
}




