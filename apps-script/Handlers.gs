function routeAction(action, payload, user) {
  switch (action) {
    case 'sessionInfo':
      return ok({ username: user.username, email: user.email, name: user.name, role: user.role });

    case 'listUsers':
      requireRole([APP_CONFIG.ROLES.OWNER], user);
      return ok(listUsersService());

    case 'createUser':
      requireRole([APP_CONFIG.ROLES.OWNER], user);
      return ok(createUserService(payload || {}, user));

    case 'changeUserPassword':
      requireRole([APP_CONFIG.ROLES.OWNER], user);
      return ok(changeUserPasswordService(payload || {}, user));

    case 'listBookings':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(listBookingsService());

    case 'updateBookingStatus':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(updateBookingStatusService(payload || {}, user));

    case 'createTestBooking':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(createTestBookingService(payload || {}, user));

    case 'listKost':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(listKostService());

    case 'upsertKost':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(upsertKostService(payload || {}, user));

    case 'deleteKost':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(deleteKostService(payload || {}, user));

    case 'listKamar':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(listKamarService());

    case 'createKamar':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(createKamarService(payload || {}, user));

    case 'deleteKamarPhoto':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(deleteKamarPhotoService(payload || {}, user));

    case 'updateKamarFasilitas':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(updateKamarFasilitasService(payload || {}, user));

    case 'listPengguna':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(listPenggunaService());

    case 'createPengguna':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(createPenggunaService(payload || {}, user));

    case 'addPenggunaMonth':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(addPenggunaMonthService(payload || {}, user));

    case 'setPenggunaPaidThisMonth':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(setPenggunaPaidThisMonthService(payload || {}, user));

    case 'updatePenggunaEndMonth':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(updatePenggunaEndMonthService(payload || {}, user));

    case 'finishPengguna':
      requireRole([APP_CONFIG.ROLES.OWNER, APP_CONFIG.ROLES.MANAGER], user);
      return ok(finishPenggunaService(payload || {}, user));

    default:
      return fail('Action tidak dikenal: ' + action);
  }
}

function handleActionRequest(action, payload) {
  try {
    const safePayload = payload || {};

    if (action === 'authBootstrap') {
      return ok(authBootstrap(safePayload));
    }

    if (action === 'authSetupCredentials') {
      return ok(setupCredentialsFromDetectedEmail(safePayload));
    }

    if (action === 'authLogin') {
      return ok(loginWithUsernamePassword(safePayload));
    }

    if (action === 'authLogout') {
      return ok(logoutSession(safePayload));
    }

    const user = getCurrentUserFromSessionPayload(safePayload);
    return routeAction(action, safePayload, user);
  } catch (err) {
    return fail(err.message || 'Terjadi kesalahan', String(err));
  }
}

function runAction(action, payload) {
  return handleActionRequest(action, payload || {});
}

function runActionJson(action, payload) {
  return JSON.stringify(handleActionRequest(action, payload || {}));
}
