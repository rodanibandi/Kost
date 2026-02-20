function logAudit(actorEmail, action, entity, entityId, payloadSummary) {
  appendRecord(APP_CONFIG.SHEETS.AUDIT_LOG, {
    waktu: nowIso(),
    actor_email: actorEmail,
    aksi: action,
    entity: entity,
    entity_id: entityId,
    payload_ringkas: payloadSummary || ''
  });
}

function listBookingsService() {
  const records = getAllRecords(APP_CONFIG.SHEETS.BOOKING);
  records.sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });
  return records;
}

function shouldMarkRoomAsBooked(bookingStatus) {
  const status = String(bookingStatus || '').trim().toLowerCase();
  return status === 'baru' || status === 'diproses' || status === 'diterima' || status === 'check-in';
}

function parseAcceptedBookingPeriod(input) {
  const dari = String((input && input.pengguna_ngekost_dari) || '').trim();
  const sampai = String((input && input.pengguna_ngekost_sampai) || '').trim();

  if (!dari && !sampai) {
    return null;
  }

  const normalizedDari = normalizeMonthValue(dari || '');
  const normalizedSampai = normalizeMonthValue(sampai || '');
  if (normalizedDari === '-' || normalizedSampai === '-') {
    throw new Error('Periode ngekost untuk status diterima wajib format YYYY-MM.');
  }

  if (normalizedSampai < normalizedDari) {
    throw new Error('Periode ngekost tidak valid: bulan sampai lebih kecil dari bulan dari.');
  }

  return {
    ngekost_dari: normalizedDari,
    ngekost_sampai: normalizedSampai
  };
}

function resolveKamarStatusForRoom(roomId) {
  const idKamar = String(roomId || '').trim();
  required(idKamar, 'id_kamar');

  const penggunaRows = getAllPenggunaRecords();
  const hasActiveOccupant = penggunaRows.some(function (row) {
    return String(row.id_kamar || '').trim() === idKamar
      && String(row.status || '').trim().toLowerCase() === 'aktif';
  });

  if (hasActiveOccupant) {
    return 'terisi';
  }

  const bookingRows = getAllRecords(APP_CONFIG.SHEETS.BOOKING);
  const hasActiveBooking = bookingRows.some(function (row) {
    return String(row.id_kamar || '').trim() === idKamar
      && shouldMarkRoomAsBooked(row.status);
  });

  if (hasActiveBooking) {
    return 'dibooking';
  }

  return 'tersedia';
}

function syncSingleKamarStatus(roomId, user, reason) {
  const idKamar = String(roomId || '').trim();
  required(idKamar, 'id_kamar');

  const kamarRows = getAllRecords(APP_CONFIG.SHEETS.KAMAR);
  const currentRoom = kamarRows.find(function (row) {
    return String(row.id_kamar || '').trim() === idKamar;
  });

  if (!currentRoom) {
    throw new Error('ID kamar tidak ditemukan: ' + idKamar);
  }

  const currentStatus = String(currentRoom.status_ketersediaan || '').trim().toLowerCase();
  if (currentStatus === 'nonaktif') {
    return currentRoom;
  }

  const targetStatus = resolveKamarStatusForRoom(idKamar);
  if (currentStatus === targetStatus) {
    return currentRoom;
  }

  const updated = updateRecordById(APP_CONFIG.SHEETS.KAMAR, 'id_kamar', idKamar, {
    status_ketersediaan: targetStatus,
    updated_at: nowIso()
  });

  if (user && user.email) {
    logAudit(user.email, 'sync_kamar_status', 'kamar', idKamar, JSON.stringify({
      from_status: currentStatus,
      to_status: targetStatus,
      reason: String(reason || '').trim()
    }));
  }

  return updated;
}

function generateNextBookingId() {
  const rows = getAllRecords(APP_CONFIG.SHEETS.BOOKING);
  let maxNumber = 0;

  rows.forEach(function (row) {
    const match = String(row.id_booking || '').trim().toUpperCase().match(/^BKG-(\d+)$/);
    if (!match) {
      return;
    }

    const number = parseInt(match[1], 10);
    if (!isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  });

  return 'BKG-' + String(maxNumber + 1).padStart(3, '0');
}

function getTestBookingRoomId() {
  const kamarRows = getAllRecords(APP_CONFIG.SHEETS.KAMAR);
  if (!kamarRows.length) {
    throw new Error('Belum ada data kamar. Tambahkan kamar dulu sebelum membuat booking test.');
  }

  const availableRoom = kamarRows.find(function (row) {
    return String(row.status_ketersediaan || '').trim().toLowerCase() === 'tersedia';
  });

  const selectedRoom = availableRoom || kamarRows[0];
  const roomId = String(selectedRoom.id_kamar || '').trim();
  required(roomId, 'id_kamar');
  return roomId;
}

function createTestBookingService(input, user) {
  const idBooking = generateNextBookingId();
  const nama = String(input.nama || '').trim();
  const noHp = String(input.no_hp || '').trim();
  const email = String(input.email || '').trim();
  const roomId = String(input.id_kamar || '').trim() || getTestBookingRoomId();
  const now = new Date();
  const nowText = nowIso();

  required(nama, 'nama');
  required(noHp, 'no_hp');
  required(email, 'email');
  required(roomId, 'id_kamar');

  if (email.indexOf('@') < 1) {
    throw new Error('Format email tidak valid.');
  }

  const kamarExists = getAllRecords(APP_CONFIG.SHEETS.KAMAR).some(function (row) {
    return String(row.id_kamar || '').trim() === roomId;
  });
  if (!kamarExists) {
    throw new Error('ID kamar tidak ditemukan: ' + roomId);
  }

  const newRecord = {
    id_booking: idBooking,
    nama: nama,
    no_hp: noHp,
    email: email,
    id_kamar: roomId,
    status: 'baru',
    created_at: nowText,
    updated_at: nowText
  };

  appendRecord(APP_CONFIG.SHEETS.BOOKING, newRecord);
  syncSingleKamarStatus(roomId, user, 'create_test_booking');
  logAudit(user.email, 'create_test_booking', 'booking', idBooking, JSON.stringify({
    id_kamar: roomId
  }));

  return newRecord;
}

function updateBookingStatusService(input, user) {
  const bookingId = String(input.id_booking || '').trim();
  const nextStatus = String(input.status || '').trim();
  const acceptedPeriod = parseAcceptedBookingPeriod(input || {});

  required(bookingId, 'id_booking');
  required(nextStatus, 'status');
  assertInEnum(nextStatus, APP_CONFIG.STATUS.BOOKING, 'status booking');

  const bookings = getAllRecords(APP_CONFIG.SHEETS.BOOKING);
  const existingBooking = bookings.find(function (item) {
    return String(item.id_booking || '') === bookingId;
  });

  if (!existingBooking) {
    throw new Error('Booking tidak ditemukan: ' + bookingId);
  }

  const currentStatus = String(existingBooking.status || '').trim();
  if (!currentStatus) {
    throw new Error('Status booking saat ini kosong.');
  }

  if (currentStatus === nextStatus) {
    throw new Error('Status booking sudah ' + nextStatus + '.');
  }

  const updatedRecord = updateRecordById(APP_CONFIG.SHEETS.BOOKING, 'id_booking', bookingId, {
    status: nextStatus,
    updated_at: nowIso()
  });

  if (String(updatedRecord.status || '') !== nextStatus) {
    throw new Error('Verifikasi update gagal: status booking belum berubah.');
  }

  if (nextStatus === 'diterima') {
    if (!acceptedPeriod) {
      throw new Error('Saat status diterima, periode ngekost wajib diisi (bulan dari & sampai).');
    }
    createPenggunaFromApprovedBooking(existingBooking, user, acceptedPeriod);
  }

  syncSingleKamarStatus(String(existingBooking.id_kamar || '').trim(), user, 'update_booking_status');

  logAudit(user.email, 'update_booking_status', 'booking', bookingId, JSON.stringify({
    from_status: currentStatus,
    to_status: nextStatus
  }));

  return {
    id_booking: bookingId,
    previous_status: currentStatus,
    status: nextStatus,
    updated_at: updatedRecord.updated_at || ''
  };
}

function listKostService() {
  const records = getAllRecords(APP_CONFIG.SHEETS.KOST);
  records.sort(function (a, b) {
    return String(a.id_kost || '').localeCompare(String(b.id_kost || ''));
  });
  return records;
}

function toAlphabetSuffix(index) {
  if (index <= 0) return '';

  let value = index;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function parseKostId(idValue) {
  const text = String(idValue || '').trim().toUpperCase();
  const match = text.match(/^KOST(\d{2})([A-Z]*)$/);
  if (!match) {
    return null;
  }

  const number = parseInt(match[1], 10);
  const suffix = match[2] || '';
  if (number < 1 || number > 99) {
    return null;
  }

  let suffixIndex = 0;
  if (suffix) {
    for (let i = 0; i < suffix.length; i++) {
      suffixIndex = suffixIndex * 26 + (suffix.charCodeAt(i) - 64);
    }
  }

  return {
    number: number,
    suffixIndex: suffixIndex,
    order: (suffixIndex * 99) + number
  };
}

function generateNextKostId() {
  const kosts = getAllRecords(APP_CONFIG.SHEETS.KOST);
  let maxOrder = 0;

  kosts.forEach(function (item) {
    const parsed = parseKostId(item.id_kost);
    if (parsed && parsed.order > maxOrder) {
      maxOrder = parsed.order;
    }
  });

  const nextOrder = maxOrder + 1;
  const number = ((nextOrder - 1) % 99) + 1;
  const suffixIndex = Math.floor((nextOrder - 1) / 99);
  const suffix = toAlphabetSuffix(suffixIndex);

  return 'KOST' + String(number).padStart(2, '0') + suffix;
}

function upsertKostService(input, user) {
  const idKost = String(input.id_kost || '').trim();
  const nama = String(input.nama || '').trim();
  const alamat = String(input.alamat || '').trim();
  const mapsUrl = String(input.maps_url || '').trim();
  const fasilitasUmum = String(input.fasilitas_umum || '').trim();
  const kontak = String(input.kontak || '').trim();
  const statusPublish = String(input.status_publish || '').trim() || 'draft';

  required(nama, 'nama');
  required(alamat, 'alamat');

  if (idKost) {
    const updatedRecord = updateRecordById(APP_CONFIG.SHEETS.KOST, 'id_kost', idKost, {
      nama: nama,
      alamat: alamat,
      maps_url: mapsUrl,
      fasilitas_umum: fasilitasUmum,
      kontak: kontak,
      status_publish: statusPublish,
      updated_at: nowIso()
    });

    logAudit(user.email, 'update_kost', 'kost', idKost, JSON.stringify({ nama: nama }));
    return updatedRecord;
  }

  const newId = generateNextKostId();
  const newRecord = {
    id_kost: newId,
    nama: nama,
    alamat: alamat,
    maps_url: mapsUrl,
    fasilitas_umum: fasilitasUmum,
    kontak: kontak,
    status_publish: statusPublish,
    updated_at: nowIso()
  };

  appendRecord(APP_CONFIG.SHEETS.KOST, newRecord);
  logAudit(user.email, 'create_kost', 'kost', newId, JSON.stringify({ nama: nama }));

  return newRecord;
}

function deleteKostService(input, user) {
  const idKost = String(input.id_kost || '').trim();
  required(idKost, 'id_kost');

  const deletedRecord = deleteRecordById(APP_CONFIG.SHEETS.KOST, 'id_kost', idKost);
  logAudit(user.email, 'delete_kost', 'kost', idKost, JSON.stringify({ nama: deletedRecord.nama || '' }));

  return {
    id_kost: idKost,
    deleted: true
  };
}

function listKamarService() {
  return getAllRecords(APP_CONFIG.SHEETS.KAMAR);
}

function extractDriveFolderId(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const folderMatch = text.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  const isIdLike = /^[a-zA-Z0-9_-]{20,}$/.test(text);
  return isIdLike ? text : '';
}

function getKamarImageFolder() {
  const folderConfig = APP_CONFIG.DRIVE && APP_CONFIG.DRIVE.KAMAR_IMAGE_FOLDER_URL;
  const folderId = extractDriveFolderId(folderConfig);
  if (!folderId) {
    throw new Error('Folder Drive gambar kamar belum dikonfigurasi dengan benar.');
  }

  try {
    return DriveApp.getFolderById(folderId);
  } catch (err) {
    throw new Error('Izin Google Drive belum diberikan. Jalankan fungsi authorizeDriveAccess() sekali di Apps Script Editor, lalu approve izin Drive.');
  }
}

function authorizeDriveAccess() {
  DriveApp.getRootFolder().getId();
  return { authorized: true };
}

function sanitizeFileBaseName(name) {
  const raw = String(name || '').trim() || 'Kamar';
  return raw
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getExtensionFromImage(image) {
  const mimeType = String(image.mimeType || '').toLowerCase();
  const originalName = String(image.originalName || '').toLowerCase();

  if (mimeType === 'image/jpeg' || /\.(jpg|jpeg)$/.test(originalName)) return '.jpg';
  if (mimeType === 'image/png' || /\.png$/.test(originalName)) return '.png';
  if (mimeType === 'image/webp' || /\.webp$/.test(originalName)) return '.webp';
  if (mimeType === 'image/gif' || /\.gif$/.test(originalName)) return '.gif';
  return '.jpg';
}

function uploadKamarImages(namaKamar, images) {
  const safeImages = Array.isArray(images) ? images : [];
  if (!safeImages.length) {
    return [];
  }

  if (safeImages.length > 5) {
    throw new Error('Maksimal upload 5 gambar kamar.');
  }

  const folder = getKamarImageFolder();
  const baseName = sanitizeFileBaseName(namaKamar);

  return safeImages.map(function (image, index) {
    const mimeType = String(image.mimeType || '').trim();
    const dataBase64 = String(image.dataBase64 || '').trim();
    if (!mimeType || !dataBase64) {
      throw new Error('Data gambar tidak lengkap.');
    }

    if (mimeType.indexOf('image/') !== 0) {
      throw new Error('File harus berupa gambar.');
    }

    const suffix = String(index + 1).padStart(2, '0');
    const fileName = baseName + '_' + suffix + getExtensionFromImage(image);
    const blob = Utilities.newBlob(Utilities.base64Decode(dataBase64), mimeType, fileName);
    const file = folder.createFile(blob);
    return file.getUrl();
  });
}

function normalizeFasilitasCell(input) {
  const values = Array.isArray(input)
    ? input
    : String(input || '').split(';');

  const result = [];
  values.forEach(function (item) {
    const normalized = String(item || '').trim();
    if (!normalized) {
      return;
    }

    if (result.indexOf(normalized) === -1) {
      result.push(normalized);
    }
  });

  return result.join(';');
}

function generateNextKamarId() {
  const kamars = getAllRecords(APP_CONFIG.SHEETS.KAMAR);
  let maxNumber = 0;

  kamars.forEach(function (item) {
    const text = String(item.id_kamar || '').trim().toUpperCase();
    const match = text.match(/^KMR-(\d+)$/);
    if (!match) {
      return;
    }
    const number = parseInt(match[1], 10);
    if (!isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  });

  return 'KMR-' + String(maxNumber + 1).padStart(3, '0');
}

function createKamarService(input, user) {
  const idKost = String(input.id_kost || '').trim();
  const namaKamar = String(input.nama_kamar || '').trim();
  const hargaBulanan = String(input.harga_bulanan || '').trim();
  const ukuran = String(input.ukuran || '').trim();
  const fasilitas = normalizeFasilitasCell(input.fasilitas || '');
  const images = Array.isArray(input.images) ? input.images : [];

  required(idKost, 'id_kost');
  required(namaKamar, 'nama_kamar');
  required(hargaBulanan, 'harga_bulanan');

  const uploadedUrls = uploadKamarImages(namaKamar, images);
  const newId = generateNextKamarId();
  const newRecord = {
    id_kamar: newId,
    id_kost: idKost,
    nama_kamar: namaKamar,
    harga_bulanan: hargaBulanan,
    ukuran: ukuran,
    fasilitas: fasilitas,
    status_ketersediaan: 'tersedia',
    foto_url: uploadedUrls.join('; '),
    updated_at: nowIso()
  };

  appendRecord(APP_CONFIG.SHEETS.KAMAR, newRecord);
  logAudit(user.email, 'create_kamar', 'kamar', newId, JSON.stringify({
    id_kost: idKost,
    nama_kamar: namaKamar,
    jumlah_gambar: uploadedUrls.length
  }));

  return newRecord;
}

function splitSemicolonValues(value) {
  return String(value || '')
    .split(';')
    .map(function (item) { return String(item || '').trim(); })
    .filter(function (item) { return item !== ''; });
}

function extractDriveFileId(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const byPath = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath && byPath[1]) {
    return byPath[1];
  }

  const byQuery = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (byQuery && byQuery[1]) {
    return byQuery[1];
  }

  return '';
}

function deleteKamarPhotoService(input, user) {
  const idKamar = String(input.id_kamar || '').trim();
  const photoUrl = String(input.photo_url || '').trim();

  required(idKamar, 'id_kamar');
  required(photoUrl, 'photo_url');

  const kamarRows = getAllRecords(APP_CONFIG.SHEETS.KAMAR);
  const kamar = kamarRows.find(function (row) {
    return String(row.id_kamar || '').trim() === idKamar;
  });

  if (!kamar) {
    throw new Error('Data kamar tidak ditemukan: ' + idKamar);
  }

  const allPhotoUrls = splitSemicolonValues(kamar.foto_url || '');
  const targetIndex = allPhotoUrls.findIndex(function (url) {
    return String(url).trim() === photoUrl;
  });

  if (targetIndex < 0) {
    throw new Error('Link foto tidak ditemukan pada kamar ini.');
  }

  const fileId = extractDriveFileId(photoUrl);
  if (!fileId) {
    throw new Error('Gagal membaca ID file Drive dari link foto.');
  }

  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (err) {
    throw new Error('Gagal menghapus file foto di Drive. Pastikan akses Drive sudah diizinkan.');
  }

  allPhotoUrls.splice(targetIndex, 1);
  const updated = updateRecordById(APP_CONFIG.SHEETS.KAMAR, 'id_kamar', idKamar, {
    foto_url: allPhotoUrls.join('; '),
    updated_at: nowIso()
  });

  logAudit(user.email, 'delete_kamar_photo', 'kamar', idKamar, JSON.stringify({
    removed_photo_url: photoUrl,
    remaining_photo_count: allPhotoUrls.length
  }));

  return updated;
}

function updateKamarFasilitasService(input, user) {
  const idKamar = String(input.id_kamar || '').trim();
  const fasilitas = normalizeFasilitasCell(input.fasilitas || '');

  required(idKamar, 'id_kamar');

  const updated = updateRecordById(APP_CONFIG.SHEETS.KAMAR, 'id_kamar', idKamar, {
    fasilitas: fasilitas,
    updated_at: nowIso()
  });

  logAudit(user.email, 'update_kamar_fasilitas', 'kamar', idKamar, JSON.stringify({
    fasilitas: fasilitas
  }));

  return updated;
}

function getPenggunaHeaders() {
  return [
    'id_pengguna',
    'sumber_booking_id',
    'nama',
    'no_hp',
    'id_kamar',
    'ngekost_sampai',
    'bayar_bulan_ini',
    'status',
    'updated_at'
  ];
}

function getOrCreatePenggunaSheet() {
  const spreadsheet = getSpreadsheet();
  const sheetName = APP_CONFIG.SHEETS.PENGGUNA;
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const headers = getPenggunaHeaders();
  const isEmpty = sheet.getLastRow() === 0;
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0]
    .map(function (item) { return String(item || '').trim(); });
  const isHeaderMismatch = headers.some(function (header, index) {
    return existingHeaders[index] !== header;
  });

  if (isHeaderMismatch) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function getAllPenggunaRecords() {
  getOrCreatePenggunaSheet();
  return getAllRecords(APP_CONFIG.SHEETS.PENGGUNA);
}

function normalizeMonthValue(value) {
  if (value instanceof Date) {
    return String(value.getFullYear()) + '-' + String(value.getMonth() + 1).padStart(2, '0');
  }

  const text = String(value || '').trim();
  if (!text || text === '-') {
    return '-';
  }

  const directMatch = text.match(/^(\d{4})-(\d{2})$/);
  if (directMatch) {
    const year = parseInt(directMatch[1], 10);
    const month = parseInt(directMatch[2], 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error('Nilai bulan tidak valid.');
    }
    return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
  }

  const isoMonthMatch = text.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoMonthMatch) {
    const year = parseInt(isoMonthMatch[1], 10);
    const month = parseInt(isoMonthMatch[2], 10);
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      throw new Error('Nilai bulan tidak valid.');
    }
    return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
  }

  const parsedDate = new Date(text);
  if (!isNaN(parsedDate.getTime())) {
    return String(parsedDate.getFullYear()) + '-' + String(parsedDate.getMonth() + 1).padStart(2, '0');
  }

  throw new Error('Format bulan harus YYYY-MM.');
}

function getCurrentYearMonth() {
  const now = new Date();
  return String(now.getFullYear()) + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function addMonthToValue(monthValue, addCount) {
  const normalized = normalizeMonthValue(monthValue);
  if (normalized === '-') {
    throw new Error('Pengguna sudah selesai ngekost.');
  }

  const parts = normalized.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const date = new Date(year, month - 1, 1);
  date.setMonth(date.getMonth() + addCount);
  return String(date.getFullYear()) + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function normalizeYesNo(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'ya' || text === 'yes' || text === 'true' || text === '1') {
    return 'ya';
  }
  return 'tidak';
}

function generateNextPenggunaId() {
  const rows = getAllPenggunaRecords();
  let maxNumber = 0;

  rows.forEach(function (row) {
    const match = String(row.id_pengguna || '').trim().toUpperCase().match(/^PGN-(\d+)$/);
    if (!match) {
      return;
    }
    const number = parseInt(match[1], 10);
    if (!isNaN(number) && number > maxNumber) {
      maxNumber = number;
    }
  });

  return 'PGN-' + String(maxNumber + 1).padStart(3, '0');
}

function listPenggunaService() {
  const rows = getAllPenggunaRecords();
  const currentMonth = getCurrentYearMonth();
  const kamarRows = getAllRecords(APP_CONFIG.SHEETS.KAMAR);
  const hargaByKamar = {};
  kamarRows.forEach(function (row) {
    const idKamar = String(row.id_kamar || '').trim();
    if (!idKamar) {
      return;
    }
    hargaByKamar[idKamar] = row.harga_bulanan;
  });

  rows.forEach(function (row) {
    const idPengguna = String(row.id_pengguna || '').trim();
    const status = String(row.status || '').trim().toLowerCase();
    const isPaid = normalizeYesNo(row.bayar_bulan_ini || 'tidak') === 'ya';
    if (!idPengguna || status !== 'aktif' || !isPaid) {
      return;
    }

    let paidMonth = '';
    try {
      paidMonth = normalizeMonthValue(row.updated_at || '');
    } catch (err) {
      paidMonth = '';
    }

    if (!paidMonth || paidMonth === '-' || paidMonth === currentMonth) {
      return;
    }

    const updated = updateRecordById(APP_CONFIG.SHEETS.PENGGUNA, 'id_pengguna', idPengguna, {
      bayar_bulan_ini: 'tidak',
      updated_at: nowIso()
    });

    row.bayar_bulan_ini = updated.bayar_bulan_ini;
    row.updated_at = updated.updated_at;
  });

  rows.sort(function (a, b) {
    return String(a.id_pengguna || '').localeCompare(String(b.id_pengguna || ''));
  });

  rows.forEach(function (row) {
    const idKamar = String(row.id_kamar || '').trim();
    row.tagihan = hargaByKamar.hasOwnProperty(idKamar) ? hargaByKamar[idKamar] : '';
  });

  return rows;
}

function updatePenggunaEndMonthService(input, user) {
  const idPengguna = String(input.id_pengguna || '').trim();
  const targetMonth = normalizeMonthValue(input.ngekost_sampai || '');

  required(idPengguna, 'id_pengguna');
  if (targetMonth === '-') {
    throw new Error('Bulan ngekost sampai wajib diisi.');
  }

  const updated = updateRecordById(APP_CONFIG.SHEETS.PENGGUNA, 'id_pengguna', idPengguna, {
    ngekost_sampai: targetMonth,
    status: 'aktif',
    updated_at: nowIso()
  });

  syncSingleKamarStatus(String(updated.id_kamar || '').trim(), user, 'update_pengguna_end_month');
  logAudit(user.email, 'update_pengguna_end_month', 'pengguna', idPengguna, JSON.stringify({
    ngekost_sampai: targetMonth
  }));

  return updated;
}

function createPenggunaService(input, user) {
  getOrCreatePenggunaSheet();

  const nama = String(input.nama || '').trim();
  const noHp = String(input.no_hp || '').trim();
  const idKamar = String(input.id_kamar || '').trim();
  const ngekostSampai = normalizeMonthValue(input.ngekost_sampai || '');
  const bayarBulanIni = normalizeYesNo(input.bayar_bulan_ini || 'tidak');

  required(nama, 'nama');
  required(idKamar, 'id_kamar');
  if (ngekostSampai === '-') {
    throw new Error('Bulan sampai wajib diisi saat tambah pengguna.');
  }

  const kamarExists = getAllRecords(APP_CONFIG.SHEETS.KAMAR).some(function (row) {
    return String(row.id_kamar || '').trim() === idKamar;
  });
  if (!kamarExists) {
    throw new Error('ID kamar tidak ditemukan: ' + idKamar);
  }

  const newId = generateNextPenggunaId();
  const newRecord = {
    id_pengguna: newId,
    sumber_booking_id: String(input.sumber_booking_id || '').trim(),
    nama: nama,
    no_hp: noHp,
    id_kamar: idKamar,
    ngekost_sampai: ngekostSampai,
    bayar_bulan_ini: bayarBulanIni,
    status: 'aktif',
    updated_at: nowIso()
  };

  appendRecord(APP_CONFIG.SHEETS.PENGGUNA, newRecord);
  syncSingleKamarStatus(idKamar, user, 'create_pengguna');
  logAudit(user.email, 'create_pengguna', 'pengguna', newId, JSON.stringify({ nama: nama, id_kamar: idKamar }));
  return newRecord;
}

function toYearMonthFromDate(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return year + '-' + month;
}

function createPenggunaFromApprovedBooking(bookingRecord, user, acceptedOptions) {
  const bookingId = String(bookingRecord.id_booking || '').trim();
  const idKamar = String(bookingRecord.id_kamar || '').trim();

  required(bookingId, 'id_booking');
  required(idKamar, 'id_kamar');

  const existing = getAllPenggunaRecords().find(function (row) {
    return String(row.sumber_booking_id || '').trim() === bookingId;
  });
  if (existing) {
    return existing;
  }

  const kamarExists = getAllRecords(APP_CONFIG.SHEETS.KAMAR).some(function (row) {
    return String(row.id_kamar || '').trim() === idKamar;
  });
  if (!kamarExists) {
    throw new Error('ID kamar pada booking tidak ditemukan: ' + idKamar);
  }

  const startedAtRaw = String(bookingRecord.created_at || '').trim();
  const startedAt = startedAtRaw ? new Date(startedAtRaw) : new Date();
  const safeDate = isNaN(startedAt.getTime()) ? new Date() : startedAt;
  const defaultStartMonth = toYearMonthFromDate(safeDate);
  const ngekostDari = acceptedOptions && acceptedOptions.ngekost_dari
    ? normalizeMonthValue(acceptedOptions.ngekost_dari)
    : defaultStartMonth;
  const ngekostSampai = acceptedOptions && acceptedOptions.ngekost_sampai
    ? normalizeMonthValue(acceptedOptions.ngekost_sampai)
    : ngekostDari;

  if (ngekostDari === '-' || ngekostSampai === '-') {
    throw new Error('Periode ngekost pengguna tidak valid.');
  }
  if (ngekostSampai < ngekostDari) {
    throw new Error('Periode ngekost tidak valid: bulan sampai lebih kecil dari bulan dari.');
  }

  const newId = generateNextPenggunaId();
  const newRecord = {
    id_pengguna: newId,
    sumber_booking_id: bookingId,
    nama: String(bookingRecord.nama || '').trim() || 'Tanpa Nama',
    no_hp: String(bookingRecord.no_hp || '').trim(),
    id_kamar: idKamar,
    ngekost_sampai: ngekostSampai,
    bayar_bulan_ini: 'tidak',
    status: 'aktif',
    updated_at: nowIso()
  };

  appendRecord(APP_CONFIG.SHEETS.PENGGUNA, newRecord);
  syncSingleKamarStatus(idKamar, user, 'auto_create_pengguna_from_booking');
  logAudit(user.email, 'auto_create_pengguna_from_booking', 'pengguna', newId, JSON.stringify({
    sumber_booking_id: bookingId,
    id_kamar: idKamar,
    ngekost_dari: ngekostDari,
    ngekost_sampai: ngekostSampai
  }));

  return newRecord;
}

function addPenggunaMonthService(input, user) {
  const idPengguna = String(input.id_pengguna || '').trim();
  const monthCount = Math.max(1, parseInt(input.month_count || '1', 10) || 1);

  required(idPengguna, 'id_pengguna');
  const rows = getAllPenggunaRecords();
  const found = rows.find(function (row) {
    return String(row.id_pengguna || '') === idPengguna;
  });

  if (!found) {
    throw new Error('Data pengguna tidak ditemukan.');
  }

  const currentMonth = normalizeMonthValue(found.ngekost_sampai || '-');
  const nextMonth = addMonthToValue(currentMonth, monthCount);
  const updated = updateRecordById(APP_CONFIG.SHEETS.PENGGUNA, 'id_pengguna', idPengguna, {
    ngekost_sampai: nextMonth,
    status: 'aktif',
    updated_at: nowIso()
  });

  logAudit(user.email, 'add_pengguna_month', 'pengguna', idPengguna, JSON.stringify({ from: currentMonth, to: nextMonth, month_count: monthCount }));
  return updated;
}

function setPenggunaPaidThisMonthService(input, user) {
  const idPengguna = String(input.id_pengguna || '').trim();
  const paid = normalizeYesNo(input.bayar_bulan_ini || 'tidak');
  required(idPengguna, 'id_pengguna');

  const updated = updateRecordById(APP_CONFIG.SHEETS.PENGGUNA, 'id_pengguna', idPengguna, {
    bayar_bulan_ini: paid,
    updated_at: nowIso()
  });

  logAudit(user.email, 'set_pengguna_paid', 'pengguna', idPengguna, JSON.stringify({ bayar_bulan_ini: paid }));
  return updated;
}

function markRelatedBookingAsFinished(penggunaRecord, user) {
  const sumberBookingId = String((penggunaRecord && penggunaRecord.sumber_booking_id) || '').trim();
  const idKamar = String((penggunaRecord && penggunaRecord.id_kamar) || '').trim();
  const activeBookingStatuses = ['baru', 'diproses', 'diterima', 'check-in'];

  const bookings = getAllRecords(APP_CONFIG.SHEETS.BOOKING);
  const targetBookingIds = [];

  if (sumberBookingId) {
    targetBookingIds.push(sumberBookingId);
  }

  if (idKamar) {
    bookings.forEach(function (row) {
      const rowId = String(row.id_booking || '').trim();
      const rowRoomId = String(row.id_kamar || '').trim();
      const rowStatus = String(row.status || '').trim().toLowerCase();
      if (!rowId) {
        return;
      }
      if (rowRoomId !== idKamar) {
        return;
      }
      if (activeBookingStatuses.indexOf(rowStatus) === -1) {
        return;
      }
      if (targetBookingIds.indexOf(rowId) === -1) {
        targetBookingIds.push(rowId);
      }
    });
  }

  const updatedBookings = [];
  targetBookingIds.forEach(function (bookingId) {
    const source = bookings.find(function (row) {
      return String(row.id_booking || '').trim() === bookingId;
    });
    const currentStatus = String((source && source.status) || '').trim().toLowerCase();
    if (!source || currentStatus === 'selesai') {
      return;
    }

    const updatedBooking = updateRecordById(APP_CONFIG.SHEETS.BOOKING, 'id_booking', bookingId, {
      status: 'selesai',
      updated_at: nowIso()
    });
    updatedBookings.push(updatedBooking);

    if (user && user.email) {
      logAudit(user.email, 'sync_booking_finished_from_pengguna', 'booking', bookingId, JSON.stringify({
        from_status: currentStatus,
        to_status: 'selesai',
        id_pengguna: String(penggunaRecord.id_pengguna || '').trim()
      }));
    }
  });

  return updatedBookings;
}

function finishPenggunaService(input, user) {
  const idPengguna = String(input.id_pengguna || '').trim();
  required(idPengguna, 'id_pengguna');

  const updated = updateRecordById(APP_CONFIG.SHEETS.PENGGUNA, 'id_pengguna', idPengguna, {
    ngekost_sampai: '-',
    bayar_bulan_ini: 'tidak',
    status: 'selesai',
    updated_at: nowIso()
  });

  markRelatedBookingAsFinished(updated, user);
  syncSingleKamarStatus(String(updated.id_kamar || '').trim(), user, 'finish_pengguna');

  logAudit(user.email, 'finish_pengguna', 'pengguna', idPengguna, '{}');
  return updated;
}
