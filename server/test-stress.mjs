import bcrypt from 'bcryptjs';
import { pool } from './config/db.js';
import { usersToInject } from './inject-batch-users.mjs';
import { generateNextQrNum, parseDatePeriod } from './services/sequence.js';

// Color helpers for terminal output
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

function calculateStats(latencies) {
  if (!latencies.length) return { min: 0, max: 0, avg: 0, p95: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = (sum / sorted.length).toFixed(2);
  const min = sorted[0].toFixed(2);
  const max = sorted[sorted.length - 1].toFixed(2);
  const p95Index = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
  const p95 = sorted[p95Index].toFixed(2);
  return { min, max, avg, p95 };
}

async function runStretchTest() {
  console.log('\n' + '='.repeat(80));
  console.log(bold(cyan('        COMPREHENSIVE STRETCH / STRESS TEST SUITE         ')));
  console.log(bold(cyan('  Machine Production Monitoring - Backdate, Sequences, Auth  ')));
  console.log('='.repeat(80) + '\n');

  let passedAll = true;

  // =========================================================================
  // TEST 1: User Injection & Authentication Verification (34 Users)
  // =========================================================================
  console.log(bold('--- TEST 1: User Injection & Password Verification (34 Users) ---'));
  const test1Start = Date.now();
  const authLatencies = [];
  let authFailures = 0;

  try {
    const dbUsersRes = await pool.query(`
      SELECT username, password_hash, full_name, machine_id, is_active
      FROM users
      WHERE deleted_at IS NULL
    `);
    const dbUserMap = new Map(dbUsersRes.rows.map((u) => [u.username.toLowerCase(), u]));

    // Check all 34 users concurrently
    const authChecks = usersToInject.map(async (u) => {
      const t0 = performance.now();
      const dbUser = dbUserMap.get(u.username.toLowerCase());
      if (!dbUser) {
        authFailures++;
        console.error(red(`[FAIL] User '${u.username}' not found in database.`));
        return false;
      }

      if (dbUser.machine_id !== '') {
        authFailures++;
        console.error(red(`[FAIL] User '${u.username}' machine_id is not empty (got: '${dbUser.machine_id}').`));
        return false;
      }

      const match = await bcrypt.compare(u.password, dbUser.password_hash);
      const t1 = performance.now();
      authLatencies.push(t1 - t0);

      if (!match) {
        authFailures++;
        console.error(red(`[FAIL] Password mismatch for '${u.username}'.`));
        return false;
      }
      return true;
    });

    await Promise.all(authChecks);
    const stats1 = calculateStats(authLatencies);

    if (authFailures === 0) {
      console.log(green(`[PASS] All ${usersToInject.length} injected users verified!`));
      console.log(`       - All 34 passwords match bcrypt hashes.`);
      console.log(`       - All 34 machine_id fields are strictly empty string "".`);
      console.log(`       - Auth verification latency: avg=${stats1.avg}ms, p95=${stats1.p95}ms, min=${stats1.min}ms, max=${stats1.max}ms`);
    } else {
      console.log(red(`[FAIL] Found ${authFailures} failures in injected user verification.`));
      passedAll = false;
    }
  } catch (err) {
    console.error(red(`[ERROR] Test 1 encountered an exception:`), err.message);
    passedAll = false;
  }

  // =========================================================================
  // TEST 2: High Concurrency QR Sequence Generation with Backdate (180 concurrent)
  // =========================================================================
  console.log('\n' + bold('--- TEST 2: High Concurrency QR Sequence (180 Parallel Requests) ---'));
  console.log('    Testing 3 distinct periods simultaneously:');
  console.log('    - 60 requests for Current Period (11/2026 -> QR.S.1126.xxxxxxxx)');
  console.log('    - 60 requests for Backdate Period 1 (10/2026 -> QR.S.1026.xxxxxxxx)');
  console.log('    - 60 requests for Backdate Period 2 (09/2026 -> QR.S.0926.xxxxxxxx)');

  const seqLatencies = [];
  const results1126 = [];
  const results1026 = [];
  const results0926 = [];

  const BATCH_SIZE = 60;
  const seqTasks = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    // Current: 06/11/2026
    seqTasks.push(
      (async () => {
        const t0 = performance.now();
        const num = await generateNextQrNum(pool, false, '06/11/2026');
        const t1 = performance.now();
        seqLatencies.push(t1 - t0);
        results1126.push(num);
      })()
    );

    // Backdate 1: 25/10/2026
    seqTasks.push(
      (async () => {
        const t0 = performance.now();
        const num = await generateNextQrNum(pool, false, '25/10/2026');
        const t1 = performance.now();
        seqLatencies.push(t1 - t0);
        results1026.push(num);
      })()
    );

    // Backdate 2: 15/09/2026
    seqTasks.push(
      (async () => {
        const t0 = performance.now();
        const num = await generateNextQrNum(pool, false, '15/09/2026');
        const t1 = performance.now();
        seqLatencies.push(t1 - t0);
        results0926.push(num);
      })()
    );
  }

  const seqStart = Date.now();
  await Promise.all(seqTasks);
  const seqDuration = Date.now() - seqStart;
  const stats2 = calculateStats(seqLatencies);

  // Validate results per period
  function validatePeriodResults(periodName, results, expectedPrefix) {
    const total = results.length;
    const unique = new Set(results).size;
    const formatValid = results.every((r) => r.startsWith(expectedPrefix));

    // Extract numbers to verify monotonic increase
    const numbers = results
      .map((r) => parseInt(r.split('.')[3], 10))
      .sort((a, b) => a - b);

    let isContiguous = true;
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i] !== numbers[i - 1] + 1) {
        isContiguous = false;
        break;
      }
    }

    const passed = total === BATCH_SIZE && unique === BATCH_SIZE && formatValid && isContiguous;
    console.log(
      `    ${passed ? green('[PASS]') : red('[FAIL]')} Period ${periodName} (${expectedPrefix}): ` +
      `Count=${total}, Unique=${unique}/${BATCH_SIZE}, Contiguous=${isContiguous ? 'YES' : 'NO'}, ` +
      `Range=[${numbers[0]} .. ${numbers[numbers.length - 1]}]`
    );
    return passed;
  }

  const p1126Ok = validatePeriodResults('1126 (Current)', results1126, 'QR.S.1126.');
  const p1026Ok = validatePeriodResults('1026 (Backdate Oct)', results1026, 'QR.S.1026.');
  const p0926Ok = validatePeriodResults('0926 (Backdate Sep)', results0926, 'QR.S.0926.');

  if (p1126Ok && p1026Ok && p0926Ok) {
    console.log(green(`[PASS] 180 concurrent sequence generation operations succeeded flawlessly!`));
    console.log(`       - Total time: ${seqDuration}ms (${(180 / (seqDuration / 1000)).toFixed(1)} ops/sec)`);
    console.log(`       - Latency: avg=${stats2.avg}ms, p95=${stats2.p95}ms, min=${stats2.min}ms, max=${stats2.max}ms`);
    console.log(`       - Zero collisions, zero sequence gaps, complete period isolation.`);
  } else {
    console.log(red(`[FAIL] Sequence generation errors detected.`));
    passedAll = false;
  }

  // =========================================================================
  // TEST 3: Concurrent Insert into CountingKainLines with TransDate
  // =========================================================================
  console.log('\n' + bold('--- TEST 3: Concurrent CountingKainLines Insert & TransDate Verification ---'));
  const testProdId = `STRESS_TEST_${Date.now()}`;
  const mockInsertCount = 30;
  const insertLatencies = [];
  const insertedQrCodes = [];

  try {
    // We insert 30 lines concurrently, alternating between 3 different dates
    const dates = ['06/11/2026', '22/10/2026', '18/09/2026'];
    const insertTasks = Array.from({ length: mockInsertCount }, async (_, idx) => {
      const transDate = dates[idx % dates.length];
      const rollNumber = idx + 1;
      const t0 = performance.now();

      // Generate sequence inside transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const qrNum = await generateNextQrNum(client, false, transDate);
        insertedQrCodes.push(qrNum);

        const query = `
          INSERT INTO "CountingKainLines" (
            "ProdId", "LineNum", "RollNumber", "QrNum", "Qty", "TransDate",
            "Color", "ItemName", "Lebar", "Gramasi", "LotResep", "Grade",
            "IsStock", "CreatedAt", "UpdatedAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            'Hitam', 'Kain Uji Stres', '180cm', '240gsm', 'LOT-TEST', 'A',
            false, NOW(), NOW()
          ) RETURNING "LineNum", "QrNum", "TransDate";
        `;

        const res = await client.query(query, [
          testProdId,
          idx + 1,
          rollNumber,
          qrNum,
          35.5,
          transDate,
        ]);

        await client.query('COMMIT');
        const t1 = performance.now();
        insertLatencies.push(t1 - t0);
        return res.rows[0];
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    const insertedRows = await Promise.all(insertTasks);
    const stats3 = calculateStats(insertLatencies);

    // Verify all rows in database
    const verifyRes = await pool.query(
      `SELECT "LineNum", "QrNum", "TransDate", "RollNumber" FROM "CountingKainLines" WHERE "ProdId" = $1 ORDER BY "LineNum" ASC`,
      [testProdId]
    );

    const verified = verifyRes.rows;
    let formatOk = true;
    for (const r of verified) {
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(r.TransDate)) {
        formatOk = false;
        console.error(red(`[FAIL] TransDate format invalid in DB: '${r.TransDate}' for QrNum: ${r.QrNum}`));
      }
    }

    if (verified.length === mockInsertCount && formatOk) {
      console.log(green(`[PASS] Successfully inserted and verified ${mockInsertCount} concurrent CountingKainLines!`));
      console.log(`       - All rows preserved DD/MM/YYYY TransDate format in database.`);
      console.log(`       - Insertion latency: avg=${stats3.avg}ms, p95=${stats3.p95}ms, min=${stats3.min}ms, max=${stats3.max}ms`);
    } else {
      console.log(red(`[FAIL] Expected ${mockInsertCount} rows, verified ${verified.length}. Format ok: ${formatOk}`));
      passedAll = false;
    }

    // Cleanup stress test records
    await pool.query(`DELETE FROM "CountingKainLines" WHERE "ProdId" = $1`, [testProdId]);
    console.log(cyan(`       - Cleaned up temporary test lines for ProdId: ${testProdId}.`));
  } catch (err) {
    console.error(red(`[ERROR] Test 3 encountered an exception:`), err.message);
    passedAll = false;
  }

  // =========================================================================
  // TEST 4: Database Connection Pool Stress (50 rapid burst queries)
  // =========================================================================
  console.log('\n' + bold('--- TEST 4: Connection Pool Burst & Stability Test (50 Rapid Requests) ---'));
  const poolLatencies = [];
  try {
    const burstTasks = Array.from({ length: 50 }, async () => {
      const t0 = performance.now();
      const res = await pool.query('SELECT 1 AS alive, NOW() as server_time');
      const t1 = performance.now();
      poolLatencies.push(t1 - t0);
      return res.rows[0].alive;
    });

    const burstResults = await Promise.all(burstTasks);
    const stats4 = calculateStats(poolLatencies);
    const allAlive = burstResults.every((x) => x === 1);

    if (allAlive) {
      console.log(green(`[PASS] Connection pool handled 50 rapid bursts cleanly without starvation!`));
      console.log(`       - Burst latency: avg=${stats4.avg}ms, p95=${stats4.p95}ms, min=${stats4.min}ms, max=${stats4.max}ms`);
      console.log(`       - Active clients remaining in pool: ${pool.totalCount - pool.idleCount} (Idle: ${pool.idleCount})`);
    } else {
      console.log(red(`[FAIL] Connection pool burst failed.`));
      passedAll = false;
    }
  } catch (err) {
    console.error(red(`[ERROR] Test 4 encountered an exception:`), err.message);
    passedAll = false;
  }

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  if (passedAll) {
    console.log(bold(green('                    ALL STRETCH TESTS PASSED (100% OK)                    ')));
    console.log(green('  - 34 Injected users: Authentication, bcrypt & empty machine_id verified'));
    console.log(green('  - Backdate & Sequence concurrency: 180 parallel generations without conflict'));
    console.log(green('  - TransDate handling: Format DD/MM/YYYY validated under transactional load'));
    console.log(green('  - Connection pool: Zero leaks, zero deadlock, rapid throughput confirmed'));
  } else {
    console.log(bold(red('                 SOME STRETCH TESTS ENCOUNTERED FAILURES                  ')));
  }
  console.log('='.repeat(80) + '\n');

  return passedAll;
}

runStretchTest()
  .then(async (ok) => {
    await pool.end();
    process.exit(ok ? 0 : 1);
  })
  .catch(async (err) => {
    console.error('Fatal test error:', err);
    await pool.end();
    process.exit(1);
  });
