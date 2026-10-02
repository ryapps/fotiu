# Alternatif workflow manual FreeBooth

Fotiu dapat menggunakan FreeBooth sebagai alternatif software booth lokal. FreeBooth belum
menyediakan API resmi yang ditemukan untuk menerima perintah start/status dari
Fotiu, jadi Local Booth Agent hanya melaporkan heartbeat. Admin mengoperasikan
FreeBooth pada komputer booth dan mencatat hasilnya di Fotiu.

## Persiapan komputer studio

1. Unduh dan pasang FreeBooth dari [website resminya](https://www.free-booth.com/).
2. Sambungkan kamera ke komputer dan atur aplikasi tethering kamera agar
   menyalin foto ke folder images yang dipilih di FreeBooth. Panduan resmi
   menyebut EOS Utility dan gphoto2 sebagai contoh aplikasi tethering.
3. Buka FreeBooth pada komputer booth dan pastikan operator dapat menjalankan
   photo booth serta foto uji muncul di folder images.
4. Di **Admin → Photobooth**, pilih provider **FreeBooth (operator manual)**
   saat membuat booth baru. Jika booth sudah ada, ganti provider ketika tidak
   ada sesi/command aktif. Salin token perangkat saat provision baru; token
   hanya muncul sekali.
5. Siapkan Local Booth Agent di komputer yang sama. Atur
   `BOOTH_AGENT_BASE_URL`, `BOOTH_DEVICE_ID`, `BOOTH_DEVICE_TOKEN`, dan
   `BOOTH_PROVIDER_KEY=freebooth` pada environment agent. Simpan token sebagai
   secret dan jangan menaruhnya di log atau repository.
   Jika provider booth baru saja diubah, samakan nilai ini dengan pilihan admin
   lalu restart agent.
6. Jalankan `npm run booth:agent`. Agent harus tampak **Online** di halaman
   Photobooth admin. Agent diperlukan untuk heartbeat dan assignment, bukan
   untuk mengendalikan FreeBooth.

## Alur demo booking

1. Pastikan booking berstatus `CONFIRMED`, payment `PAID`, dan customer sudah
   check-in.
2. Admin assign booking ke booth FreeBooth yang online.
3. Operator menjalankan sesi di aplikasi FreeBooth lokal.
4. Setelah sesi benar-benar berjalan, admin kembali ke detail booking dan
   memilih **Catat sesi dimulai di FreeBooth**. Fotiu mencatat sesi aktif tanpa
   membuat `START_SESSION` command.
5. Setelah sesi berakhir, admin memeriksa komputer booth dan hasil foto.
6. Admin menggunakan **Manual recovery**, mengisi alasan/verifikasi, lalu
   menyelesaikan booking. Fotiu menyimpan alasan, admin, waktu, dan sumber
   completion.

Jangan catat sesi dimulai sebelum operator menjalankan FreeBooth. Jangan
selesaikan booking hanya karena UI booth atau agent menunjukkan status tertentu;
FreeBooth tidak mengirim status sesi ke Fotiu.

## Batasan demo

- Start, status, completion, stop, dan reprint tidak terintegrasi otomatis.
- Tampilan slideshow FreeBooth versi terbaru bisa berbeda dari panduan lama;
  versi 0.9.3 menghapus slideshow server.
- Uji kamera, tethering, dan folder foto pada komputer studio sebelum demo
  customer. Website tidak mengakses kamera atau printer.

Referensi: [panduan penggunaan resmi FreeBooth](https://www.free-booth.com/index.php/how-to-build-a-diy-photo-booth/),
[website FreeBooth](https://www.free-booth.com/), dan
[source serta changelog FreeBooth](https://github.com/Luy242/freebooth).
