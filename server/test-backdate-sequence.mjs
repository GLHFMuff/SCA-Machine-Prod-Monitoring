import { pool } from './config/db.js';
import { generateNextQrNum, parseDatePeriod } from './services/sequence.js';

async function runTests() {
  console.log('='.repeat(60));
  console.log(' Testing Backdate NumberSequence & QrNum Generation...');
  console.log('='.repeat(60));

  try {
    // Test 1: Date Period Parser
    console.log('\n[1/4] Testing parseDatePeriod for various date formats...');
    const p1 = parseDatePeriod('15/10/2026');
    const p2 = parseDatePeriod('06/11/2026');
    const p3 = parseDatePeriod('2026-09-01');
    const p4 = parseDatePeriod(new Date(2026, 7, 20)); // August 2026

    console.log(' - 15/10/2026 ->', p1.period, (p1.period === '1026' ? '✓ OK' : '❌ FAIL'));
    console.log(' - 06/11/2026 ->', p2.period, (p2.period === '1126' ? '✓ OK' : '❌ FAIL'));
    console.log(' - 2026-09-01 ->', p3.period, (p3.period === '0926' ? '✓ OK' : '❌ FAIL'));
    console.log(' - Date(Aug)  ->', p4.period, (p4.period === '0826' ? '✓ OK' : '❌ FAIL'));

    if (p1.period !== '1026' || p2.period !== '1126' || p3.period !== '0926' || p4.period !== '0826') {
      throw new Error('parseDatePeriod failed');
    }

    // Test 2: Generate Next QrNum for October (Backdate: month 10 while now is month 11)
    console.log('\n[2/4] Testing generateNextQrNum for backdate month 10 (15/10/2026)...');
    const qrOct1 = await generateNextQrNum(pool, false, '15/10/2026');
    console.log(' - Generated October QrNum 1:', qrOct1);
    if (!qrOct1.startsWith('QR.S.1026.')) {
      throw new Error(`Expected QR.S.1026..., got ${qrOct1}`);
    }

    const qrOct2 = await generateNextQrNum(pool, false, '20/10/2026');
    console.log(' - Generated October QrNum 2:', qrOct2);
    if (!qrOct2.startsWith('QR.S.1026.')) {
      throw new Error(`Expected QR.S.1026..., got ${qrOct2}`);
    }

    const seq1 = parseInt(qrOct1.split('.')[3], 10);
    const seq2 = parseInt(qrOct2.split('.')[3], 10);
    if (seq2 !== seq1 + 1) {
      throw new Error(`Sequence not consecutive! seq1: ${seq1}, seq2: ${seq2}`);
    }
    console.log(` ✓ October sequence incremented properly: ${seq1} -> ${seq2}`);

    // Test 3: Generate Next QrNum for November (Current month 11)
    console.log('\n[3/4] Testing generateNextQrNum for month 11 (06/11/2026)...');
    const qrNov1 = await generateNextQrNum(pool, false, '06/11/2026');
    console.log(' - Generated November QrNum:', qrNov1);
    if (!qrNov1.startsWith('QR.S.1126.')) {
      throw new Error(`Expected QR.S.1126..., got ${qrNov1}`);
    }
    console.log(' ✓ November sequence generated under independent period 1126!');

    // Test 4: Verify sequences in database table
    console.log('\n[4/4] Verifying rows in NumberSequences table...');
    const tableRes = await pool.query(
      `SELECT sequence_key, period, last_number FROM "NumberSequences" WHERE period IN ('1026', '1126') ORDER BY period ASC`
    );
    console.table(tableRes.rows);

    console.log('\n' + '='.repeat(60));
    console.log(' ALL BACKDATE NUMBER SEQUENCE TESTS PASSED! 🎉');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('\n❌ Test Error:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runTests();

