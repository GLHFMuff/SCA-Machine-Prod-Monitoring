import { pool } from '../config/db.js';

const show = async (label, sql, params) => {
  const r = await pool.query(sql, params);
  console.log('\n=== ' + label + ' ===');
  console.log(JSON.stringify(r.rows, null, 1));
};

try {
  await show(
    'COLUMNS users/keyalike',
    `select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema='public' and table_name in ('users','machine_lists')
     order by table_name, ordinal_position`,
  );

  await show(
    'CONSTRAINTS',
    `select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
     from pg_constraint
     where conrelid in ('public.users'::regclass,'public.machine_lists'::regclass)
     order by 1,2`,
  );

  await show(
    'INDEXES',
    `select tablename, indexdef from pg_indexes where schemaname='public' and tablename in ('users','machine_lists')`,
  );

  await show('MACHINE_LISTS', 'select * from machine_lists order by machine_num');

  await show(
    'EXISTING USERS',
    `select id, username, email, role, machine_id, is_active, deleted_at from users order by created_at`,
  );

  await show('ENUMS', `select t.typname, e.enumlabel from pg_type t join pg_enum e on e.enumtypid=t.oid order by 1, e.enumsortorder`);
} catch (err) {
  console.error('ERR:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
