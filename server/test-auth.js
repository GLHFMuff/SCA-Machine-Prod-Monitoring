import crypto from 'crypto';

const API_BASE = 'http://localhost:5000';

async function runAuthTests() {
  console.log('='.repeat(60));
  console.log(' Running Auth & Session Key Tests...');
  console.log('='.repeat(60));

  // Test 1: Health check
  console.log('\n[1/5] Checking API Health...');
  try {
    const healthRes = await fetch(`${API_BASE}/api/health`);
    const health = await healthRes.json();
    console.log(` Health status: ${health.status} (DB: ${health.database?.status})`);
  } catch (err) {
    console.error(' Health check failed. Make sure server is running on port 5000:', err.message);
    process.exit(1);
  }

  // Test 2: Login with mesin1
  console.log('\n[2/5] Testing Login for mesin1...');
  let sessionKey = null;
  try {
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'mesin1',
        password: 'mesin1',
      }),
    });

    const loginData = await loginRes.json();
    console.log(' Login HTTP Status:', loginRes.status);
    console.log(' Login Response:', JSON.stringify(loginData, null, 2));

    if (!loginData.success || !loginData.data?.key) {
      throw new Error('Login failed or key not received');
    }

    sessionKey = loginData.data.key;
    console.log(' Received Session Key:', sessionKey);
  } catch (err) {
    console.error(' Login failed:', err.message);
    process.exit(1);
  }

  // Test 3: Authenticate with Bearer token
  console.log('\n[3/5] Testing GET /api/auth/me with Bearer token...');
  try {
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${sessionKey}`,
      },
    });

    const meData = await meRes.json();
    console.log(' /me HTTP Status:', meRes.status);
    console.log(' /me User Data:', JSON.stringify(meData, null, 2));

    if (!meData.success || meData.data?.user?.username !== 'mesin1') {
      throw new Error('/me verification failed');
    }
    console.log(' Bearer Authentication SUCCESSFUL!');
  } catch (err) {
    console.error(' Bearer test failed:', err.message);
    process.exit(1);
  }

  // Test 4: Authenticate with x-api-key header
  console.log('\n[4/5] Testing GET /api/auth/me with x-api-key header...');
  try {
    const apiKeyRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        'x-api-key': sessionKey,
      },
    });

    const apiKeyData = await apiKeyRes.json();
    console.log(' /me with x-api-key HTTP Status:', apiKeyRes.status);
    if (!apiKeyData.success) {
      throw new Error('x-api-key test failed');
    }
    console.log(' x-api-key Authentication SUCCESSFUL!');
  } catch (err) {
    console.error(' x-api-key test failed:', err.message);
    process.exit(1);
  }

  // Test 5: Invalid Password
  console.log('\n[5/5] Testing Invalid Password rejection...');
  try {
    const badLoginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'mesin1',
        password: 'wrong_password',
      }),
    });

    const badData = await badLoginRes.json();
    console.log(' Bad Login HTTP Status (Expected 401):', badLoginRes.status);
    if (badLoginRes.status === 401) {
      console.log(' Rejection working as expected:', badData.message);
    } else {
      throw new Error(`Expected 401 but got ${badLoginRes.status}`);
    }
  } catch (err) {
    console.error(' Bad password test failed:', err.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(' ALL AUTH & SESSION TESTS PASSED SUCCESSFULLY! ');
  console.log('='.repeat(60));
}

runAuthTests();
