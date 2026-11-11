import { pool } from '../config/db.js';
import { getAppSettings } from './appSettings.js';

export const ADMIN_PORTAL_UA_PREFIX = '[AdminPortal]';

/**
 * Revoke expired and idle sessions, then release machine_lists.user_active
 * for any operator who no longer has a valid active operator session.
 */
export async function cleanupExpiredAndIdleSessions(dbClient = null) {
  const settings = await getAppSettings();
  const idleMinutes = Number(settings?.session?.idleTimeoutMinutes || 0);
  const applyIdleToAdmin = Boolean(settings?.session?.applyIdleToAdmin);

  const client = dbClient || (await pool.connect());
  const shouldRelease = !dbClient;

  try {
    if (shouldRelease) {
      await client.query('BEGIN');
    }

    // 1. Revoke sessions past expires_at OR past idleTimeoutMinutes
    const revokeQuery = `
      UPDATE user_sessions s
      SET revoked_at = NOW()
      WHERE s.revoked_at IS NULL
        AND (
          s.expires_at <= NOW()
          OR (
            $1 > 0
            AND COALESCE(s.last_used_at, s.created_at) <= NOW() - ($1 * INTERVAL '1 minute')
            AND ($2::boolean = true OR COALESCE(s.user_agent, '') NOT LIKE $3)
          )
        )
      RETURNING s.id, s.user_id, s.user_agent
    `;
    const revokedRes = await client.query(revokeQuery, [
      idleMinutes,
      applyIdleToAdmin,
      `${ADMIN_PORTAL_UA_PREFIX}%`,
    ]);

    // 2. Release machine locks if the assigned operator no longer has any valid active operator session
    //    (Checks users who just had a session revoked OR any user with at least one past operator session
    //     so manually edited test rows without sessions are not accidentally wiped).
    const releaseQuery = `
      UPDATE machine_lists ml
      SET user_active = NULL
      WHERE ml.user_active IS NOT NULL
        AND BTRIM(ml.user_active) <> ''
        AND EXISTS (
          SELECT 1
          FROM users u
          JOIN user_sessions s_any ON s_any.user_id = u.id
          WHERE LOWER(BTRIM(u.username)) = LOWER(BTRIM(ml.user_active))
            AND COALESCE(s_any.user_agent, '') NOT LIKE $2
        )
        AND NOT EXISTS (
          SELECT 1
          FROM users u
          JOIN user_sessions s_active ON s_active.user_id = u.id
          WHERE LOWER(BTRIM(u.username)) = LOWER(BTRIM(ml.user_active))
            AND u.deleted_at IS NULL
            AND u.is_active = true
            AND s_active.revoked_at IS NULL
            AND s_active.expires_at > NOW()
            AND COALESCE(s_active.user_agent, '') NOT LIKE $2
            AND (
              $1 <= 0
              OR COALESCE(s_active.last_used_at, s_active.created_at) > NOW() - ($1 * INTERVAL '1 minute')
            )
        )
      RETURNING ml.machine_id, ml.machine_num, ml.user_active
    `;
    const releasedRes = await client.query(releaseQuery, [
      idleMinutes,
      `${ADMIN_PORTAL_UA_PREFIX}%`,
    ]);

    if (shouldRelease) {
      await client.query('COMMIT');
    }

    if (revokedRes.rowCount > 0 || releasedRes.rowCount > 0) {
      console.log(
        `[SessionCleanup] Revoked ${revokedRes.rowCount} session(s), released ${releasedRes.rowCount} machine(s).`
      );
    }

    return {
      revokedCount: revokedRes.rowCount,
      releasedMachines: releasedRes.rows,
    };
  } catch (err) {
    if (shouldRelease) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    if (shouldRelease) {
      client.release();
    }
  }
}

/**
 * Release machine_lists.user_active for a specific username if they have no active operator session left.
 */
export async function releaseMachineForUsername(username, dbClient = null) {
  const cleanUsername = String(username || '').trim();
  if (!cleanUsername) return 0;

  const executor = dbClient || pool;
  const result = await executor.query(
    `UPDATE machine_lists ml
     SET user_active = NULL
     WHERE LOWER(BTRIM(ml.user_active)) = LOWER(BTRIM($1))
       AND NOT EXISTS (
         SELECT 1
         FROM users u
         JOIN user_sessions s ON s.user_id = u.id
         WHERE LOWER(BTRIM(u.username)) = LOWER(BTRIM($1))
           AND s.revoked_at IS NULL
           AND s.expires_at > NOW()
           AND COALESCE(s.user_agent, '') NOT LIKE $2
       )
     RETURNING ml.machine_id`,
    [cleanUsername, `${ADMIN_PORTAL_UA_PREFIX}%`],
  );
  return result.rowCount;
}

