import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { authenticateKey, hashToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Sanitize IP address for PostgreSQL 'inet' data type
 */
function sanitizeIp(ip) {
  if (!ip) return null;
  // Strip IPv6-mapped IPv4 prefix (e.g. ::ffff:192.168.1.1 -> 192.168.1.1)
  if (ip.startsWith('::ffff:')) {
    return ip.replace('::ffff:', '');
  }
  if (ip === '::1') {
    return '127.0.0.1';
  }
  return ip;
}

/**
 * Verify password with bcrypt, with fallback to plain-text
 */
async function verifyPassword(plainPassword, passwordHash) {
  if (!passwordHash) return false;
  if (passwordHash.startsWith('$2a$') || passwordHash.startsWith('$2b$') || passwordHash.startsWith('$2y$')) {
    return await bcrypt.compare(plainPassword, passwordHash);
  }
  return plainPassword === passwordHash;
}

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Username and password are required.',
    });
  }

  try {
    // 1. Find user by username or email
    const userQuery = `
      SELECT 
        id,
        email,
        username,
        password_hash,
        full_name,
        role,
        machine_id,
        is_active,
        deleted_at
      FROM users
      WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))
        AND deleted_at IS NULL
      LIMIT 1;
    `;

    const userResult = await pool.query(userQuery, [username.trim()]);

    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid username or password.',
      });
    }

    const user = userResult.rows[0];

    // 2. Check if account is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Account is deactivated. Please contact administrator.',
      });
    }

    // 3. Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid username or password.',
      });
    }

    // 4. Generate cryptographically secure session key
    // Raw token prefix "mpm_" (Machine Production Monitoring)
    const rawToken = 'mpm_' + crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(rawToken);

    // Default session validity: 30 days
    const sessionDays = parseInt(process.env.SESSION_EXPIRES_DAYS || '30', 10);
    const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

    const clientIp = sanitizeIp(
      req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress
    );
    const userAgent = req.headers['user-agent'] || 'Unknown Client';

    // 5. Store session in user_sessions table
    const sessionInsertQuery = `
      INSERT INTO user_sessions (
        user_id,
        token_hash,
        ip_address,
        user_agent,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, expires_at, created_at;
    `;

    const sessionResult = await pool.query(sessionInsertQuery, [
      user.id,
      tokenHash,
      clientIp,
      userAgent,
      expiresAt,
    ]);

    const session = sessionResult.rows[0];

    // 6. Update user's last_login_at
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    // 7. Return success response with session key
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        key: rawToken,
        token_type: 'Bearer',
        expires_at: session.expires_at,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          machine_id: user.machine_id,
          is_active: user.is_active,
        },
      },
    });
  } catch (err) {
    console.error('[Login API Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to process login.',
    });
  }
});

/**
 * GET /api/auth/me
 * Protected endpoint: Returns current user details using session key
 */
router.get('/me', authenticateKey, (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      user: req.user,
      session: {
        id: req.session.id,
        expires_at: req.session.expires_at,
      },
    },
  });
});

/**
 * POST /api/auth/logout
 * Protected endpoint: Revokes active session key
 */
router.post('/logout', authenticateKey, async (req, res) => {
  try {
    await pool.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1', [req.session.id]);

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully. Session key revoked.',
    });
  } catch (err) {
    console.error('[Logout API Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to revoke session key.',
    });
  }
});

export default router;
