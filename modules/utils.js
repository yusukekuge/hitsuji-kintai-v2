// ===== ユーティリティモジュール =====
const Utils = (() => {
  // 日付フォーマット
  function formatDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function formatDateJP(date) {
    const d = new Date(date);
    const days = ['日','月','火','水','木','金','土'];
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日(${days[d.getDay()]})`;
  }

  function formatTime(date) {
    const d = new Date(date);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function formatDateTime(date) {
    return formatDate(date) + ' ' + formatTime(date);
  }

  // 時間文字列 "HH:MM" をその日の Date に変換
  function timeToDate(dateStr, timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(dateStr);
    d.setHours(h, m, 0, 0);
    return d;
  }

  // 分を "HH:MM" に変換
  function minutesToHM(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${String(m).padStart(2,'0')}`;
  }

  // 分を "H時間M分" に変換
  function minutesToHMJP(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時間`;
    return `${h}時間${m}分`;
  }

  // 金額フォーマット
  function formatCurrency(amount) {
    return '¥' + Math.floor(amount).toLocaleString('ja-JP');
  }

  // UUID生成
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // 月の日数を取得
  function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  // 曜日取得
  function getDayOfWeek(year, month, day) {
    return new Date(year, month, day).getDay();
  }

  // 曜日名
  const DAY_NAMES = ['日','月','火','水','木','金','土'];

  // 今日の日付文字列
  function today() {
    return formatDate(new Date());
  }

  // 現在時刻文字列
  function now() {
    return new Date().toISOString();
  }

  // 2つの日時の差を分で返す
  function diffMinutes(start, end) {
    return Math.floor((new Date(end) - new Date(start)) / 60000);
  }

  // トースト表示
  function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => { toast.className = 'toast'; }, 3000);
  }

  // 確認モーダル
  function showConfirm(title, message) {
    return new Promise(resolve => {
      const modal = document.getElementById('confirm-modal');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      modal.classList.add('active');
      const ok = document.getElementById('confirm-ok');
      const cancel = document.getElementById('confirm-cancel');
      function cleanup() {
        modal.classList.remove('active');
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
      }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
    });
  }

  // HTML エスケープ
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 締め期間を計算（前月21日〜当月20日）
  function getPayPeriod(year, month) {
    // month: 0-indexed
    let startYear = year, startMonth = month - 1;
    if (startMonth < 0) { startMonth = 11; startYear--; }
    const start = `${startYear}-${String(startMonth+1).padStart(2,'0')}-21`;
    const end = `${year}-${String(month+1).padStart(2,'0')}-20`;
    return { start, end };
  }

  // 日付が範囲内かチェック
  function isDateInRange(date, start, end) {
    return date >= start && date <= end;
  }

  return {
    formatDate, formatDateJP, formatTime, formatDateTime,
    timeToDate, minutesToHM, minutesToHMJP, formatCurrency,
    generateId, getDaysInMonth, getDayOfWeek, DAY_NAMES,
    today, now, diffMinutes, showToast, showConfirm, escapeHtml,
    getPayPeriod, isDateInRange
  };
})();
