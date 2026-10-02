# Implementation Tasks

## Working Rules

- Kerjakan berdasarkan fase, berurutan.
- Jangan mengimplementasikan fitur fase berikutnya sebelum dependency-nya selesai.
- Setiap task harus bisa diverifikasi (ada cara jelas untuk mengecek selesai atau belum).
- Prioritaskan core workflow: booking → payment → confirmed.
- Hindari premature abstraction.
- Task dengan business logic penting memakai format panjang dan wajib dipahami sebelum diimplementasikan (lihat `AGENTS.md` bagian Learning-First).
- Referensi `FR-xxx`, `BR-xxx` merujuk ke `PRD.md`. Referensi bagian merujuk ke `DESIGN.md`.
- Tandai `[x]` hanya jika Definition of Done fase terpenuhi.

---

## Phase 0 — Project Setup

- [x] Setup Next.js (App Router) dengan TypeScript strict
- [x] Setup Tailwind CSS
- [x] Setup shadcn/ui (button, input, form, dialog, table, badge, calendar, toast)
- [x] Setup ESLint dan Prettier
- [x] Setup konfigurasi environment (`.env.example`, validasi env dengan Zod saat startup)
- [x] Setup PostgreSQL lokal untuk development
- [x] Buat project database managed (Supabase) untuk production; project `fotiu` aktif di Jakarta sejak 2 Okt 2026
- [x] Setup Prisma dan konfigurasi koneksi database
- [x] Setup Vitest
- [x] Struktur folder `src/modules/*` dan `src/lib/*`
- [x] Logger sederhana di `lib/logger.ts`
- [x] Repository git, `.gitignore` (termasuk `.env*`), README awal

**Definition of Done**

- [x] `npm run dev`, `lint`, `typecheck`, dan `test` berjalan tanpa error.
- [x] Aplikasi terhubung ke database lokal.
- [x] Aplikasi gagal start dengan pesan jelas jika env wajib hilang.
- [x] Tidak ada secret di repository.

## Phase 1 — Database Foundation

- [x] Schema Prisma untuk `users`, `admins`, `packages`, `bookings`, `payments`, `payment_events`, `operating_hours`, `schedule_blocks`, `gallery_images`
- [x] Enum: `BookingStatus`, `PaymentStatus`, `CancelledBy`
- [x] Relasi dan foreign key (`ON DELETE RESTRICT` untuk history)
- [x] Index sesuai DESIGN bagian 7
- [x] Migration awal
- [x] Seed: admin awal, `operating_hours` default, beberapa package contoh, gallery contoh

### TASK-1.1 — Exclusion Constraint Anti-Overlap

**Goal**

Database menolak dua booking aktif dengan rentang waktu beririsan.

**Dependency**

Migration awal selesai.

**Requirements**

- Tambahkan custom SQL migration untuk exclusion constraint (DESIGN bagian 10).
- Constraint hanya berlaku untuk status `WAITING_PAYMENT` dan `CONFIRMED`.
- Tambahkan CHECK `endAt > startAt`.
- Pastikan `prisma migrate` berikutnya tidak menghapus constraint.

**Edge Cases**

- Sesi berakhir tepat saat sesi lain dimulai (harus boleh, rentang `[)`).
- Booking `CANCELLED`/`EXPIRED` tidak memblokir.
- Update booking (reschedule) tidak bentrok dengan dirinya sendiri.

**Acceptance Criteria**

- [x] Insert dua booking aktif overlapping pada level SQL gagal dengan SQLSTATE `23P01`.
- [x] Insert booking berdampingan (tanpa irisan) berhasil.
- [x] Insert booking overlap dengan booking `CANCELLED` berhasil.
- [x] Ada integration test untuk ketiga kasus.

**Learning Focus**

Database constraint sebagai penjaga akhir, range type dan operator `&&`, partial constraint, perbedaan validasi aplikasi dan integritas database.

**Definition of Done (Phase 1)**

- [x] Migration dapat dijalankan dari database kosong.
- [x] Seed berjalan dan dapat diulang tanpa duplikasi.
- [x] Constraint TASK-1.1 terbukti lewat test.
- [x] ERD di DESIGN masih sesuai schema (jika berbeda, perbarui dokumen).

---

## Phase 2 — Authentication

- [x] Konfigurasi Auth.js dengan session JWT
- [x] Halaman `/login` dan `/admin/login`
- [x] Logout customer dan admin (FR-011)
- [x] Redirect awal lewat Next.js Proxy (hanya UX)
- [x] Helper `requireCustomer()` dan `requireAdmin()`

### TASK-2.1 — Customer Google OAuth

**Goal**

Customer dapat login dengan Google dan akunnya tercatat di `users`.

**Dependency**

Phase 0, Phase 1.

**Requirements**

- Daftarkan OAuth client (redirect URI lokal dan preview).
- Callback `signIn` melakukan upsert user berdasarkan `googleSub`, memakai email terverifikasi.
- Token/session memuat `id` dan `role = CUSTOMER`.
- Validasi `callbackUrl` hanya path internal.

**Edge Cases**

- Login pertama kali vs berikutnya (tidak boleh membuat user ganda).
- User membatalkan consent di Google.
- Email Google tidak terverifikasi.
- `callbackUrl` menunjuk domain eksternal.

**Acceptance Criteria**

- [x] Login pertama membuat satu record `users`, login kedua tidak menduplikasi.
- [x] Setelah login, user kembali ke halaman tujuan (mis. halaman booking).
- [x] `callbackUrl` eksternal diabaikan.
- [x] Guest yang membuka `/dashboard` diarahkan ke `/login`.

**Learning Focus**

Alur OAuth 2.0/OIDC, peran `state` dan PKCE, JWT session, upsert idempoten, open redirect.

### TASK-2.2 — Admin Credentials Login

**Goal**

Admin login dengan email dan password yang di-hash, tanpa registrasi publik.

**Dependency**

TASK-2.1 (konfigurasi Auth.js dasar), seed admin.

**Requirements**

- Credentials provider membaca `admins` dan memverifikasi hash.
- Pesan error generik. Hash compare dummy jika email tidak ada.
- Tolak admin `isActive = false`.
- Token memuat `role = ADMIN`.
- Rate limit percobaan login.

**Edge Cases**

- Email tidak ada vs password salah (respons harus serupa).
- Admin dinonaktifkan saat session masih aktif.
- Brute force.

**Acceptance Criteria**

- [x] Login dengan kredensial benar berhasil, salah gagal dengan pesan generik.
- [x] Admin nonaktif tidak bisa login.
- [x] Tidak ada route atau UI registrasi admin.
- [x] Percobaan berlebihan mendapat penolakan rate limit.
- [x] Password tidak pernah muncul di log.

**Learning Focus**

Password hashing (cost factor, salt), timing attack, enumerasi akun, brute force protection.

### TASK-2.3 — Authorization Guards dan Protected Routes

**Goal**

Semua operasi dilindungi di server, bukan hanya di UI.

**Dependency**

TASK-2.1, TASK-2.2.

**Requirements**

- `requireCustomer()` mengembalikan `{ userId }` atau melempar/redirect.
- `requireAdmin()` mengecek role dan `isActive` di database.
- Guard dipakai di setiap Server Action, Route Handler, dan halaman terproteksi.
- Middleware hanya sebagai redirect cepat.

**Edge Cases**

- Customer mencoba memanggil aksi admin langsung.
- Session admin dipakai untuk aksi customer (role berbeda).
- Request tanpa session ke Route Handler.

**Acceptance Criteria**

- [x] Customer mendapat penolakan pada semua route dan aksi `/admin`.
- [x] Guest tidak dapat memanggil aksi customer.
- [x] Test integrasi membuktikan hal tersebut tanpa lewat UI.

**Learning Focus**

Authentication vs authorization, defense in depth, mengapa middleware saja tidak cukup, RBAC sederhana.

**Definition of Done (Phase 2)**

- [x] Customer login Google, admin login credentials, logout berfungsi.
- [x] Route dan aksi terlindungi di server.
- [x] Test authorization dasar lulus.

Catatan progres: Google OAuth telah dicoba end-to-end pada aplikasi lokal dan
kembali ke `/dashboard`; logout customer juga berjalan. Integration test
PostgreSQL mencakup upsert customer tanpa duplikasi, verifikasi email,
kredensial admin, rate limit, dan guard role. Guard dicek pada aksi yang
memerlukannya saat fitur masing-masing diimplementasikan.

---

## Phase 3 — Package

- [x] Halaman `/packages` (package aktif, FR-001)
- [x] Halaman `/packages/[slug]` (FR-002)
- [x] Admin: daftar package, create, update (FR-050)
- [x] Admin: aktif/nonaktif (FR-051)
- [x] Admin: hapus hanya jika tidak punya booking (FR-052)
- [x] Skema validasi Zod untuk package (harga Rp20.000–Rp40.000, durasi sesi/jeda tetap 10/2 menit, slug unik)
- [x] State loading, empty, dan error

### TASK-3.1 — Package Deactivation dan Deletion Rule

**Goal**

Package dengan riwayat booking tidak pernah hilang dari history.

**Dependency**

Phase 2, Phase 1.

**Requirements**

- Hapus permanen hanya bila tidak ada booking (BR-014). Jika ada, tawarkan nonaktifkan.
- Package nonaktif tidak tampil publik dan tidak bisa dibooking.
- Booking lama menampilkan snapshot nama dan harga.

**Edge Cases**

- Menghapus package yang punya booking EXPIRED lama.
- Package dinonaktifkan saat customer sedang memilih slot.
- Mengubah harga saat ada booking WAITING_PAYMENT.

**Acceptance Criteria**

- [x] Delete package dengan booking ditolak dengan pesan jelas.
- [x] Package nonaktif tidak muncul di `/packages` dan slug-nya menghasilkan 404.
- [x] Ubah harga tidak mengubah `priceSnapshot` booking lama.

**Learning Focus**

Soft delete vs hard delete, snapshot data historis, foreign key `RESTRICT`.

**Definition of Done (Phase 3)**

- [x] Admin dapat mengelola package sepenuhnya, guest dapat melihatnya.
- [x] Semua mutation tervalidasi dan diotorisasi.

---

## Phase 4 — Availability & Scheduling

- [x] Admin: atur jam operasional per hari (FR-060)
- [x] Admin: schedule block, create dan delete (FR-061)
- [x] Konfigurasi booking (lead time dan max advance; slot tetap 12 menit)
- [x] Util waktu (konversi UTC dan Asia/Jakarta)
- [x] `getAvailability` (FR-021, FR-062, FR-063)
- [x] Sesi tetap 10 menit dengan jeda 2 menit; slot berulang tiap 12 menit sampai jam tutup.
- [x] UI pemilih tanggal dan slot (sementara tanpa membuat booking)

### TASK-4.1 — Availability Calculation

**Goal**

Server menghitung slot tersedia yang benar untuk package dan tanggal tertentu.

**Dependency**

TASK-3.1, operating hours, schedule block.

**Requirements**

- Ikuti algoritma DESIGN bagian 9.
- Fungsi murni untuk kalkulasi (input: jam buka, durasi, booking aktif, blokir, `now`) agar mudah di-unit-test.
- Booking aktif = `CONFIRMED` atau `WAITING_PAYMENT` dengan `holdExpiresAt > now`.
- Rentang setengah-terbuka `[startAt, endAt)`.

**Edge Cases**

- Hari tutup atau tanggal masa lalu.
- Slot yang melewati jam tutup.
- Slot sesi tetap 10 menit + jeda 2 menit, berulang setiap 12 menit.
- Hold yang sudah expired namun belum di-sweep.
- Pergantian hari dan perbedaan UTC vs Asia/Jakarta.
- Blokir yang sebagian menimpa jam operasional.

**Acceptance Criteria**

- [x] Unit test mencakup seluruh edge case di atas.
- [x] Slot yang overlap booking, blokir, atau di luar jam tidak muncul.
- [x] Slot yang lebih awal dari lead time tidak muncul.
- [x] Hold expired tidak memblokir slot pada hasil availability.

**Learning Focus**

Interval overlap, fungsi murni yang mudah dites, timezone handling, half-open interval.

### TASK-4.2 — Schedule Block dan Peringatan Bentrok

**Goal**

Admin dapat memblokir waktu dan melihat booking yang terdampak.

**Dependency**

TASK-4.1.

**Requirements**

- Buat dan hapus blokir (`endAt > startAt`).
- Saat membuat blokir, tampilkan booking aktif yang bentrok sebagai peringatan (tidak membatalkan otomatis).

**Edge Cases**

- Blokir menimpa booking CONFIRMED.
- Blokir lintas hari.

**Acceptance Criteria**

- [x] Blokir menghilangkan slot dari availability.
- [x] Peringatan menampilkan daftar booking bentrok.
- [x] Menghapus blokir mengembalikan slot.

**Learning Focus**

Batas antara aturan yang dijaga database dan aturan yang dijaga aplikasi.

**Definition of Done (Phase 4)**

- [x] Availability benar dan teruji unit test.
- [x] Admin dapat mengatur jam dan blokir, dan efeknya terlihat pada availability.

---

## Phase 5 — Booking

- [x] Halaman `/packages/[slug]/book` (wajib login, FR-020)
- [x] `createBooking` (FR-022, FR-027)
- [x] Kode booking yang mudah dibaca (`code`)
- [x] Batas hold per customer (FR-024)
- [x] Lazy expiry di transaction booking dan filter availability (FR-025)
- [x] Endpoint cron sweep (`/api/cron/expire-bookings`)
- [x] State machine booking (fungsi transisi terpusat)
- [x] Penanganan error konflik pada UI

### TASK-5.1 — Create Booking dengan Slot Hold dan Anti Double Booking

**Goal**

Customer membuat booking WAITING_PAYMENT yang menahan slot, aman dari race condition.

**Dependency**

TASK-1.1, TASK-2.3, TASK-4.1.

**Requirements**

- Hitung `endAt` di server, jangan terima dari client.
- Validasi ulang slot di server sebelum insert.
- Satu transaction: sweep hold expired, cek batas hold customer, insert booking dan payment `UNPAID`.
- Snapshot `packageNameSnapshot` dan `priceSnapshot`, set `holdExpiresAt`.
- Tangkap SQLSTATE `23P01` menjadi error `CONFLICT`.
- `userId` selalu dari session.

**Edge Cases**

- Dua customer memilih slot sama bersamaan.
- Slot ditahan booking expired yang belum di-sweep.
- Customer sudah punya 2 WAITING_PAYMENT.
- Package dinonaktifkan atau slot berubah menjadi tidak valid saat submit.
- Double-click tombol submit oleh customer yang sama.
- `startAt` tidak selaras interval atau di luar jam.

**Acceptance Criteria**

- [x] Booking berhasil menghasilkan status WAITING_PAYMENT dengan `holdExpiresAt` benar.
- [x] Test race: dua `createBooking` paralel, tepat satu sukses dan satu `CONFLICT`.
- [x] Booking expired yang belum di-sweep tidak menghalangi booking baru.
- [x] Batas hold ditegakkan dan `userId`/`endAt`/harga dari client diabaikan.

**Learning Focus**

Race condition, check-then-insert, transaction, exclusion constraint, mengapa validasi UI tidak cukup, tidak memanggil API eksternal di dalam transaction.

### TASK-5.2 — Booking Expiration

**Goal**

Booking yang tidak dibayar melepaskan slot secara otomatis dan konsisten.

**Dependency**

TASK-5.1.

**Requirements**

- Fungsi `expireStaleHolds(tx)` dipakai di transaction booking, cron, dan pembacaan detail.
- Update bersyarat `WHERE status = 'WAITING_PAYMENT' AND holdExpiresAt <= now()`; batas sama dengan `now` termasuk expired sesuai aturan availability.
- Payment terkait `UNPAID/PENDING` menjadi `EXPIRED`.
- Endpoint cron dilindungi `CRON_SECRET`.

**Edge Cases**

- Expiry berlomba dengan webhook PAID.
- Cron berjalan dua kali bersamaan.
- Booking dilihat customer tepat saat expired.

**Acceptance Criteria**

- [x] Setelah hold lewat, slot muncul lagi di availability dan bisa dibooking.
- [x] Menjalankan sweep dua kali tidak menimbulkan efek ganda.
- [x] Endpoint cron menolak request tanpa secret.
- [x] Test untuk balapan expiry vs konfirmasi (yang commit lebih dulu menang).

**Learning Focus**

Idempotent batch job, conditional update, lazy vs scheduled cleanup, keterbatasan cron serverless.

**Definition of Done (Phase 5)**

- [x] Customer dapat membuat booking end-to-end sampai WAITING_PAYMENT.
- [x] Double booking terbukti mustahil lewat test.
- [x] Expired booking melepaskan slot.

---

## Phase 6 — Payment

- [x] Akun dan konfigurasi sandbox payment provider (Server Key diterima API status Midtrans sandbox)
- [x] `payment/provider.ts` (`createQris`, `verifyWebhook`, `mapStatus`)
- [x] `createPayment` untuk membuat atau mengulang QRIS (FR-030)
- [x] Tampilan QR, countdown, dan status di booking detail (FR-031)
- [x] Endpoint `GET /api/bookings/[id]/status` dan polling UI
- [x] Webhook `POST /api/webhooks/payment` (FR-032 s.d. FR-036)
- [x] Tabel `payment_events` dipakai untuk idempotency
- [x] Simulasi webhook lokal terbatas ke localhost dan Midtrans sandbox
- [x] Penanganan pembayaran terlambat (`needsReview`, FR-037)

### TASK-6.1 — Create QRIS Payment

**Goal**

Booking WAITING_PAYMENT memiliki QRIS yang valid sampai batas hold.

**Dependency**

TASK-5.1.

**Requirements**

- Pemanggilan provider dilakukan setelah transaction booking commit.
- `providerOrderId` berasal dari kode booking. Expiry QRIS sama dengan `holdExpiresAt`.
- Sukses: payment `PENDING` dengan data QR. Gagal: booking tetap WAITING_PAYMENT dan dapat dicoba ulang.
- `createPayment` memverifikasi kepemilikan, status, dan sisa hold.

**Edge Cases**

- Provider timeout tetapi order sebenarnya sudah dibuat (cek status di provider sebelum retry).
- Klik berulang membuat QRIS ganda.
- Hold habis saat request berjalan.

**Acceptance Criteria**

- [x] Booking baru menampilkan QR sandbox dan countdown; smoke test Midtrans sandbox memverifikasi QR URL dan expiry tersimpan sesuai hold.
- [x] Kegagalan provider tidak menghilangkan booking, dan ada tombol coba lagi.
- [x] Tidak pernah ada lebih dari satu payment per booking.
- [x] Customer lain tidak dapat memanggil `createPayment` untuk booking bukan miliknya.

**Learning Focus**

Integrasi API eksternal, idempotent retry, memisahkan I/O eksternal dari transaction database.

### TASK-6.2 — Webhook Verification dan Idempotency

**Goal**

Pembayaran sukses mengonfirmasi booking secara otomatis, aman dari spoofing dan duplikasi.

**Dependency**

TASK-6.1.

**Requirements**

- Ikuti alur DESIGN bagian 13 (signature, amount, lock, `eventKey` unik, mapping status).
- Perbandingan signature constant-time. Baca raw body.
- Konfirmasi booking dan update payment dalam satu transaction.
- Semua event dicatat di `payment_events` dengan `result`.
- Kode respons: 200/401/500 sesuai desain.

**Edge Cases**

- Webhook yang sama dikirim dua kali atau paralel.
- Signature salah atau payload dimodifikasi.
- Amount tidak sama.
- Order tidak dikenal.
- Event tiba tidak berurutan (mis. `pending` setelah `settlement`).
- PAID datang saat booking sudah EXPIRED/CANCELLED.
- Browser customer ditutup setelah bayar.

**Acceptance Criteria**

- [x] Webhook valid mengubah payment ke PAID dan booking ke CONFIRMED.
- [x] Duplikat (termasuk dua request paralel) menghasilkan tepat satu perubahan.
- [x] Signature salah menghasilkan 401 dan tidak mengubah data.
- [x] Amount salah ditolak dan dicatat.
- [x] PAID setelah EXPIRED membuat `needsReview = true` dan booking tidak berubah.
- [x] Event mundur tidak menurunkan status PAID.
- [x] Tidak ada endpoint atau aksi client yang bisa mengubah status payment.

**Learning Focus**

Webhook security, signature/HMAC, idempotency key, row locking (`FOR UPDATE`), state machine yang tahan event tidak berurutan, mengapa redirect bukan bukti pembayaran.

**Definition of Done (Phase 6)**

- [ ] Alur sandbox lengkap: booking → QRIS → settlement lewat QRIS Simulator Midtrans → CONFIRMED otomatis. Deployment sudah memiliki URL HTTPS tetap dan charge baru menambahkan URL webhook melalui `X-Append-Notification`; settlement dan webhook nyata belum diuji.
- [x] Test webhook (valid, duplikat, invalid, terlambat) lulus.
- [x] Log webhook tersedia melalui `payment_events` dan tidak menyimpan Server Key.

Catatan progres: implementasi provider dan simulasi webhook lokal tersedia; unit
dan integration test lulus. Server Key sandbox sudah diverifikasi melalui API
status Midtrans. Smoke test sandbox membuat QRIS lewat service aplikasi dan
memastikan payment `PENDING`, URL QR, serta expiry tersimpan sesuai hold; fixture
lokal dibersihkan dan QR tidak dibayar. Midtrans menjelaskan [alur uji sandbox](https://docs.midtrans.com/docs/testing-payment-on-sandbox)
dan [simulator QRIS](https://simulator.sandbox.midtrans.com/openapi/qris/index):
masukkan URL gambar QR sandbox ke simulator. Halaman booking kini menampilkan
URL dan tautan simulator hanya ketika provider disetel ke sandbox. Jangan
membayar QR sandbox melalui aplikasi bank/e-wallet sungguhan; Midtrans
memperingatkan dana dapat masuk ke tujuan yang tidak dapat dipulihkan.
Settlement melalui simulator dan status `CONFIRMED` masih perlu dijalankan
setelah deployment memiliki URL HTTPS tetap. Test webhook lokal tetap menjadi
bukti sementara untuk handler, bukan bukti notifikasi dari Midtrans.

---

## Photobooth Workstream — P0

Workstream ini mempertahankan phase booking/payment sebelumnya sebagai dependency. Domain/provider/agent dikerjakan setelah Auth.js dan booking/payment dasar tersedia; admin dashboard biasa tetap dapat dikerjakan paralel setelah task yang dibutuhkan selesai. P0 hanya satu studio dan satu booth mock. Tidak ada provider nyata sebagai dependency.

### PB-1 — Photobooth Domain

**Dependency:** Phase 1, Phase 2.

- [x] Tambahkan `booths`, `photo_sessions`, `booth_commands`, dan normalized `booth_events`.
- [x] Tambahkan field check-in admin pada booking tanpa mengubah booking status saat check-in.
- [x] Definisikan provider-agnostic provider key, booth read status, command/event enums, dan photo session status.
- [x] Tambahkan foreign keys, CHECK constraints, partial unique indexes untuk satu active session per booth dan booking, serta index query yang nyata.
- [x] Pertahankan booking exclusion constraint dan snapshot/payment constraints.
- [x] Test migration seluruhnya dari database kosong.
- [x] Test database menolak duplikasi active session dengan partial unique constraint.

**Definition of Done:** booking memiliki check-in ter-audit; percobaan photo session dan command dapat direpresentasikan tanpa provider tertentu; database mencegah active-session duplikat.

**Learning Focus:** domain modeling, state machine, partial unique index, FK, konsistensi database.

Catatan progres PB-1: seluruh enam migration berhasil diterapkan dari database
sementara yang benar-benar kosong. Integration test juga membuktikan database
menolak duplikasi active session (SQLSTATE 23505), termasuk assignment paralel
dan retry setelah session FAILED. Prisma Client generation Windows masih
melaporkan query-engine DLL terkunci oleh proses `next dev`; tipe client sudah
terbaca dan integration suite lulus.

### PB-2 — Provider Abstraction dan Mock Provider

**Dependency:** PB-1.

- [x] Definisikan contract minimal `startSession()` dan `getStatus()`.
- [x] Definisikan capability sederhana: start, status events, stop, reprint; stop/reprint optional.
- [x] Normalisasi minimal SESSION_STARTED, SESSION_COMPLETED, SESSION_FAILED.
- [x] Implementasikan `MockBoothProvider` sebagai adapter P0 yang melewati command/event flow yang sama dengan provider nyata.
- [x] Simulasikan success, failure, unavailable, dan delayed response.
- [x] Tandai unsupported capability tanpa perilaku palsu.

**Definition of Done:** alur sesi dapat disimulasikan tanpa hardware dan provider adapter tidak mengubah core booking rules.

**Learning Focus:** dependency inversion, adapter pattern, idempotency, abstraction secukupnya.

Catatan progres PB-2: provider contract, status normalizer, dan mock provider tersedia. Mock idempotency mengembalikan session yang sama untuk retry key identik; mode unavailable tidak membuat sesi, sementara stop/reprint ditandai unsupported. Alur cloud command/event dan pengujian adapter masih tersisa di PB-3/PB-5.

### PB-3 — Local Booth Agent

**Dependency:** PB-2.

- [x] Buat agent kecil yang berjalan pada komputer studio dan dikonfigurasi dengan cloud URL, device identity, token, provider key.
- [x] Provision, rotate, dan revoke device credential; cloud menyimpan hash, agent menyimpan secret lokal.
- [x] Implementasikan polling HTTPS dan heartbeat dengan interval/timeout yang dapat dikonfigurasi.
- [x] Agent hanya dapat membaca command untuk booth credential-nya.
- [x] Klaim dan jalankan command melalui Provider Adapter; kirim hasil command, normalized event, dan error.
- [x] Validasi payload serta booth/session/command ownership di cloud endpoints.
- [x] Jangan menganggap command terkirim/SUCCESS sebagai session completion.

**Definition of Done:** satu agent tersambung melalui outbound HTTPS, heartbeat memperbarui status booth, dan dapat menjalankan command mock. Tidak diperlukan port inbound, broker, atau service cloud tambahan.

**Learning Focus:** cloud vs local network, machine authentication, polling, heartbeat, retry, failure boundaries.

Catatan progres PB-3: runner `npm run booth:agent`, heartbeat/poll/result/event endpoints,
autentikasi device berbasis token hash, provisioning/rotasi/pencabutan token, dan
halaman `/admin/booths` sudah tersedia. Token mentah hanya ditampilkan saat dibuat
atau dirotasi. Migration photobooth telah diterapkan pada database lokal. Integration
test menjalankan Local Booth Agent dan MockBoothProvider melewati handler cloud
heartbeat/poll/result/event. Smoke test proses agent melalui HTTP(S) lokal nyata
masih perlu dilakukan. Prisma Client generation masih gagal karena file query engine
Windows terkunci. Rate limit agent saat ini per proses aplikasi, sebagai perlindungan
tambahan dan bukan batas global.

### PB-4 — Studio Check-in dan Booth Assignment

**Dependency:** PB-1, PB-3, Phase 2, Phase 5, Phase 6.

- [x] Admin mencari booking dan check-in hanya jika CONFIRMED, payment PAID, non-terminal, dan masih pada jadwal yang memenuhi aturan operasional.
- [x] Simpan `checkedInAt` dan `checkedInByAdminId`; cegah check-in ganda.
- [x] Admin dapat melihat ONLINE/OFFLINE/BUSY/MAINTENANCE dan mengatur maintenance.
- [x] Assignment hanya ke booth ONLINE, bukan BUSY/MAINTENANCE, tanpa active session.
- [x] Assignment membuat photo session READY; retry sesi gagal membuat percobaan baru.
- [x] Customer tidak dapat check-in, assign, atau mengirim booth command.

**Definition of Done:** admin dapat menyelesaikan `CONFIRMED + PAID → Check-in → Assign Booth → READY Photo Session` dengan server-side validation dan constraint. Integration tests check-in, offline assignment, duplicate assignment, dan retry lulus.

**Learning Focus:** authorization, check-in rules, derived device state, assignment race.

### PB-5 — Start Session dan Completion

**Dependency:** PB-2, PB-3, PB-4.

- [x] `START_SESSION` membuat command dan mengubah READY → STARTING secara atomic.
- [x] Satu command/idempotency key per session; double-click/poll/retry tidak membuat sesi kedua.
- [x] Agent/Mock Provider menghasilkan SESSION_STARTED, SESSION_COMPLETED, atau SESSION_FAILED.
- [x] Terapkan normalized event inbox dengan unique event ID dan conditional state transition.
- [x] Update booking COMPLETED hanya setelah photo session COMPLETED; status command SUCCESS bukan pemicu completion.
- [x] SESSION_FAILED tidak menyelesaikan booking; retry assignment membuat attempt baru, manual completion ditangani TASK-8.2.
- [x] Catat `completionSource`, alasan, admin, dan waktu untuk manual recovery (TASK-8.2).

**Definition of Done:** P0 berjalan `Check-in → Assign → Start → Mock session → normalized completion → Booking COMPLETED`; kegagalan dan duplikat tidak merusak status.

**Learning Focus:** idempotency, command vs event, event normalization, transaksi, state consistency.

Catatan progres PB-5: START_SESSION atomic dan idempotent; Local Booth Agent dengan
MockBoothProvider diuji dari command polling sampai normalized completion. Command
SUCCESS mempertahankan session STARTING/ACTIVE dan booking CONFIRMED. Event inbox
mendeduplikasi event dan hanya completion yang valid menyelesaikan booking. Manual
manual recovery completion dicatat oleh TASK-8.2 dengan alasan, aktor, waktu,
dan source; sesi FAILED tetap terminal dan perlu attempt baru.

### PB-6 — Photobooth Reliability

**Dependency:** PB-1 sampai PB-5.

- [x] Test booth offline sebelum dan setelah start; stale heartbeat dan reconnect agent.
- [x] Test command/event duplikat, command pending untuk booking cancelled, provider unavailable/delay/failure.
- [x] Cegah dua assignment/start aktif pada booth yang sama, termasuk request paralel.
- [x] Hasil PROCESSING yang tidak pasti setelah agent restart tidak auto-retry side effect; tampilkan untuk rekonsiliasi admin.
- [x] Dokumentasikan unsupported capabilities dan batasan pemulihan.

**Definition of Done:** failure umum tidak membuat fake success, double session, atau booking COMPLETED tanpa session yang valid.

**Learning Focus:** distributed systems basics, at-least-once delivery, timeout, recovery, invariant testing.

Catatan progres PB-6: integration tests memverifikasi stale heartbeat/reconnect,
pending command pada booking cancelled, provider unavailable/failure, duplicate
start/event, serta agent restart dengan command PROCESSING tanpa auto-retry. Detail
booking menampilkan keadaan yang memerlukan pemeriksaan manual. Mock stop/reprint
tetap unsupported dan dibatasi pada satu booth P0.

### PB-7 — Real Provider Integration (P1)

P1 setelah P0 selesai; jangan menandai P0 belum selesai karena provider nyata belum dipilih.

- [x] Riset kandidat dan bandingkan documented/official integration mechanism, session control/event, biaya, dan kesesuaian agent.
- [x] Pilih Photobooth-App untuk integrasi lokal P1; FreeBooth tetap provider manual.
- [x] Verifikasi action API dan Commander lifecycle hook dari dokumentasi/source resmi Photobooth-App.
- [x] Tambahkan adapter action lokal, callback Commander loopback bertoken, pilihan/ganti provider saat booth tidak aktif, dan normalisasi event.
- [x] Hanya callback `finished` tervalidasi yang menyelesaikan sesi; tanpa callback perlu rekonsiliasi admin.
- [x] Jalankan end-to-end Photobooth-App pada komputer booth studio dan validasi kamera/action/Commander callback (developer melaporkan seluruh alur berhasil pada 2 Okt 2026).

Catatan riset kandidat (30 September 2026):

| Kandidat                          | Integrasi resmi dan bukti hasil sesi                                                                                                                                                                                                                                                                                                                                                                                                                                             | Biaya publik                                                                                                                                      | Kesesuaian terhadap Local Booth Agent                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LumaBooth for Windows (dslrBooth) | [Dokumentasi vendor](https://support.lumasoft.co/en/articles/12831651-triggers-webhooks-and-api) (26 Mar 2026) menyebut API untuk memulai Print/GIF/Boomerang/Video (v8+) dan trigger lokal `session_start`/`session_end`. Trigger URL mengirim query parameters ke URL yang dikonfigurasi. API butuh autentikasi/password; format credential dan pengamanan lokal perlu ditinjau dari [API docs](https://documenter.getpostman.com/view/5516194/UVRBnmJ5) sebelum implementasi. | [USD 17/bulan ditagih tahunan atau USD 49.99/bulan](https://www.lumabooth.com/pricing), harga dapat berubah.                                      | Kandidat kuat bila studio sudah memakai PC Windows: command dapat menuju aplikasi lokal dan trigger dapat dinormalisasi agent. Belum diuji di booth studio.                                                                     |
| Breeze Booth (iPad/iPhone)        | [Dokumentasi Breeze](https://www.breezesys.com/downloads/Breeze_Booth.pdf) yang terindeks menyebut `statusUrl`, password, dan interval; [vendor blog](https://blog.breezesys.com/tag/featured/page/6/) menyebut monitoring status jarak jauh dan pengiriman command individual. PDF manual mengembalikan 404 saat riset, sehingga detail dan sinyal completion versi terbaru belum terverifikasi.                                                                                | Harga aktif tidak ditemukan pada rujukan resmi yang dapat diverifikasi; minta harga vendor. Harga blog 2019 tidak dipakai sebagai harga saat ini. | Status URL/remote control berpotensi cocok bila booth iPad, tetapi perlu endpoint HTTPS yang dapat dijangkau perangkat dan ada password/interval. Belum terbukti menyediakan normalized session completion yang Fotiu perlukan. |
| FreeBooth 0.9.4                   | [Panduan resmi](https://www.free-booth.com/index.php/how-to-build-a-diy-photo-booth/) memandu aplikasi tethering menyalin foto ke folder images dan operator menjalankan photobooth lokal. [Riwayat source](https://github.com/Luy242/freebooth) menyebut slideshow server dihapus sejak 0.9.3; tidak ditemukan dokumentasi remote session control/status.                                                                                                                       | Gratis/open-source menurut [website resmi](https://www.free-booth.com/).                                                                          | Cocok sebagai software lokal demo manual; tidak cocok untuk remote start atau completion otomatis. Agent hanya heartbeat, admin mencatat operasi setelah verifikasi.                                                            |
| Photobooth-App                   | [REST action API](https://photobooth-app.org/setup/configuration/actions) dan [Commander hooks](https://photobooth-app.org/setup/configuration/commander) mendukung trigger dan callback `counting`/`capture`/`finished`; endpoint action diverifikasi di [source resmi](https://github.com/photobooth-app/photobooth-app).                                                                                                        | Gratis, open-source MIT.                                                                                                                          | Dipilih untuk integrasi lokal P1. Agent mengirim action ke loopback dan menerima lifecycle callback. DSLR pada Windows memakai DigiCamControl backend yang upstream tandai tidak terpelihara; uji kamera aktual sebelum demo. |
| FreeBooth 0.9.4                   | [Panduan resmi](https://www.free-booth.com/index.php/how-to-build-a-diy-photo-booth/) memandu aplikasi tethering menyalin foto ke folder images dan operator menjalankan photobooth lokal. [Riwayat source](https://github.com/Luy242/freebooth) menyebut slideshow server dihapus sejak 0.9.3; tidak ditemukan dokumentasi remote session control/status.                                                                                                                       | Gratis/open-source menurut [website resmi](https://www.free-booth.com/).                                                                          | Tetap tersedia sebagai software lokal demo manual; agent heartbeat saja dan admin mencatat operasi setelah verifikasi.                                                                                                     |

Photobooth-App sekarang dipilih untuk demonstrasi remote start dan completion
melalui adapter lokal. Commander harus dikonfigurasi mengikuti
`docs/PHOTOBOOTH-APP.md`. FreeBooth tetap dapat digunakan sebagai alternatif
manual melalui `docs/FREEBOOTH-DEMO.md`.

**Definition of Done P1:** booking lunas/check-in dapat di-assign ke booth
Photobooth-App online; agent mengirim action lokal; Commander `finished` melewati
normalized event dan menutup booking sesuai state machine. Jalankan end-to-end
pada komputer studio dan validasi kamera sebelum demo. FreeBooth manual recovery
tetap tersedia.

---

## Phase 7 — Customer Dashboard

- [x] `/dashboard` dengan upcoming booking dan CTA booking baru (FR-012)
- [x] `/dashboard/bookings` dengan tab upcoming dan history (FR-013)
- [x] `/dashboard/bookings/[id]` (FR-014), termasuk payment
- [x] Badge status booking dan payment
- [x] `cancelMyBooking` (FR-026)

### TASK-7.1 — Customer Cancellation

**Goal**

Customer dapat membatalkan booking sesuai aturan.

**Dependency**

TASK-5.1, TASK-6.2, TASK-2.3.

**Requirements**

- WAITING_PAYMENT: boleh kapan saja, slot langsung bebas, payment tidak lagi bisa dibayar (batalkan di provider bila didukung, best effort).
- CONFIRMED: hanya jika `startAt - now >= CUSTOMER_CANCEL_DEADLINE_HOURS`.
- Terminal state ditolak.
- Update bersyarat status. Ownership lewat filter `userId`.
- Cancel CONFIRMED menandai perlu refund manual (tanpa refund otomatis).

**Edge Cases**

- Cancel tepat di batas deadline.
- Cancel bersamaan dengan webhook PAID.
- Cancel booking orang lain (IDOR).
- Cancel dua kali.

**Acceptance Criteria**

- [x] Cancel WAITING_PAYMENT berhasil dan slot tersedia lagi.
- [x] Cancel CONFIRMED tepat pada deadline berhasil; satu milidetik melewati batas ditolak dengan pesan jelas.
- [x] Booking orang lain menghasilkan NOT_FOUND tanpa mengubah data.
- [x] Cancel ulang atau cancel setelah COMPLETED ditolak.

**Learning Focus**

State machine transitions, conditional update untuk mencegah race, IDOR, aturan bisnis berbasis waktu.

**Definition of Done (Phase 7)**

- [x] Customer melihat dan mengelola booking miliknya saja.
- [x] Cancel sesuai aturan dan teruji, termasuk race dengan webhook settlement.

Catatan progres: dashboard menampilkan booking mendatang, daftar booking memiliki
tab mendatang/riwayat, dan detail menampilkan badge serta aksi pembatalan. Cancel
mengunci booking lalu payment, melakukan transisi bersyarat, dan menandai payment
hold EXPIRED di transaction yang sama; pembatalan QRIS Midtrans dicoba setelah
commit. Jika pembuatan QR masih berjalan saat cancel, service payment mencoba
membatalkan QR setelah respons provider kembali. Payment PAID tetap PAID agar
kebutuhan refund manual dapat diturunkan dari booking CANCELLED + payment PAID.

---

## Phase 8 — Admin Booking Management

- [x] `/admin/bookings` dengan filter status, tanggal, pencarian, dan paginasi (FR-042)
- [x] `/admin/bookings/[id]` (FR-043, FR-048)
- [x] Indikator "perlu review" dan "perlu refund"
- [x] `cancelBookingAdmin` (FR-045)
- [x] `rescheduleBooking` (FR-044)
- [x] `completeBooking` (FR-046; normal session completion and audited manual recovery implemented in the photobooth workflow)
- [x] `/admin/calendar` (FR-049)
- [x] `/admin/customers` (FR-047)
- [x] (P2) `markPaymentRefunded` (FR-038; conditional PAID → REFUNDED after manual refund, with reason/admin/time audit)

### TASK-8.1 — Admin Reschedule

**Goal**

Admin memindahkan booking CONFIRMED ke slot lain tanpa risiko bentrok.

**Dependency**

TASK-1.1, TASK-4.1, TASK-2.3.

**Requirements**

- Hanya CONFIRMED. Durasi dan buffer tetap 10/2 menit.
- Validasi slot baru (jam operasional, blokir).
- `UPDATE ... WHERE id AND status='CONFIRMED'`, konflik ditangkap dari constraint.
- Booking tetap di slot lama jika gagal.

**Edge Cases**

- Slot tujuan terisi.
- Slot tujuan overlap dengan slot lama sendiri (geser 30 menit).
- Booking sudah COMPLETED/CANCELLED.
- Dua admin mereschedule bersamaan.

**Acceptance Criteria**

- [x] Reschedule ke slot kosong berhasil.
- [x] Reschedule ke slot terisi ditolak dan booking tidak berubah.
- [x] Geser sebagian ke rentang yang overlap dengan dirinya sendiri berhasil.
- [x] Customer tidak dapat memanggil aksi ini.

**Learning Focus**

Constraint pada UPDATE, self-overlap, penanganan konflik dengan pesan bermakna.

### TASK-8.2 — Admin Complete dan Cancel

**Goal**

Admin menutup atau membatalkan booking dengan aturan transisi yang benar.

**Dependency**

TASK-6.2, PB-5. Complete/cancel action tetap bagian booking state machine; booking hanya completed setelah sesi photobooth valid atau manual recovery.

Catatan progres Phase 8: halaman booking, detail, kalender, daftar customer,
indikator payment, pembatalan admin, dan reschedule tersedia. Reschedule
memakai durasi tetap 10 menit + jeda 2 menit, memvalidasi jam operasional,
interval 12 menit, blokir, dan
booking lain; constraint integration test mencakup konflik/self-overlap. Complete
normal hanya menerima session COMPLETED; manual recovery memerlukan alasan dan
menyimpan admin/waktu/source. Pembatalan PAID menampilkan kebutuhan refund; READY
session dibatalkan, sedangkan session/command yang mungkin sudah berjalan tetap
di-reserve sampai direkonsiliasi. Lint, typecheck, dan integration suite lulus.

**Requirements**

- Complete: hanya CONFIRMED dan `now >= startAt`, serta photo session terkait COMPLETED. Set `completedAt` melalui state transition terpusat.
- Manual completion hanya recovery operasional, wajib memastikan sesi benar-benar selesai dan mencatat alasan, admin, waktu, serta `completionSource = MANUAL_RECOVERY`.
- Cancel admin: WAITING_PAYMENT atau CONFIRMED, isi `cancelledBy = ADMIN` dan alasan.
- COMPLETED final.

**Edge Cases**

- Complete sebelum sesi dimulai.
- Photo session masih STARTING/ACTIVE/PROCESSING atau FAILED.
- Sesi berakhir tetapi normalized completion event belum tiba.
- Cancel booking COMPLETED.
- Cancel CONFIRMED yang sudah PAID (perlu refund manual).

**Acceptance Criteria**

- [x] Complete sebelum `startAt` ditolak.
- [x] Booking tidak dapat completed sebelum session selesai; manual recovery memerlukan reason/audit.
- [x] SESSION_FAILED tidak menyelesaikan booking.
- [x] Cancel COMPLETED ditolak.
- [x] Cancel CONFIRMED menampilkan penanda perlu refund.

**Learning Focus**

State machine terpusat, aturan berbasis waktu, audit metadata (`cancelledBy`, `reason`).

**Definition of Done (Phase 8)**

- [x] Admin dapat menjalankan siklus booking dan photobooth dari dashboard.
- [x] Semua aksi admin diotorisasi server-side; aksi inti diuji dengan integration test.

---

## Phase 9 — Admin Dashboard

- [x] Ringkasan jumlah booking per status
- [x] Sesi hari ini dan mendatang
- [x] Pendapatan sederhana (SUM payment `PAID`, periode bulan ini)
- [x] Daftar booking yang butuh perhatian (perlu review, perlu refund)
- [x] Tanpa advanced analytics

**Definition of Done**

- [x] Agregat dashboard sesuai data DB; diverifikasi terhadap database development (1 EXPIRED, 1 CONFIRMED, revenue PAID bulan ini Rp150.000, 0 perlu perhatian).
- [x] Query dibatasi untuk ringkasan dan delapan baris per daftar; route memanggil `requireAdmin` sebelum membaca data.

---

## Phase 10 — Gallery & Public Polish

- [x] Upload gambar via presigned URL (validasi tipe dan ukuran, FR-053; storage credentials/CORS still required to verify against a live bucket)
- [x] `/admin/gallery`
- [x] Halaman `/gallery` (FR-003)
- [x] Landing page final termasuk info studio (FR-004); alamat dan kontak terkonfigurasi pada development `.env`
- [x] Responsive smoke audit halaman publik/customer utama (HP) dan dashboard/detail admin (desktop)
- [x] Loading, empty, dan error state pada seluruh halaman utama
- [x] `error.tsx`, `not-found.tsx`, metadata dan SEO dasar
- [x] Pemeriksaan aksesibilitas dasar

Catatan progres Phase 10: S3-compatible presigned upload, validasi file dan
metadata, draft/publish, halaman admin/public gallery, serta landing responsive
telah dibuat. Screenshot menangkap dan membantu memperbaiki fallback serif akibat
CSS font variable yang self-reference. Unit test magic-byte JPEG/PNG/WebP lulus.
Test action upload juga membuktikan authorization admin, penolakan tipe/ukuran
invalid, dan pembuatan presigned request.
Jam operasional landing page dibaca dari database; alamat dan kontak
menggunakan `STUDIO_ADDRESS` dan `STUDIO_CONTACT`. Kedua nilai development
sekarang sudah dikonfigurasi, sehingga landing menampilkan info studio. Pastikan
nilai yang sama disetel pada environment production. Variabel `STORAGE_*` kini
ada pada development `.env`; unggah langsung tetap perlu diuji terhadap bucket
dan aturan CORS aktual. Pemeriksaan dasar
memeriksa label form, heading, status/error, serta skip link keyboard. Playwright
memeriksa skip link dan overflow pada homepage, gallery, package list/detail,
booking, login, dashboard customer, serta halaman admin utama. Route utama
memiliki fallback global/nested dan empty state.

**Definition of Done**

- [x] Halaman publik/customer utama dapat dipakai di HP; diuji pada homepage, gallery, package list/detail, booking, login, dan dashboard.
- [x] Upload menolak tipe/ukuran tidak valid dan hanya admin yang dapat meminta presigned URL; metadata upload is re-verified server-side.
- [x] Tidak ada halaman utama kosong tanpa penjelasan; loading, empty, error, dan not-found states tersedia.

---

## Phase 11 — Security & Reliability

- [x] Audit authorization untuk semua endpoint (matriks dari DESIGN bagian 6)
- [x] Test IDOR untuk akses status/detail/mutasi booking customer; resource lain difilter owner di server query.
- [x] Rate limiting: login admin, `createBooking`, `createPayment`
- [x] Review agent credential scope/rotation, device-to-booth ownership, polling, dan event validation
- [x] Review stale heartbeat, command replay, duplicate normalized event, dan manual recovery audit
- [x] Review validasi input di semua mutation
- [x] Review webhook (signature, amount, idempotency)
- [x] Review environment variables dan pastikan tidak ada secret di client bundle
- [x] Security header dan konfigurasi cookie
- [x] Uji role migration dan runtime terpisah pada database PostgreSQL terisolasi: migration dari kosong berhasil; runtime dapat CRUD tanpa privilege CREATE database/schema.
- [ ] Verifikasi grant dan TLS role runtime/migration pada database production (environment production belum tersedia).

Catatan progres Phase 11: rate limit login admin sudah memakai database; booking
(10/menit/customer) dan pembuatan payment (5/15 menit/customer) kini memakai
upsert PostgreSQL atomik dan diuji dengan 24 request bersamaan. Agent, webhook,
heartbeat, command/event, dan recovery memiliki integration coverage. Audit
authorization aplikasi, IDOR booking, dan bundle secret sudah selesai. Database
sementara baru dibuat untuk menguji migration dari kosong memakai owner role
terpisah dan runtime role yang hanya mendapat DML: seluruh enam migration sukses,
runtime create/read/delete berhasil, dan query privilege memastikan role runtime
tidak dapat membuat objek database/schema. Ke-48 integration tests juga lulus
menggunakan runtime role DML sementara pada `fotiu_test`. Kedua role dan database
sementara dibersihkan setelah uji. Grant/TLS nyata tetap harus diverifikasi saat
database production provision (lihat Phase 13). High severity
GHSA pada deepmerge-ts di Prisma config diperbaiki dengan npm override ke 8.x;
`npm run db:generate`, migration, test, dan build diverifikasi setelah perubahan.
Moderate GHSA pada `@vitest/mocker` ditutup dengan upgrade Vitest 4.1.11 dan
peer dependency Vite 7. `npm audit` kini bersih; kedua perubahan tooling
dijelaskan di ADR-006/007 pada DESIGN dan perlu ditinjau lagi saat Prisma atau
Vitest diperbarui.

Review input memeriksa Server Actions, webhook, route agent, availability, dan
cron: mutation memakai skema Zod/validator, payload agent dibatasi 4 KiB,
webhook 64 KiB, serta query tanggal/package dan path ID tervalidasi. Validasi
field ID package yang sebelumnya manual kini memakai skema Zod terbatas dan
memiliki unit test.

### TASK-11.1 — Concurrency dan Race Condition Testing

**Goal**

Bukti otomatis bahwa sistem tetap konsisten di bawah request bersamaan.

**Dependency**

Phase 5, Phase 6, Phase 8.

**Requirements**

- Test paralel: N request `createBooking` pada slot sama.
- Test: webhook PAID paralel dengan expiry sweep.
- Test: webhook duplikat paralel.
- Test: cancel paralel dengan webhook PAID.
- Test: dua reschedule ke slot sama.

**Edge Cases**

- Hasil bergantung pada timing (test harus deterministik pada invarian, bukan urutan).

**Acceptance Criteria**

- [x] Untuk slot yang sama, jumlah booking aktif selalu 1.
- [x] Tidak ada booking CONFIRMED tanpa payment PAID.
- [x] Tidak ada payment PAID ganda atau update ganda.
- [x] Test stabil saat dijalankan berulang.

**Learning Focus**

Menguji invarian di bawah concurrency, transaction isolation, deterministic test design.

**Definition of Done (Phase 11)**

- [ ] Seluruh checklist audit selesai dan temuan diperbaiki atau dicatat (izin role database produksi masih menunggu deployment).
- [x] Test race dan IDOR lulus; suite integration dijalankan berulang.
- [x] Pemeriksaan source tidak menemukan secret dalam client bundle.

---

## Phase 12 — Testing

- [x] Unit test: availability, overlap, booking/photo session/booth state machines, event normalization, mapping status, signature, aturan cancel, MockBoothProvider modes
- [x] Integration test: booking, payment webhook, authorization, booth assignment/commands/events (database test terpisah)
- [x] E2E Playwright: alur customer (login seeded, package, slot, booking, simulasi webhook, CONFIRMED, dashboard)
- [x] E2E Playwright: alur admin (login, lihat booking, check-in, booth, mulai mock session, manual recovery completion)
- [x] Script `npm run test`, `test:e2e` dan integrasi CI sederhana (lint, typecheck, test)

Catatan progres Phase 12: setelah dependency security updates, pemeriksaan lokal
terbaru lulus: lint, typecheck, `npm audit` (0 vulnerabilities), 59 unit test, 48
integration test PostgreSQL, dan 4 Playwright E2E (termasuk production build
serta tampilan link simulator QRIS di booking sandbox). Audit dependency runtime
ulang dengan `npm audit --omit=dev` menemukan 0 vulnerabilities.
Integration runner mengeksekusi file/suite secara berurutan karena fixture DB
berbagi jadwal dan booth; test request paralel tetap menguji race condition di
dalam skenario masing-masing.
Workflow CI GitHub Actions menjalankan rangkaian tersebut di PostgreSQL 16 dan
Node 24. [Run 37029345913](https://github.com/ryapps/fotiu/actions/runs/37029345913)
untuk commit `18631d8` lulus pada 2 Okt 2026.
Tidak ditemukan test yang di-skip atau `.only` pada source/test E2E.

**Definition of Done**

- [x] Semua test lulus secara lokal dan di CI (verifikasi 2 Okt 2026: lint, typecheck, build, unit test, 48 integration test, dan 4 E2E test lulus; [GitHub Actions run 37029345913](https://github.com/ryapps/fotiu/actions/runs/37029345913) sukses).
- [x] Prioritas test dari `AGENTS.md` bagian 17 terpenuhi untuk alur booking, authorization, payment webhook, availability, cancellation, dan booth/session.
- [x] Tidak ada test yang di-skip tanpa alasan tertulis.

---

## Phase 13 — Deployment

- [x] Database produksi Supabase dan 8 migration diterapkan; role runtime DML terpisah dari role migration
- [x] Seed admin produksi dengan password acak kuat yang berbeda dari password seed dev
- [ ] Konfigurasi object storage (bucket `fotiu-gallery` sudah dibuat di Supabase; preflight CORS PUT dari `https://fotiu.vercel.app` lulus; kunci S3 dan environment Vercel belum tersedia)
- [x] Deploy ke Vercel dengan environment produksi, Midtrans sandbox, dan koneksi database runtime terbatas
- [x] Domain tetap dan HTTPS pada deployment produksi: `https://fotiu.vercel.app`
- [ ] Konfigurasi OAuth produksi (redirect URI pada domain deployment, consent screen)
- [ ] Pastikan charge QRIS sandbox baru mengirim `X-Append-Notification: https://fotiu.vercel.app/api/webhooks/payment`, lalu verifikasi notifikasi nyata diterima; URL dashboard Midtrans boleh ditambahkan sebagai cadangan
- [ ] Buat booking baru, selesaikan QRIS sandbox lewat simulator, dan verifikasi notifikasi Midtrans membuat payment PAID serta booking CONFIRMED otomatis
- [x] Konfigurasi cron harian untuk sweep expiry dan pasang `CRON_SECRET` di Vercel (eksekusi terjadwal pertama belum diamati)
- [ ] Provision booth device token secara aman dan jalankan Local Booth Agent di komputer studio
- [ ] Pastikan cloud endpoint HTTPS dapat dijangkau agent melalui koneksi outbound
- [ ] Smoke test end-to-end di produksi
- [x] README: deskripsi proyek, screenshot lokal, dan cara menjalankan lokal
- [ ] Tambahkan screenshot dan tautan demo setelah deployment tersedia

**Definition of Done**

- [ ] Alur inti customer dan admin berjalan di URL produksi.
- [ ] Webhook produksi menerima dan memverifikasi event.
- [ ] Tidak ada secret di repository atau log.

Catatan kesiapan Phase 13: `https://fotiu.vercel.app` sudah terdeploy dengan
Supabase Jakarta, TLS, 8 migration, seed admin, role runtime DML terbatas,
Midtrans sandbox, dan `CRON_SECRET`. Role `anon`/`authenticated` Supabase tidak
memiliki hak baca tabel booking. Bucket galeri publik sudah dibuat dengan batas
10 MiB untuk JPEG/PNG/WebP, dan preflight CORS PUT dari domain produksi lulus.
Kelanjutan aktivasi memerlukan OAuth redirect production pada Google Cloud dan
kredensial S3-compatible bucket galeri,
provision booth pada database production, serta smoke test end-to-end. Notifikasi
Midtrans melalui `X-Append-Notification` untuk charge baru belum dibuktikan lewat
QRIS Simulator. Screenshot deployment belum ditambahkan. Jangan mengisi checklist
integrasi sampai masing-masing benar-benar diuji.

---

## Final MVP Checklist

**Customer**

- [x] Google Login (pernah diuji lokal; callback OAuth provider tetap harus diatur untuk production)
- [x] Lihat Package
- [x] Pilih Schedule (slot tersedia benar)
- [x] Booking (WAITING_PAYMENT, slot ditahan)
- [ ] Bayar QRIS
- [x] Webhook memverifikasi dan booking menjadi CONFIRMED (signed sandbox payload test)
- [x] Booking tampil di Dashboard (upcoming, history, detail)
- [x] Cancel sesuai aturan

**Admin**

- [x] Login
- [x] Lihat Booking (filter dan detail)
- [x] Kelola Schedule (jam operasional dan blokir)
- [x] Kelola Package
- [x] Complete Booking
- [x] Reschedule dan Cancel
- [x] Lihat Calendar dan Customer
- [x] Check-in booking CONFIRMED + PAID
- [x] Assign booth online dan memulai photo session
- [x] Session selesai sebelum booking COMPLETED; recovery manual mencatat alasan

**Photobooth P0**

- [x] Tidak bergantung provider tertentu; MockBoothProvider mencakup success/failure/unavailable/delay
- [x] Local Booth Agent authenticated terpisah, mengirim heartbeat, dan menerima command lewat polling HTTPS
- [x] ONLINE/OFFLINE/BUSY/MAINTENANCE ditampilkan benar; booth unavailable ditolak
- [x] Command START_SESSION dan normalized events aman terhadap duplikasi
- [x] Workflow lengkap dapat dijalankan tanpa software photobooth berbayar atau hardware

**Sistem**

- [x] Double booking mustahil (terbukti test race)
- [x] Webhook idempotent dan tervalidasi
- [x] Expired booking melepaskan slot
- [x] Authorization server-side dan IDOR teruji
- [ ] Deploy dan smoke test lulus

Catatan checklist MVP lokal: implementasi dan automated test untuk customer,
admin, sistem, dan photobooth P0 telah diverifikasi. Pembayaran QRIS sandbox
berhasil menghasilkan QR dan berstatus PENDING, tetapi settlement lewat QRIS
Simulator Midtrans dan notifikasi nyata belum diuji; keduanya dijadwalkan setelah
deployment memiliki URL HTTPS tetap. Smoke test production juga tetap terbuka.

**Photobooth P1 (bukan syarat P0)**

- [x] FreeBooth terpilih untuk demo berdasarkan dokumentasi resmi; capability remote dinyatakan unsupported
- [x] Workflow operator manual tersedia dengan heartbeat booth dan audited manual completion
- [ ] Validasi FreeBooth, kamera, dan folder tethering pada komputer booth studio
