/** 스프레드시트에 바인딩해 사용하는 수강생 링크 발급 스크립트. */
const COMENTO = {
  sheet: '시트1',
  site: 'https://comento-ads-2027.netlify.app/',
  timezone: 'Asia/Seoul',
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('코멘토 링크')
    .addItem('새 수강생 링크 발급', 'generateStudentLinks')
    .addItem('만료 상태 갱신', 'refreshExpiryStatus')
    .addItem('매일 만료 갱신 설정', 'installExpiryTrigger')
    .addToUi();
}

function signingKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('ACCESS_SIGNING_KEY');
  if (!key) throw new Error('앱스 스크립트의 스크립트 속성에 ACCESS_SIGNING_KEY를 먼저 설정하세요. Netlify에도 같은 값을 설정해야 합니다.');
  if (key.length < 32) throw new Error('ACCESS_SIGNING_KEY 값은 32자 이상의 임의 문자열이어야 합니다.');
  return key;
}

function dateAtMidnight_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) throw new Error('시작일과 종료일은 날짜 셀로 입력하세요.');
  const date = Utilities.formatDate(value, COMENTO.timezone, 'yyyy-MM-dd');
  return Date.parse(`${date}T00:00:00+09:00`);
}

function signedToken_(payload, key) {
  const encoded = Utilities.base64EncodeWebSafe(JSON.stringify(payload), Utilities.Charset.UTF_8).replace(/=+$/, '');
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(encoded, key)).replace(/=+$/, '');
  return `${encoded}.${signature}`;
}

function studentSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(COMENTO.sheet);
  if (!sheet) throw new Error(`${COMENTO.sheet} 시트를 찾을 수 없습니다.`);
  const headers = sheet.getRange(1, 1, 1, 6).getDisplayValues()[0];
  if (headers.join('|') !== '회차|수강 시작|수강 종료|수강생명|링크|만료여부') throw new Error('A~F열 제목이 예상한 구조와 다릅니다.');
  return sheet;
}

function generateStudentLinks() {
  const sheet = studentSheet_();
  const key = signingKey_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return SpreadsheetApp.getUi().alert('발급할 수강생이 없습니다.');
  const rows = sheet.getRange(2, 1, count, 6).getValues();
  const now = Date.now();
  const changes = [];
  const errors = [];
  rows.forEach((row, index) => {
    const [cohort, start, end, name, existing, status] = row;
    if (!cohort && !name) return;
    if (existing || String(status).trim() === '만료') return;
    try {
      if (!cohort || !name) throw new Error('회차 또는 수강생명이 비어 있습니다.');
      const nbf = dateAtMidnight_(start);
      const exp = dateAtMidnight_(end) + 86400000;
      if (exp <= nbf) throw new Error('종료일이 시작일보다 빠릅니다.');
      if (now >= exp) throw new Error('이미 종료된 수강 기간입니다.');
      const studentId = Utilities.getUuid();
      const token = signedToken_({ studentId, cohort: String(cohort), nbf, exp }, key);
      changes.push({ row: index + 2, link: `${COMENTO.site}?access=${token}` });
    } catch (error) { errors.push(`${index + 2}행: ${error.message}`); }
  });
  changes.forEach(change => {
    sheet.getRange(change.row, 5).setValue(change.link);
    sheet.getRange(change.row, 6).setValue('활성');
  });
  refreshExpiryStatus();
  SpreadsheetApp.getUi().alert(`${changes.length}개 링크를 발급했습니다.${errors.length ? '\n' + errors.join('\n') : ''}`);
}

function refreshExpiryStatus() {
  const sheet = studentSheet_();
  const count = Math.max(0, sheet.getLastRow() - 1);
  if (!count) return;
  const rows = sheet.getRange(2, 1, count, 6).getValues();
  rows.forEach((row, index) => {
    if (!row[4]) return;
    try {
      const expired = Date.now() >= dateAtMidnight_(row[2]) + 86400000;
      const wanted = expired ? '만료' : '활성';
      if (row[5] !== wanted) sheet.getRange(index + 2, 6).setValue(wanted);
    } catch (error) { console.warn(`${index + 2}행: ${error.message}`); }
  });
}

function installExpiryTrigger() {
  ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'refreshExpiryStatus')
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('refreshExpiryStatus').timeBased().everyDays(1).atHour(1).create();
  SpreadsheetApp.getUi().alert('매일 만료 상태 갱신을 설정했습니다.');
}

