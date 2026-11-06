import { pool } from '../config/db.js';

const r = await pool.query(
  `select a.attname, a.atttypid::regtype::text as typ, t.typtype, t.typname,
          format_type(a.atttypid, a.atttypmod) as formatted
   from pg_attribute a
   join pg_class c on c.oid = a.attrelid
   join pg_type t on t.oid = a.atttypid
   where c.relname = 'users' and a.attname = 'email' and a.attnum > 0`,
);
console.log('EMAIL TYPE:', JSON.stringify(r.rows, null, 1));

const d = await pool.query(`select oid::regtype::text as typ, typtype from pg_type where typname in (select typname from pg_type where oid = (select atttypid from pg_attribute where attrelid='public.users'::regclass and attname='email'))`);
console.log('DETAIL:', JSON.stringify(d.rows, null, 1));

try {
  const dom = await pool.query(`select t.typname, t.typtype, t.typbasetype::regtype::text as base, t.typnotnull from pg_type t where t.typname = (select format_type(atttypid,atttypmod) from pg_attribute where attrelid='public.users'::regclass and attname='email')`);
  console.log('DOMAIN:', JSON.stringify(dom.rows, null, 1));
} catch (e) {
  console.log('domain lookup err:', e.message);
}

const types = await pool.query(`select typname, typtype, typcategory from pg_type where typtype in ('d','e','c') and typnamespace='public'::regnamespace`);
console.log('CUSTOM TYPES IN public:', JSON.stringify(types.rows, null, 1));

await pool.end();
