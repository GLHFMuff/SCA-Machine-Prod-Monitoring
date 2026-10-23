import bcrypt from 'bcryptjs';
import { pool } from './config/db.js';

const seedUsers = [
  {
    username: 'mesin1',
    password: 'mesin1',
    role: 'user',
    email: 'mesin1@sca.id',
    full_name: 'Mesin 1',
    is_active: true,
    machine_id: '1',
  },
  {
    username: 'mesin2',
    password: 'mesin2',
    role: 'user',
    email: 'mesin2@sca.id',
    full_name: 'Mesin 2',
    is_active: true,
    machine_id: '2',
  },
  {
    username: 'mesin3',
    password: 'mesin3',
    role: 'user',
    email: 'mesin3@sca.id',
    full_name: 'Mesin 3',
    is_active: true,
    machine_id: '3',
  },
];

export async function runSeed() {
  console.log('='.repeat(60));
  console.log(' Seeding Users into PostgreSQL...');
  console.log('='.repeat(60));

  const client = await pool.connect();
  try {
    for (const u of seedUsers) {
      const passwordHash = await bcrypt.hash(u.password, 10);

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
          updated_at = NOW()
        RETURNING id, username, email, role, machine_id, is_active;
      `;

      const res = await client.query(query, [
        u.email,
        u.username,
        passwordHash,
        u.full_name,
        u.role,
        u.machine_id,
        u.is_active,
      ]);

      const inserted = res.rows[0];
      console.log(`[OK] User '${inserted.username}' (ID: ${inserted.id}) ready - machine_id: ${inserted.machine_id}`);
    }

    console.log('='.repeat(60));
    console.log(' All seed users inserted / updated successfully!');
    console.log('='.repeat(60));
  } catch (err) {
    console.error(' Seeding failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// Execute directly if run as a script
if (process.argv[1]?.endsWith('seed-users.js')) {
  runSeed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async () => {
      await pool.end();
      process.exit(1);
    });
}
