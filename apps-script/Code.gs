function doGet() {
  const template = HtmlService.createTemplateFromFile('Dashboard');
  template.sessionUser = null;
  return template
    .evaluate()
    .setTitle('Kost Management')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const body = safeJsonParse(e && e.postData ? e.postData.contents : '{}');
  const action = body.action || '';
  const payload = body.payload || {};
  const result = handleActionRequest(action, payload);

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
