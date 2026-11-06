import readline from 'readline';
import bcrypt from 'bcryptjs';
import { pool } from './config/db.js';

// Helper for interactive terminal input
function createPrompter() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask: (query, defaultValue = '') =>
      new Promise((resolve) => {
        const promptText = defaultValue ? `${query} [default: ${defaultValue}]: ` : `${query}: `;
        rl.question(promptText, (answer) => {
          const trimmed = answer.trim();
          resolve(trimmed !== '' ? trimmed : defaultValue);
        });
      }),
    close: () => rl.close(),
  };
}

/**
 * Insert or update a single user in PostgreSQL
 */
export async function injectUser({
  username,
  password,
  email,
  full_name,
  role = 'user',
  machine_id = '0',
  is_active = true,
}) {
  if (!username) throw new Error('Username wajib diisi');
  if (!password) throw new Error('Password wajib diisi');

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmail = (email || `${cleanUsername}@sca.id`).trim().toLowerCase();
  const cleanFullName = full_name || cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1);
  const cleanMachineId = String(machine_id || '0');

  const passwordHash = await bcrypt.hash(password, 10);

  const query = `
    INSERT INTO users (
      email,
      username,
      password_hash,
      full_name,
      role,
      machine_id,
      is_active,
      updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (username) DO UPDATE SET
      email = EXCLUDED.email,
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      machine_id = EXCLUDED.machine_id,
      is_active = EXCLUDED.is_active,
      deleted_at = NULL,
      updated_at = NOW()
    RETURNING id, username, email, full_name, role, machine_id, is_active;
  `;

  const res = await pool.query(query, [
    cleanEmail,
    cleanUsername,
    passwordHash,
    cleanFullName,
    role,
    cleanMachineId,
    Boolean(is_active),
  ]);

  return res.rows[0];
}

/**
 * List all users from PostgreSQL
 */
export async function listUsers() {
  const res = await pool.query(`
    SELECT id, username, email, full_name, role, machine_id, is_active, last_login_at, created_at
    FROM users
    WHERE deleted_at IS NULL
    ORDER BY username ASC
  `);
  return res.rows;
}

/**
 * Sync / generate users for all machines in machine_lists
 */
export async function syncAllMachineUsers(defaultPasswordPattern = (num) => `mesin${num}`) {
  const machinesRes = await pool.query(`
    SELECT machine_id, machine_num
    FROM machine_lists
    ORDER BY machine_num ASC
  `);

  const results = [];
  for (const m of machinesRes.rows) {
    const num = m.machine_num ?? m.machine_id;
    const username = `mesin${num}`;
    const password = defaultPasswordPattern(num);
    const email = `mesin${num}@sca.id`;
    const fullName = `Mesin ${num}`;

    const user = await injectUser({
      username,
      password,
      email,
      full_name: fullName,
      role: 'user',
      machine_id: String(m.machine_id),
      is_active: true,
    });
    results.push(user);
  }
  return results;
}

/**
 * Reset password for a specific user
 */
export async function resetPassword(username, newPassword) {
  if (!username || !newPassword) throw new Error('Username dan newPassword wajib diisi');
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const res = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(username) = LOWER($2) AND deleted_at IS NULL RETURNING id, username`,
    [passwordHash, username.trim()]
  );
  if (!res.rows.length) {
    throw new Error(`User '${username}' tidak ditemukan.`);
  }
  return res.rows[0];
}

// Parse simple CLI flags: --key value or --flag
function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

// CLI runner
async function runCLI() {
  const args = process.argv.slice(2);
  const flags = parseArgs(args);

  console.log('\n======================================================');
  console.log('       INJECT USER TOOL - MACHINE PROD MONITORING     ');
  console.log('======================================================\n');

  try {
    // 0. Help flag
    if (flags.help || flags.h) {
      console.log('Penggunaan:');
      console.log('  Mode Interaktif:');
      console.log('    npm run server:inject-user');
      console.log('    node server/inject-user.js');
      console.log('\n  Mode One-Liner / Argumen CLI:');
      console.log('    node server/inject-user.js --username <user> --password <pass> [--name "Nama"] [--email email] [--machine 1] [--role user]');
      console.log('    node server/inject-user.js --sync-machines');
      console.log('    node server/inject-user.js --list');
      console.log('    node server/inject-user.js --reset-password <user> --new-password <pass>');
      console.log('\nContoh:');
      console.log('  node server/inject-user.js --username operator1 --password 123 --machine 1 --name "Operator Satu"');
      console.log('  node server/inject-user.js --sync-machines');
      return;
    }

    // 1. List users flag
    if (flags.list) {
      const users = await listUsers();
      console.log(`Ditemukan ${users.length} user terdaftar:\n`);
      console.table(
        users.map((u) => ({
          ID: u.id.slice(0, 8) + '...',
          Username: u.username,
          'Full Name': u.full_name,
          Role: u.role,
          'Machine ID': u.machine_id,
          Email: u.email,
          Active: u.is_active ? 'YES' : 'NO',
        }))
      );
      return;
    }

    // 2. Sync all machines flag
    if (flags['sync-machines'] || flags['all-machines']) {
      console.log('Menyelaraskan user untuk semua mesin di machine_lists...');
      const synced = await syncAllMachineUsers();
      console.log(`\nBerhasil meng-inject / menyelaraskan ${synced.length} akun mesin:\n`);
      console.table(
        synced.map((u) => ({
          Username: u.username,
          'Full Name': u.full_name,
          'Machine ID': u.machine_id,
          Role: u.role,
          Email: u.email,
        }))
      );
      return;
    }

    // 3. Reset password flag: --reset-password <username> --new-password <pass>
    if (flags['reset-password']) {
      const targetUser = typeof flags['reset-password'] === 'string' ? flags['reset-password'] : flags.username;
      const newPass = flags['new-password'] || flags.password;
      if (!targetUser || !newPass) {
        console.error('Error: Gunakan flag --reset-password <username> --new-password <password>');
        process.exitCode = 1;
        return;
      }
      const updated = await resetPassword(targetUser, newPass);
      console.log(`[OK] Password user '${updated.username}' berhasil diperbarui!`);
      return;
    }

    // 4. Direct CLI flags to create single user: e.g. --username foo --password bar
    if (flags.username && flags.password) {
      console.log(`Meng-inject user '${flags.username}' via argumen CLI...`);
      const user = await injectUser({
        username: flags.username,
        password: flags.password,
        full_name: flags.name || flags.full_name,
        email: flags.email,
        role: flags.role || 'user',
        machine_id: flags.machine || flags.machine_id || '0',
        is_active: flags.active !== 'false' && flags.active !== false,
      });

      console.log('\n[SUKSES] User berhasil dibuat / diperbarui:');
      console.log(` - Username   : ${user.username}`);
      console.log(` - Full Name  : ${user.full_name}`);
      console.log(` - Email      : ${user.email}`);
      console.log(` - Role       : ${user.role}`);
      console.log(` - Machine ID : ${user.machine_id}`);
      return;
    }

    // 5. Interactive Mode (No arguments provided)
    const prompter = createPrompter();

    console.log('Pilih menu:');
    console.log(' [1] Inject 1 User Baru (Custom)');
    console.log(' [2] Inject Semua Akun Mesin Otomatis (mesin1 .. mesin12)');
    console.log(' [3] Lihat Daftar Semua User (List)');
    console.log(' [4] Reset Password User');
    console.log(' [0] Keluar\n');

    const choice = await prompter.ask('Pilihan kamu [1/2/3/4/0]', '1');

    if (choice === '0') {
      console.log('Batal. Keluar.');
      prompter.close();
      return;
    }

    if (choice === '2') {
      prompter.close();
      console.log('\nSedang memproses auto-inject semua mesin...');
      const synced = await syncAllMachineUsers();
      console.log(`\nBerhasil meng-inject / menyelaraskan ${synced.length} akun mesin:\n`);
      console.table(
        synced.map((u) => ({
          Username: u.username,
          'Full Name': u.full_name,
          'Machine ID': u.machine_id,
          Role: u.role,
          Email: u.email,
        }))
      );
      return;
    }

    if (choice === '3') {
      prompter.close();
      const users = await listUsers();
      console.log(`\nDitemukan ${users.length} user terdaftar:\n`);
      console.table(
        users.map((u) => ({
          Username: u.username,
          'Full Name': u.full_name,
          Role: u.role,
          'Machine ID': u.machine_id,
          Email: u.email,
          Active: u.is_active ? 'YES' : 'NO',
        }))
      );
      return;
    }

    if (choice === '4') {
      const username = await prompter.ask('Masukkan username yang ingin di-reset');
      const newPass = await prompter.ask('Masukkan password baru');
      prompter.close();
      if (!username || !newPass) {
        console.error('Username dan password tidak boleh kosong.');
        return;
      }
      const updated = await resetPassword(username, newPass);
      console.log(`\n[OK] Password untuk user '${updated.username}' berhasil diperbarui!`);
      return;
    }

    // Option 1: Custom User
    console.log('\n--- Form Inject User Baru ---');
    const username = await prompter.ask('Username');
    if (!username) {
      console.error('Username wajib diisi.');
      prompter.close();
      return;
    }

    const password = await prompter.ask('Password', username);
    const defaultFullName = username.charAt(0).toUpperCase() + username.slice(1);
    const fullName = await prompter.ask('Nama Lengkap (Full Name)', defaultFullName);
    const defaultEmail = `${username.toLowerCase()}@sca.id`;
    const email = await prompter.ask('Email', defaultEmail);
    const role = await prompter.ask('Role (user / admin / supervisor)', 'user');

    // List available machines for guidance
    const machinesRes = await pool.query('SELECT machine_id, machine_num FROM machine_lists ORDER BY machine_num');
    const availableMachineIds = machinesRes.rows.map((m) => m.machine_id).join(', ');
    const machineId = await prompter.ask(`Machine ID (Pilihan mesin: ${availableMachineIds})`, '1');

    prompter.close();

    console.log('\nMenyimpan user ke database...');
    const created = await injectUser({
      username,
      password,
      full_name: fullName,
      email,
      role,
      machine_id: machineId,
      is_active: true,
    });

    console.log('\n======================================================');
    console.log('       [SUKSES] USER BERHASIL DI-INJECT KE DATABASE   ');
    console.log('======================================================');
    console.log(` - ID         : ${created.id}`);
    console.log(` - Username   : ${created.username}`);
    console.log(` - Password   : ${password}`);
    console.log(` - Full Name  : ${created.full_name}`);
    console.log(` - Role       : ${created.role}`);
    console.log(` - Machine ID : ${created.machine_id}`);
    console.log(` - Email      : ${created.email}`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('\n[GAGAL] Terjadi kesalahan:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// Run CLI if called directly
if (process.argv[1]?.endsWith('inject-user.js')) {
  runCLI();
}
