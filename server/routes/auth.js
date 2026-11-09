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
    const result = await pool.query('SELECT machine_id, machine_num, user_active, autonic_table, printer_name FROM machine_lists ORDER BY machine_num');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Machine List Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memuat daftar mesin.' });
  }
});

// Tambah mesin baru
router.post('/machines', async (req, res) => {
  try {
    const { machine_id, machine_num, autonic_table, printer_name } = req.body || {};
    let targetId = machine_id ? parseInt(machine_id, 10) : null;
    if (!targetId || isNaN(targetId)) {
      const maxRes = await pool.query('SELECT COALESCE(MAX(machine_id), 0) + 1 AS next_id FROM machine_lists');
      targetId = parseInt(maxRes.rows[0].next_id, 10);
    }
    const targetNum = machine_num !== undefined && machine_num !== null && machine_num !== '' ? parseInt(machine_num, 10) : targetId;
    const cleanAutonic = autonic_table ? String(autonic_table).trim() : `autonicmachine_${targetId}`;
    const cleanPrinter = printer_name ? String(printer_name).trim() : null;

    const checkExist = await pool.query('SELECT machine_id FROM machine_lists WHERE machine_id = $1 LIMIT 1', [targetId]);
    if (checkExist.rows.length) {
      return res.status(409).json({ success: false, message: `Mesin ID #${targetId} sudah terdaftar.` });
    }

    const result = await pool.query(
      `INSERT INTO machine_lists (machine_id, machine_num, autonic_table, printer_name)
       VALUES ($1, $2, $3, $4)
       RETURNING machine_id, machine_num, autonic_table, printer_name, user_active`,
      [targetId, targetNum, cleanAutonic, cleanPrinter]
    );

    res.status(201).json({
      success: true,
      message: `Mesin #${targetNum} berhasil ditambahkan.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Create Machine Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal menambahkan mesin.' });
  }
});

// Update detail mesin atau reset user_active
router.put('/machines/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    const { machine_num, autonic_table, printer_name, user_active } = req.body || {};

    const check = await pool.query('SELECT * FROM machine_lists WHERE machine_id = $1 LIMIT 1', [machineId]);
    if (!check.rows.length) {
      return res.status(404).json({ success: false, message: `Mesin #${machineId} tidak ditemukan.` });
    }
    const current = check.rows[0];

    const newNum = machine_num !== undefined && machine_num !== null && machine_num !== '' ? parseInt(machine_num, 10) : current.machine_num;
    const newAutonic = autonic_table !== undefined ? (autonic_table ? String(autonic_table).trim() : null) : current.autonic_table;
    const newPrinter = printer_name !== undefined ? (printer_name ? String(printer_name).trim() : null) : current.printer_name;
    const newUserActive = user_active !== undefined ? (user_active ? String(user_active).trim() : null) : current.user_active;

    const result = await pool.query(
      `UPDATE machine_lists
       SET machine_num = $1, autonic_table = $2, printer_name = $3, user_active = $4
       WHERE machine_id = $5
       RETURNING machine_id, machine_num, autonic_table, printer_name, user_active`,
      [newNum, newAutonic, newPrinter, newUserActive, machineId]
    );

    res.json({
      success: true,
      message: `Mesin #${newNum} berhasil diperbarui.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Update Machine Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal memperbarui mesin.' });
  }
});

// Hapus mesin
router.delete('/machines/:machineId', async (req, res) => {
  try {
    const { machineId } = req.params;
    const result = await pool.query(
      'DELETE FROM machine_lists WHERE machine_id = $1 RETURNING machine_id, machine_num',
      [machineId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: `Mesin #${machineId} tidak ditemukan.` });
    }
    res.json({
      success: true,
      message: `Mesin #${result.rows[0].machine_num || machineId} berhasil dihapus.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Delete Machine Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal menghapus mesin.' });
  }
});

// Update printer assigned to a machine
router.put('/machines/:machineId/printer', async (req, res) => {
  try {
    const { machineId } = req.params;
    const { printer_name } = req.body || {};
    const result = await pool.query(
      'UPDATE machine_lists SET printer_name = $1 WHERE machine_id = $2 RETURNING machine_id, machine_num, printer_name',
      [printer_name ? String(printer_name).trim() : null, machineId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: `Mesin #${machineId} tidak ditemukan.` });
    }
    res.json({
      success: true,
      data: result.rows[0],
      message: `Printer untuk Mesin #${result.rows[0].machine_num || machineId} berhasil disimpan: ${result.rows[0].printer_name || '(Dikosongkan)'}`,
    });
  } catch (err) {
    console.error('[Update Machine Printer Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memperbarui printer mesin.' });
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
    const machineResult = await client.query(`UPDATE machine_lists SET user_active=$1 WHERE machine_id=$2 AND (user_active IS NULL OR BTRIM(user_active)='') RETURNING machine_id,machine_num,autonic_table,printer_name`, [user.username, machine_id]);
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
    res.json({ success: true, data: { key: rawToken, expires_at: session.rows[0].expires_at, user: { id:user.id,username:user.username,email:user.email,full_name:user.full_name,role:user.role,is_active:user.is_active,machine_id:machine.machine_id,machine_num:machine.machine_num,autonic_table:machine.autonic_table,printer_name:machine.printer_name } } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[Login API Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses login.' });
  } finally { client.release(); }
});

// Endpoint Login Khusus Administrator (Portal /admin) - Tanpa perlu pilih mesin atau shift
router.post('/admin-login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  const client = await pool.connect();
  try {
    const found = await client.query(
      `SELECT id, email, username, password_hash, full_name, role, is_active
       FROM users
       WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1))
         AND deleted_at IS NULL
       LIMIT 1`,
      [username.trim()]
    );
    const user = found.rows[0];

    if (!user || !user.is_active || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ success: false, message: 'Username atau password tidak valid.' });
    }

    if (String(user.role || '').toLowerCase() !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Akses ditolak: Akun Anda bukan Administrator.',
      });
    }

    const rawToken = 'mpm_adm_' + crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + parseInt(process.env.SESSION_EXPIRES_DAYS || '30', 10) * 86400000);
    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '').replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1') || null;

    const session = await client.query(
      `INSERT INTO user_sessions(user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES($1, $2, $3, $4, $5)
       RETURNING id, expires_at`,
      [user.id, hashToken(rawToken), ip, req.headers['user-agent'] || 'Admin Web Portal', expiresAt]
    );

    await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    return res.json({
      success: true,
      message: 'Login admin berhasil.',
      data: {
        key: rawToken,
        expires_at: session.rows[0].expires_at,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active,
        },
      },
    });
  } catch (err) {
    console.error('[Admin Login API Error]:', err);
    res.status(500).json({ success: false, message: 'Gagal memproses login admin.' });
  } finally {
    client.release();
  }
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

// Tambah User Baru
router.post('/users', async (req, res) => {
  const { username, password, email, full_name, role, machine_id, is_active } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = (email || `${cleanUsername}@sca.id`).trim().toLowerCase();
  const cleanFullName = (full_name || cleanUsername).trim();
  const cleanRole = role === 'admin' ? 'admin' : 'user';
  const cleanMachineId = machine_id !== undefined && machine_id !== null ? String(machine_id).trim() : '0';
  const cleanActive = is_active !== false;

  try {
    const check = await pool.query(
      'SELECT id FROM users WHERE (LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($2)) AND deleted_at IS NULL LIMIT 1',
      [cleanUsername, cleanEmail]
    );
    if (check.rows.length) {
      return res.status(409).json({ success: false, message: `Username atau email '${cleanUsername}' sudah terdaftar.` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, username, password_hash, full_name, role, machine_id, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, username, email, full_name, role, machine_id, is_active, created_at`,
      [cleanEmail, cleanUsername, passwordHash, cleanFullName, cleanRole, cleanMachineId, cleanActive]
    );

    res.status(201).json({
      success: true,
      message: `User '${cleanUsername}' berhasil dibuat.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Create User API Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal membuat user baru.' });
  }
});

// Perbarui User
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, email, full_name, role, machine_id, is_active } = req.body || {};

  try {
    const check = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
    if (!check.rows.length) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }
    const current = check.rows[0];

    const newUsername = username ? username.trim().toLowerCase() : current.username;
    const newEmail = email !== undefined ? email.trim().toLowerCase() : current.email;
    const newFullName = full_name !== undefined ? full_name.trim() : current.full_name;
    const newRole = role !== undefined ? (role === 'admin' ? 'admin' : 'user') : current.role;
    const newMachineId = machine_id !== undefined ? String(machine_id).trim() : current.machine_id;
    const newActive = is_active !== undefined ? Boolean(is_active) : current.is_active;

    let newPasswordHash = current.password_hash;
    if (password && password.trim()) {
      newPasswordHash = await bcrypt.hash(password.trim(), 10);
    }

    const result = await pool.query(
      `UPDATE users
       SET username = $1, email = $2, full_name = $3, role = $4, machine_id = $5, is_active = $6, password_hash = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING id, username, email, full_name, role, machine_id, is_active, updated_at`,
      [newUsername, newEmail, newFullName, newRole, newMachineId, newActive, newPasswordHash, id]
    );

    res.json({
      success: true,
      message: `User '${newUsername}' berhasil diperbarui.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Update User API Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal memperbarui user.' });
  }
});

// Hapus User (Soft delete + cabut sesi aktif)
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const check = await pool.query('SELECT username FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [id]);
    if (!check.rows.length) {
      return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
    }

    await pool.query('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1', [id]);
    const result = await pool.query(
      'UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id, username',
      [id]
    );

    res.json({
      success: true,
      message: `User '${result.rows[0].username}' berhasil dihapus.`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error('[Delete User API Error]:', err);
    res.status(500).json({ success: false, message: err.message || 'Gagal menghapus user.' });
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
