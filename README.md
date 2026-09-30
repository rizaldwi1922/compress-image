# Ringkas

Aplikasi web lokal untuk mengompres dan mengonversi gambar ke WebP, JPEG, atau PNG. Seluruh proses berjalan di browser; file tidak pernah dikirim ke server.

## Menjalankan

Karena aplikasi memakai JavaScript module, jalankan melalui server lokal:

```bash
npm start
```

Lalu buka alamat yang tampil di terminal. Alternatif tanpa memasang paket adalah memakai server lokal apa pun untuk membuka folder ini.

## Cara kerja

- Pilih target ukuran, misalnya `1000 KB`.
- Pilih format `WEBP` untuk ukuran paling efisien.
- Tarik gambar ke area unggah atau pilih dari perangkat.
- Aplikasi mencari kualitas tertinggi yang masih memenuhi target.
- Bila kualitas minimum belum cukup, resolusi diturunkan bertahap hingga target tercapai.
- Saat memproses beberapa gambar, gunakan **Unduh semua** untuk mengambil seluruh hasil dalam satu file ZIP.

Target sangat kecil mungkin tidak dapat dicapai tanpa kehilangan detail yang berlebihan. Dalam kondisi itu, aplikasi memberikan hasil terbaik dan menampilkan peringatan.

## Tes

```bash
npm test
```
