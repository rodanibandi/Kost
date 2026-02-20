function nowIso() {
  return new Date().toISOString();
}

function ok(data) {
  return {
    success: true,
    data: data || null,
    error: null
  };
}

function fail(message, details) {
  return {
    success: false,
    data: null,
    error: {
      message: message,
      details: details || null
    }
  };
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText || '{}');
  } catch (err) {
    return {};
  }
}

function required(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new Error('Field wajib: ' + fieldName);
  }
}

function assertInEnum(value, allowedValues, fieldName) {
  if (allowedValues.indexOf(value) === -1) {
    throw new Error('Nilai tidak valid untuk ' + fieldName + ': ' + value);
  }
}
