function getSpreadsheet() {
  const configId = String(APP_CONFIG.SPREADSHEET_ID || '').trim();
  const propertyKey = String(APP_CONFIG.SPREADSHEET_ID_PROPERTY_KEY || 'SPREADSHEET_ID').trim();
  const scriptPropId = String(PropertiesService.getScriptProperties().getProperty(propertyKey) || '').trim();

  if (configId) {
    return SpreadsheetApp.openById(configId);
  }

  if (scriptPropId) {
    return SpreadsheetApp.openById(scriptPropId);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (activeSpreadsheet) {
    return activeSpreadsheet;
  }

  throw new Error('Spreadsheet ID belum diset. Isi APP_CONFIG.SPREADSHEET_ID atau Script Property SPREADSHEET_ID.');
}

function getSheetByName(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet tidak ditemukan: ' + sheetName);
  }
  return sheet;
}

function normalizeCellValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return value;
}

function getAllRecords(sheetName) {
  const sheet = getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0].map(function (h) { return String(h).trim(); });
  return data.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (header, index) {
      obj[header] = normalizeCellValue(row[index]);
    });
    return obj;
  });
}

function appendRecord(sheetName, record) {
  const sheet = getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const row = headers.map(function (header) {
    return record.hasOwnProperty(header) ? record[header] : '';
  });

  sheet.appendRow(row);
}

function updateRecordById(sheetName, idField, idValue, patch) {
  const sheet = getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('Data kosong di sheet: ' + sheetName);
  }

  if (!idValue) {
    throw new Error('ID wajib diisi untuk proses update.');
  }

  if (!patch || Object.keys(patch).length === 0) {
    throw new Error('Patch update tidak boleh kosong.');
  }

  const headers = values[0].map(function (h) { return String(h).trim(); });
  const idColIndex = headers.indexOf(idField);
  if (idColIndex < 0) {
    throw new Error('Kolom ID tidak ditemukan: ' + idField);
  }

  const patchKeys = Object.keys(patch);
  patchKeys.forEach(function (key) {
    if (headers.indexOf(key) === -1) {
      throw new Error('Kolom patch tidak ditemukan: ' + key);
    }
  });

  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idColIndex]) === String(idValue)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex < 0) {
    throw new Error('Data tidak ditemukan untuk ' + idField + ': ' + idValue);
  }

  let updatedFields = 0;
  headers.forEach(function (header, headerIndex) {
    if (patch.hasOwnProperty(header)) {
      sheet.getRange(rowIndex, headerIndex + 1).setValue(patch[header]);
      updatedFields += 1;
    }
  });

  if (updatedFields === 0) {
    throw new Error('Tidak ada field yang diupdate.');
  }

  const updatedRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const updatedRecord = {};
  headers.forEach(function (header, index) {
    updatedRecord[header] = updatedRow[index];
  });

  return updatedRecord;
}

function deleteRecordById(sheetName, idField, idValue) {
  const sheet = getSheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    throw new Error('Data kosong di sheet: ' + sheetName);
  }

  const headers = values[0].map(function (h) { return String(h).trim(); });
  const idColIndex = headers.indexOf(idField);
  if (idColIndex < 0) {
    throw new Error('Kolom ID tidak ditemukan: ' + idField);
  }

  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idColIndex]) === String(idValue)) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex < 0) {
    throw new Error('Data tidak ditemukan untuk ' + idField + ': ' + idValue);
  }

  const deletedRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  sheet.deleteRow(rowIndex);

  const deletedRecord = {};
  headers.forEach(function (header, index) {
    deletedRecord[header] = normalizeCellValue(deletedRow[index]);
  });

  return deletedRecord;
}
