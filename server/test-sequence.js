import { pool } from './config/db.js';
import { generateNextQrNum, ensureSequenceTable } from './services/sequence.js';

const API_BASE = 'http://127.0.0.1:5000';

async function testSequenceFeature() {
  console.log('='.repeat(60));
  console.log(' Testing Number Sequence for CountingKainLines (QrNum)...');
  console.log('='.repeat(60));

  const testProdId = `TEST.SEQ.${Date.now()}`;
  console.log(`Test ProdId: ${testProdId}\n`);

  try {
    // 0. Ensure table exists
    await ensureSequenceTable(pool);
    console.log('[Step 0] Table NumberSequences verified.');

    // 1. Create a bundle with 2 lines: line 1 (isStock: false), line 2 (isStock: true)
    console.log('\n[Step 1] Testing POST /api/counting/upsert with isStock false & true...');
    const upsertRes = await fetch(`${API_BASE}/api/counting/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ProdId: testProdId,
        NoMesin: '1',
        UserId: 'tester',
        lines: [
          {
            RoolNumber: 1,
            Description: 'Roll Order #1',
            Length: 125.5,
            isStock: false,
          },
          {
            RoolNumber: 2,
            Description: 'Roll Stock #2',
            Length: 130.0,
            isStock: true,
          },
        ],
      }),
    });

    const upsertData = await upsertRes.json();
    console.log('Status:', upsertRes.status);
    console.log('Upsert response lines:');
    for (const l of upsertData.data?.lines || []) {
      console.log(` - Roll #${l.RoolNumber}: isStock=${l.isStock}, QrNum=${l.QrNum}`);
    }

    const line1 = upsertData.data?.lines?.find((l) => l.RoolNumber === 1);
    const line2 = upsertData.data?.lines?.find((l) => l.RoolNumber === 2);

    if (!line1?.QrNum?.startsWith('QR.S.') || line1?.isStock !== false) {
      throw new Error(`Line 1 QrNum invalid! Expected QR.S..., got ${line1?.QrNum}`);
    }
    if (!line2?.QrNum?.startsWith('QR.S.') || line2?.isStock !== true) {
      throw new Error(`Line 2 QrNum invalid! Expected QR.S..., got ${line2?.QrNum}`);
    }

    console.log('✓ Line 1 correctly generated with QR.S format (isStock=false)!');
    console.log('✓ Line 2 correctly generated with QR.S format (isStock=true)!');

    // 2. Fetch via GET /api/counting/headers/:prodId
    console.log(`\n[Step 2] Testing GET /api/counting/headers/${testProdId}...`);
    const getRes = await fetch(`${API_BASE}/api/counting/headers/${testProdId}`);
    const getData = await getRes.json();
    console.log('Status:', getRes.status);
    console.log('Lines fetched:');
    for (const l of getData.data?.lines || []) {
      console.log(` - Roll #${l.RoolNumber}: isStock=${l.isStock}, QrNum=${l.QrNum}`);
    }

    // 3. Test PATCH /api/counting/lines/:prodId/:roolNumber/stock (Toggle Line 1 from Order to Stock)
    console.log(`\n[Step 3] Testing PATCH /api/counting/lines/${testProdId}/1/stock to isStock=true...`);
    const patchRes = await fetch(`${API_BASE}/api/counting/lines/${testProdId}/1/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isStock: true }),
    });
    const patchData = await patchRes.json();
    console.log('Status:', patchRes.status);
    console.log('Updated line 1 data:', patchData.data);

    if (!patchData.data?.QrNum?.startsWith('QR.S.') || patchData.data?.isStock !== true) {
      throw new Error(`PATCH stock failed! Expected QR.S..., got ${patchData.data?.QrNum}`);
    }
    console.log('✓ Line 1 successfully toggled to Stock (QR.S...)!');

    // 4. Test Single Line Insert via POST /api/counting/lines
    console.log(`\n[Step 4] Testing POST /api/counting/lines for Roll #3...`);
    const postLineRes = await fetch(`${API_BASE}/api/counting/lines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ProdId: testProdId,
        RoolNumber: 3,
        Length: 150.0,
        isStock: false,
      }),
    });
    const postLineData = await postLineRes.json();
    console.log('Status:', postLineRes.status);
    console.log('Line 3 created:', postLineData.data);
    if (!postLineData.data?.QrNum?.startsWith('QR.S.')) {
      throw new Error(`Line 3 QrNum invalid! Got ${postLineData.data?.QrNum}`);
    }
    console.log('✓ Line 3 successfully created with QR.S format!');

    // 5. Cleanup test data
    console.log(`\n[Step 5] Cleaning up test records for ${testProdId}...`);
    await pool.query('DELETE FROM "CountingKainLines" WHERE "ProdId" = $1', [testProdId]);
    await pool.query('DELETE FROM "CountingKainHeader" WHERE "ProdId" = $1', [testProdId]);
    console.log('✓ Cleaned up test lines and header.');

    console.log('\n' + '='.repeat(60));
    console.log(' ALL NUMBER SEQUENCE TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('='.repeat(60));
  } catch (err) {
    console.error('\n❌ Test Failed:', err);
  } finally {
    await pool.end();
  }
}

testSequenceFeature();
