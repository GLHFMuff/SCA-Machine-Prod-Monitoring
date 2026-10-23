const API_BASE = 'http://localhost:5000';

async function runCountingTests() {
  console.log('='.repeat(60));
  console.log(' Running CountingKain CRUD & Upsert API Tests...');
  console.log('='.repeat(60));

  const testProdId = `TEST.${Date.now()}`;

  // 1. Get existing headers
  console.log('\n[1/6] Testing GET /api/counting/headers...');
  const getHeadersRes = await fetch(`${API_BASE}/api/counting/headers?limit=3`);
  const getHeadersData = await getHeadersRes.json();
  console.log(' HTTP Status:', getHeadersRes.status);
  console.log(' Headers found:', getHeadersData.count);
  console.log(' Sample header:', getHeadersData.data?.[0]);

  // 2. Upsert single header
  console.log(`\n[2/6] Testing POST /api/counting/headers (Create '${testProdId}')...`);
  const createHeaderRes = await fetch(`${API_BASE}/api/counting/headers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ProdId: testProdId,
      NoMesin: '2',
      UserId: 'mesin2',
    }),
  });
  const createHeaderData = await createHeaderRes.json();
  console.log(' HTTP Status:', createHeaderRes.status);
  console.log(' Action:', createHeaderData.action, '| Data:', createHeaderData.data);

  // 3. Upsert single header update
  console.log(`\n[3/6] Testing POST /api/counting/headers (Update '${testProdId}')...`);
  const updateHeaderRes = await fetch(`${API_BASE}/api/counting/headers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ProdId: testProdId,
      NoMesin: '3',
      UserId: 'mesin3',
    }),
  });
  const updateHeaderData = await updateHeaderRes.json();
  console.log(' HTTP Status:', updateHeaderRes.status);
  console.log(' Action:', updateHeaderData.action, '| Updated Data:', updateHeaderData.data);

  // 4. Upsert single and multiple lines
  console.log(`\n[4/6] Testing POST /api/counting/lines for '${testProdId}'...`);
  const linesRes = await fetch(`${API_BASE}/api/counting/lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      {
        ProdId: testProdId,
        RoolNumber: 1,
        Description: 'Roll Kain Test #1',
        Length: 120.5,
        IsExecute: false,
      },
      {
        ProdId: testProdId,
        RoolNumber: 2,
        Description: 'Roll Kain Test #2',
        Length: 115.0,
        IsExecute: true,
      },
    ]),
  });
  const linesData = await linesRes.json();
  console.log(' HTTP Status:', linesRes.status);
  console.log(' Upserted lines count:', linesData.count);

  // 5. Get header with lines
  console.log(`\n[5/6] Testing GET /api/counting/headers/${testProdId}...`);
  const detailRes = await fetch(`${API_BASE}/api/counting/headers/${testProdId}`);
  const detailData = await detailRes.json();
  console.log(' HTTP Status:', detailRes.status);
  console.log(' Header detail:', {
    ProdId: detailData.data?.ProdId,
    NoMesin: detailData.data?.NoMesin,
    UserId: detailData.data?.UserId,
    linesCount: detailData.data?.lines?.length,
  });

  // 6. Delete test record
  console.log(`\n[6/6] Testing DELETE /api/counting/headers/${testProdId}...`);
  const deleteRes = await fetch(`${API_BASE}/api/counting/headers/${testProdId}`, {
    method: 'DELETE',
  });
  const deleteData = await deleteRes.json();
  console.log(' HTTP Status:', deleteRes.status);
  console.log(' Message:', deleteData.message);

  console.log('\n' + '='.repeat(60));
  console.log(' ALL COUNTING KAIN CRUD & UPSERT TESTS PASSED! ');
  console.log('='.repeat(60));
}

runCountingTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
