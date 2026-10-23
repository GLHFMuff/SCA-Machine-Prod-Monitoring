# Backend API - Machine Production Monitoring

Backend API berbasis Node.js & Express untuk komunikasi ke PostgreSQL, manajemen sesi autentikasi (API key/token), dan monitoring status sistem.

---

## 📁 Struktur Folder `server`

```text
server/
├── config/
│   └── db.js            # Konfigurasi PostgreSQL Connection Pool & health check logic
├── middleware/
│   └── auth.js          # Middleware validasi session key (Bearer / x-api-key)
├── routes/
│   └── auth.js          # Endpoint /api/auth (login, me, logout)
├── seed-users.js        # Script seeding user mesin1, mesin2, mesin3
├── test-auth.js         # Pengujian otomatis login & verifikasi key
├── test-db.js           # Pengujian koneksi PostgreSQL via CLI
├── .env                 # File environment aktif (kredensial DB)
├── .env.example         # Template environment
├── index.js             # Entry point API Express
└── README.md            # Dokumentasi panduan
```

---

## 👥 Akun User Terdaftar (Seeding)

| Username | Password | Role | Email | Machine ID | Active |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `mesin1` | `mesin1` | `user` | `mesin1@sca.id` | `1` | `true` |
| `mesin2` | `mesin2` | `user` | `mesin2@sca.id` | `2` | `true` |
| `mesin3` | `mesin3` | `user` | `mesin3@sca.id` | `3` | `true` |

> Password disimpan menggunakan enkripsi **bcrypt** di kolom `password_hash` pada tabel `users`.

---

## 🔑 Mekanisme Session & Key

Sistem menggunakan skema keamanan hashing SHA-256 yang selaras dengan tabel `user_sessions`:
1. **User Login (`POST /api/auth/login`)**:
   - Server memverifikasi username & password.
   - Server men-generate secure random key dengan prefix `mpm_` (contoh: `mpm_7eacdad137...`).
   - Server menyimpan **SHA-256 hash** dari key tersebut ke dalam kolom `token_hash` tabel `user_sessions`.
   - Key mentah (`raw key`) dikembalikan ke client di respon JSON.
2. **Penggunaan di API Selanjutnya**:
   - Kirimkan key di header HTTP salah satu dari format berikut:
     - `Authorization: Bearer <KEY>`
     - atau `x-api-key: <KEY>`
   - Middleware [`authenticateKey`](file:///d:/MUFF/Web/Machine%20Production%20Monitoring/server/middleware/auth.js) akan memeriksa masa berlaku session (`expires_at`), status aktif user, serta memperbarui timestamp `last_used_at`.

---

## 📡 Daftar Endpoint Autentikasi

### 1. Login
* **Method & URL**: `POST /api/auth/login`
* **Header**: `Content-Type: application/json`
* **Body**:
  ```json
  {
    "username": "mesin1",
    "password": "mesin1"
  }
  ```
* **Respon Sukses (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "data": {
      "key": "mpm_7eacdad1375c3255b7e3a4862ed188dd6484a0abd77bb57a2d07fe03bf3ed6f7",
      "token_type": "Bearer",
      "expires_at": "2026-11-21T04:26:08.762Z",
      "user": {
        "id": "abf8d89e-a088-42b3-8060-4b2d13df59e2",
        "username": "mesin1",
        "email": "mesin1@sca.id",
        "full_name": "Mesin 1",
        "role": "user",
        "machine_id": "1",
        "is_active": true
      }
    }
  }
  ```

---

### 2. Cek Profil / Validasi Key
* **Method & URL**: `GET /api/auth/me`
* **Header**: `Authorization: Bearer <KEY>` atau `x-api-key: <KEY>`
* **Respon Sukses (HTTP 200)**:
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "abf8d89e-a088-42b3-8060-4b2d13df59e2",
        "username": "mesin1",
        "email": "mesin1@sca.id",
        "full_name": "Mesin 1",
        "role": "user",
        "machine_id": "1",
        "is_active": true,
        "last_login_at": "2026-10-22T04:26:09.068Z"
      },
      "session": {
        "id": "06058862-ed2b-4640-844f-f19ba7dac76f",
        "expires_at": "2026-11-21T04:26:08.762Z"
      }
    }
  }
  ```

---

### 3. Logout (Revoke Key)
* **Method & URL**: `POST /api/auth/logout`
* **Header**: `Authorization: Bearer <KEY>`
* **Respon Sukses (HTTP 200)**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully. Session key revoked."
  }
  ```

---

## 📊 Endpoint Counting Kain (Header & Lines)

Base URL: `http://localhost:5000/api/counting` (atau alias `/api/counting-kain`)

### 1. Upsert Bundle (Header + Semua Lines Sekaligus)
Mengirimkan header beserta array baris roll dalam satu transaksi database atomik:
* **Method & URL**: `POST /api/counting/upsert`
* **Body**:
  ```json
  {
    "ProdId": "OP.012026.001113",
    "NoMesin": "1",
    "UserId": "mesin1",
    "lines": [
      {
        "RoolNumber": 1,
        "Description": "Roll Kain #1",
        "Length": 112.5,
        "IsExecute": false
      },
      {
        "RoolNumber": 2,
        "Description": "Roll Kain #2",
        "Length": 108.0,
        "IsExecute": true
      }
    ]
  }
  ```

---

### 2. Header CRUD (`CountingKainHeader`)
* **List Headers**: `GET /api/counting/headers?ProdId=...&NoMesin=...&UserId=...&limit=50&offset=0`
* **Detail Header + Lines**: `GET /api/counting/headers/:prodId`
* **Upsert Header**: `POST /api/counting/headers`
  ```json
  {
    "ProdId": "OP.012026.001113",
    "NoMesin": "1",
    "UserId": "mesin1"
  }
  ```
  *(Jika `ProdId` sudah ada, data `NoMesin` dan `UserId` otomatis di-UPDATE; jika belum ada, otomatis di-INSERT)*
* **Delete Header & Lines**: `DELETE /api/counting/headers/:prodId`

---

### 3. Lines CRUD (`CountingKainLines`)
* **List Lines**: `GET /api/counting/lines?ProdId=OP.012026.001113`
* **Detail Single Line**: `GET /api/counting/lines/:prodId/:roolNumber`
* **Upsert Lines (Single atau Array)**: `POST /api/counting/lines`
  ```json
  [
    {
      "ProdId": "OP.012026.001113",
      "RoolNumber": 1,
      "Description": "Roll #1",
      "Length": 112.5,
      "IsExecute": false
    }
  ]
  ```
  *(Jika kombinasi `ProdId` dan `RoolNumber` sudah ada, data `Description`, `Length`, `IsExecute` otomatis di-UPDATE; jika belum, otomatis di-INSERT)*
* **Delete Single Line**: `DELETE /api/counting/lines/:prodId/:roolNumber`

---

## 🛠️ Perintah CLI Tersedia

```bash
# Menjalankan server API (auto-reload)
npm run server

# Testing koneksi database
npm run server:test-db

# Menjalankan ulang seeding user
npm run server:seed

# Testing alur login & verifikasi key
npm run server:test-auth

# Testing CRUD & Upsert Counting Kain
npm run server:test-counting
```

