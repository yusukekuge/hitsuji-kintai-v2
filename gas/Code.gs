// ===== 100匹目の羊 勤怠管理システム - GAS Backend =====
// 使い方:
// 1. Googleスプレッドシートを作成
// 2. メニュー「拡張機能」→「Apps Script」→ このコードを貼り付け
// 3. SS_ID にスプレッドシートIDを設定
// 4. initializeSpreadsheet() を手動実行してシートを初期化
// 5.「デプロイ」→「新しいデプロイ」→「ウェブアプリ」→ 実行ユーザー：自分、アクセス：全員
// 6. 生成されたURLをアプリの設定画面に入力

// ===== 設定 =====
const SS_ID = '1yLa_vbXhjDK2AkduL6gVzJQp3GlBQ7R_ENSpgLKkCbk'; // ← スプレッドシートIDを設定

function getSpreadsheet() {
  return SpreadsheetApp.openById(SS_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

// ===== 初期化（最初に1回だけ手動実行） =====
function initializeSpreadsheet() {
  const ss = getSpreadsheet();

  // staff シート
  let sheet = getSheet('staff');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'name', 'hourlyWage', 'probation', 'commuteDistance', 'hireDate', 'otherAllowance', 'taxCategory', 'dependents', 'active']);
  }

  // time_records シート
  sheet = getSheet('time_records');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['id', 'staffId', 'date', 'type', 'time', 'modified']);
  }

  // shifts シート
  sheet = getSheet('shifts');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['staffId', 'date', 'startTime', 'endTime']);
  }

  // settings シート
  sheet = getSheet('settings');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['key', 'value']);
  }

  // wage_history / min_wage シート（時給履歴・最低賃金）
  getHeaderedSheet('wage_history', WAGE_HISTORY_HEADERS);
  getHeaderedSheet('min_wage', MIN_WAGE_HEADERS);

  Logger.log('初期化完了');
}

// ===== HTTP ハンドラ =====
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'ping') {
    return jsonOk({ message: 'pong' });
  }
  return jsonOk({ message: '勤怠管理システム API is running', version: '3.2' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    switch (action) {
      case 'ping':
        return jsonOk({ message: 'pong' });

      // === スタッフ ===
      case 'getStaff':
        return jsonOk(getStaffData());
      case 'getAllStaff':
        return jsonOk(getAllStaffData());
      case 'saveStaff':
        return jsonOk(saveStaffData(body.staff));
      case 'deleteStaff':
        return jsonOk(deleteStaffData(body.staffId));

      // === 打刻記録 ===
      case 'getTimeRecords':
        return jsonOk(getTimeRecordsData(body.date));
      case 'getTimeRecordsByMonth':
        return jsonOk(getTimeRecordsByMonthData(body.year, body.month));
      case 'getTimeRecordsByRange':
        return jsonOk(getTimeRecordsByRangeData(body.startDate, body.endDate));
      case 'addTimeRecord':
        return jsonOk(addTimeRecordData(body.record));
      case 'updateTimeRecord':
        return jsonOk(updateTimeRecordData(body.record));
      case 'deleteTimeRecord':
        return jsonOk(deleteTimeRecordData(body.recordId));

      // === シフト ===
      case 'getShifts':
        return jsonOk(getShiftsData(body.year, body.month));
      case 'saveShift':
        return jsonOk(saveShiftData(body.shift));
      case 'deleteShift':
        return jsonOk(deleteShiftData(body.staffId, body.date));
      case 'saveShiftsBulk':
        return jsonOk(saveShiftsBulkData(body.shifts));

      // === 時給履歴・最低賃金 ===
      case 'getWageHistory':
        return jsonOk(getWageHistoryData());
      case 'addWageHistory':
        return jsonOk(addWageHistoryData(body.entry));
      case 'deleteWageHistory':
        return jsonOk(deleteWageHistoryData(body.staffId, body.id));
      case 'getMinWages':
        return jsonOk(getMinWagesData());
      case 'addMinWage':
        return jsonOk(addMinWageData(body.entry));

      default:
        return jsonError('Unknown action: ' + action);
    }
  } catch (err) {
    return jsonError(err.message || String(err));
  }
}

// ===== レスポンスヘルパー =====
function jsonOk(data) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, data: data })
  ).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: false, error: message })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ===== シートデータ変換ヘルパー =====
function formatCellValue(value) {
  // Googleスプレッドシートが日付文字列をDateオブジェクトに自動変換するため、
  // YYYY-MM-DD形式の文字列に戻す
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  return value;
}

function sheetToArray(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = formatCellValue(row[i]); });
    return obj;
  });
}

function findRowIndex(sheet, colIndex, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) return i + 1; // 1-indexed
  }
  return -1;
}

// ===== スタッフ操作 =====
function getStaffData() {
  const sheet = getSheet('staff');
  return sheetToArray(sheet).filter(s => String(s.active) !== '0' && String(s.active) !== 'false');
}

function getAllStaffData() {
  const sheet = getSheet('staff');
  return sheetToArray(sheet);
}

// staff.hourlyWage 列は後方互換のため残すが、給与計算には使わない（時給は wage_history）。
// 新規登録時だけ、その時給を wage_history の初期履歴として登録する。
function saveStaffData(staff) {
  return withLock(() => {
    ensureWageHistoryMigrated_();
    const sheet = getSheet('staff');
    const rowIdx = findRowIndex(sheet, 0, staff.id);
    const isNew = rowIdx < 0;

    let initialWage = 0;
    if (isNew) {
      initialWage = toYen(staff.hourlyWage);
      if (!(initialWage > 0) || Math.floor(initialWage) !== initialWage) {
        throw new Error('時給は1円以上の整数で入力してください');
      }
      // 入社日が未来ならその日、それ以外は今日の最低賃金と比較
      const hireDate = normalizeDateStr(staff.hireDate);
      const checkDate = hireDate && hireDate > todayStr() ? hireDate : todayStr();
      const minWage = minWageAt(readMinWagesSeeded_(), checkDate);
      if (minWage && initialWage < minWage) {
        throw new Error('最低賃金（' + checkDate + '時点 ' + minWage + '円）を下回るため登録できません');
      }
    }

    const row = [
      staff.id, staff.name, staff.hourlyWage || '',
      staff.probation ? '1' : '0', staff.commuteDistance || 0,
      staff.hireDate || '', staff.otherAllowance || 0,
      staff.taxCategory || 'kou', staff.dependents || 0,
      staff.active !== false ? '1' : '0'
    ];

    if (rowIdx > 0) {
      const range = sheet.getRange(rowIdx, 1, 1, row.length);
      range.setNumberFormat('@');
      range.setValues([row]);
    } else {
      const newRow = sheet.getLastRow() + 1;
      const range = sheet.getRange(newRow, 1, 1, row.length);
      range.setNumberFormat('@');
      range.setValues([row]);
    }

    if (isNew && !readWageHistory_().some(h => h.staffId === String(staff.id))) {
      appendTextRows(getHeaderedSheet('wage_history', WAGE_HISTORY_HEADERS), [[
        Utilities.getUuid(), String(staff.id), WAGE_BASE_DATE, String(initialWage), '登録時の時給', new Date().toISOString()
      ]]);
    }
    return 'ok';
  });
}

function deleteStaffData(staffId) {
  const sheet = getSheet('staff');
  const rowIdx = findRowIndex(sheet, 0, staffId);
  if (rowIdx > 0) {
    // active列(10列目)を0に設定
    sheet.getRange(rowIdx, 10).setValue('0');
  }
  return 'ok';
}

// ===== 打刻記録操作 =====
function getTimeRecordsData(date) {
  const sheet = getSheet('time_records');
  return sheetToArray(sheet).filter(r => r.date === date);
}

function getTimeRecordsByMonthData(year, month) {
  const prefix = year + '-' + String(Number(month) + 1).padStart(2, '0');
  const sheet = getSheet('time_records');
  return sheetToArray(sheet).filter(r => String(r.date).startsWith(prefix));
}

function getTimeRecordsByRangeData(startDate, endDate) {
  const sheet = getSheet('time_records');
  return sheetToArray(sheet).filter(r => r.date >= startDate && r.date <= endDate);
}

// 端末側で作ったIDのまま受け取る。同じIDがすでにあれば追加せず成功を返す（再送で二重登録しないため）
function addTimeRecordData(record) {
  if (!record || !record.id) throw new Error('打刻IDがありません');
  return withLock(() => {
    const sheet = getSheet('time_records');
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      const id = String(record.id);
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === id) return 'ok';
      }
    }
    const row = [
      record.id, record.staffId, record.date,
      record.type, record.time, record.modified ? '1' : '0'
    ];
    const range = sheet.getRange(lastRow + 1, 1, 1, row.length);
    range.setNumberFormat('@');
    range.setValues([row]);
    return 'ok';
  });
}

function updateTimeRecordData(record) {
  const sheet = getSheet('time_records');
  const rowIdx = findRowIndex(sheet, 0, record.id);
  if (rowIdx > 0) {
    const row = [record.id, record.staffId, record.date, record.type, record.time, record.modified ? '1' : '0'];
    const range = sheet.getRange(rowIdx, 1, 1, row.length);
    range.setNumberFormat('@');
    range.setValues([row]);
  }
  return 'ok';
}

function deleteTimeRecordData(recordId) {
  const sheet = getSheet('time_records');
  const rowIdx = findRowIndex(sheet, 0, recordId);
  if (rowIdx > 0) {
    sheet.deleteRow(rowIdx);
  }
  return 'ok';
}

// ===== シフト操作 =====
function getShiftsData(year, month) {
  const prefix = year + '-' + String(Number(month) + 1).padStart(2, '0');
  const sheet = getSheet('shifts');
  return sheetToArray(sheet).filter(s => String(s.date).startsWith(prefix));
}

function saveShiftData(shift) {
  const sheet = getSheet('shifts');
  const data = sheet.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(shift.staffId) && formatCellValue(data[i][1]) === String(shift.date)) {
      rowIdx = i + 1;
      break;
    }
  }
  const row = [shift.staffId, shift.date, shift.startTime || '', shift.endTime || ''];
  if (rowIdx > 0) {
    const range = sheet.getRange(rowIdx, 1, 1, row.length);
    range.setNumberFormat('@'); // テキスト形式に設定
    range.setValues([row]);
  } else {
    const newRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(newRow, 1, 1, row.length);
    range.setNumberFormat('@'); // テキスト形式に設定
    range.setValues([row]);
  }
  return 'ok';
}

function deleteShiftData(staffId, date) {
  const sheet = getSheet('shifts');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(staffId) && formatCellValue(data[i][1]) === String(date)) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return 'ok';
}

function saveShiftsBulkData(shifts) {
  if (!shifts || shifts.length === 0) return 'ok';

  const prefix = shifts[0].date.substring(0, 7); // "YYYY-MM"
  const sheet = getSheet('shifts');
  const data = sheet.getDataRange().getValues();

  // 該当月の既存データを削除（逆順で削除）
  for (let i = data.length - 1; i >= 1; i--) {
    if (formatCellValue(data[i][1]).startsWith(prefix)) {
      sheet.deleteRow(i + 1);
    }
  }

  // 新しいデータを追加（テキスト形式で書き込み）
  shifts.forEach(sh => {
    const newRow = sheet.getLastRow() + 1;
    const row = [sh.staffId, sh.date, sh.startTime || '', sh.endTime || ''];
    const range = sheet.getRange(newRow, 1, 1, row.length);
    range.setNumberFormat('@');
    range.setValues([row]);
  });

  return 'ok';
}

// ===== 時給履歴・最低賃金 =====
// シートには日付・数値をテキストで保存し、読み込み時に正規化する（'0' と 0 の型ズレ対策）
const WAGE_HISTORY_HEADERS = ['id', 'staffId', 'effectiveDate', 'hourlyWage', 'note', 'createdAt'];
const MIN_WAGE_HEADERS = ['id', 'effectiveDate', 'minWage', 'note', 'createdAt'];
const WAGE_BASE_DATE = '2000-01-01'; // 初期時給の適用開始日（入社日前の打刻もカバーするため固定の過去日）
// 移行処理専用：旧仕様の時給（試用期間は1,116円固定、未設定は1,150円）
const MIGRATION_PROBATION_WAGE = 1116;
const MIGRATION_FALLBACK_WAGE = 1150;
// 最低賃金の初期データ（兵庫県）
const DEFAULT_MIN_WAGES = [
  ['2025-10-04', 1116, '兵庫県最低賃金'],
  ['2026-10-01', 1172, '兵庫県最低賃金']
];

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getHeaderedSheet(name, headers) {
  const sheet = getSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function appendTextRows(sheet, rows) {
  if (rows.length === 0) return;
  const range = sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function todayStr() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

// '2026/10/1' や Date 型も 'YYYY-MM-DD' にそろえる。不正な値は ''
function normalizeDateStr(value) {
  const s = String(formatCellValue(value) || '').trim().replace(/\//g, '-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
}

// '1,172' '1172円' なども数値にする。不正な値は NaN
function toYen(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(String(value).replace(/[,円\s]/g, ''));
}

function byEffectiveDate(a, b) {
  return a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0;
}

function getSettingValue_(key) {
  const sheet = getHeaderedSheet('settings', ['key', 'value']);
  const rowIdx = findRowIndex(sheet, 0, key);
  return rowIdx > 0 ? sheet.getRange(rowIdx, 2).getValue() : '';
}

function readWageHistory_() {
  return sheetToArray(getHeaderedSheet('wage_history', WAGE_HISTORY_HEADERS)).map(r => ({
    id: String(r.id),
    staffId: String(r.staffId),
    effectiveDate: normalizeDateStr(r.effectiveDate),
    hourlyWage: toYen(r.hourlyWage),
    note: String(r.note || ''),
    createdAt: String(r.createdAt || '')
  })).filter(h => h.staffId && h.effectiveDate && h.hourlyWage > 0);
}

function readMinWages_() {
  return sheetToArray(getHeaderedSheet('min_wage', MIN_WAGE_HEADERS)).map(r => ({
    id: String(r.id),
    effectiveDate: normalizeDateStr(r.effectiveDate),
    minWage: toYen(r.minWage),
    note: String(r.note || ''),
    createdAt: String(r.createdAt || '')
  })).filter(m => m.effectiveDate && m.minWage > 0).sort(byEffectiveDate);
}

function minWageAt(minWages, date) {
  let value = 0;
  minWages.forEach(m => { if (m.effectiveDate <= date) value = m.minWage; });
  return value;
}

// --- 既存スタッフの移行（1回だけ。ロック内で呼ぶこと） ---
// wage_history に1件もないスタッフに、旧仕様と同じ時給を 2000-01-01 適用で登録する
function ensureWageHistoryMigrated_() {
  if (getSettingValue_('wage_history_migrated')) return;
  const wageSheet = getHeaderedSheet('wage_history', WAGE_HISTORY_HEADERS);
  const registered = {};
  sheetToArray(wageSheet).forEach(r => { registered[String(r.staffId)] = true; });
  const now = new Date().toISOString();
  const rows = [];
  sheetToArray(getSheet('staff')).forEach(s => {
    const staffId = String(s.id || '');
    if (!staffId || registered[staffId]) return;
    const probation = s.probation === true || s.probation === '1' || s.probation === 1;
    const wage = probation ? MIGRATION_PROBATION_WAGE : (Number(s.hourlyWage) || MIGRATION_FALLBACK_WAGE);
    rows.push([Utilities.getUuid(), staffId, WAGE_BASE_DATE, String(wage), '移行時の時給（旧仕様から自動登録）', now]);
    registered[staffId] = true;
  });
  appendTextRows(wageSheet, rows);
  appendTextRows(getHeaderedSheet('settings', ['key', 'value']), [['wage_history_migrated', now]]);
}

// --- 最低賃金の初期データ登録（1回だけ。ロック内で呼ぶこと） ---
function ensureMinWageSeeded_() {
  if (getSettingValue_('min_wage_seeded')) return;
  const sheet = getHeaderedSheet('min_wage', MIN_WAGE_HEADERS);
  if (sheet.getLastRow() <= 1) {
    const now = new Date().toISOString();
    appendTextRows(sheet, DEFAULT_MIN_WAGES.map(m => [Utilities.getUuid(), m[0], String(m[1]), m[2], now]));
  }
  appendTextRows(getHeaderedSheet('settings', ['key', 'value']), [['min_wage_seeded', new Date().toISOString()]]);
}

function readMinWagesSeeded_() {
  ensureMinWageSeeded_();
  return readMinWages_();
}

function getWageHistoryData() {
  if (!getSettingValue_('wage_history_migrated')) withLock(ensureWageHistoryMigrated_);
  return readWageHistory_().sort(byEffectiveDate);
}

function addWageHistoryData(entry) {
  return withLock(() => {
    ensureWageHistoryMigrated_();
    const staffId = String((entry && entry.staffId) || '');
    if (!staffId || findRowIndex(getSheet('staff'), 0, staffId) < 0) throw new Error('スタッフが見つかりません');
    const effectiveDate = normalizeDateStr(entry.effectiveDate);
    if (!effectiveDate) throw new Error('適用開始日が正しくありません');
    const wage = toYen(entry.hourlyWage);
    if (!(wage > 0) || Math.floor(wage) !== wage) throw new Error('時給は1円以上の整数で入力してください');

    const wageSheet = getHeaderedSheet('wage_history', WAGE_HISTORY_HEADERS);
    let history = readWageHistory_().filter(h => h.staffId === staffId).sort(byEffectiveDate);
    if (history.length === 0) {
      // 移行後に旧画面から登録されたスタッフなど：先に旧仕様の時給を初期履歴として残す（過去の計算を変えないため）
      const s = sheetToArray(getSheet('staff')).find(st => String(st.id) === staffId);
      const probation = s.probation === true || s.probation === '1' || s.probation === 1;
      const baseWage = probation ? MIGRATION_PROBATION_WAGE : (Number(s.hourlyWage) || MIGRATION_FALLBACK_WAGE);
      appendTextRows(wageSheet, [[Utilities.getUuid(), staffId, WAGE_BASE_DATE, String(baseWage), '移行時の時給（旧仕様から自動登録）', new Date().toISOString()]]);
      history = readWageHistory_().filter(h => h.staffId === staffId).sort(byEffectiveDate);
    }
    const latest = history[history.length - 1];
    if (latest && effectiveDate <= latest.effectiveDate) {
      throw new Error('適用開始日は最新の履歴（' + latest.effectiveDate + '）より後の日付にしてください');
    }
    const minWage = minWageAt(readMinWagesSeeded_(), effectiveDate);
    if (minWage && wage < minWage) {
      throw new Error('最低賃金（' + effectiveDate + '時点 ' + minWage + '円）を下回るため登録できません');
    }
    if (latest && wage === latest.hourlyWage) throw new Error('現在の時給と同じです');

    const row = [Utilities.getUuid(), staffId, effectiveDate, String(wage), String(entry.note || '').slice(0, 100), new Date().toISOString()];
    appendTextRows(wageSheet, [row]);
    return { id: row[0], staffId: row[1], effectiveDate: row[2], hourlyWage: wage, note: row[4], createdAt: row[5] };
  });
}

// 取り消せるのは各スタッフの「一番新しい履歴」だけ（初期の1件は取り消し不可）
function deleteWageHistoryData(staffId, id) {
  return withLock(() => {
    const history = readWageHistory_().filter(h => h.staffId === String(staffId)).sort(byEffectiveDate);
    if (history.length <= 1) throw new Error('初期の時給は取り消せません');
    const latest = history[history.length - 1];
    if (latest.id !== String(id)) throw new Error('取り消せるのは一番新しい履歴だけです');
    const sheet = getHeaderedSheet('wage_history', WAGE_HISTORY_HEADERS);
    const rowIdx = findRowIndex(sheet, 0, latest.id);
    if (rowIdx < 2) throw new Error('履歴が見つかりません');
    sheet.deleteRow(rowIdx);
    return 'ok';
  });
}

function getMinWagesData() {
  if (!getSettingValue_('min_wage_seeded')) withLock(ensureMinWageSeeded_);
  return readMinWages_();
}

function addMinWageData(entry) {
  return withLock(() => {
    const minWages = readMinWagesSeeded_();
    const effectiveDate = normalizeDateStr(entry && entry.effectiveDate);
    if (!effectiveDate) throw new Error('適用開始日が正しくありません');
    const minWage = toYen(entry.minWage);
    if (!(minWage > 0) || Math.floor(minWage) !== minWage) throw new Error('最低賃金は1円以上の整数で入力してください');
    if (minWages.some(m => m.effectiveDate === effectiveDate)) throw new Error('同じ適用開始日の最低賃金がすでに登録されています');
    const row = [Utilities.getUuid(), effectiveDate, String(minWage), String(entry.note || '').slice(0, 100), new Date().toISOString()];
    appendTextRows(getHeaderedSheet('min_wage', MIN_WAGE_HEADERS), [row]);
    return { id: row[0], effectiveDate: row[1], minWage: minWage, note: row[3], createdAt: row[4] };
  });
}
