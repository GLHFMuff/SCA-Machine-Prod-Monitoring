import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Kumpulkan semua alamat IP lokal (LAN) dan Hostname mesin Windows ini
function getHostDomainsAndIps() {
  const domains = ['localhost', '127.0.0.1'];
  const hostname = os.hostname();
  if (hostname && !domains.includes(hostname)) {
    domains.push(hostname);
  }

  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Ambil hanya IPv4 yang non-internal (misal 192.168.x.x atau 10.x.x.x)
      if (net.family === 'IPv4' && !net.internal) {
        if (!domains.includes(net.address)) {
          domains.push(net.address);
        }
      }
    }
  }
  return domains;
}

async function generateSslCertificates() {
  const sslDir = path.resolve(__dirname, 'ssl');
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }

  const domains = getHostDomainsAndIps();
  console.log('='.repeat(60));
  console.log(' Pembuat Sertifikat SSL Otomatis untuk Windows (Dev Server)');
  console.log('='.repeat(60));
  console.log(`Daftar IP & Host yang didaftarkan ke SSL:\n -> ${domains.join('\n -> ')}\n`);

  try {
    // Gunakan modul createCertificate bawaan dari @vitejs/plugin-basic-ssl
    const { createCertificate } = await import(
      '../node_modules/@vitejs/plugin-basic-ssl/dist/chunks/certificate.mjs'
    );

    // Buat sertifikat berlaku selama 365 hari
    const rawPem = createCertificate('MachineProductionMonitoring', domains, 365);

    // Pisahkan private key dan certificate
    const keyMatch = rawPem.match(/-----BEGIN RSA PRIVATE KEY-----[\s\S]+?-----END RSA PRIVATE KEY-----/);
    const certMatch = rawPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);

    if (!keyMatch || !certMatch) {
      throw new Error('Gagal memisahkan Private Key dan Certificate dari generator.');
    }

    const keyPath = path.join(sslDir, 'server.key');
    const certPath = path.join(sslDir, 'server.crt');

    fs.writeFileSync(keyPath, keyMatch[0].trim() + '\n', 'utf8');
    fs.writeFileSync(certPath, certMatch[0].trim() + '\n', 'utf8');

    console.log('✓ Sukses! File SSL berhasil dibuat:');
    console.log(`  1. Private Key : ${keyPath}`);
    console.log(`  2. Certificate : ${certPath}`);
    console.log('='.repeat(60));
    console.log('Langkah Selanjutnya untuk Mengaktifkan HTTPS:');
    console.log('1. Buka file server/.env dan pastikan baris ini aktif:');
    console.log('   ENABLE_HTTPS=true');
    console.log('2. Jalankan server:');
    console.log('   npm run server');
    console.log('3. Buka browser di tablet/PC operator menggunakan HTTPS:');
    domains.forEach((d) => {
      console.log(`   👉 https://${d}:5000`);
    });
    console.log('='.repeat(60));
  } catch (err) {
    console.error('Gagal membuat sertifikat SSL:', err.message);
    process.exit(1);
  }
}

generateSslCertificates();

