function isActiveUserFlag(value) {
  const normalized = String(value === true ? 'true' : value || '').toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password) {
  const text = String(password || '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getUsersSheet() {
  const spreadsheet = getSpreadsheet();
  const sheetName = APP_CONFIG.SHEETS.USERS;
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function ensureUsersAuthHeaders() {
  const sheet = getUsersSheet();
  const requiredHeaders = ['username', 'password_hash', 'email', 'nama', 'role', 'is_active', 'updated_at'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return;
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) {
    return String(h || '').trim();
  });
  const aliasMap = {
    password_: 'password_hash',
    password: 'password_hash',
    user_name: 'username',
    nama_lengkap: 'nama'
  };

  const normalizedHeaders = headers.map(function (header) {
    const key = String(header || '').trim().toLowerCase();
    return aliasMap[key] || key;
  });
  const isCompatible = requiredHeaders.every(function (header) {
    return normalizedHeaders.indexOf(header) >= 0;
  });

  if (isCompatible) {
    if (headers.join('|') !== requiredHeaders.join('|')) {
      sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    }
    return;
  }

  const records = values.slice(1).map(function (row) {
    const item = {};
    normalizedHeaders.forEach(function (header, idx) {
      item[header] = row[idx];
    });
    return item;
  });

  sheet.clearContents();
  if (sheet.getLastColumn() < requiredHeaders.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), requiredHeaders.length - sheet.getLastColumn());
  }

  sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
  if (!records.length) {
    return;
  }

  const migratedRows = records.map(function (record) {
    return requiredHeaders.map(function (header) {
      return record.hasOwnProperty(header) ? record[header] : '';
    });
  });

  sheet.getRange(2, 1, migratedRows.length, requiredHeaders.length).setValues(migratedRows);
}

function seedUsersCompleteData() {
  const sheet = getUsersSheet();
  const headers = ['username', 'password_hash', 'email', 'nama', 'role', 'is_active', 'updated_at'];
  const now = nowIso();

  const rows = [
    ['owner', hashPassword('owner123'), 'owner@example.com', 'Owner Utama', APP_CONFIG.ROLES.OWNER, 'true', now],
    ['manager1', hashPassword('manager123'), 'manager1@example.com', 'Manager Satu', APP_CONFIG.ROLES.MANAGER, 'true', now]
  ];

  sheet.clearContents();
  if (sheet.getLastColumn() < headers.length) {
    sheet.insertColumnsAfter(sheet.getLastColumn(), headers.length - sheet.getLastColumn());
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  return {
    seeded: true,
    count: rows.length,
    sample_login: [
      { username: 'owner', password: 'owner123' },
      { username: 'manager1', password: 'manager123' }
    ]
  };
}

function getDetectedEmailSafe() {
  try {
    return normalizeEmail(Session.getActiveUser().getEmail() || '');
  } catch (err) {
    return '';
  }
}

function getAllUsersAuthRecords() {
  ensureUsersAuthHeaders();
  return getAllRecords(APP_CONFIG.SHEETS.USERS);
}

function hasCredential(user) {
  return !!String(user && user.username || '').trim() && !!String(user && user.password_hash || '').trim();
}

function findActiveUserByEmail(users, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  return users.find(function (user) {
    return normalizeEmail(user.email) === normalized && isActiveUserFlag(user.is_active);
  }) || null;
}

function findUserByUsername(users, username) {
  const normalized = normalizeUsername(username);
  return users.find(function (user) {
    return normalizeUsername(user.username) === normalized;
  }) || null;
}

function sanitizeSessionUser(userRecord) {
  return {
    username: normalizeUsername(userRecord.username || ''),
    email: String(userRecord.email || '').trim(),
    name: String(userRecord.nama || '').trim() || normalizeUsername(userRecord.username || ''),
    role: String(userRecord.role || APP_CONFIG.ROLES.MANAGER).trim()
  };
}

function bootstrapDefaultOwnerIfNeeded() {
  const users = getAllUsersAuthRecords();
  const activeCredentialUsers = users.filter(function (item) {
    return isActiveUserFlag(item.is_active) && hasCredential(item);
  });

  if (activeCredentialUsers.length > 0) {
    return;
  }
}

function createSessionToken() {
  return Utilities.getUuid() + '-' + new Date().getTime();
}

function putUserSession(token, user) {
  const ttlSeconds = 12 * 60 * 60;
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(user), ttlSeconds);
}

function removeUserSession(token) {
  CacheService.getScriptCache().remove('session:' + token);
}

function getUserFromSessionToken(token) {
  const raw = CacheService.getScriptCache().get('session:' + token);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function loginWithUsernamePassword(input) {
  bootstrapDefaultOwnerIfNeeded();

  const username = normalizeUsername(input.username || '');
  const password = String(input.password || '');
  required(username, 'username');
  required(password, 'password');

  const users = getAllUsersAuthRecords();
  const user = users.find(function (item) {
    return normalizeUsername(item.username) === username && isActiveUserFlag(item.is_active) && hasCredential(item);
  });

  if (!user) {
    throw new Error('Username atau password salah.');
  }

  const incomingHash = hashPassword(password);
  const savedHash = String(user.password_hash || '').trim();
  if (!savedHash || savedHash !== incomingHash) {
    throw new Error('Username atau password salah.');
  }

  const sessionUser = sanitizeSessionUser(user);

  const token = createSessionToken();
  putUserSession(token, sessionUser);

  return {
    session_token: token,
    user: sessionUser
  };
}

function buildAuthBootstrapResponse(sessionUser) {
  const users = getAllUsersAuthRecords();
  const detectedEmail = getDetectedEmailSafe();
  const emailUser = findActiveUserByEmail(users, detectedEmail);
  const hasAnyCredentialUser = users.some(function (user) {
    return isActiveUserFlag(user.is_active) && hasCredential(user);
  });

  let needsSetup = false;
  if (emailUser && !hasCredential(emailUser)) {
    needsSetup = true;
  } else if (!hasAnyCredentialUser && !!detectedEmail) {
    needsSetup = true;
  }

  return {
    authenticated: !!sessionUser,
    user: sessionUser || null,
    detected_email: detectedEmail,
    needs_setup: needsSetup,
    setup_name: String((emailUser && emailUser.nama) || detectedEmail || '').trim()
  };
}

function authBootstrap(payload) {
  const token = String((payload && payload.__session_token) || '').trim();
  const sessionUser = token ? getUserFromSessionToken(token) : null;
  return buildAuthBootstrapResponse(sessionUser);
}

function setupCredentialsFromDetectedEmail(input) {
  const users = getAllUsersAuthRecords();
  const detectedEmail = getDetectedEmailSafe();
  if (!detectedEmail) {
    throw new Error('Email aktif tidak terdeteksi. Pastikan akses akun Google aktif.');
  }

  const username = normalizeUsername(input.username || '');
  const password = String(input.password || '');
  const displayName = String(input.nama || '').trim() || detectedEmail;
  required(username, 'username');
  required(password, 'password');

  if (password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  const existedByUsername = findUserByUsername(users, username);
  const existingByEmail = findActiveUserByEmail(users, detectedEmail);

  if (existedByUsername && normalizeEmail(existedByUsername.email) !== detectedEmail) {
    throw new Error('Username sudah digunakan user lain.');
  }

  const hasOwnerCredential = users.some(function (user) {
    return isActiveUserFlag(user.is_active)
      && hasCredential(user)
      && String(user.role || '').trim() === APP_CONFIG.ROLES.OWNER;
  });

  if (existingByEmail) {
    updateRecordById(APP_CONFIG.SHEETS.USERS, 'email', detectedEmail, {
      username: username,
      password_hash: hashPassword(password),
      nama: displayName,
      is_active: true,
      updated_at: nowIso()
    });
  } else {
    appendRecord(APP_CONFIG.SHEETS.USERS, {
      username: username,
      password_hash: hashPassword(password),
      email: detectedEmail,
      nama: displayName,
      role: hasOwnerCredential ? APP_CONFIG.ROLES.MANAGER : APP_CONFIG.ROLES.OWNER,
      is_active: true,
      updated_at: nowIso()
    });
  }

  return loginWithUsernamePassword({ username: username, password: password });
}

function listUsersService() {
  const users = getAllUsersAuthRecords();
  users.sort(function (a, b) {
    return normalizeUsername(a.username).localeCompare(normalizeUsername(b.username));
  });

  return users.map(function (user) {
    return {
      username: normalizeUsername(user.username),
      email: String(user.email || '').trim(),
      nama: String(user.nama || '').trim(),
      role: String(user.role || APP_CONFIG.ROLES.MANAGER).trim(),
      is_active: isActiveUserFlag(user.is_active) ? 'true' : 'false',
      updated_at: String(user.updated_at || '').trim()
    };
  });
}

function createUserService(input, actor) {
  const users = getAllUsersAuthRecords();
  const username = normalizeUsername(input.username || '');
  const password = String(input.password || '');
  const nama = String(input.nama || '').trim() || username;
  const email = normalizeEmail(input.email || '');
  const role = String(input.role || APP_CONFIG.ROLES.MANAGER).trim();

  required(username, 'username');
  required(password, 'password');
  assertInEnum(role, [APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], 'role');

  if (password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  if (findUserByUsername(users, username)) {
    throw new Error('Username sudah digunakan.');
  }

  if (email && findActiveUserByEmail(users, email)) {
    throw new Error('Email sudah terdaftar.');
  }

  appendRecord(APP_CONFIG.SHEETS.USERS, {
    username: username,
    password_hash: hashPassword(password),
    email: email,
    nama: nama,
    role: role,
    is_active: true,
    updated_at: nowIso()
  });

  logAudit(actor.email || actor.username || '-', 'create_user', 'users', username, JSON.stringify({
    role: role,
    email: email
  }));

  return {
    username: username,
    nama: nama,
    email: email,
    role: role,
    is_active: 'true'
  };
}

function changeUserPasswordService(input, actor) {
  const username = normalizeUsername(input.username || '');
  const password = String(input.password || '');
  required(username, 'username');
  required(password, 'password');

  if (password.length < 6) {
    throw new Error('Password minimal 6 karakter.');
  }

  const users = getAllUsersAuthRecords();
  const target = findUserByUsername(users, username);
  if (!target) {
    throw new Error('User tidak ditemukan: ' + username);
  }

  updateRecordById(APP_CONFIG.SHEETS.USERS, 'username', username, {
    password_hash: hashPassword(password),
    updated_at: nowIso()
  });

  logAudit(actor.email || actor.username || '-', 'change_user_password', 'users', username, '{}');
  return { username: username, changed: true };
}

function getCurrentUserFromSessionPayload(payload) {
  const token = String((payload && payload.__session_token) || '').trim();
  required(token, 'session_token');

  const user = getUserFromSessionToken(token);
  if (!user) {
    throw new Error('Sesi login tidak valid atau sudah berakhir. Silakan login ulang.');
  }

  return {
    username: String(user.username || '').trim(),
    email: String(user.email || '').trim(),
    name: String(user.name || '').trim(),
    role: String(user.role || APP_CONFIG.ROLES.MANAGER).trim()
  };
}

function logoutSession(payload) {
  const token = String((payload && payload.__session_token) || '').trim();
  if (token) {
    removeUserSession(token);
  }
  return { logged_out: true };
}

function requireRole(allowedRoles, user) {
  if (allowedRoles.indexOf(user.role) === -1) {
    throw new Error('Akses ditolak: role tidak diizinkan.');
  }
}
