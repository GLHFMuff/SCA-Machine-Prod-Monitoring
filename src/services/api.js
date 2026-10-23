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
 * Get CountingKainHeader by ProdId including all lines
 * @param {string} prodId 
 * @returns {Promise<object>}
 */
export async function getCountingData(prodId) {
  if (!prodId) return null;
  const url = `${API_BASE}/api/counting/headers/${encodeURIComponent(prodId.trim())}`;

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
