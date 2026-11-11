import crypto from 'crypto';
import { pool } from '../config/db.js';
import { getAppSettings } from '../services/appSettings.js';
import { releaseMachineForUsername } from '../services/sessionCleanup.js';

/**
 * Hash raw token string with SHA-256 to match user_sessions.token_hash
 * @param {string} token
 * @returns {string} 64-character hex string
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

function extractRawToken(req) {
  let rawToken = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.substring(7).trim();
  } else if (authHeader) {
    rawToken = authHeader.trim();
  }

  if (!rawToken && req.headers['x-api-key']) {
    rawToken = req.headers['x-api-key'].trim();
  }

  if (!rawToken && (req.query.key || req.query.api_key)) {
    rawToken = (req.query.key || req.query.api_key).trim();
  }

  return rawToken;
}

/**
 * Express Middleware factory to validate session key from headers or query param.
 * Set `touchLastUsed: true` only on active user interactions (e.g. heartbeat / settings update),
 * leaving passive checks (GET /api/auth/me) read-only so idle timers are not falsely reset.
 */
export function createAuthMiddleware({ touchLastUsed = false } = {}) {
  return async function authMiddleware(req, res, next) {
    const rawToken = extractRawToken(req);

    if (!rawToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Session key / authorization token is missing. Provide via Bearer token or x-api-key header.',
      });
    }

    try {
      const tokenHash = hashToken(rawToken);
      const isAdminPortalSession = rawToken.startsWith('mpm_adm_');
      const settings = await getAppSettings();
      const idleTimeoutMinutes = Number(settings?.session?.idleTimeoutMinutes || 0);
      const applyIdleToAdmin = Boolean(settings?.session?.applyIdleToAdmin);

      const sessionQuery = `
        SELECT
          s.id AS session_id,
          s.user_id,
          s.token_hash,
          s.expires_at,
          COALESCE(s.last_used_at, s.created_at) AS last_used_at,
          s.created_at AS session_created_at,
          GREATEST(0, EXTRACT(EPOCH FROM (NOW() - COALESCE(s.last_used_at, s.created_at))) * 1000)::double precision AS idle_elapsed_ms,
          u.id,
          u.username,
          u.email,
          u.full_name,
          u.role,
          COALESCE(
            session_machine.machine_id,
            CASE WHEN BTRIM(COALESCE(u.machine_id, '')) ~ '^[0-9]+$' AND BTRIM(u.machine_id) <> '0'
              THEN BTRIM(u.machine_id)::integer
              ELSE NULL
            END
          ) AS machine_id,
          ml.machine_num,
          ml.autonic_table,
          ml.printer_name,
          u.is_active,
          u.last_login_at
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN LATERAL (
          SELECT machine_id
          FROM machine_lists
          WHERE LOWER(BTRIM(user_active)) = LOWER(BTRIM(u.username))
          ORDER BY machine_id
          LIMIT 1
        ) session_machine ON true
        LEFT JOIN machine_lists ml ON ml.machine_id = COALESCE(
          session_machine.machine_id,
          CASE WHEN BTRIM(COALESCE(u.machine_id, '')) ~ '^[0-9]+$' AND BTRIM(u.machine_id) <> '0'
            THEN BTRIM(u.machine_id)::integer
            ELSE NULL
          END
        )
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
          code: 'SESSION_INVALID',
          message: 'Invalid, revoked, or expired session key.',
        });
      }

      const row = result.rows[0];
      const idleElapsedMs = Number(row.idle_elapsed_ms || 0);
      const shouldEnforceIdle = idleTimeoutMinutes > 0 && (!isAdminPortalSession || applyIdleToAdmin);

      if (shouldEnforceIdle && idleElapsedMs >= idleTimeoutMinutes * 60 * 1000) {
        await pool.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL', [row.session_id]);
        if (!isAdminPortalSession) {
          await releaseMachineForUsername(row.username).catch((err) => {
            console.error('[Idle Machine Release Error]:', err.message);
          });
        }
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
          code: 'SESSION_IDLE_EXPIRED',
          message: `Sesi berakhir otomatis karena tidak ada aktivitas selama ${idleTimeoutMinutes} menit.`,
        });
      }

      let effectiveLastUsedAt = row.last_used_at;
      if (touchLastUsed) {
        const touchRes = await pool.query(
          'UPDATE user_sessions SET last_used_at = NOW() WHERE id = $1 RETURNING last_used_at',
          [row.session_id],
        ).catch((err) => {
          console.error('[Session Update Error]:', err.message);
          return null;
        });
        if (touchRes?.rows?.[0]?.last_used_at) {
          effectiveLastUsedAt = touchRes.rows[0].last_used_at;
        }
      }

      req.user = {
        id: row.id,
        username: row.username,
        email: row.email,
        full_name: row.full_name,
        role: row.role,
        machine_id: row.machine_id,
        machine_num: row.machine_num,
        autonic_table: row.autonic_table,
        printer_name: row.printer_name,
        is_active: row.is_active,
        last_login_at: row.last_login_at,
      };

      req.session = {
        id: row.session_id,
        expires_at: row.expires_at,
        last_used_at: effectiveLastUsedAt,
        idle_elapsed_ms: touchLastUsed ? 0 : idleElapsedMs,
        idle_timeout_minutes: shouldEnforceIdle ? idleTimeoutMinutes : 0,
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
  };
}

export const authenticateKey = createAuthMiddleware({ touchLastUsed: false });
export const authenticateKeyAndTouch = createAuthMiddleware({ touchLastUsed: true });
