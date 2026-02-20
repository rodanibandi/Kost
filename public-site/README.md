# Website Publik Kost

Frontend statis untuk Cloudflare Pages.

## Fitur MVP
- Menampilkan daftar kost yang `status_publish` aktif.
- Menampilkan kamar per kost.
- Form booking publik.
- Konfigurasi endpoint API via `config.js`.

## Struktur
- `index.html` : halaman publik.
- `styles.css` : style sederhana.
- `app.js` : fetch listing, render UI, submit booking.
- `config.js` : konfigurasi endpoint.
- `data/sample-listings.json` : data fallback lokal untuk mode demo.

## Konfigurasi API
Edit `config.js`:

```js
window.PUBLIC_CONFIG = {
  apiBaseUrl: 'https://your-worker-domain.workers.dev',
  listEndpointPath: '/public/listings',
  bookingEndpointPath: '/public/bookings',
  fallbackDataPath: './data/sample-listings.json'
};
```

- Jika `apiBaseUrl` kosong, website akan pakai `fallbackDataPath` untuk listing.
- Jika `bookingEndpointPath` belum aktif, submit booking berjalan mode demo (tidak mengirim ke server).

## Kontrak API yang diharapkan
### GET `/public/listings`
Response JSON salah satu format:
1) Langsung:
```json
{ "kost": [], "kamar": [] }
```
2) Dibungkus:
```json
{ "success": true, "data": { "kost": [], "kamar": [] } }
```

### POST `/public/bookings`
Request body:
```json
{
  "nama": "Nama",
  "no_hp": "08...",
  "email": "user@email.com",
  "id_kamar": "KMR-001",
  "tgl_masuk": "2026-03-01",
  "durasi_bulan": "6",
  "catatan": "...",
  "sumber": "website-publik"
}
```

Contoh response sukses:
```json
{ "success": true, "data": { "message": "Booking diterima" } }
```

## Deploy ke Cloudflare Pages
1. Push folder ini ke repository.
2. Buat project Pages dan set output directory ke `public-site`.
3. Karena ini static site, build command bisa dikosongkan.
4. Setelah deploy, atur `config.js` untuk endpoint Worker produksi.
