import { checkDatabaseConnection, pool, dbConfig } from './config/db.js';

console.log('='.repeat(60));
console.log(' Testing PostgreSQL Database Connection...');
console.log(` Target Host : ${dbConfig.host}:${dbConfig.port}`);
console.log(` Database    : ${dbConfig.database}`);
console.log(` User        : ${dbConfig.user}`);
console.log(` SSL         : ${Boolean(dbConfig.ssl)}`);
console.log('='.repeat(60));

try {
  const result = await checkDatabaseConnection();

  if (result.connected) {
    console.log(' Connection SUCCESSFUL!');
    console.log(` Latency     : ${result.latencyMs}ms`);
    console.log(` Server Time : ${result.serverTime}`);
    console.log(` PG Version  : ${result.version}`);
  } else {
    console.error(' Connection FAILED:');
    console.error(` Error Message : ${result.error}`);
    console.error(` Error Code    : ${result.code}`);
    console.error(` Latency       : ${result.latencyMs}ms`);
  }
} catch (err) {
  console.error(' Unexpected test error:', err.message);
} finally {
  await pool.end();
  process.exit(0);
}
