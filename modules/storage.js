// ===== データ保存モジュール（GAS連携 + localStorageフォールバック） =====
const Storage = (() => {
  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbzO2IC99lGUsAIot97WYVXUpyY7fcL5dSiS_zf4OzKWzFRmWeHt1agu5bBtRsUhqqhz_w/exec';
  let gasUrl = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;
  let useGas = false;

  // --- メモリキャッシュ ---
  let _staffCache = null;
  let _staffCacheTime = 0;
  const STAFF_CACHE_TTL = 60000; // 60秒

  function init() {
    gasUrl = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;
    useGas = gasUrl.length > 0;
    _staffCache = null; // キャッシュクリア
  }

  function setGasUrl(url) {
    gasUrl = url;
    localStorage.setItem('gas_url', url);
    useGas = url.length > 0;
  }
  function getGasUrl() { return gasUrl; }
  function isGasMode() { return useGas; }
  function clearStaffCache() { _staffCache = null; }

  // --- GAS通信（15秒タイムアウト付き） ---
  // 通信エラー・タイムアウト・JSONとして読めない応答・success:true 以外の応答は、すべて例外にする
  async function gasRequest(action, data = {}) {
    const payload = { action, ...data };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      let json;
      try {
        const res = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        json = await res.json();
      } catch (e) {
        if (controller.signal.aborted) throw new Error('GASとの通信がタイムアウトしました（15秒）');
        throw new Error(e instanceof SyntaxError ? 'GASの応答を読み取れませんでした' : `GASと通信できませんでした（${e.message}）`);
      }
      if (!json || json.success !== true) {
        const err = new Error((json && json.error) || 'GASの応答が不正です');
        err.fromGas = true; // GAS側でのエラー（通信エラーと区別する）
        throw err;
      }
      return json.data !== undefined ? json.data : json;
    } finally {
      clearTimeout(timeoutId);
    }
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
      hourlyWage: Number(s.hourlyWage) || 0, // 後方互換用の列。給与計算の時給は wage_history から取る
      commuteDistance: Number(s.commuteDistance) || 0,
      otherAllowance: Number(s.otherAllowance) || 0,
      dependents: Number(s.dependents) || 0
    }));
  }

  async function getStaff() {
    // キャッシュが有効ならそれを返す
    if (_staffCache && (Date.now() - _staffCacheTime < STAFF_CACHE_TTL)) {
      return _staffCache.filter(s => s.active !== false);
    }
    if (useGas) {
      try {
        const result = normalizeStaff(await gasRequest('getStaff'));
        _staffCache = result;
        _staffCacheTime = Date.now();
        try { localSet('gas_staff_cache', result); } catch { /* 保存できなくても続行 */ }
        return result;
      }
      catch (e) {
        console.warn('GAS getStaff failed:', e.message);
        // 通信できないときは前回GASから取得したスタッフ一覧で打刻できるようにする（打刻は未送信キューへ）
        const cached = localGet('gas_staff_cache');
        if (cached.length > 0) return cached.filter(s => s.active !== false);
      }
    }
    const local = localGet('staff').filter(s => s.active !== false);
    _staffCache = local;
    _staffCacheTime = Date.now();
    return local;
  }

  async function getAllStaff() {
    if (useGas) {
      try { return normalizeStaff(await gasRequest('getAllStaff')); }
      catch (e) { console.warn('GAS getAllStaff failed:', e.message); }
    }
    return localGet('staff');
  }

  async function saveStaff(staff) {
    _staffCache = null; // キャッシュ無効化
    if (useGas) {
      try { await gasRequest('saveStaff', { staff }); return; }
      catch (e) {
        if (e.fromGas) throw e; // 最低賃金チェック等でGASが拒否した場合はローカルに保存しない
        console.warn('GAS saveStaff failed:', e.message);
      }
    }
    const all = localGet('staff');
    const idx = all.findIndex(s => s.id === staff.id);
    if (idx >= 0) all[idx] = staff;
    else all.push(staff);
    localSet('staff', all);
  }

  async function deleteStaff(staffId) {
    _staffCache = null; // キャッシュ無効化
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

  // 打刻の追加・修正・削除は、GASモードで失敗したら例外にする（端末内に黙って保存しない）
  async function addTimeRecord(record) {
    if (useGas) {
      await gasRequest('addTimeRecord', { record });
      return;
    }
    const all = localGet('time_records');
    all.push(record);
    localSet('time_records', all);
  }

  async function updateTimeRecord(record) {
    if (useGas) {
      await gasRequest('updateTimeRecord', { record });
      return;
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
      await gasRequest('deleteTimeRecord', { recordId });
      return;
    }
    let all = localGet('time_records');
    all = all.filter(r => r.id !== recordId);
    localSet('time_records', all);
  }

  // ===== 打刻の未送信キュー =====
  // 打刻はまず端末内のキュー（localStorage）に保存してからGASへ送り、
  // GASへの保存を確認できたものだけキューから消す。失敗したものは自動で再送する
  // （30秒ごと・アプリを開いたとき・通信が戻ったとき。タイマー等は app.js）
  const PENDING_KEY = 'pending_time_records';
  const FLUSH_LOCK_KEY = 'pending_time_records_lock';
  const tabId = Utils.generateId();
  const pendingListeners = [];
  let flushPromise = null;
  let sending = false;

  // [{ record, queuedAt, attempts, lastError }]
  function getPendingTimeRecords() { return localGet(PENDING_KEY); }
  function savePending(list) { localSet(PENDING_KEY, list); }
  function isSendingPending() { return sending; }
  function onPendingChange(fn) { pendingListeners.push(fn); }
  function notifyPending() {
    pendingListeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  // 同じ端末の別タブと同時に再送しないための簡易ロック（60秒で失効）
  function acquireFlushLock() {
    try {
      const lock = JSON.parse(localStorage.getItem(FLUSH_LOCK_KEY) || 'null');
      if (lock && lock.owner !== tabId && lock.until > Date.now()) return false;
      localStorage.setItem(FLUSH_LOCK_KEY, JSON.stringify({ owner: tabId, until: Date.now() + 60000 }));
    } catch { /* localStorage が使えない場合はロックなしで送る */ }
    return true;
  }
  function releaseFlushLock() {
    try {
      const lock = JSON.parse(localStorage.getItem(FLUSH_LOCK_KEY) || 'null');
      if (lock && lock.owner === tabId) localStorage.removeItem(FLUSH_LOCK_KEY);
    } catch { /* noop */ }
  }

  // 1件送信。GASへの保存を確認できなければ例外
  async function sendPendingRecord(item) {
    // 再送時は先に存在を確認する：前回の送信が実は届いていた場合に二重登録しない
    // （GASの再デプロイ前＝同一IDチェックがないGASでも二重にならないように）
    if (item.attempts > 0) {
      const saved = await gasRequest('getTimeRecords', { date: item.record.date });
      if (Array.isArray(saved) && saved.some(r => String(r.id) === String(item.record.id))) return;
    }
    await gasRequest('addTimeRecord', { record: item.record });
  }

  function flushPendingTimeRecords() {
    if (flushPromise) return flushPromise;
    flushPromise = (async () => {
      if (!useGas) {
        // ローカルモード：端末内の打刻記録へ移す
        const pending = getPendingTimeRecords();
        if (pending.length === 0) return;
        const all = localGet('time_records');
        pending.forEach(i => { if (!all.some(r => r.id === i.record.id)) all.push(i.record); });
        localSet('time_records', all);
        savePending([]);
        return;
      }
      if (getPendingTimeRecords().length === 0 || !acquireFlushLock()) return;
      sending = true;
      notifyPending();
      const tried = new Set();
      try {
        // 送信中に追加された打刻も拾うため、毎回キューを読み直す
        for (;;) {
          const item = getPendingTimeRecords().find(i => !tried.has(i.record.id));
          if (!item) break;
          tried.add(item.record.id);
          acquireFlushLock(); // ロック延長
          try {
            await sendPendingRecord(item);
            savePending(getPendingTimeRecords().filter(i => i.record.id !== item.record.id));
          } catch (e) {
            console.warn('打刻の送信に失敗しました:', e.message);
            savePending(getPendingTimeRecords().map(i => i.record.id === item.record.id
              ? { ...i, attempts: i.attempts + 1, lastError: e.message, lastTriedAt: Utils.now() } : i));
            if (!e.fromGas) break; // 通信エラーなら残りも失敗するので次回の再送に回す
          }
          notifyPending();
        }
      } finally {
        sending = false;
        releaseFlushLock();
        notifyPending();
      }
    })().finally(() => { flushPromise = null; });
    return flushPromise;
  }

  // 打刻を記録する。GASへの保存を確認できたら true、未送信としてキューに残ったら false
  async function addTimeRecordQueued(record) {
    try {
      const list = getPendingTimeRecords();
      list.push({ record, queuedAt: Utils.now(), attempts: 0, lastError: '' });
      savePending(list);
    } catch (e) {
      // 端末に保存できない場合（プライベートモード等）は直接送る
      console.warn('未送信キューに保存できません:', e.message);
      await addTimeRecord(record);
      return true;
    }
    notifyPending();
    await flushPendingTimeRecords();
    return !getPendingTimeRecords().some(i => i.record.id === record.id);
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

  // ===== 時給履歴・最低賃金 =====
  // シート上はテキストのため、日付は 'YYYY-MM-DD'、金額は数値に正規化する
  function normalizeDateStr(value) {
    const m = String(value || '').trim().replace(/\//g, '-').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
  }
  function toYen(value) {
    if (value === null || value === undefined || value === '') return NaN;
    return Number(String(value).replace(/[,円\s]/g, ''));
  }
  const byEffectiveDate = (a, b) => a.effectiveDate.localeCompare(b.effectiveDate);

  function normalizeWageHistory(list) {
    return (list || []).map(h => ({
      id: String(h.id || ''),
      staffId: String(h.staffId || ''),
      effectiveDate: normalizeDateStr(h.effectiveDate),
      hourlyWage: toYen(h.hourlyWage),
      note: String(h.note || ''),
      createdAt: String(h.createdAt || '')
    })).filter(h => h.staffId && h.effectiveDate && h.hourlyWage > 0).sort(byEffectiveDate);
  }

  function normalizeMinWages(list) {
    return (list || []).map(m => ({
      id: String(m.id || ''),
      effectiveDate: normalizeDateStr(m.effectiveDate),
      minWage: toYen(m.minWage),
      note: String(m.note || '')
    })).filter(m => m.effectiveDate && m.minWage > 0).sort(byEffectiveDate);
  }

  // GASが時給履歴に未対応（再デプロイ前）のときのエラーを分かりやすくする
  function toWriteError(e) {
    if (/Unknown action/.test(e.message)) return new Error('GASの再デプロイが必要です（時給履歴に未対応のGASです）');
    return e;
  }

  // 取得できない場合は null（呼び出し側で旧仕様の時給にフォールバックする）
  async function getWageHistory() {
    if (useGas) {
      try { return normalizeWageHistory(await gasRequest('getWageHistory')); }
      catch (e) { console.warn('GAS getWageHistory failed:', e.message); return null; }
    }
    return normalizeWageHistory(localGet('wage_history'));
  }

  // 書き込みは localStorage にフォールバックしない（端末ごとに時給がずれるのを防ぐ）
  // baseEntry: ローカルモードで初回追加時に保存する初期時給（GASモードではGAS側で移行済み）
  async function addWageHistory(entry, baseEntry) {
    if (useGas) {
      try { return await gasRequest('addWageHistory', { entry }); }
      catch (e) { throw toWriteError(e); }
    }
    const all = localGet('wage_history');
    if (baseEntry && !all.some(h => String(h.staffId) === String(entry.staffId))) {
      all.push({ ...baseEntry, id: Utils.generateId(), createdAt: Utils.now() });
    }
    const saved = { ...entry, id: Utils.generateId(), createdAt: Utils.now() };
    all.push(saved);
    localSet('wage_history', all);
    return saved;
  }

  async function deleteWageHistory(staffId, id) {
    if (useGas) {
      try { await gasRequest('deleteWageHistory', { staffId, id }); return; }
      catch (e) { throw toWriteError(e); }
    }
    localSet('wage_history', localGet('wage_history').filter(h => h.id !== id));
  }

  // 取得できない場合は null（呼び出し側で初期データにフォールバックする）
  async function getMinWages() {
    if (useGas) {
      try { return normalizeMinWages(await gasRequest('getMinWages')); }
      catch (e) { console.warn('GAS getMinWages failed:', e.message); return null; }
    }
    const local = localGet('min_wage');
    return local.length > 0 ? normalizeMinWages(local) : null;
  }

  async function addMinWage(entry) {
    if (useGas) {
      try { return await gasRequest('addMinWage', { entry }); }
      catch (e) { throw toWriteError(e); }
    }
    const all = localGet('min_wage');
    if (all.length === 0) Calc.DEFAULT_MIN_WAGES.forEach(m => all.push({ ...m, id: Utils.generateId() }));
    const saved = { ...entry, id: Utils.generateId() };
    all.push(saved);
    localSet('min_wage', all);
    return saved;
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

  // PIN（デフォルト: 0511）
  const DEFAULT_PIN = '0511';
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
    _staffCache = null;
  }

  init();

  return {
    init, setGasUrl, getGasUrl, isGasMode, clearStaffCache,
    getStaff, getAllStaff, saveStaff, deleteStaff,
    getTimeRecords, getTimeRecordsByMonth, getTimeRecordsByRange,
    addTimeRecord, updateTimeRecord, deleteTimeRecord,
    addTimeRecordQueued, flushPendingTimeRecords, getPendingTimeRecords, isSendingPending, onPendingChange, PENDING_KEY,
    getShifts, saveShift, deleteShift, saveShiftsBulk,
    getWageHistory, addWageHistory, deleteWageHistory, getMinWages, addMinWage,
    getSetting, setSetting, getPin, setPin, verifyPin,
    exportAllData, importAllData, resetAllData,
    gasRequest
  };
})();
