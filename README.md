# Fotiu

Aplikasi booking dan manajemen untuk satu studio foto. Product requirements,
technical design, dan roadmap ada di [`docs/`](docs/).

## Menjalankan secara lokal

1. Gunakan Node.js 20.19+ atau 22.12+.
2. Siapkan PostgreSQL lokal dan buat database `fotiu`.
3. Salin `.env.example` menjadi `.env`, lalu sesuaikan kredensial database.
4. Jalankan `npm install`, `npm run db:generate`, lalu `npm run dev`.

Perintah pemeriksaan: `npm run lint`, `npm run typecheck`, dan `npm test`.

Project managed Supabase belum dikonfigurasi; gunakan database terpisah untuk
preview dan production, jangan memakai data production secara lokal.
