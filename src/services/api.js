/**
 * API Service for Machine Production Monitoring
 */

// Use relative path for Vite proxy, or fallback to backend port 5000 if needed
const API_BASE = import.meta.env.VITE_API_URL || '';

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
    machine: `Mesin ${rawUser.machine_id}`,
    machineType: `Loom Machine #${rawUser.machine_id}`,
    role: rawUser.role,
    sessionKey: sessionKey,
  };
}

/**
 * Perform login to backend API
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<object>} { success, user, key, message }
 */
export async function loginApi(username, password) {
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
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.success) {
      const errorMsg = data?.message || data?.error || `Login gagal (Status ${res.status})`;
      throw new Error(errorMsg);
    }

    const { key, user } = data.data;
    const formattedUser = formatUser(user, key);

    // Save session in localStorage
    localStorage.setItem('mpm_session_key', key);
    localStorage.setItem('mpm_user', JSON.stringify(formattedUser));

    return {
      success: true,
      user: formattedUser,
      key: key,
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
 * Validate active session key with backend
 * @param {string} sessionKey 
 * @returns {Promise<object>} formatted user object
 */
export async function checkSessionApi(sessionKey) {
  if (!sessionKey) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${sessionKey}`,
      },
    });

    if (!res.ok) {
      throw new Error('Session expired or invalid');
    }

    const data = await res.json();
    if (data?.success && data?.data?.user) {
      const user = formatUser(data.data.user, sessionKey);
      localStorage.setItem('mpm_user', JSON.stringify(user));
      return user;
    }
    return null;
  } catch {
    // Session is invalid or expired
    clearStoredSession();
    return null;
  }
}

/**
 * Logout and invalidate session in backend
 * @param {string} sessionKey 
 */
export async function logoutApi(sessionKey) {
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
    console.warn('Logout API call failed:', err);
  } finally {
    clearStoredSession();
  }
}

/**
 * Clear session from localStorage
 */
export function clearStoredSession() {
  localStorage.removeItem('mpm_session_key');
  localStorage.removeItem('mpm_user');
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
    const res = await fetch(url);
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
  const url = `${API_BASE}/api/counting/lines/${encodeURIComponent(prodId.trim())}/${roolNumber}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menghapus roll dari database');
    }
    return data;
  } catch (err) {
    console.error(`[deleteRollApi] Error deleting ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}

/**
 * Pull machine data and automatically delete the record from PostgreSQL database
 * @param {number|string} machineId
 * @returns {Promise<{ Length: number, DateTimeCreated: string }>}
 */
export async function pullAndClearMachineData(machineId) {
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
        })),
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menyimpan catatan cacat ke database');
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
 * Delete defects for a specific roll from CountingKainDefect
 * @param {string} prodId
 * @param {number} roolNumber
 * @returns {Promise<object>}
 */
export async function deleteRollDefectsApi(prodId, roolNumber) {
  if (!prodId || !roolNumber) return null;
  const url = `${API_BASE}/api/counting/defects/${encodeURIComponent(String(prodId).trim())}/${encodeURIComponent(roolNumber)}`;

  try {
    const res = await fetch(url, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.message || data?.error || 'Gagal menghapus cacat roll dari database');
    }
    return data;
  } catch (err) {
    console.error(`[deleteRollDefectsApi] Error for ${prodId} #${roolNumber}:`, err);
    throw err;
  }
}


