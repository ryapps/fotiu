# Fotiu

Aplikasi booking dan manajemen untuk satu studio foto. Product requirements,
technical design, dan roadmap ada di [`docs/`](docs/).

## Menjalankan secara lokal

1. Gunakan Node.js 20.19+ atau 22.12+.
2. Salin `.env.example` menjadi `.env`.
3. Jalankan `docker compose up -d` untuk menyalakan PostgreSQL lokal.
4. Jalankan `npm install`, `npm run db:migrate`, lalu `npm run dev`.

Set `ADMIN_SEED_EMAIL` dan `ADMIN_SEED_PASSWORD` di `.env` sebelum menjalankan
`npm run db:seed`. Seed memakai bcrypt dengan cost 12.

Login Google memerlukan OAuth client. Isi `AUTH_GOOGLE_ID` dan
`AUTH_GOOGLE_SECRET` di `.env`, lalu daftarkan callback lokal
`http://localhost:3000/api/auth/callback/google` pada Google OAuth client.
Login admin memakai akun yang dibuat seed dan tersedia di `/admin/login`;
customer masuk melalui `/login`.

Compose membuat database `fotiu_test` saat volume PostgreSQL diinisialisasi.
Jika volume sudah ada sebelum konfigurasi ini, buat sekali dengan
`docker compose exec -T postgres createdb -U postgres fotiu_test`. Pastikan
`TEST_DATABASE_URL` menunjuk ke database tersebut, lalu jalankan
`npm run test:integration`. Test ini menjalankan migration pada database test
sebelum menguji constraint.

Perintah pemeriksaan: `npm run lint`, `npm run typecheck`, dan `npm test`.

Compose hanya menjalankan satu database PostgreSQL untuk development lokal.
Project managed Supabase belum dikonfigurasi; gunakan database terpisah untuk
preview dan production, jangan memakai data production secara lokal.
