/**
 * Service untuk komunikasi ke External API / Webhook Autonic
 * Base URL: http://192.168.23.61:5678
 */

export const AUTONIC_CONFIG = {
  BASE_URL: 'http://192.168.23.61:5678',
  BEARER_TOKEN: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub21lc2luIjoiMSJ9.RbhwKIJJqRxD2uP_on5Ch3tJOoR2rLfrz45D_E0IR_0',
};

export const AUTONIC_ENDPOINTS = {
  GET_DATA: '/webhook/getdataautonic',
  // Endpoint eksternal lainnya dapat ditambahkan di sini secara terpusat
};

/**
 * Helper request internal untuk Autonic API
 * @param {string} endpoint - Path webhook endpoint
 * @param {object} options - Fetch options (method, body, headers, dll.)
 */
async function autonicRequest(endpoint, options = {}) {
  const url = `${AUTONIC_CONFIG.BASE_URL}${endpoint}`;

  const defaultHeaders = {
    'Content-Type': 'application/json',
    'Authorization': AUTONIC_CONFIG.BEARER_TOKEN,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Autonic API Error (${response.status}): ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error(`Tidak dapat menghubungi External API (${AUTONIC_CONFIG.BASE_URL}). Pastikan jaringan / IP dapat diakses.`);
    }
    throw err;
  }
}

/**
 * Mengambil data mesin terkini dari Autonic webhook
 * @param {number|string} machineId - ID mesin (dari user login kolom machine_id)
 * @returns {Promise<{ DateTimeCreated: string, Length: string }>}
 */
export async function getAutonicData(machineId) {
  const payload = {
    nomesin: Number(machineId) || 1,
  };

  return autonicRequest(AUTONIC_ENDPOINTS.GET_DATA, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function flushAutonicData(machineId) {
  const payload = {
    nomesin: Number(machineId) || 1,
  };
  return autonicRequest(AUTONIC_ENDPOINTS.GET_DATA, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export default {
  AUTONIC_CONFIG,
  AUTONIC_ENDPOINTS,
  getAutonicData,
};
