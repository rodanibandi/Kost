const APP_CONFIG = {
  SPREADSHEET_ID: '',
  SPREADSHEET_ID_PROPERTY_KEY: 'SPREADSHEET_ID',
  PUBLIC_API_TOKEN_PROPERTY_KEY: 'PUBLIC_API_TOKEN',
  DRIVE: {
    KAMAR_IMAGE_FOLDER_URL: 'https://drive.google.com/drive/folders/1TjVF4nMimjcj5o1SvgXZHX9iDcJ4GOUk?usp=drive_link'
  },
  SHEETS: {
    KOST: 'kost',
    KAMAR: 'kamar',
    PENGGUNA: 'pengguna',
    BOOKING: 'booking',
    USERS: 'users',
    AUDIT_LOG: 'audit_log'
  },
  STATUS: {
    BOOKING: ['baru', 'diproses', 'diterima', 'ditolak', 'check-in', 'batal', 'selesai'],
    KAMAR: ['tersedia', 'dibooking', 'terisi', 'nonaktif']
  },
  ROLES: {
    OWNER: 'owner',
    MANAGER: 'manager'
  }
};
