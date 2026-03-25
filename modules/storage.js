// ===== データ保存モジュール（GAS連携 + localStorageフォールバック） =====
const Storage = (() => {
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzO2IC99lGUsAIot97WYVXUpyY7fcL5dSiS_zf4OzKWzFRmWeHt1agu5bBtRsUhqqhz_w/exec';
  let gasUrl = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;
  let useGas = false;

  function init() {
    gasUrl = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;
    useGas = gasUrl.length > 0;
  }

  function setGasUrl(url) {
    gasUrl = url;
    localStorage.setItem('gas_url', url);
    useGas = url.length > 0;
  }
  function getGasUrl() { return gasUrl; }
  function isGasMode() { return useGas; }

  // --- GAS通信 ---
  async function gasRequest(action, data = {}) {
    const payload = { action, ...data };
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json.data !== undefined ? json.data : json;
  }

  // --- ローカルストレージ操作 ---
  function localGet(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  }
  function localSet(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  function localGetObj(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }

  // ===== スタッフ =====
  // GASから返る文字列 '0'/'1' をJS型に正規化
  function normalizeStaff(staffList) {
    return staffList.map(s => ({
      ...s,
      probation: s.probation === true || s.probation === '1' || s.probation === 1,
      active: s.active !== false && String(s.active) !== '0' && String(s.active) !== 'false',
      hourlyWage: Number(s.hourlyWage) || 1150,
      commuteDistance: Number(s.commuteDistance) || 0,
      otherAllowance: Number(s.otherAllowance) || 0,
      dependents: Number(s.dependents) || 0
    }));
  }

  async function getStaff() {
    if (useGas) {
      try { return normalizeStaff(await gasRequest('getStaff')); }
      catch (e) { console.warn('GAS getStaff failed:', e.message); }
    }
    return localGet('staff').filter(s => s.active !== false);
  }

  async function getAllStaff() {
    if (useGas) {
      try { return normalizeStaff(await gasRequest('getAllStaff')); }
      catch (e) { console.warn('GAS getAllStaff failed:', e.message); }
    }
    return localGet('staff');
  }

  async function saveStaff(staff) {
    if (useGas) {
      try { await gasRequest('saveStaff', { staff }); return; }
      catch (e) { console.warn('GAS saveStaff failed:', e.message); }
    }
    const all = localGet('staff');
    const idx = all.findIndex(s => s.id === staff.id);
    if (idx >= 0) all[idx] = staff;
    else all.push(staff);
    localSet('staff', all);
  }

  async function deleteStaff(staffId) {
    if (useGas) {
      try { await gasRequest('deleteStaff', { staffId }); return; }
      catch (e) { console.warn('GAS deleteStaff failed:', e.message); }
    }
    const all = localGet('staff');
    const idx = all.findIndex(s => s.id === staffId);
    if (idx >= 0) {
      all[idx].active = false;
      localSet('staff', all);
    }
  }

  // ===== 打刻記録 =====
  async function getTimeRecords(date) {
    if (useGas) {
      try { return await gasRequest('getTimeRecords', { date }); }
      catch (e) { console.warn('GAS getTimeRecords failed:', e.message); }
    }
    return localGet('time_records').filter(r => r.date === date);
  }

  async function getTimeRecordsByMonth(year, month) {
    if (useGas) {
      try { return await gasRequest('getTimeRecordsByMonth', { year, month }); }
      catch (e) { console.warn('GAS getTimeRecordsByMonth failed:', e.message); }
    }
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return localGet('time_records').filter(r => r.date.startsWith(prefix));
  }

  async function getTimeRecordsByRange(startDate, endDate) {
    if (useGas) {
      try { return await gasRequest('getTimeRecordsByRange', { startDate, endDate }); }
      catch (e) { console.warn('GAS getTimeRecordsByRange failed:', e.message); }
    }
    return localGet('time_records').filter(r => r.date >= startDate && r.date <= endDate);
  }

  async function addTimeRecord(record) {
    if (useGas) {
      try { await gasRequest('addTimeRecord', { record }); return; }
      catch (e) { console.warn('GAS addTimeRecord failed:', e.message); }
    }
    const all = localGet('time_records');
    all.push(record);
    localSet('time_records', all);
  }

  async function updateTimeRecord(record) {
    if (useGas) {
      try { await gasRequest('updateTimeRecord', { record }); return; }
      catch (e) { console.warn('GAS updateTimeRecord failed:', e.message); }
    }
    const all = localGet('time_records');
    const idx = all.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      all[idx] = record;
      localSet('time_records', all);
    }
  }

  async function deleteTimeRecord(recordId) {
    if (useGas) {
      try { await gasRequest('deleteTimeRecord', { recordId }); return; }
      catch (e) { console.warn('GAS deleteTimeRecord failed:', e.message); }
    }
    let all = localGet('time_records');
    all = all.filter(r => r.id !== recordId);
    localSet('time_records', all);
  }

  // ===== シフト =====
  async function getShifts(year, month) {
    if (useGas) {
      try { return await gasRequest('getShifts', { year, month }); }
      catch (e) { console.warn('GAS getShifts failed:', e.message); }
    }
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return localGet('shifts').filter(s => s.date.startsWith(prefix));
  }

  async function saveShift(shift) {
    if (useGas) {
      try { await gasRequest('saveShift', { shift }); return; }
      catch (e) { console.warn('GAS saveShift failed:', e.message); }
    }
    const all = localGet('shifts');
    const idx = all.findIndex(s => s.staffId === shift.staffId && s.date === shift.date);
    if (idx >= 0) all[idx] = shift;
    else all.push(shift);
    localSet('shifts', all);
  }

  async function deleteShift(staffId, date) {
    if (useGas) {
      try { await gasRequest('deleteShift', { staffId, date }); return; }
      catch (e) { console.warn('GAS deleteShift failed:', e.message); }
    }
    let all = localGet('shifts');
    all = all.filter(s => !(s.staffId === staffId && s.date === date));
    localSet('shifts', all);
  }

  async function saveShiftsBulk(shifts) {
    if (useGas) {
      try { await gasRequest('saveShiftsBulk', { shifts }); return; }
      catch (e) { console.warn('GAS saveShiftsBulk failed:', e.message); }
    }
    if (shifts.length === 0) return;
    const prefix = shifts[0].date.substring(0, 7);
    let all = localGet('shifts').filter(s => !s.date.startsWith(prefix));
    all = all.concat(shifts);
    localSet('shifts', all);
  }

  // ===== 設定 =====
  function getSetting(key, defaultVal = '') {
    const settings = localGetObj('app_settings');
    return settings[key] !== undefined ? settings[key] : defaultVal;
  }

  function setSetting(key, value) {
    const settings = localGetObj('app_settings');
    settings[key] = value;
    localSet('app_settings', settings);
  }

  // PIN（デフォルト: 0000）
  const DEFAULT_PIN = '0000';
  function getPin() { return getSetting('admin_pin', DEFAULT_PIN); }
  function setPin(pin) { setSetting('admin_pin', pin); }
  function verifyPin(pin) {
    const stored = getPin();
    return pin === stored;
  }

  // データエクスポート
  function exportAllData() {
    return {
      staff: localGet('staff'),
      time_records: localGet('time_records'),
      shifts: localGet('shifts'),
      app_settings: localGetObj('app_settings')
    };
  }

  // データインポート
  function importAllData(data) {
    if (data.staff) localSet('staff', data.staff);
    if (data.time_records) localSet('time_records', data.time_records);
    if (data.shifts) localSet('shifts', data.shifts);
    if (data.app_settings) localSet('app_settings', data.app_settings);
  }

  // データ初期化
  function resetAllData() {
    localStorage.removeItem('staff');
    localStorage.removeItem('time_records');
    localStorage.removeItem('shifts');
  }

  init();

  return {
    init, setGasUrl, getGasUrl, isGasMode,
    getStaff, getAllStaff, saveStaff, deleteStaff,
    getTimeRecords, getTimeRecordsByMonth, getTimeRecordsByRange,
    addTimeRecord, updateTimeRecord, deleteTimeRecord,
    getShifts, saveShift, deleteShift, saveShiftsBulk,
    getSetting, setSetting, getPin, setPin, verifyPin,
    exportAllData, importAllData, resetAllData,
    gasRequest
  };
})();
