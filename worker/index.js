export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders(origin, env) });
    }

    if (url.pathname === '/public/listings' && request.method === 'GET') {
      return withCors(await handlePublicListings(env), origin, env);
    }

    if (url.pathname === '/public/bookings' && request.method === 'POST') {
      return withCors(await handlePublicBookings(request, env), origin, env);
    }

    return withCors(json({ success: false, error: { message: 'Route tidak ditemukan' } }, 404), origin, env);
  }
};

function normalizeOriginList(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildCorsHeaders(origin, env) {
  const allowList = normalizeOriginList(env);
  const isAllowed = allowList.includes(origin);
  const allowOrigin = isAllowed ? origin : (allowList[0] || '*');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function withCors(response, origin, env) {
  const headers = new Headers(response.headers);
  const cors = buildCorsHeaders(origin, env);
  Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    headers
  });
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function sanitizeText(value) {
  return String(value || '').trim();
}

async function callAppsScript(action, payload, env) {
  const endpoint = sanitizeText(env.APPS_SCRIPT_URL);
  if (!endpoint) {
    throw new Error('APPS_SCRIPT_URL belum diisi di environment variable Worker.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action, payload })
  });

  if (!response.ok) {
    throw new Error(`Apps Script error (${response.status}).`);
  }

  const data = await response.json().catch(() => null);
  if (!data || data.success !== true) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : 'Apps Script mengembalikan error.';
    throw new Error(message);
  }

  return data.data;
}

async function handlePublicListings(env) {
  try {
    const data = await callAppsScript('publicListings', {}, env);
    return json({ success: true, data }, 200);
  } catch (error) {
    return json({
      success: false,
      error: { message: error.message || 'Gagal memuat listing.' }
    }, 500);
  }
}

function validateBookingInput(input) {
  const payload = {
    nama: sanitizeText(input.nama),
    no_hp: sanitizeText(input.no_hp),
    email: sanitizeText(input.email),
    id_kamar: sanitizeText(input.id_kamar),
    tgl_masuk: sanitizeText(input.tgl_masuk),
    durasi_bulan: sanitizeText(input.durasi_bulan),
    catatan: sanitizeText(input.catatan),
    sumber: sanitizeText(input.sumber) || 'website-publik'
  };

  if (!payload.nama || !payload.no_hp || !payload.email || !payload.id_kamar || !payload.tgl_masuk || !payload.durasi_bulan) {
    throw new Error('Field booking wajib belum lengkap.');
  }

  if (!payload.email.includes('@')) {
    throw new Error('Format email tidak valid.');
  }

  const durasi = Number(payload.durasi_bulan);
  if (!Number.isInteger(durasi) || durasi < 1) {
    throw new Error('Durasi bulan tidak valid.');
  }

  return payload;
}

async function handlePublicBookings(request, env) {
  try {
    const incoming = await request.json().catch(() => ({}));
    const booking = validateBookingInput(incoming || {});
    const apiToken = sanitizeText(env.APPS_SCRIPT_API_TOKEN);

    if (!apiToken) {
      throw new Error('APPS_SCRIPT_API_TOKEN belum diisi di Worker secret.');
    }

    const result = await callAppsScript('publicCreateBooking', {
      ...booking,
      api_token: apiToken
    }, env);

    return json({
      success: true,
      data: {
        id_booking: result.id_booking || '',
        message: 'Booking diterima. Tim kami akan menghubungi Anda.'
      }
    }, 200);
  } catch (error) {
    return json({
      success: false,
      error: { message: error.message || 'Gagal membuat booking.' }
    }, 400);
  }
}
