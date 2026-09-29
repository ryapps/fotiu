# AI Agent Development Guidelines

## 1. Project Context

**Fotiu** adalah aplikasi web booking dan manajemen studio foto (satu studio) yang menghubungkan booking lunas ke workflow photobooth lokal. Customer login Google, memilih package dan jadwal, membayar QRIS, dan melihat status booking. Admin (email dan password) mengelola package, jadwal, booking, customer, check-in, booth assignment, dan photo session. P0 memakai Local Booth Agent dan MockBoothProvider; provider nyata adalah P1.

Core workflow:

Browse Package → Google Login → Select Schedule → Booking → QRIS Payment → Payment Verified → Booking Confirmed → Admin Check-in → Assign Booth → Photo Session → Booking Completed

Stack: Next.js + TypeScript, Tailwind + shadcn/ui, PostgreSQL, Prisma, Auth.js, payment gateway QRIS (default Midtrans sandbox), Vercel. Arsitektur cloud: **modular monolith**. Local Booth Agent adalah service bridge ringan pada komputer studio, bukan cloud microservice atau platform IoT.

Proyek ini dikerjakan satu developer dan **juga untuk belajar**.

## 2. Primary Goal

Membantu membangun MVP sesuai `docs/PRD.md`, `docs/DESIGN.md`, dan `docs/TASKS.md`.

Urutan authority:

1. `docs/PRD.md` = product requirement
2. `docs/DESIGN.md` = technical direction
3. `docs/TASKS.md` = implementation roadmap
4. Existing codebase = current implementation

Jika ada konflik antar dokumen atau antara dokumen dan code, **jangan diam-diam membuat keputusan baru**. Untuk perubahan scope yang developer minta secara eksplisit, identifikasi konflik yang terdampak dan harmonisasikan empat dokumen dengan solusi paling sederhana sesuai permintaan; tanyakan hanya jika konflik penting masih belum terselesaikan oleh arahan tersebut.

## 3. Development Philosophy

Agent harus:

- memilih solusi paling sederhana yang memenuhi requirement,
- menghindari over-engineering,
- menjaga konsistensi dengan code yang ada,
- tidak memperkenalkan dependency tanpa alasan,
- tidak membuat abstraction sebelum dibutuhkan,
- mengikuti code style yang sudah ada.

## 4. Learning-First Rule

Karena proyek ini untuk belajar, agent **TIDAK BOLEH** langsung memberikan implementasi besar untuk business logic penting tanpa membantu developer memahami masalahnya.

Bagian yang termasuk: double booking, transaction, authorization, OAuth, webhook, payment, database constraint, race condition, provider abstraction, command/event handling, heartbeat, device authentication, offline behavior, dan state machine booth/session.

Untuk bagian tersebut, agent harus **terlebih dahulu** menjelaskan:

1. Problem
2. Why it happens
3. Possible approaches
4. Trade-offs
5. Recommended approach

Setelah itu baru implementasi **jika diminta**.

Untuk boilerplate sederhana (setup, komponen UI dasar, form biasa), agent boleh langsung membantu.

## 5. Problem-Solving Mode

Saat developer meminta bantuan debugging, jangan langsung menulis ulang seluruh file. Lakukan:

1. Identify symptom
2. Identify likely cause
3. Explain hypothesis
4. Suggest minimal investigation
5. Suggest minimal fix
6. Verify

Jika developer berkata **"jangan kasih solusi"**, agent hanya memberi hint atau pertanyaan pemandu, tanpa solusi langsung.

## 6. Coding Rules

- TypeScript strict.
- Hindari `any` kecuali benar-benar diperlukan (dan beri komentar alasan).
- Validasi server-side wajib untuk setiap mutation (Zod).
- Authorization dilakukan server-side.
- Jangan percaya `userId` dari client.
- Jangan percaya payment status dari client.
- Jangan percaya slot availability dari UI.
- Validasi semua input eksternal (client, webhook, query param).
- Tangani expected error secara eksplisit (hasil terstruktur, bukan exception mentah).

## 7. Database Rules

- Database adalah source of truth untuk booking.
- Gunakan foreign key.
- Gunakan transaction ketika operasi membutuhkan atomicity.
- Jangan memanggil API eksternal di dalam transaction database.
- Pertimbangkan index berdasarkan query nyata dan jangan menambah index tanpa alasan.
- Jangan hard delete data yang dibutuhkan history booking tanpa mempertimbangkan konsekuensinya.
- Semua waktu disimpan UTC (`timestamptz`), uang sebagai integer Rupiah.
- Custom SQL (mis. exclusion constraint) ditulis di migration dan didokumentasikan.
- Booth/device dan photo session tetap memiliki foreign key. Gunakan partial unique constraint untuk mencegah lebih dari satu sesi aktif pada booth/booking; jangan menambah constraint satu-sesi-per-booking yang menghalangi retry ter-audit.
- Simpan device token sebagai hash di cloud; jangan simpan raw token di database, repository, atau log.

## 8. Booking Rules

Agent harus menjaga rule:

- tidak boleh double booking,
- availability harus diverifikasi server,
- `WAITING_PAYMENT` memiliki expiration,
- expired booking melepaskan slot,
- `CANCELLED` dan `EXPIRED` tidak memblokir slot,
- `CONFIRMED` memblokir slot,
- `COMPLETED` menyimpan history,
- perubahan status hanya lewat fungsi state machine terpusat dan update bersyarat status.
- Booking `COMPLETED` hanya setelah photo session `COMPLETED`, atau manual recovery admin dengan alasan/audit yang valid.
- Status booking dan photo session berbeda. Event session gagal tidak boleh menyelesaikan booking.

## 9. Payment Rules

- Payment status tidak boleh diubah oleh client.
- Webhook provider adalah source of truth.
- Webhook harus diverifikasi (signature, amount, order dikenal).
- Webhook harus idempotent.
- Duplicate event tidak boleh menghasilkan duplicate booking atau payment update.
- Payment failure tidak boleh membuat booking confirmed.
- Redirect sukses dari provider bukan bukti pembayaran.
- Detail signature dan format payload provider harus dicek ke dokumentasi terbaru, bukan diasumsikan dari ingatan.

## 10. Authentication Rules

- Customer: Google OAuth (Auth.js).
- Admin: Credentials (email dan password ber-hash).
- Tidak ada registrasi publik untuk admin dan tidak ada password untuk customer.
- Agent tidak boleh mengubah strategi authentication tanpa alasan dan approval developer.

## 11. Authorization Rules

- Customer hanya dapat mengakses resource miliknya.
- Admin dapat mengakses resource administratif.
- Jangan hanya menyembunyikan tombol di UI.
- Authorization wajib dicek server-side pada setiap Server Action, Route Handler, dan query data.
- Resource milik customer selalu difilter dengan `userId` dari session, dan resource orang lain menghasilkan 404.
- Middleware bukan pengaman utama.

## 12. Security Rules

Perhatikan selalu:

- IDOR
- broken authorization
- injection (gunakan query parameterized)
- unsafe upload
- leaked secrets
- webhook spoofing
- pencurian/penyalahgunaan Local Booth Agent credential, command replay, dan booth identity mismatch
- insecure password handling
- open redirect pada `callbackUrl`

Jangan memasukkan secret ke code, log, atau client bundle.

## 13. UI Rules

- Responsive.
- Halaman customer mobile-first.
- Admin dashboard functional first.
- Selalu sediakan loading state, empty state, dan error state.
- Hindari UI berlebihan yang tidak mendukung task user.
- Gunakan komponen shadcn/ui yang sudah ada sebelum membuat komponen baru.

## 14. Scope Control

Agent tidak boleh otomatis menambahkan:

- Redis
- message queue
- broker untuk komunikasi Local Booth Agent
- Docker orchestration (satu instance database lokal untuk development diperbolehkan)
- microservices
- Kubernetes
- GraphQL
- event sourcing
- CQRS
- complex caching
- fitur AI

kecuali requirement berubah dan ada alasan nyata yang disetujui developer.

Jika ada kebutuhan yang tampaknya membutuhkan salah satu di atas, jelaskan masalahnya dan tawarkan opsi yang lebih sederhana terlebih dahulu.

## 15. Dependency Rules

Sebelum menambahkan dependency:

- cek apakah platform atau framework sudah menyediakan capability tersebut,
- jelaskan alasan dependency diperlukan,
- pilih dependency yang matang dan terawat,
- jangan install library hanya untuk fungsi kecil.

## 16. Task Execution

Sebelum mengerjakan task:

1. Baca `docs/TASKS.md`.
2. Identifikasi task aktif.
3. Cek dependency task.
4. Baca requirement terkait di `docs/PRD.md`.
5. Baca desain terkait di `docs/DESIGN.md`.
6. Baru implementasikan (dan untuk business logic penting, ikuti Learning-First Rule).

Setelah selesai, jelaskan:

- apa yang berubah,
- file yang berubah,
- alasan perubahan,
- cara mengetes,
- apakah acceptance criteria tercapai.

## 17. Testing Rules

Business logic penting harus memiliki test. Prioritas:

1. Booking conflict
2. Authorization
3. Payment webhook
4. Booking state transitions
5. Availability
6. Cancellation dan reschedule
7. Booth assignment/session transitions, command/event idempotency, agent authorization, dan heartbeat/offline behavior

Jangan mengejar coverage 100%. Prioritaskan behaviour penting. Test concurrency menguji invarian (mis. jumlah booking aktif per slot), bukan urutan eksekusi.

## 18. Refactoring Rules

- Jangan refactor code yang tidak berhubungan dengan task kecuali diperlukan.
- Jika menemukan technical debt, catat terlebih dahulu (mis. sebagai catatan di akhir respons atau daftar di README) dan jangan langsung memperbaikinya.
- Jangan memperbesar scope task tanpa alasan.

## 19. Documentation Rules

Jika architecture atau business rule berubah, perbarui dokumen yang relevan:

- PRD berubah → update `docs/PRD.md`.
- Technical design berubah → update `docs/DESIGN.md`.
- Task berubah → update `docs/TASKS.md`.
- Perilaku agent berubah → update `AGENTS.md`.

Pastikan keempat dokumen tetap konsisten. Perubahan dokumen dijelaskan kepada developer.

## 20. Definition of Done

Task belum selesai hanya karena code compile. Minimal:

- requirement terpenuhi,
- authorization benar,
- validation benar,
- happy path berjalan,
- edge case penting ditangani,
- lint dan typecheck berjalan,
- test yang relevan berjalan,
- dokumentasi diperbarui jika diperlukan.

## 21. Do Not

Agent tidak boleh:

- mengubah scope tanpa izin,
- menghasilkan fake implementation,
- membuat TODO sebagai pengganti core functionality,
- mem-bypass error TypeScript,
- memakai `any` untuk menutup error,
- menonaktifkan lint hanya agar build berhasil,
- hardcode production secret,
- mempercayai client untuk authorization,
- mempercayai redirect payment sebagai konfirmasi pembayaran,
- menghapus data hanya agar test berhasil,
- membuat fitur yang belum ada di PRD,
- mengubah atau menghapus exclusion constraint booking tanpa penjelasan dan persetujuan.

## 22. Communication Style

Saat membantu developer:

- jelas,
- ringkas,
- teknis,
- jelaskan "why",
- hindari teori berlebihan jika tidak relevan.

Jika developer sedang belajar, prioritaskan urutan:

**Hint → Explanation → Implementation**

bukan:

Implementation → Explanation.

Jika instruksi ambigu, ajukan satu pertanyaan klarifikasi yang paling penting. Jika tidak ambigu, langsung kerjakan tanpa banyak basa-basi.

## 23. Photobooth Integration Rules

1. Jangan hardcode satu software/provider photobooth sebagai arsitektur inti.
2. Jangan menganggap LumaBooth atau vendor tertentu wajib digunakan. Provider hanyalah kandidat integrasi.
3. `MockBoothProvider` wajib untuk P0; real provider adalah P1 setelah integrasi core selesai.
4. Jangan mengarang API provider. Jika implementasi membutuhkan provider nyata, verifikasi dokumentasi resmi/terbaru terlebih dahulu.
5. Jangan reverse-engineer proprietary protocol. Gunakan hanya integration mechanism resmi yang terdokumentasi.
6. Web app/cloud tidak boleh mengakses camera atau printer dan tidak membuat hardware driver. Photobooth software tetap menangani hardware.
7. Provider-specific code hanya berada di adapter lokal. Core application hanya menggunakan command internal dan normalized events.
8. Provider contract P0 cukup `startSession()` dan `getStatus()`; `stopSession()` dan `reprint()` optional. Jangan menambah capability lain tanpa requirement nyata.
9. Agent adalah bridge lokal sederhana: autentikasi device, heartbeat, command delivery, event normalization, dan error reporting. Agent tidak menangani booking, payment, customer auth, atau admin auth.
10. Jangan membuat platform IoT, microservices cloud, Redis, Kafka, RabbitMQ, atau message broker untuk booth communication tanpa kebutuhan nyata dan persetujuan perubahan scope.
11. `START_SESSION` idempotent. Pengiriman ulang command yang sama tidak boleh menjalankan sesi kedua.
12. Duplicate normalized event aman dan transition state bersyarat. Jangan menerapkan provider-specific event langsung ke business state.
13. Jangan memberikan fake success jika agent/provider offline atau hasil command tidak diketahui. `Command SUCCESS` bukan `Photo Session COMPLETED`.
14. Hanya booking `CONFIRMED` dan payment `PAID` yang dapat check-in. Booking harus check-in sebelum assignment/session.
15. Booth OFFLINE, BUSY, atau MAINTENANCE tidak dapat di-assign. Availability diperiksa server dan dikuatkan constraint database.
16. Booking tidak boleh `COMPLETED` sebelum photo session `COMPLETED`, kecuali manual recovery yang diotorisasi, diverifikasi, dan mencatat alasan/aktor/waktu.
17. `SESSION_FAILED` tidak membuat booking completed. Retry membuat percobaan photo session baru; jangan hapus failed history.
18. Agent authentication terpisah dari user authentication. Credential unik per device, dapat dicabut/dirotasi, disimpan hash di cloud, dan tidak pernah dicatat di log.
19. Jika capability provider tidak tersedia, nyatakan unsupported atau recovery manual yang benar; jangan membuat behavior seolah-olah tersedia.
20. Untuk perubahan provider abstraction, command, event, heartbeat, idempotency, device auth, race condition, offline behavior, dan state machine, ikuti Learning-First Rule: jelaskan problem, penyebab, opsi, trade-off, dan rekomendasi sebelum implementasi.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
