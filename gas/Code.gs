// ===== 100匹目の羊 勤怠管理システム - GAS Backend =====
// 使い方:
// 1. Googleスプレッドシートを作成
// 2. メニュー「拡張機能」→「Apps Script」→ このコードを貼り付け
// 3. SS_ID にスプレッドシートIDを設定
// 4. initializeSpreadsheet() を手動実行してシートを初期化
// 5.「デプロイ」→「新しいデプロイ」→「ウェブアプリ」→ 実行ユーザー：自分、アクセス：全員
// 6. 生成されたURLをアプリの設定画面に入力

// ===== 設定 =====
const SS_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← スプレッドシートIDを設定

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

  Logger.log('初期化完了');
}

// ===== HTTP ハンドラ =====
function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  if (action === 'ping') {
    return jsonOk({ message: 'pong' });
  }
  return jsonOk({ message: '勤怠管理システム API is running', version: '3.0' });
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
function sheetToArray(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
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

function saveStaffData(staff) {
  const sheet = getSheet('staff');
  const rowIdx = findRowIndex(sheet, 0, staff.id);
  const row = [
    staff.id, staff.name, staff.hourlyWage || 1150,
    staff.probation ? '1' : '0', staff.commuteDistance || 0,
    staff.hireDate || '', staff.otherAllowance || 0,
    staff.taxCategory || 'kou', staff.dependents || 0,
    staff.active !== false ? '1' : '0'
  ];

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return 'ok';
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

function addTimeRecordData(record) {
  const sheet = getSheet('time_records');
  sheet.appendRow([
    record.id, record.staffId, record.date,
    record.type, record.time, record.modified ? '1' : '0'
  ]);
  return 'ok';
}

function updateTimeRecordData(record) {
  const sheet = getSheet('time_records');
  const rowIdx = findRowIndex(sheet, 0, record.id);
  if (rowIdx > 0) {
    const row = [record.id, record.staffId, record.date, record.type, record.time, record.modified ? '1' : '0'];
    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
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
    if (String(data[i][0]) === String(shift.staffId) && String(data[i][1]) === String(shift.date)) {
      rowIdx = i + 1;
      break;
    }
  }
  const row = [shift.staffId, shift.date, shift.startTime || '', shift.endTime || ''];
  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return 'ok';
}

function deleteShiftData(staffId, date) {
  const sheet = getSheet('shifts');
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(staffId) && String(data[i][1]) === String(date)) {
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
    if (String(data[i][1]).startsWith(prefix)) {
      sheet.deleteRow(i + 1);
    }
  }

  // 新しいデータを追加
  shifts.forEach(sh => {
    sheet.appendRow([sh.staffId, sh.date, sh.startTime || '', sh.endTime || '']);
  });

  return 'ok';
}
