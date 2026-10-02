# Integrasi Photobooth-App lokal

Fotiu menyediakan adapter P1 untuk software Photobooth-App. Local Booth Agent
memanggil endpoint action lokal `GET /api/actions/{action_type}/{index}`. Plugin
Commander mengirim lifecycle event kembali ke agent. API booth dan callback hanya
untuk jaringan komputer studio; jangan meneruskannya ke internet.

Setiap booking menyediakan sesi 10 menit dan jeda 2 menit sebelum slot berikutnya.
Commander/action Photobooth-App perlu dikonfigurasi agar job capture selesai
dalam 10 menit. Fotiu tidak menghentikan job dengan timer; sesi hanya dinyatakan
selesai setelah callback `finished` tervalidasi diterima.

## Prasyarat

- Pasang Photobooth-App pada komputer booth dan pastikan dapat dibuka di
  `http://127.0.0.1:8000`.
- Atur kamera dan action di Admin Center. Windows mendukung webcam; DSLR di
  Windows memakai backend DigiCamControl yang dokumentasi upstream sebut tidak
  lagi dipelihara. Uji kamera sebenarnya dahulu.
- Jalankan Local Booth Agent pada komputer yang sama dengan Photobooth-App.
- Buat token callback acak lokal minimal 32 karakter. Token ini berbeda dari
  credential device Fotiu.

## Environment Local Booth Agent

```dotenv
BOOTH_PROVIDER_KEY=photobooth_app
BOOTH_PHOTOBOOTH_APP_URL=http://127.0.0.1:8000
BOOTH_PHOTOBOOTH_APP_ACTION=image
BOOTH_PHOTOBOOTH_APP_ACTION_INDEX=0
BOOTH_PHOTOBOOTH_APP_CALLBACK_TOKEN=<random-token-minimal-32-karakter>
BOOTH_PHOTOBOOTH_APP_CALLBACK_PORT=43127
```

Pilih action type yang didukung API: `image`, `collage`, `animation`, `video`,
atau `multicamera`. Index mengikuti action yang dikonfigurasi dalam aplikasi.
Agent hanya listen pada `127.0.0.1`, memeriksa token constant-time, dan menerima
callback dari loopback.

Untuk menghubungkan komputer booth ke deployment, buat booth `Photobooth-App`
di admin `https://fotiu.vercel.app` dan provision credential device baru di
database production. Pada environment agent di komputer booth, set
`BOOTH_AGENT_BASE_URL=https://fotiu.vercel.app` serta `BOOTH_DEVICE_ID` dan
`BOOTH_DEVICE_TOKEN` yang baru. Pengaturan `BOOTH_PHOTOBOOTH_APP_*` di atas tetap
menunjuk ke software dan callback loopback pada komputer itu.

## Commander callback

Di Admin Center → Help, buka dokumentasi REST API interaktif untuk instalasi
Photobooth-App yang berjalan. Di Configuration → Commander, aktifkan pemrosesan
tasks dan tambahkan HTTP request task dengan pengaturan berikut:

- Method: `GET`
- URL: `http://127.0.0.1:43127/photobooth-app/event`
- Events: `counting`, `capture`, dan `finished`
- Query parameter `token`: isi token callback yang sama
- Query parameter `event`: isi template `{event}`
- Timeout: nilai singkat yang wajar, misalnya 5 detik

Simpan konfigurasi dan restart/reload service jika diminta. Event `counting` atau
`capture` menandai sesi mulai. Hanya `finished` yang menormalisasi ke completion.
HTTP 2xx dari action API hanya mengonfirmasi trigger diterima, bukan sesi selesai.
Commander tidak mendokumentasikan callback kegagalan; jika capture gagal atau
callback tidak tiba, sesi perlu diperiksa dan ditangani admin melalui manual
recovery beralasan.

## Alur operasi

1. Buat/pilih booth provider `Photobooth-App` di Admin → Photobooth.
2. Pastikan agent online dan Photobooth-App terbuka dengan kamera/action siap.
3. Booking harus `CONFIRMED`, payment `PAID`, sudah check-in, dan berada dalam
   jadwal yang diizinkan.
4. Admin memulai sesi dari detail booking. Agent mengirim action yang dipilih.
5. Commander mengirim lifecycle callback; agent memetakan event ke endpoint
   normalized Fotiu. Event inbox dan state machine cloud tetap menjadi sumber
   perubahan status sesi/booking.
6. Jika hasil tidak diketahui, jangan kirim ulang START_SESSION. Periksa booth
   secara fisik dan gunakan manual recovery dengan alasan bila sesi benar-benar
   selesai.

## Batasan

- Adapter satu sesi aktif pada booth Fotiu, sesuai constraint P0 saat ini.
- Start, session events, dan completion didukung. Stop/reprint tidak didukung.
- Callback harus dikonfigurasi untuk setiap instalasi; tanpa callback, sesi tidak
  akan dianggap selesai otomatis.
- Token callback berada pada URL query karena Commander mendukung query
  parameters. Ia hanya dikirim ke loopback dan tidak boleh dipakai ulang untuk
  credential lain.
- Developer melaporkan uji end-to-end pada komputer studio berhasil pada
  2 Okt 2026, termasuk kamera, action, dan callback Commander. Catat hasil
  retry/recovery secara terpisah bila diuji.

Referensi resmi: [Actions dan REST API](https://photobooth-app.org/setup/configuration/actions),
[Commander](https://photobooth-app.org/setup/configuration/commander),
[Admin Center dan API docs](https://photobooth-app.org/setup/configuration/admincenter),
[instalasi Windows/Linux](https://photobooth-app.org/setup/installation),
[source action endpoint](https://github.com/photobooth-app/photobooth-app/blob/main/src/photobooth/routers/api/actions.py).
