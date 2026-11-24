// ===== 画面1：打刻画面 =====
const ClockScreen = (() => {
  let selectedStaffId = null;
  let cachedStaff = null;
  let cachedRecords = null;
  let todayLoaded = true; // 今日の打刻をGASから読めたか（読めないときは状態で絞り込まない）

  // 今日の状態ごとに押せる打刻
  const ALLOWED_TYPES = {
    none: ['clock_in'],
    working: ['break_start', 'clock_out'],
    break: ['break_end'],
    done: []
  };

  // 押せない（グレーの）ボタンを押したときの案内
  function unavailableMessage(status, type) {
    if (status === 'none') return 'まだ出勤の記録がありません。出勤を押し忘れた場合は、店長に伝えてください';
    if (status === 'done') return '本日は退勤済みです。打刻を間違えた場合は、店長に伝えてください';
    if (status === 'break') {
      return type === 'break_start' ? 'すでに休憩中です。戻るときは「休憩終了」を押してください'
        : '休憩中です。先に「休憩終了」を押してください';
    }
    // 勤務中
    return type === 'clock_in' ? 'すでに出勤しています。出勤の記録を間違えた場合は、店長に伝えてください'
      : '休憩中ではありません。休憩開始を押し忘れた場合は、店長に伝えてください';
  }

  async function render() {
    const container = document.getElementById('screen-clock');
    const todayStr = Utils.today();
    const [staff, today] = await Promise.all([
      Storage.getStaff(),
      Storage.getTimeRecordsChecked(todayStr)
    ]);
    const records = today.records;
    todayLoaded = today.loaded;
    cachedStaff = staff;
    cachedRecords = mergePending(records, todayStr);

    renderUI(container, staff, cachedRecords, todayStr);
  }

  // 未送信キューの打刻を当日分の表示に合流させる（GASにまだない打刻も状態に反映する）
  function mergePending(records, todayStr) {
    const ids = new Set(records.map(r => r.id));
    const pending = Storage.getPendingTimeRecords()
      .map(i => i.record)
      .filter(r => r.date === todayStr && !ids.has(r.id));
    return records.concat(pending);
  }

  // 送信状態（上部の「送信中…」と、未送信がある間ずっと出る赤い帯）
  function renderSyncStatusHTML() {
    const pending = Storage.getPendingTimeRecords();
    const sending = Storage.isSendingPending();
    // 1回目の送信中だけは「送信中…」のみ。失敗したもの・前回から残っているものがあれば赤い帯
    const showBanner = pending.length > 0 && !(sending && pending.every(i => i.attempts === 0));
    return `
      ${sending ? '<div class="sync-sending">送信中…</div>' : ''}
      ${showBanner ? `
        <div class="sync-banner" role="alert">
          <span>⚠ 未送信の打刻が${pending.length}件あります。自動で再送しています</span>
          <button class="btn btn-sm btn-danger" id="sync-retry-btn" ${sending ? 'disabled' : ''}>今すぐ再送</button>
        </div>` : ''}
    `;
  }

  // UIだけ再描画（データ取得なし＝即座に完了）
  function renderUI(container, staff, records, todayStr) {
    const pendingById = new Map(Storage.getPendingTimeRecords().map(i => [i.record.id, i]));
    const sending = Storage.isSendingPending();
    const allRecords = mergePending(records, todayStr);
    const statuses = {};
    staff.forEach(s => {
      const sr = allRecords.filter(r => r.staffId === s.id).sort((a, b) => a.time.localeCompare(b.time));
      const last = sr[sr.length - 1];
      const pendingItems = sr.map(r => pendingById.get(r.id)).filter(Boolean);
      // 1回目の送信中は「送信中」、失敗済み・残っているものは「未送信」
      const pendingMark = pendingItems.length === 0 ? ''
        : sending && pendingItems.every(i => i.attempts === 0) ? '<span class="badge badge-warning">送信中</span>'
        : '<span class="badge badge-danger">未送信</span>';
      if (!last) {
        statuses[s.id] = { status: 'none', label: '未出勤', cssClass: '' };
      } else if (last.type === 'clock_in') {
        statuses[s.id] = { status: 'working', label: `勤務中 ${Utils.formatTime(last.time)}出勤`, cssClass: 'status-working' };
      } else if (last.type === 'break_start') {
        statuses[s.id] = { status: 'break', label: `休憩中 ${Utils.formatTime(last.time)}〜`, cssClass: 'status-break' };
      } else if (last.type === 'break_end') {
        statuses[s.id] = { status: 'working', label: `勤務中（休憩戻り ${Utils.formatTime(last.time)}）`, cssClass: 'status-working' };
      } else if (last.type === 'clock_out') {
        statuses[s.id] = { status: 'done', label: `退勤済 ${Utils.formatTime(last.time)}`, cssClass: 'status-done' };
      } else {
        statuses[s.id] = { status: 'unknown', label: '状態不明', cssClass: '' };
      }
      statuses[s.id].pendingMark = pendingMark;
    });

    // 選んだスタッフの今日の状態に合わせて、押せるボタンを決める
    // （今日の打刻を読めなかったとき・状態不明のときは絞り込まない＝打刻できなくなるのを防ぐ）
    const selected = selectedStaffId ? statuses[selectedStaffId] : null;
    const restrict = !!selected && todayLoaded && ALLOWED_TYPES[selected.status] !== undefined;
    const buttonAttrs = type => {
      if (!selected) return 'disabled';
      if (!restrict || ALLOWED_TYPES[selected.status].includes(type)) return '';
      return 'aria-disabled="true" data-unavailable="1"';
    };
    const selectedStaff = selected ? staff.find(s => s.id === selectedStaffId) : null;
    const clockNote = !selected ? 'スタッフを選んでください'
      : !todayLoaded ? `${Utils.escapeHtml(selectedStaff.name)}さん`
      : selected.status === 'done' ? '本日は退勤済みです'
      : `${Utils.escapeHtml(selectedStaff.name)}さん：${selected.label}`;

    container.innerHTML = `
      <div id="clock-sync-status">${renderSyncStatusHTML()}</div>

      <div class="card">
        <div class="clock-display">
          <div class="date">${Utils.formatDateJP(new Date())}</div>
          <div class="time" id="clock-time">${Utils.formatTime(new Date())}</div>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">スタッフ選択</h3>
        <div class="staff-grid">
          ${staff.map(s => `
            <button class="staff-btn ${statuses[s.id].cssClass} ${selectedStaffId === s.id ? 'selected' : ''}" data-id="${s.id}">
              ${Utils.escapeHtml(s.name)}
              <span class="staff-status">${statuses[s.id].label}</span>
            </button>
          `).join('')}
          ${staff.length === 0 ? '<p style="color:var(--text-light);grid-column:1/-1;text-align:center;">スタッフが登録されていません。管理者メニューからスタッフを登録してください。</p>' : ''}
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">打刻</h3>
        <p class="clock-note ${selected && selected.status === 'done' ? 'clock-note-done' : ''}">${clockNote}</p>
        ${selected && !todayLoaded ? '<p class="clock-note clock-note-warn">通信できないため、今日の打刻の状態を確認できません。押す打刻を確認してください。</p>' : ''}
        <div class="clock-actions">
          <button class="btn btn-success clock-btn" data-type="clock_in" ${buttonAttrs('clock_in')}>出勤</button>
          <button class="btn btn-warning clock-btn" data-type="break_start" ${buttonAttrs('break_start')}>休憩開始</button>
          <button class="btn btn-primary clock-btn" data-type="break_end" ${buttonAttrs('break_end')}>休憩終了</button>
          <button class="btn btn-danger clock-btn" data-type="clock_out" ${buttonAttrs('clock_out')}>退勤</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">本日の勤務状況</h3>
        <ul class="status-list">
          ${staff.map(s => `
            <li class="status-item">
              <span class="name">${Utils.escapeHtml(s.name)}</span>
              <span>
                ${statuses[s.id].pendingMark}
                <span class="badge ${statuses[s.id].status === 'working' ? 'badge-success' :
                  statuses[s.id].status === 'break' ? 'badge-warning' :
                  statuses[s.id].status === 'done' ? 'badge-info' : ''}">${statuses[s.id].label}</span>
              </span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    container.querySelectorAll('.staff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedStaffId = btn.dataset.id;
        // キャッシュからUI再描画（GAS通信なし＝即座）
        if (cachedStaff && cachedRecords) {
          renderUI(container, cachedStaff, cachedRecords, Utils.today());
        }
      });
    });

    container.querySelectorAll('.clock-actions .btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // グレーのボタン：打刻せず、理由を案内する
        if (btn.dataset.unavailable) {
          Utils.showToast(unavailableMessage(selected.status, btn.dataset.type), 'error');
          return;
        }
        handleClock(btn, btn.dataset.type);
      });
    });

    bindSyncStatusEvents();
  }

  function bindSyncStatusEvents() {
    document.getElementById('sync-retry-btn')?.addEventListener('click', () => {
      Storage.flushPendingTimeRecords();
    });
  }

  // 未送信キューの状態が変わったときに呼ばれる（app.js から）
  // 送信済みになった打刻も表示に残るよう、キューの打刻をキャッシュへ取り込んでから描画する
  function refreshSyncStatus() {
    const container = document.getElementById('screen-clock');
    if (!container || !cachedStaff || !cachedRecords) return;
    // 今日の打刻を読めていなかった場合は、送信が終わったところで読み直す（通信が戻れば状態の絞り込みも戻る）
    if (!todayLoaded && !Storage.isSendingPending()) {
      render();
      return;
    }
    cachedRecords = mergePending(cachedRecords, Utils.today());
    renderUI(container, cachedStaff, cachedRecords, Utils.today());
  }

  async function handleClock(btn, type) {
    if (!selectedStaffId || !cachedStaff) return;
    const s = cachedStaff.find(st => st.id === selectedStaffId);
    if (!s) return;

    const typeLabels = { clock_in: '出勤', break_start: '休憩開始', break_end: '休憩終了', clock_out: '退勤' };
    const now = new Date();
    const timeStr = Utils.formatTime(now);

    // 確認ダイアログ（GAS通信なし＝即表示）
    const ok = await Utils.showConfirm('打刻確認', `${s.name}さんの${typeLabels[type]}を${timeStr}で記録しますか？`);
    if (!ok) return;

    // ボタンをローディング状態に
    Utils.btnLoading(btn, true);

    // ID と時刻は「ボタンを押した時点」で確定し、再送してもこのまま送る
    const record = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Utils.generateId() + Utils.generateId(),
      staffId: selectedStaffId,
      date: Utils.formatDate(now),
      type: type,
      time: now.toISOString(),
      modified: false
    };

    // 未送信キューに保存 → GASへ送信。成功を確認できたら今まで通りのトースト
    let saved = false;
    try {
      saved = await Storage.addTimeRecordQueued(record);
    } catch (e) {
      console.error('打刻の保存に失敗しました:', e);
    }
    if (cachedRecords && !cachedRecords.some(r => r.id === record.id)) cachedRecords.push(record);
    if (saved) {
      Utils.showToast(`${s.name}さん：${typeLabels[type]}（${timeStr}）`, 'success');
    } else {
      Utils.showToast(`${s.name}さんの${typeLabels[type]}（${timeStr}）を送信できませんでした。端末に保存し、自動で再送します`, 'error');
    }
    refreshSyncStatus();
  }

  return { render, refreshSyncStatus };
})();
