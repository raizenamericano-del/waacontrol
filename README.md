# NexusWA — WhatsApp Multi-Device Controller

Dashboard full-stack untuk menghubungkan **akun WhatsApp milik sendiri** sebagai linked device, membaca percakapan, dan mengirim teks/media. Monorepo berisi API Node.js/Express + TypeScript, Baileys `7.0.0-rc14`, Socket.IO, Prisma `6.12.0`, dan UI Next.js `15.5.27` App Router + Tailwind CSS `4.3.3`.

> **Catatan keamanan versi:** spesifikasi meminta Next.js 14, tetapi rilis 14 yang tersedia pada saat project dibuat masih terkena advisori keamanan yang dilaporkan `npm audit`. Karena targetnya production-ready, frontend memakai Next.js 15.5.27 yang tetap memakai App Router dan React 18. Prisma dipin ke 6.12.0 dan dependency transitive diperketat agar `npm audit` bersih. Struktur UI memakai pola komponen `components/ui` ala shadcn, tanpa mengunci ke generator CLI.

> **Penting — integrasi tidak resmi.** Project memakai `@whiskeysockets/baileys` untuk berbicara dengan layanan WhatsApp Web, bukan WhatsApp Business Platform/Cloud API. Baileys bukan library resmi atau didukung WhatsApp dan perubahan protokol dapat memutus koneksi. Penggunaan otomatisasi yang tidak sesuai ketentuan WhatsApp dapat menyebabkan pembatasan akun. Gunakan hanya nomor yang kamu miliki/berwenang kelola; jangan melakukan spam, scraping, atau mengirim pesan tanpa persetujuan. Untuk penggunaan bisnis/volume tinggi gunakan WhatsApp Business Platform resmi.
>
> **Format pairing code:** WhatsApp/Baileys mengeluarkan kode pairing **8 karakter alfanumerik** (Baileys terbaru menyediakan kode khusus dengan panjang delapan karakter). Protokol tidak mengizinkan aplikasi ini mengubahnya menjadi enam digit. UI menampilkan kode yang benar-benar dikembalikan WhatsApp.

## Fitur yang sudah diimplementasikan

- Login admin tunggal dengan cookie JWT **HttpOnly**, `SameSite` configurable, rate limit login, origin guard, Helmet, CORS credentials, dan pembatasan API.
- Auth folder diproteksi dengan permission POSIX `0700` (direktori) dan `0600` (file); proses memakai `umask 077`. Gunakan volume dengan enkripsi at-rest dari provider dan batasi akses OS.
- Multi-session: buat session dari nomor E.164 internasional (digit saja, mis. `62812…`), minta pairing code, verifikasi kode opsional, status koneksi, unlink/hapus session.
- Penyimpanan auth state Baileys terpisah per session (`AUTH_DIR/<session-id>`), permission folder/file ketat pada filesystem POSIX, restore session saat backend start, graceful shutdown, reconnect exponential backoff.
- Inbound/outbound text, image, video, document, audio, sticker, presence dan message acknowledgement; penyimpanan chat/pesan di Prisma; update real-time melalui Socket.IO.
- Kirim media melalui multipart upload. Voice note dapat direkam dari browser; backend mengonversi WebM/format lain ke OGG/Opus dengan FFmpeg. File audio OGG/Opus bisa langsung dipakai tanpa konversi.
- SQLite untuk development dan PostgreSQL untuk production. Dua schema provider berada di `backend/prisma/`; script memilih schema dari `DB_PROVIDER`.
- Dark responsive UI: dashboard perangkat, pairing flow, inbox dengan daftar chat, status online, search, chat baru, media preview, pengiriman teks/lampiran/voice note.
- Dockerfiles terpisah untuk backend dan frontend serta konfigurasi Railway multi-service.

## Arsitektur singkat

```text
Browser (Next.js :3000)
  ├─ REST, cookie HttpOnly ───────────────> Express API (:4000)
  └─ Socket.IO, cookie auth ──────────────> Socket.IO server
                                               ├─ Baileys socket per session
                                               ├─ Prisma ─ SQLite dev / PostgreSQL prod
                                               ├─ AUTH_DIR (kredensial linked-device)
                                               └─ UPLOAD_DIR (file media lokal, dilindungi auth API)
```

Backend berjalan sebagai satu instance untuk menghindari dua proses memegang auth state session yang sama. Socket events dikirim ke admin yang sudah terautentikasi. Database berisi metadata dan riwayat; auth state WhatsApp dan file media berada di storage filesystem terpisah. Untuk deployment, **pasang persistent volume** pada backend dan arahkan `AUTH_DIR` serta `UPLOAD_DIR` ke volume itu.

## Prasyarat local

- Node.js 20.11+ (project dites dengan Node 20) dan npm.
- FFmpeg tersedia di `PATH` untuk konversi voice note browser WebM ke OGG/Opus. Jika tidak ada, unggah file voice note OGG/Opus yang sudah sesuai.
- Akun WhatsApp di ponsel yang akan ditautkan.

## Install & jalankan local

Dari direktori root project:

```bash
cp .env.example .env
# Edit .env: ganti JWT_SECRET dan ADMIN_PASSWORD sebelum dipakai.
npm install
npm run setup
npm run dev
```

Skrip root memuat `.env` dan meneruskannya ke frontend serta backend, sehingga `NEXT_PUBLIC_API_URL` dan pengaturan API yang kamu ubah dipakai konsisten. Buka `http://localhost:3000`. API berjalan di `http://localhost:4000` dan health check ada di `/health`.

`npm run setup` menjalankan `prisma generate` dan `prisma db push` terhadap schema sesuai `DB_PROVIDER`. Pada development bawaan, database SQLite akan dibuat di `backend/data/dev.db`.

Untuk secret lokal yang aman, buat string acak minimal 32 karakter, misalnya:

```bash
openssl rand -base64 48
```

Pastikan `ADMIN_PASSWORD` minimal 12 karakter. Backend juga menerima bcrypt hash sebagai `ADMIN_PASSWORD` jika nilainya berawalan `$2a$`, `$2b$`, atau `$2y$` (generate hash dengan `bcryptjs`/`bcrypt`). Jangan commit `.env`.

## Setup environment

| Variable | Default / contoh | Keterangan |
|---|---|---|
| `NODE_ENV` | `development` | Gunakan `production` di deploy. |
| `PORT` | `4000` | Port API; Railway memasang nilai runtime. |
| `DB_PROVIDER` | `sqlite` | `sqlite` atau `postgresql`; menentukan schema Prisma yang digenerate. |
| `DATABASE_URL` | `file:../data/dev.db` | SQLite URL (relatif terhadap schema di `backend/prisma`) atau URL PostgreSQL. |
| `JWT_SECRET` | wajib, min. 32 karakter | Secret JWT admin. Gunakan secret unik dan acak. |
| `JWT_EXPIRES_IN` | `12h` | Masa berlaku cookie sesi. |
| `ADMIN_USERNAME` | `admin` | Username untuk satu admin. |
| `ADMIN_PASSWORD` | wajib, min. 12 karakter | Password plaintext via env atau bcrypt hash. |
| `AUTH_COOKIE_NAME` | `wa_admin` | Nama cookie HttpOnly. |
| `COOKIE_SAME_SITE` | `lax` | `lax`, `strict`, atau `none`; `none` hanya bekerja melalui HTTPS. Untuk frontend/backend beda site gunakan `none` dan HTTPS. |
| `CORS_ORIGINS` | `http://localhost:3000` | Daftar origin frontend, pisahkan koma; jangan beri slash akhir. Contoh `https://app.example.com`. |
| `AUTH_DIR` | `./data/auth` | Folder kredensial multi-device; wajib persistent pada deploy. |
| `UPLOAD_DIR` | `./data/uploads` | Folder file pesan; wajib persistent jika media harus tetap tersedia. |
| `MAX_UPLOAD_MB` | `50` | Batas file inbound/outbound, 1–250 MB. |
| `LOG_LEVEL` | `info` | Level Pino API. |
| `BAILEYS_LOG_LEVEL` | `warn` | Level logger Baileys. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Origin API yang dipakai browser; pada Next production nilai ini **dibake saat build**. |

## Pairing perangkat

1. Login admin, pilih **Tambah nomor**, masukkan nomor WhatsApp internasional tanpa `+` (Indonesia contoh `6281234567890`).
2. Tunggu pairing code tampil.
3. Pada WhatsApp di ponsel: **Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon** (nama/menu dapat sedikit berbeda di Android/iOS).
4. Masukkan kode yang ditampilkan oleh dashboard. Jangan kirim atau bagikan kode itu kepada orang lain.
5. Backend menandai status `connected` hanya setelah event koneksi Baileys menyatakan linked device tersambung. Status diperbarui otomatis.

Tidak ada endpoint “verify” WhatsApp yang terpisah. Endpoint `POST /api/sessions/:id/verify` hanya mencocokkan kode konfirmasi opsional UI dan melaporkan status terakhir; sumber kebenaran koneksi adalah event server `connection.update`.

## Endpoint API

Semua endpoint kecuali health check dan `POST /api/auth/login` memerlukan cookie admin yang valid (atau `Authorization: Bearer <JWT>` untuk klien API). Cookie dikirim oleh frontend dengan `credentials: include`.

| Method | Path | Fungsi |
|---|---|---|
| `POST` | `/api/auth/login` | Login admin, mengatur cookie HttpOnly. |
| `GET` | `/api/auth/me` | Memeriksa sesi admin. |
| `POST` | `/api/auth/logout` | Menghapus cookie login. |
| `GET` | `/api/sessions` | Daftar semua session. |
| `POST` | `/api/sessions` | Buat session `{ "phoneNumber": "628…" }`. |
| `POST` | `/api/sessions/:id/pairing` | Meminta pairing code dari Baileys. |
| `POST` | `/api/sessions/:id/verify` | Konfirmasi kode opsional `{ "pairingCode": "…" }`. |
| `GET` | `/api/sessions/:id/status` | Status terkini session. |
| `DELETE` | `/api/sessions/:id` | Logout/unlink dan hapus session/history. |
| `POST` | `/api/messages/send` | Kirim text atau multipart media. Field: `sessionId`, `chatJid`, `text` (opsional saat ada file), `media` (opsional), `ptt` (`true` untuk voice note). |
| `GET` | `/api/messages/:sessionId?chatJid=…&limit=100` | Riwayat pesan, opsional filter chat. |
| `GET` | `/api/chats/:sessionId` | Daftar chat yang tersimpan. |
| `GET` | `/api/media/:filename` | File lampiran, tetap dilindungi admin. |
| `GET` | `/health` | Health check tanpa autentikasi. |

Socket.IO event server → browser: `realtime:ready`, `session:update`, `session:deleted`, `message:new`, `message:update`, `chat:update`, `presence:update`. Koneksi Socket.IO memerlukan cookie login dan origin yang diizinkan.

## Deploy ke Railway (backend + frontend + PostgreSQL)

Project memakai **dua Railway service** dari repository yang sama, plus PostgreSQL. Buat/deploy backend terlebih dahulu.

### 1. Buat project dan database

1. Buat project Railway baru dan tambahkan service **PostgreSQL**.
2. Buat service backend dari repository ini. Pilih konfigurasi Railway di root (`railway.json`) atau set Dockerfile path ke `backend/Dockerfile` dengan build context root repository.
3. Tambahkan **Volume** ke service backend, mount path misalnya `/data`. Volume ini wajib: file auth Baileys dan lampiran tidak dapat dipulihkan jika container dihapus tanpa volume.

### 2. Environment backend

Atur variable berikut pada service backend:

```env
NODE_ENV=production
DB_PROVIDER=postgresql
DATABASE_URL=${{Postgres.DATABASE_URL}}
PORT=4000
JWT_SECRET=<secret-random-minimal-32-karakter>
JWT_EXPIRES_IN=12h
ADMIN_USERNAME=<username-admin-unik>
ADMIN_PASSWORD=<password-kuat-atau-bcrypt-hash>
AUTH_COOKIE_NAME=wa_admin
COOKIE_SAME_SITE=none
CORS_ORIGINS=https://<domain-frontend-railway-atau-custom-domain>
AUTH_DIR=/data/auth
UPLOAD_DIR=/data/uploads
MAX_UPLOAD_MB=50
LOG_LEVEL=info
BAILEYS_LOG_LEVEL=warn
```

Sesuaikan reference PostgreSQL sesuai nama service Railway. Tambahkan public domain untuk backend sehingga Railway memberi URL HTTPS. Health check backend sudah diset ke `/health`. Container backend memasang FFmpeg dan akan menjalankan `prisma generate`, `prisma db push`, lalu API. `db push` cocok untuk setup awal; untuk sistem penting, review schema dan rencanakan migrasi terkontrol sebelum upgrade destruktif.

### 3. Deploy frontend

1. Tambahkan service kedua dari repository yang sama.
2. Pilih `frontend/railway.json` atau set Dockerfile path `frontend/Dockerfile` (build context root repository).
3. Set `NEXT_PUBLIC_API_URL=https://<domain-backend>` **sebelum build/redeploy**. Next.js mengembed nilai `NEXT_PUBLIC_*` saat build. Jika URL berubah, set variable lalu redeploy frontend.
4. Tambahkan domain HTTPS frontend. Setelah URL tersedia, pastikan `CORS_ORIGINS` backend sama persis dengan origin frontend (tanpa trailing slash), lalu redeploy backend.
5. Buka frontend, login, dan tautkan perangkat. Untuk custom domain, samakan ulang `CORS_ORIGINS` dan gunakan `COOKIE_SAME_SITE=none` jika domain frontend/backend berbeda site.

### 4. Production checklist

- Pastikan PostgreSQL dan volume backend aktif; verifikasi `/health`, login, reconnect session setelah redeploy.
- Gunakan HTTPS, password admin kuat, secret JWT baru, CORS origin spesifik, dan akses dashboard dibatasi.
- Jangan menjalankan beberapa backend replica dengan direktori auth sama. Satu WhatsApp session hanya boleh dikendalikan satu socket aktif.
- Cadangkan volume auth dan media dengan kontrol akses ketat. Auth state berisi kredensial linked-device; perlakukan seperti password dan jangan pernah dimasukkan ke Git/artifact publik.
- Siapkan retensi/pembersihan file media serta database sesuai kebutuhan privasi dan regulasi.

## Jalankan dengan Docker Compose

Setelah `.env` dibuat dan diisi, dari root:

```bash
docker compose up --build
```

UI tersedia di port `3000`, API di `4000`; data persisten local disimpan di `backend/data`. `docker-compose.yml` mengoverride DB ke SQLite untuk mode local.

## Pengembangan & troubleshooting

```bash
npm run typecheck
npm run build
```

- **Pairing timeout/kode ditolak:** pastikan nomor menggunakan country code tanpa `+`, ponsel online, pilih opsi “tautkan dengan nomor telepon”, lalu minta kode baru jika perlu.
- **Session terus reconnect:** periksa koneksi internet, jam sistem, status perangkat tertaut di ponsel, dan log `BAILEYS_LOG_LEVEL`. Putuskan/unlink lalu pasangkan ulang bila credentials dicabut.
- **Railway crash `Cannot find package '@hapi/boom'`:** pastikan service memakai `backend/Dockerfile` versi terbaru, lalu lakukan redeploy yang membangun image baru. Dockerfile sekarang menyalin dependency workspace backend ke runtime image; tombol Restart saja tetap memakai image lama.
- **Voice note gagal:** instal FFmpeg (`ffmpeg -version`) pada host backend; Dockerfile backend memasang FFmpeg pada image. Alternatifnya kirim OGG/Opus.
- **Browser mendapat CORS error:** `CORS_ORIGINS` harus memuat origin frontend lengkap dan `NEXT_PUBLIC_API_URL` harus berisi URL backend yang benar. Cookie cross-site perlu HTTPS + `COOKIE_SAME_SITE=none`.
- **Riwayat tanpa media:** file media harus masih ada di `UPLOAD_DIR`/volume yang sama; metadata pesan tidak menyimpan isi file di database.
- **SQLite lock saat dev:** hanya jalankan satu backend process untuk database dan auth folder yang sama.

## Batasan implementasi

- Satu kredensial administrator untuk instalasi, tidak ada multi-user/RBAC.
- Pesan diterima setelah perangkat linked dan event Baileys aktif. Sinkronisasi full-history sengaja dimatikan (`syncFullHistory: false`) agar startup lebih ringan; jangan mengasumsikan semua riwayat lama WhatsApp tersedia.
- Media lokal memakai filesystem. Untuk skala multi-instance gunakan object storage terenkripsi dan implementasikan auth-state storage terdistribusi/locking—jangan berbagi session Baileys tanpa koordinasi.
- “Online/offline” hanya tersedia ketika WhatsApp mengirim event presence; tidak semua kontak membagikan status presence.
- Tidak ada bulk-send, broadcast, scheduler, atau scraping.

## Struktur

```text
backend/
  prisma/                 # SQLite + PostgreSQL schema
  scripts/prisma.cjs      # memilih provider berdasarkan DB_PROVIDER
  src/
    config/ middleware/ controllers/ routes/
    services/             # Prisma, Baileys manager, message handling
    socket/ utils/ types/
frontend/
  app/                    # login, dashboard, pairing, inbox
  components/             # shell + komponen UI Tailwind
  lib/ stores/
backend/Dockerfile
frontend/Dockerfile
railway.json
frontend/railway.json
```

## Lisensi & merek

Contoh project untuk penggunaan pribadi/berizin. WhatsApp dan WhatsApp Web adalah merek dagang WhatsApp LLC. Project ini tidak berafiliasi dengan atau didukung oleh WhatsApp/Meta.
