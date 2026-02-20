# Kost

Repository ini berisi 2 bagian utama:

1. `apps-script/` → Web app management kost (internal) berbasis Google Apps Script.
2. `public-site/` → Website publik kost untuk Cloudflare Pages.

Dokumen rencana lengkap ada di `abaut.md`.

## Menjalankan website publik (lokal)

Masuk ke folder `public-site` lalu jalankan static server favorit Anda, misalnya:

```bash
python3 -m http.server 8080
```

Kemudian buka `http://localhost:8080`.

Detail konfigurasi endpoint ada di `public-site/README.md`.