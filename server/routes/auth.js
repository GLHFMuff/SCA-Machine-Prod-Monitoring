import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { authenticateKey, hashToken } from '../middleware/auth.js';
import { injectUser, listUsers } from '../inject-user.js';

const router = express.Router();

async function verifyPassword(plain, hash) {
  if (!hash) return false;
  if (/^\$2[aby]\$/.test(hash)) return bcrypt.compare(plain, hash);
  return plain === hash;
}

router.get('/machines', async (_req, res) => {
  try {
    const result = await pool.query('SELECT machine_id, machine_num, user_active, autonic_table FROM machine_lists ORDER BY machine_num');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Machine List Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar mesin.s' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password, machine_id } = req.body || {};
  if (!username || !password || !machine_id) return res.status(400).json({ success: false, message: 'Username, password, dan mesin wajib dipilih.' });
  const client = await pool.connect();
  try {
    const found = await client.query(`SELECT id,email,username,password_hash,full_name,role,is_active FROM users WHERE (LOWER(username)=LOWER($1) OR LOWER(email)=LOWER($1)) AND deleted_at IS NULL LIMIT 1`, [username.trim()]);
    const user = found.rows[0];
    if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) return res.status(401).json({ success: false, message: 'Username atau password tidak valid.' });
    await client.query('BEGIN');
    const activeElsewhere = await client.query(
      `SELECT machine_id, machine_num
       FROM machine_lists
       WHERE LOWER(BTRIM(user_active)) = LOWER($1)
         AND machine_id <> $2
       FOR UPDATE`,
      [user.username, machine_id],
    );
    if (activeElsewhere.rows.length) {
      await client.query('ROLLBACK');
      const activeMachine = activeElsewhere.rows[0];
      return res.status(409).json({
        success: false,
        message: `User masih aktif di ${activeMachine.machine_num || `mesin ${activeMachine.machine_id}`}. Silakan logout terlebih dahulu.`,
      });
    }
    const machineResult = await client.query(`UPDATE machine_lists SET user_active=$1 WHERE machine_id=$2 AND (user_active IS NULL OR BTRIM(user_active)='') RETURNING machine_id,machine_num,autonic_table`, [user.username, machine_id]);
    if (!machineResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Mesin tidak tersedia atau sedang digunakan user lain.' });
    }
    const rawToken = 'mpm_' + crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + parseInt(process.env.SESSION_EXPIRES_DAYS || '30', 10) * 86400000);
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '').replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1') || null;
    const session = await client.query(`INSERT INTO user_sessions(user_id,token_hash,ip_address,user_agent,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at`, [user.id, hashToken(rawToken), ip, req.headers['user-agent'] || 'Unknown Client', expiresAt]);
    await client.query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [user.id]);
    await client.query('COMMIT');
    const machine = machineResult.rows[0];
    res.json({ success: true, data: { key: rawToken, expires_at: session.rows[0].expires_at, user: { id:user.id,username:user.username,email:user.email,full_name:user.full_name,role:user.role,is_active:user.is_active,machine_id:machine.machine_id,machine_num:machine.machine_num,autonic_table:machine.autonic_table } } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Login API Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses login.' });
  } finally { client.release(); }
});

router.get('/me', authenticateKey, (req, res) => res.json({ success: true, data: { user: req.user, session: { id:req.session.id, expires_at:req.session.expires_at } } }));
router.post('/logout', async (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  if (!token) return res.status(401).json({ success: false, message: 'Session key tidak ditemukan.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const sessionResult = await client.query(
      `SELECT s.id AS session_id, u.username
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
         AND u.deleted_at IS NULL AND u.is_active = true
       FOR UPDATE OF s`,
      [hashToken(token)],
    );
    if (!sessionResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(401).json({ success: false, message: 'Sesi tidak valid atau sudah kedaluwarsa.' });
    }

    const { session_id: sessionId, username } = sessionResult.rows[0];
    await client.query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1', [sessionId]);
    const released = await client.query(
      `UPDATE machine_lists SET user_active = NULL
       WHERE LOWER(BTRIM(user_active)) = LOWER(BTRIM($1))
       RETURNING machine_id`,
      [username],
    );
    if (!released.rowCount) {
      console.warn('[Logout] No machine assignment found to release:', { username });
    }
    await client.query('COMMIT');
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Logout API Error]:', err);
    return res.status(500).json({ success: false, message: 'Gagal logout.' });
  } finally {
    client.release();
  }
});

// Endpoint untuk melihat daftar user
router.get('/users', async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ success: true, data: users });
  } catch (err) {
    console.error('[List Users API Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar user.' });
  }
});

// Endpoint untuk inject / create / update user baru via API
router.post('/inject-user', async (req, res) => {
  const { username, password, email, full_name, role, machine_id, is_active } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  try {
    const user = await injectUser({
      username,
      password,
      email,
      full_name,
      role: role || 'user',
      machine_id: machine_id ?? '0',
      is_active: is_active ?? true,
    });
    res.json({
      success: true,
      message: `User '${user.username}' berhasil disimpan.`,
      data: user,
    });
  } catch (err) {
    console.error('[Inject User API Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal menyimpan user.' });
  }
});

export default router;
