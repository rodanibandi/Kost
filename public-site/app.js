(function () {
  const config = window.PUBLIC_CONFIG || {};

  const state = {
    kost: [],
    kamar: []
  };

  const elements = {
    kostList: document.getElementById('kost-list'),
    roomSelect: document.getElementById('booking-room'),
    bookingForm: document.getElementById('booking-form'),
    bookingMessage: document.getElementById('booking-message'),
    submitButton: document.getElementById('submit-booking'),
    refreshButton: document.getElementById('refresh-data'),
    currentYear: document.getElementById('current-year')
  };

  function normalizeStatus(value) {
    return String(value || '').trim().toLowerCase();
  }

  function asCurrency(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return String(value || '-');
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(number);
  }

  function getFullUrl(path) {
    const base = String(config.apiBaseUrl || '').trim().replace(/\/$/, '');
    const endpoint = String(path || '').trim();
    if (!base) return '';
    return `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Gagal mengambil data (${response.status})`);
    }

    return response.json();
  }

  function mapApiListingResponse(raw) {
    if (!raw) return { kost: [], kamar: [] };

    if (Array.isArray(raw.kost) || Array.isArray(raw.kamar)) {
      return {
        kost: Array.isArray(raw.kost) ? raw.kost : [],
        kamar: Array.isArray(raw.kamar) ? raw.kamar : []
      };
    }

    if (raw.success && raw.data) {
      return {
        kost: Array.isArray(raw.data.kost) ? raw.data.kost : [],
        kamar: Array.isArray(raw.data.kamar) ? raw.data.kamar : []
      };
    }

    return { kost: [], kamar: [] };
  }

  async function loadListings() {
    const listUrl = getFullUrl(config.listEndpointPath || '');

    if (listUrl) {
      const apiData = await fetchJson(listUrl);
      return mapApiListingResponse(apiData);
    }

    const fallback = String(config.fallbackDataPath || '').trim();
    if (!fallback) {
      return { kost: [], kamar: [] };
    }

    return fetchJson(fallback);
  }

  function getPublicKostRows(rows) {
    return rows.filter(function (row) {
      const status = normalizeStatus(row.status_publish);
      return status === 'publish' || status === 'published' || status === 'true' || status === '1';
    });
  }

  function getAvailableRooms(rows) {
    return rows.filter(function (row) {
      return normalizeStatus(row.status_ketersediaan) === 'tersedia';
    });
  }

  function buildKostCard(kost, kamarRows) {
    const card = document.createElement('article');
    card.className = 'card';

    const title = document.createElement('h3');
    title.textContent = kost.nama || kost.id_kost || '-';

    const address = document.createElement('p');
    address.className = 'muted';
    address.textContent = kost.alamat || '-';

    const facility = document.createElement('p');
    facility.textContent = `Fasilitas umum: ${kost.fasilitas_umum || '-'}`;

    const contact = document.createElement('p');
    contact.textContent = `Kontak: ${kost.kontak || '-'}`;

    const roomList = document.createElement('ul');
    if (!kamarRows.length) {
      const li = document.createElement('li');
      li.textContent = 'Belum ada kamar publish';
      roomList.appendChild(li);
    } else {
      kamarRows.forEach(function (room) {
        const li = document.createElement('li');
        li.textContent = `${room.nama_kamar || room.id_kamar} • ${asCurrency(room.harga_bulanan)} • ${room.ukuran || '-'} • ${room.status_ketersediaan || '-'}`;
        roomList.appendChild(li);
      });
    }

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = `${kamarRows.length} kamar`;

    card.appendChild(title);
    card.appendChild(address);
    card.appendChild(facility);
    card.appendChild(contact);
    card.appendChild(roomList);
    card.appendChild(badge);

    return card;
  }

  function renderKostCards() {
    elements.kostList.innerHTML = '';

    const publishedKost = getPublicKostRows(state.kost);
    if (!publishedKost.length) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Belum ada data kost yang dipublish.';
      elements.kostList.appendChild(empty);
      return;
    }

    publishedKost.forEach(function (kost) {
      const kamarRows = state.kamar.filter(function (room) {
        return String(room.id_kost || '').trim() === String(kost.id_kost || '').trim();
      });
      elements.kostList.appendChild(buildKostCard(kost, kamarRows));
    });
  }

  function renderRoomOptions() {
    const availableRooms = getAvailableRooms(state.kamar);
    elements.roomSelect.innerHTML = '<option value="">Pilih kamar tersedia</option>';

    availableRooms.forEach(function (room) {
      const option = document.createElement('option');
      option.value = room.id_kamar;
      option.textContent = `${room.nama_kamar || room.id_kamar} (${asCurrency(room.harga_bulanan)})`;
      elements.roomSelect.appendChild(option);
    });
  }

  function setMessage(text, type) {
    elements.bookingMessage.textContent = text || '';
    elements.bookingMessage.classList.remove('success', 'error');
    if (type) elements.bookingMessage.classList.add(type);
  }

  function readBookingFormPayload() {
    const formData = new FormData(elements.bookingForm);
    return {
      nama: String(formData.get('nama') || '').trim(),
      no_hp: String(formData.get('no_hp') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      id_kamar: String(formData.get('id_kamar') || '').trim(),
      tgl_masuk: String(formData.get('tgl_masuk') || '').trim(),
      durasi_bulan: String(formData.get('durasi_bulan') || '').trim(),
      catatan: String(formData.get('catatan') || '').trim(),
      sumber: 'website-publik'
    };
  }

  function validateBookingPayload(payload) {
    if (!payload.nama || !payload.no_hp || !payload.email || !payload.id_kamar || !payload.tgl_masuk || !payload.durasi_bulan) {
      throw new Error('Semua field wajib harus diisi.');
    }

    if (!payload.email.includes('@')) {
      throw new Error('Format email tidak valid.');
    }

    const duration = Number(payload.durasi_bulan);
    if (!Number.isInteger(duration) || duration <= 0) {
      throw new Error('Durasi bulan harus angka lebih dari 0.');
    }
  }

  async function submitBooking(payload) {
    const bookingUrl = getFullUrl(config.bookingEndpointPath || '');
    if (!bookingUrl) {
      await new Promise(function (resolve) { setTimeout(resolve, 300); });
      return {
        success: true,
        data: {
          message: 'Mode demo: endpoint booking belum diatur. Data belum dikirim ke server.'
        }
      };
    }

    const response = await fetch(bookingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error((data && data.error && data.error.message) || 'Gagal mengirim booking.');
    }

    return data;
  }

  async function handleBookingSubmit(event) {
    event.preventDefault();

    try {
      const payload = readBookingFormPayload();
      validateBookingPayload(payload);

      elements.submitButton.disabled = true;
      setMessage('Mengirim booking...', '');

      const result = await submitBooking(payload);
      const message = (result && result.data && result.data.message)
        ? result.data.message
        : 'Booking berhasil dikirim. Tim kami akan menghubungi Anda.';

      setMessage(message, 'success');
      elements.bookingForm.reset();
    } catch (error) {
      setMessage(error.message || 'Terjadi kesalahan saat mengirim booking.', 'error');
    } finally {
      elements.submitButton.disabled = false;
    }
  }

  async function refreshData() {
    try {
      elements.refreshButton.disabled = true;
      setMessage('', '');

      const listings = await loadListings();
      state.kost = Array.isArray(listings.kost) ? listings.kost : [];
      state.kamar = Array.isArray(listings.kamar) ? listings.kamar : [];

      renderKostCards();
      renderRoomOptions();
    } catch (error) {
      state.kost = [];
      state.kamar = [];
      renderKostCards();
      renderRoomOptions();
      setMessage(error.message || 'Gagal memuat data.', 'error');
    } finally {
      elements.refreshButton.disabled = false;
    }
  }

  function bindEvents() {
    elements.bookingForm.addEventListener('submit', handleBookingSubmit);
    elements.refreshButton.addEventListener('click', refreshData);
  }

  function init() {
    elements.currentYear.textContent = new Date().getFullYear();
    bindEvents();
    refreshData();
  }

  init();
})();
