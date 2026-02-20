# Sistem Aplikasi Web Management Kost (Dokumen Rencana)

Dokumen ini merangkum semua informasi dan rencana yang sudah dibahas untuk membangun sistem aplikasi kost.

## Tujuan Utama

Membangun sistem dengan 2 bagian:

1. **Website informasi kost (publik)** di Cloudflare Pages.
2. **Web app management kost (internal)** dengan Google Apps Script + Google Spreadsheet.

Urutan pengerjaan yang disepakati:
- **Pertama:** bangun web app management dulu.
- **Kedua:** lanjut website informasi publik.

---

## Gambaran Arsitektur

- **Frontend Publik:** Cloudflare Pages
  - Menampilkan informasi kost/kamar.
  - Menyediakan form booking.

- **API Layer (disarankan):** Cloudflare Worker
  - Menerima booking dari website publik.
  - Validasi input.
  - Anti-spam/rate limit.
  - Forward data ke Apps Script.

- **Backoffice Internal:** Google Apps Script Web App
  - Dashboard manager.
  - Kelola booking, kost, kamar.

- **Database sederhana:** Google Spreadsheet
  - Menjadi sumber data utama.

---

## Alur Data End-to-End

1. Pengunjung masuk website informasi kost.
2. Pengunjung isi form booking.
3. Data booking masuk ke endpoint (Worker), divalidasi.
4. Worker kirim data ke Apps Script ingest endpoint.
5. Apps Script menyimpan ke sheet `booking`.
6. Manager buka web app internal untuk memproses booking.
7. Manager bisa tambah/edit data kost dan kamar.
8. Data publish dipakai kembali oleh website publik.

---

## Tahap 1 (Fokus): Web App Management Dulu

### Scope MVP Management

- Login manager (berdasarkan akun Google + whitelist role).
- Melihat daftar booking.
- Update status booking.
- CRUD data kost.
- CRUD data kamar.
- Audit log perubahan data.

### Stack Tahap 1

- Google Spreadsheet = data store.
- Google Apps Script = backend + UI dashboard sederhana.

---

## Setup Awal

1. Siapkan 1 akun Google operasional khusus.
2. Buat spreadsheet utama: `Kost Management`.
3. Buat project Apps Script yang terhubung ke spreadsheet.
4. Definisikan role:
   - `owner`
   - `manager`
5. Batasi akses web app hanya email yang diizinkan.

---

## Struktur Spreadsheet (Disarankan)

Buat 5 sheet:

### 1) `kost`
Kolom:
- `id_kost`
- `nama`
- `alamat`
- `maps_url`
- `fasilitas_umum`
- `kontak`
- `status_publish`
- `updated_at`

### 2) `kamar`
Kolom:
- `id_kamar`
- `id_kost`
- `nama_kamar`
- `harga_bulanan`
- `ukuran`
- `fasilitas`
- `status_ketersediaan`
- `foto_url`
- `updated_at`

### 3) `booking`
Kolom:
- `id_booking`
- `created_at`
- `nama`
- `no_hp`
- `email`
- `id_kamar`
- `tgl_masuk`
- `durasi_bulan`
- `catatan`
- `status`
- `sumber`
- `updated_at`

### 4) `users`
Kolom:
- `email`
- `nama`
- `role`
- `is_active`

### 5) `audit_log`
Kolom:
- `waktu`
- `actor_email`
- `aksi`
- `entity`
- `entity_id`
- `payload_ringkas`

---

## Standar Status

### Status Booking
- `baru`
- `diproses`
- `diterima`
- `ditolak`
- `check-in`
- `batal`

### Status Kamar
- `tersedia`
- `dibooking`
- `terisi`
- `nonaktif`

---

## Struktur Kode Apps Script (Saran)

Pisahkan modul agar maintainable:

- `auth`
  - cek user login (email)
  - cek role dari sheet `users`

- `repositories`
  - fungsi baca/tulis per sheet
  - contoh: `getBookings`, `updateBookingStatus`, `upsertKamar`

- `validators`
  - validasi field wajib
  - validasi enum status
  - validasi format angka/tanggal

- `services`
  - business logic lintas entitas
  - contoh: saat booking diterima, status kamar berubah

- `handlers`
  - endpoint action untuk UI/API

- `logging`
  - tulis jejak perubahan ke `audit_log`

---

## Endpoint Minimal (MVP)

### Endpoint untuk Manager
- `GET action=listBookings`
- `PATCH action=updateBookingStatus`
- `GET action=listKost`
- `POST action=upsertKost`
- `GET action=listKamar`
- `POST action=upsertKamar`
- `GET action=listUsers` (opsional, owner only)

Catatan:
- Semua endpoint manager wajib role check.
- Semua mutasi data wajib update `updated_at` + tulis `audit_log`.

---

## UI Dashboard Management (MVP)

Halaman internal minimal berisi:

- Informasi sesi login (email + role).
- Tab `Booking`
  - tabel booking
  - filter status
  - tombol ubah status
- Tab `Kost`
  - form tambah/edit kost
- Tab `Kamar`
  - form tambah/edit kamar
- Notifikasi sederhana sukses/gagal.

Fokus MVP: fungsi stabil dulu, desain visual belakangan.

---

## Deploy Apps Script Web App

- Deploy sebagai Web App.
- `Execute as`: akun pemilik script.
- `Who has access`: hanya user yang diizinkan.
- Isi sheet `users` terlebih dahulu (whitelist).
- Simpan URL deploy sebagai dashboard internal.

---

## Keamanan Penting

- Jangan expose endpoint write Apps Script langsung ke publik.
- Gunakan secret token antara Worker ↔ Apps Script.
- Validasi semua input di server-side.
- Batasi CORS hanya domain resmi.
- Tambah anti-spam (honeypot + rate limit + minimal delay submit).
- Batasi aksi sensitif berdasarkan role.

---

## Pengujian yang Wajib Dilakukan

1. Login manager berhasil/gagal sesuai whitelist.
2. Tambah/edit kost tersimpan benar.
3. Tambah/edit kamar dan status berubah benar.
4. Booking dummy bisa diproses sampai update status.
5. Semua mutasi tercatat di `audit_log`.
6. Error handling jelas untuk input invalid/ID tidak ditemukan.

---

## Hardening Minimal Sebelum Go-Live Internal

- Kunci kolom ID agar tidak terubah manual.
- Gunakan format ID konsisten:
  - `KST-001`
  - `KMR-001`
  - `BKG-YYYYMMDD-001`
- Backup spreadsheet rutin (harian/mingguan).
- Pastikan hanya role tertentu bisa aksi sensitif.

---

## Roadmap Implementasi

### Rencana 7 Hari (Global)
- Hari 1: setup sheet + Apps Script CRUD dasar.
- Hari 2: Worker endpoint booking + validasi.
- Hari 3: halaman publik + form booking.
- Hari 4: dashboard manager booking.
- Hari 5: CRUD kost/kamar.
- Hari 6: hardening & logging.
- Hari 7: UAT & final deploy.

### Rencana Fokus Management (lebih detail)
- Hari 1: schema spreadsheet + `users`.
- Hari 2: backend Apps Script (`auth`, CRUD dasar, audit log).
- Hari 3: dashboard tab booking + update status.
- Hari 4: dashboard tab kost/kamar + validasi.
- Hari 5: test end-to-end + hardening + deploy internal.

---

## Tahap 2 (Setelah Management Stabil)

Bangun website informasi publik di Cloudflare Pages:
- tampilkan data kost/kamar yang status publish,
- form booking kirim ke endpoint aman (Worker),
- data booking masuk ke management app untuk diproses.

Dengan ini, management app tetap jadi pusat operasi dan approval booking.

---

## Kesimpulan

Pendekatan ini cocok untuk:
- mulai cepat,
- biaya rendah,
- operasional sederhana,
- dan mudah ditingkatkan saat trafik bertambah.

Jika skala makin besar, backend/database bisa dimigrasi bertahap tanpa mengubah total alur bisnis.
