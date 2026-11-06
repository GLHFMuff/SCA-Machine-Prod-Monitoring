import bcrypt from 'bcryptjs';
import { pool } from './config/db.js';

export const usersToInject = [
  { full_name: 'SHOLIKAT FATHUR', username: 'sholikat', password: 'Sholikat#241' },
  { full_name: 'DAVIT ILHAM A', username: 'davit', password: 'Davit#892' },
  { full_name: 'EKO PRASETYO', username: 'eko', password: 'Eko#517' },
  { full_name: 'LELY KURNIASARI', username: 'lely', password: 'Lely#304' },
  { full_name: 'YONA WIDAD', username: 'yona', password: 'Yona#768' },
  { full_name: 'IRFAN DWI YANTORO', username: 'irfan', password: 'Irfan#429' },
  { full_name: 'NOVY APRILIA', username: 'novy', password: 'Novy#153' },
  { full_name: 'ZAKKY AHMAD FAUZI', username: 'zakky', password: 'Zakky#680' },
  { full_name: 'EGA DESTA G', username: 'ega', password: 'Ega#935' },
  { full_name: 'RIZAL EKA ARFANDI', username: 'rizal', password: 'Rizal#274' },
  { full_name: 'HARI SUSANTO', username: 'hari', password: 'Hari#816' },
  { full_name: 'RIKO ONA', username: 'riko', password: 'Riko#549' },
  { full_name: 'FIRMAN DWI SAPUTRA', username: 'firman', password: 'Firman#391' },
  { full_name: 'ARDIYANTO', username: 'ardiyanto', password: 'Ardi#702' },
  { full_name: 'SHEVA NUR ARISKA', username: 'sheva', password: 'Sheva#618' },
  { full_name: 'SISKA ROMADHONI', username: 'siska', password: 'Siska#483' },
  { full_name: 'FANDRA EKA', username: 'fandra', password: 'Fandra#927' },
  { full_name: 'DITTO AJI SAPUTRO', username: 'ditto', password: 'Ditto#165' },
  { full_name: 'REVI ANANDA S', username: 'revi', password: 'Revi#834' },
  { full_name: 'HENRY MALIKI', username: 'henry', password: 'Henry#570' },
  { full_name: 'RONI YUSUF', username: 'roni', password: 'Roni#219' },
  { full_name: 'A. GILANG ABI P', username: 'gilang', password: 'Gilang#642' },
  { full_name: 'YULIANTO', username: 'yulianto', password: 'Yuli#387' },
  { full_name: 'LENA SULASTRI', username: 'lena', password: 'Lena#951' },
  { full_name: 'FERRY SEPTIAN', username: 'ferry', password: 'Ferry#726' },
  { full_name: 'RISMAYA NUR KHAYATI', username: 'rismaya', password: 'Rismaya#408' },
  { full_name: 'NICHO NUR H S', username: 'nicho', password: 'Nicho#193' },
  { full_name: 'NIKO DARMAWAN', username: 'niko', password: 'Niko#865' },
  { full_name: 'PURNOMO', username: 'purnomo', password: 'Purno#532' },
  { full_name: 'VACANT', username: 'vacant', password: 'Vacant#000' },
  { full_name: 'ABDUL HARITS', username: 'abdul', password: 'Abdul#741' },
  { full_name: 'SITI KARYULI', username: 'siti', password: 'Siti#298' },
  { full_name: 'VENA FRANSISKA PUTRI', username: 'vena', password: 'Vena#654' },
  { full_name: 'FAISAL BAYU IRIANTO', username: 'faisal', password: 'Faisal#310' },
];

export async function runBatchInject() {
  console.log('='.repeat(80));
  console.log(` Starting Batch User Injection (${usersToInject.length} users)...`);
  console.log(` Machine ID will be set to empty string: ""`);
  console.log('='.repeat(80));

  const client = await pool.connect();
  const summary = [];

  try {
    await client.query('BEGIN');

    for (const [index, u] of usersToInject.entries()) {
      const username = u.username.trim().toLowerCase();
      const email = `${username}@sca.id`;
      const fullName = u.full_name.trim();
      const role = 'user';
      const machineId = ''; // machine_id dikosongkan
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
        ) VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
        ON CONFLICT (username) DO UPDATE SET
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          machine_id = EXCLUDED.machine_id,
          is_active = true,
          deleted_at = NULL,
          updated_at = NOW()
        RETURNING id, username, email, full_name, role, machine_id, is_active;
      `;

      const res = await client.query(query, [
        email,
        username,
        passwordHash,
        fullName,
        role,
        machineId,
      ]);

      const inserted = res.rows[0];
      summary.push({
        no: index + 1,
        id: inserted.id,
        username: inserted.username,
        full_name: inserted.full_name,
        role: inserted.role,
        machine_id: `"${inserted.machine_id}"`,
        email: inserted.email,
      });

      console.log(`[${String(index + 1).padStart(2, '0')}/${usersToInject.length}] OK: ${inserted.username} (${inserted.full_name}) -> machine_id: ""`);
    }

    await client.query('COMMIT');
    console.log('='.repeat(80));
    console.log(` Successfully injected all ${usersToInject.length} users into 'users' table!`);
    console.log('='.repeat(80));

    console.table(summary);
    return summary;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(' Batch injection failed, transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('inject-batch-users.mjs')) {
  runBatchInject()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}

