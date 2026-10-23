import crypto from 'crypto';
import { pool } from '../config/db.js';

/**
 * Hash raw token string with SHA-256 to match user_sessions.token_hash
 * @param {string} token 
 * @returns {string} 64-character hex string
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Express Middleware to validate session key from headers or query param
 * Supported formats:
 * - Authorization: Bearer <key>
 * - x-api-key: <key>
 * - ?api_key=<key> or ?key=<key>
 */
export async function authenticateKey(req, res, next) {
  let rawToken = null;

  // 1. Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.substring(7).trim();
  } else if (authHeader) {
    rawToken = authHeader.trim();
  }

  // 2. Fallback to x-api-key header
  if (!rawToken && req.headers['x-api-key']) {
    rawToken = req.headers['x-api-key'].trim();
  }

  // 3. Fallback to query parameter (convenient for testing)
  if (!rawToken && (req.query.key || req.query.api_key)) {
    rawToken = (req.query.key || req.query.api_key).trim();
  }

  if (!rawToken) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Session key / authorization token is missing. Provide via Bearer token or x-api-key header.',
    });
  }

  try {
    const tokenHash = hashToken(rawToken);

    // Verify session in database
    const sessionQuery = `
      SELECT 
        s.id AS session_id,
        s.user_id,
        s.token_hash,
        s.expires_at,
        s.last_used_at,
        s.created_at AS session_created_at,
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.role,
        u.machine_id,
        u.is_active,
        u.last_login_at
      FROM user_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
        AND u.deleted_at IS NULL
        AND u.is_active = true
      LIMIT 1;
    `;

    const result = await pool.query(sessionQuery, [tokenHash]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid, revoked, or expired session key.',
      });
    }

    const row = result.rows[0];

    // Update last_used_at timestamp in background (non-blocking)
    pool.query('UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1', [row.session_id]).catch((err) => {
      console.error('[Session Update Error]:', err.message);
    });

    // Attach user & session details to request object
    req.user = {
      id: row.id,
      username: row.username,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      machine_id: row.machine_id,
      is_active: row.is_active,
      last_login_at: row.last_login_at,
    };

    req.session = {
      id: row.session_id,
      expires_at: row.expires_at,
      token_hash: row.token_hash,
    };

    next();
  } catch (err) {
    console.error('[Auth Middleware Error]:', err.message);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to authenticate session key.',
    });
  }
}
