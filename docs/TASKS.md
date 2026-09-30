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
- [ ] Buat project database managed (Supabase) untuk preview/production
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
- [x] Skema validasi Zod untuk package (harga ≥ 0, durasi > 0, slug unik)
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
- [x] Konfigurasi booking (slot interval, lead time, max advance)
- [x] Util waktu (konversi UTC dan Asia/Jakarta)
- [x] `getAvailability` (FR-021, FR-062, FR-063)
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
- Package dengan durasi dan buffer berbeda pada hari yang sama.
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

- [ ] Booking baru menampilkan QR sandbox dan countdown (perlu kredensial sandbox untuk verifikasi nyata).
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

- [ ] Alur sandbox lengkap: booking → QRIS → bayar → CONFIRMED otomatis (menunggu akun dan Server Key sandbox).
- [x] Test webhook (valid, duplikat, invalid, terlambat) lulus.
- [x] Log webhook tersedia melalui `payment_events` dan tidak menyimpan Server Key.

Catatan progres: implementasi provider dan simulasi webhook lokal tersedia; unit
dan integration test lulus. Server Key sandbox sudah diverifikasi melalui API
status Midtrans. Smoke test sandbox membuat QRIS lewat service aplikasi dan
memastikan payment `PENDING`, URL QR, serta expiry tersimpan sesuai hold; fixture
lokal dibersihkan dan QR tidak dibayar. Alur QR terlihat di browser dan settlement
sandbox menuju `CONFIRMED` masih perlu diverifikasi.

---

## Photobooth Workstream — P0

Workstream ini mempertahankan phase booking/payment sebelumnya sebagai dependency. Domain/provider/agent dikerjakan setelah Auth.js dan booking/payment dasar tersedia; admin dashboard biasa tetap dapat dikerjakan paralel setelah task yang dibutuhkan selesai. P0 hanya satu studio dan satu booth mock. Tidak ada provider nyata sebagai dependency.

### PB-1 — Photobooth Domain

**Dependency:** Phase 1, Phase 2.

- [ ] Tambahkan `booths`, `photo_sessions`, `booth_commands`, dan normalized `booth_events`.
- [ ] Tambahkan field check-in admin pada booking tanpa mengubah booking status saat check-in.
- [ ] Definisikan provider-agnostic provider key, booth read status, command/event enums, dan photo session status.
- [ ] Tambahkan foreign keys, CHECK constraints, partial unique indexes untuk satu active session per booth dan booking, serta index query yang nyata.
- [ ] Pertahankan booking exclusion constraint dan snapshot/payment constraints.
- [ ] Test migration dari database kosong dan constraint active session.

**Definition of Done:** booking memiliki check-in ter-audit; percobaan photo session dan command dapat direpresentasikan tanpa provider tertentu; database mencegah active-session duplikat.

**Learning Focus:** domain modeling, state machine, partial unique index, FK, konsistensi database.

### PB-2 — Provider Abstraction dan Mock Provider

**Dependency:** PB-1.

- [ ] Definisikan contract minimal `startSession()` dan `getStatus()`.
- [ ] Definisikan capability sederhana: start, status events, stop, reprint; stop/reprint optional.
- [ ] Normalisasi minimal SESSION_STARTED, SESSION_COMPLETED, SESSION_FAILED.
- [ ] Implementasikan `MockBoothProvider` sebagai adapter P0 yang melewati command/event flow yang sama dengan provider nyata.
- [ ] Simulasikan success, failure, unavailable, dan delayed response.
- [ ] Tandai unsupported capability tanpa perilaku palsu.

**Definition of Done:** alur sesi dapat disimulasikan tanpa hardware dan provider adapter tidak mengubah core booking rules.

**Learning Focus:** dependency inversion, adapter pattern, idempotency, abstraction secukupnya.

### PB-3 — Local Booth Agent

**Dependency:** PB-2.

- [ ] Buat agent kecil yang berjalan pada komputer studio dan dikonfigurasi dengan cloud URL, device identity, token, provider key.
- [ ] Provision, rotate, dan revoke device credential; cloud menyimpan hash, agent menyimpan secret lokal.
- [ ] Implementasikan polling HTTPS dan heartbeat dengan interval/timeout yang dapat dikonfigurasi.
- [ ] Agent hanya dapat membaca command untuk booth credential-nya.
- [ ] Klaim dan jalankan command melalui Provider Adapter; kirim hasil command, normalized event, dan error.
- [ ] Validasi payload serta booth/session/command ownership di cloud endpoints.
- [ ] Jangan menganggap command terkirim/SUCCESS sebagai session completion.

**Definition of Done:** satu agent tersambung melalui outbound HTTPS, heartbeat memperbarui status booth, dan dapat menjalankan command mock. Tidak diperlukan port inbound, broker, atau service cloud tambahan.

**Learning Focus:** cloud vs local network, machine authentication, polling, heartbeat, retry, failure boundaries.

### PB-4 — Studio Check-in dan Booth Assignment

**Dependency:** PB-1, PB-3, Phase 2, Phase 5, Phase 6.

- [ ] Admin mencari booking dan check-in hanya jika CONFIRMED, payment PAID, non-terminal, dan masih pada jadwal yang memenuhi aturan operasional.
- [ ] Simpan `checkedInAt` dan `checkedInByAdminId`; cegah check-in ganda.
- [ ] Admin dapat melihat ONLINE/OFFLINE/BUSY/MAINTENANCE dan mengatur maintenance.
- [ ] Assignment hanya ke booth ONLINE, bukan BUSY/MAINTENANCE, tanpa active session.
- [ ] Assignment membuat photo session READY; retry sesi gagal membuat percobaan baru.
- [ ] Customer tidak dapat check-in, assign, atau mengirim booth command.

**Definition of Done:** admin dapat menyelesaikan `CONFIRMED + PAID → Check-in → Assign Booth → READY Photo Session` dengan server-side validation dan constraint.

**Learning Focus:** authorization, check-in rules, derived device state, assignment race.

### PB-5 — Start Session dan Completion

**Dependency:** PB-2, PB-3, PB-4.

- [ ] `START_SESSION` membuat command dan mengubah READY → STARTING secara atomic.
- [ ] Satu command/idempotency key per session; double-click/poll/retry tidak membuat sesi kedua.
- [ ] Agent/Mock Provider menghasilkan SESSION_STARTED, SESSION_COMPLETED, atau SESSION_FAILED.
- [ ] Terapkan normalized event inbox dengan unique event ID dan conditional state transition.
- [ ] Update booking COMPLETED hanya setelah photo session COMPLETED; status command SUCCESS bukan pemicu completion.
- [ ] SESSION_FAILED tidak menyelesaikan booking; recovery membuat attempt baru atau manual completion beralasan.
- [ ] Catat `completionSource`, alasan, admin, dan waktu untuk manual recovery.

**Definition of Done:** P0 berjalan `Check-in → Assign → Start → Mock session → normalized completion → Booking COMPLETED`; kegagalan dan duplikat tidak merusak status.

**Learning Focus:** idempotency, command vs event, event normalization, transaksi, state consistency.

### PB-6 — Photobooth Reliability

**Dependency:** PB-1 sampai PB-5.

- [ ] Test booth offline sebelum dan setelah start; stale heartbeat dan reconnect agent.
- [ ] Test command/event duplikat, command pending untuk booking cancelled, provider unavailable/delay/failure.
- [ ] Cegah dua assignment/start aktif pada booth yang sama, termasuk request paralel.
- [ ] Hasil PROCESSING yang tidak pasti setelah agent restart tidak auto-retry side effect; tampilkan untuk rekonsiliasi admin.
- [ ] Dokumentasikan unsupported capabilities dan batasan pemulihan.

**Definition of Done:** failure umum tidak membuat fake success, double session, atau booking COMPLETED tanpa session yang valid.

**Learning Focus:** distributed systems basics, at-least-once delivery, timeout, recovery, invariant testing.

### PB-7 — Real Provider Integration (P1)

P1 setelah P0 selesai; jangan menandai P0 belum selesai karena provider nyata belum dipilih.

- [ ] Riset kandidat dan bandingkan documented/official integration mechanism, session control/event, biaya, dan kesesuaian agent.
- [ ] Pilih satu provider setelah evaluasi.
- [ ] Verifikasi dokumentasi resmi terbaru; tidak melakukan reverse-engineering proprietary protocol.
- [ ] Implementasikan adapter saja, test start/status/event di komputer studio, dan dokumentasikan capability unsupported.
- [ ] Jika completion event tidak tersedia, gunakan status API resmi atau minta rekonsiliasi admin; jangan membuat fake completion.

**Definition of Done:** satu software photobooth nyata menjalankan START_SESSION melalui agent dan hasil sesi diketahui melalui mekanisme resmi tanpa perubahan core booking architecture.

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
- [ ] `rescheduleBooking` (FR-044)
- [ ] `completeBooking` (FR-046)
- [x] `/admin/calendar` (FR-049)
- [x] `/admin/customers` (FR-047)
- [ ] (P2) `markPaymentRefunded` (FR-038)

### TASK-8.1 — Admin Reschedule

**Goal**

Admin memindahkan booking CONFIRMED ke slot lain tanpa risiko bentrok.

**Dependency**

TASK-1.1, TASK-4.1, TASK-2.3.

**Requirements**

- Hanya CONFIRMED. Durasi dan buffer mengikuti package/booking.
- Validasi slot baru (jam operasional, blokir).
- `UPDATE ... WHERE id AND status='CONFIRMED'`, konflik ditangkap dari constraint.
- Booking tetap di slot lama jika gagal.

**Edge Cases**

- Slot tujuan terisi.
- Slot tujuan overlap dengan slot lama sendiri (geser 30 menit).
- Booking sudah COMPLETED/CANCELLED.
- Dua admin mereschedule bersamaan.

**Acceptance Criteria**

- [ ] Reschedule ke slot kosong berhasil.
- [ ] Reschedule ke slot terisi ditolak dan booking tidak berubah.
- [ ] Geser sebagian ke rentang yang overlap dengan dirinya sendiri berhasil.
- [ ] Customer tidak dapat memanggil aksi ini.

**Learning Focus**

Constraint pada UPDATE, self-overlap, penanganan konflik dengan pesan bermakna.

### TASK-8.2 — Admin Complete dan Cancel

**Goal**

Admin menutup atau membatalkan booking dengan aturan transisi yang benar.

**Dependency**

TASK-6.2, PB-5. Complete/cancel action tetap bagian booking state machine; booking hanya completed setelah sesi photobooth valid atau manual recovery.

Catatan progres Phase 8: halaman booking, detail, kalender, daftar customer, indikator payment, dan pembatalan admin sudah dibuat. Reschedule menunggu keputusan sumber durasi karena booking tidak menyimpan snapshot durasi/buffer, sementara package dapat berubah. `completeBooking` tetap menunggu PB-5 karena model sesi photobooth belum tersedia di schema saat ini.

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

- [ ] Complete sebelum `startAt` ditolak.
- [ ] Booking tidak dapat completed sebelum session selesai; manual recovery memerlukan reason/audit.
- [ ] SESSION_FAILED tidak menyelesaikan booking.
- [ ] Cancel COMPLETED ditolak.
- [ ] Cancel CONFIRMED menampilkan penanda perlu refund.

**Learning Focus**

State machine terpusat, aturan berbasis waktu, audit metadata (`cancelledBy`, `reason`).

**Definition of Done (Phase 8)**

- [ ] Admin dapat menjalankan seluruh siklus booking dari dashboard.
- [ ] Semua aksi admin diotorisasi server-side dan teruji.

---

## Phase 9 — Admin Dashboard

- [ ] Ringkasan jumlah booking per status
- [ ] Sesi hari ini dan mendatang
- [ ] Pendapatan sederhana (SUM payment `PAID`, periode bulan ini)
- [ ] Daftar booking yang butuh perhatian (perlu review, perlu refund)
- [ ] Tanpa advanced analytics

**Definition of Done**

- [ ] Angka dashboard sesuai data (diverifikasi dengan data seed).
- [ ] Query efisien untuk data skala kecil dan tidak mengekspos data non-admin.

---

## Phase 10 — Gallery & Public Polish

- [ ] Upload gambar via presigned URL (validasi tipe dan ukuran, FR-053)
- [ ] `/admin/gallery`
- [ ] Halaman `/gallery` (FR-003)
- [ ] Landing page final termasuk info studio (FR-004)
- [ ] Responsive audit (customer mobile-first, admin desktop-first)
- [ ] Loading, empty, dan error state di semua halaman utama
- [ ] `error.tsx`, `not-found.tsx`, metadata dan SEO dasar
- [ ] Pemeriksaan aksesibilitas dasar

**Definition of Done**

- [ ] Semua halaman publik dapat dipakai dengan baik di HP.
- [ ] Upload menolak tipe/ukuran tidak valid dan hanya admin yang dapat upload.
- [ ] Tidak ada halaman kosong tanpa penjelasan.

---

## Phase 11 — Security & Reliability

- [ ] Audit authorization untuk semua endpoint (matriks dari DESIGN bagian 6)
- [ ] Test IDOR untuk semua resource customer
- [ ] Rate limiting: login admin, `createBooking`, `createPayment`
- [ ] Review agent credential scope/rotation, device-to-booth ownership, polling, dan event validation
- [ ] Review stale heartbeat, command replay, duplicate normalized event, dan manual recovery audit
- [ ] Review validasi input di semua mutation
- [ ] Review webhook (signature, amount, idempotency)
- [ ] Review environment variables dan pastikan tidak ada secret di client bundle
- [ ] Security header dan konfigurasi cookie
- [ ] Review izin role database

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

- [ ] Untuk slot yang sama, jumlah booking aktif selalu 1.
- [ ] Tidak ada booking CONFIRMED tanpa payment PAID.
- [ ] Tidak ada payment PAID ganda atau update ganda.
- [ ] Test stabil saat dijalankan berulang.

**Learning Focus**

Menguji invarian di bawah concurrency, transaction isolation, deterministic test design.

**Definition of Done (Phase 11)**

- [ ] Seluruh checklist audit selesai dan temuan diperbaiki atau dicatat.
- [ ] Test race dan IDOR lulus.
- [ ] Tidak ada secret bocor.

---

## Phase 12 — Testing

- [ ] Unit test: availability, overlap, booking/photo session/booth state machines, event normalization, mapping status, signature, aturan cancel, MockBoothProvider modes
- [ ] Integration test: booking, payment webhook, authorization, booth assignment/commands/events (database test terpisah)
- [ ] E2E Playwright: alur customer (login seeded, package, slot, booking, simulasi webhook, CONFIRMED, dashboard)
- [ ] E2E Playwright: alur admin (login, lihat booking, kelola package, complete)
- [ ] Script `npm run test`, `test:e2e` dan integrasi CI sederhana (lint, typecheck, test)

**Definition of Done**

- [ ] Semua test lulus secara lokal dan di CI.
- [ ] Prioritas test dari `AGENTS.md` bagian 17 terpenuhi.
- [ ] Tidak ada test yang di-skip tanpa alasan tertulis.

---

## Phase 13 — Deployment

- [ ] Database produksi dan jalankan migration
- [ ] Seed admin produksi (password kuat, bukan password seed dev)
- [ ] Konfigurasi OAuth produksi (redirect URI, consent screen)
- [ ] Konfigurasi payment (sandbox atau produksi) dan daftarkan URL webhook produksi
- [ ] Konfigurasi object storage (bucket, CORS untuk presigned upload)
- [ ] Deploy ke Vercel dan set semua environment variable
- [ ] Konfigurasi cron (atau alternatif) untuk sweep expiry
- [ ] Provision booth device token secara aman dan jalankan Local Booth Agent di komputer studio
- [ ] Pastikan cloud endpoint HTTPS dapat dijangkau agent melalui koneksi outbound
- [ ] Domain dan HTTPS
- [ ] Smoke test end-to-end di produksi
- [ ] README: deskripsi proyek, screenshot, cara menjalankan lokal, dan tautan demo

**Definition of Done**

- [ ] Alur inti customer dan admin berjalan di URL produksi.
- [ ] Webhook produksi menerima dan memverifikasi event.
- [ ] Tidak ada secret di repository atau log.

---

## Final MVP Checklist

**Customer**

- [ ] Google Login
- [ ] Lihat Package
- [ ] Pilih Schedule (slot tersedia benar)
- [ ] Booking (WAITING_PAYMENT, slot ditahan)
- [ ] Bayar QRIS
- [ ] Webhook memverifikasi dan booking menjadi CONFIRMED
- [ ] Booking tampil di Dashboard (upcoming, history, detail)
- [ ] Cancel sesuai aturan

**Admin**

- [ ] Login
- [ ] Lihat Booking (filter dan detail)
- [ ] Kelola Schedule (jam operasional dan blokir)
- [ ] Kelola Package
- [ ] Complete Booking
- [ ] Reschedule dan Cancel
- [ ] Lihat Calendar dan Customer
- [ ] Check-in booking CONFIRMED + PAID
- [ ] Assign booth online dan memulai photo session
- [ ] Session selesai sebelum booking COMPLETED; recovery manual mencatat alasan

**Photobooth P0**

- [ ] Tidak bergantung provider tertentu; MockBoothProvider mencakup success/failure/unavailable/delay
- [ ] Local Booth Agent authenticated terpisah, mengirim heartbeat, dan menerima command lewat polling HTTPS
- [ ] ONLINE/OFFLINE/BUSY/MAINTENANCE ditampilkan benar; booth unavailable ditolak
- [ ] Command START_SESSION dan normalized events aman terhadap duplikasi
- [ ] Workflow lengkap dapat dijalankan tanpa software photobooth berbayar atau hardware

**Sistem**

- [ ] Double booking mustahil (terbukti test race)
- [ ] Webhook idempotent dan tervalidasi
- [ ] Expired booking melepaskan slot
- [ ] Authorization server-side dan IDOR teruji
- [ ] Deploy dan smoke test lulus

**Photobooth P1 (bukan syarat P0)**

- [ ] Satu real provider terpilih berdasarkan dokumentasi dan capability resmi
- [ ] Provider adapter nyata dapat start session dan hasil sesi diketahui melalui dukungan resmi
