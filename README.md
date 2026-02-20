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

## Deploy Worker API (Cloudflare)

Repo ini sudah berisi Worker di folder `worker/` dan config `wrangler.jsonc`, jadi error "Missing entry-point" sudah teratasi.

Sebelum deploy, set environment variable di Cloudflare Worker:

- `APPS_SCRIPT_URL` = URL Web App Apps Script kamu.
- `APPS_SCRIPT_API_TOKEN` = token rahasia untuk ingest booking.
- `ALLOWED_ORIGINS` = daftar origin frontend dipisah koma, contoh:
	`https://namaproject.pages.dev,http://localhost:8080`

Di Apps Script, buka Script Properties lalu set:

- key: `PUBLIC_API_TOKEN`
- value: sama persis dengan `APPS_SCRIPT_API_TOKEN` di Worker.

Endpoint yang tersedia di Worker:

- `GET /public/listings`
- `POST /public/bookings`