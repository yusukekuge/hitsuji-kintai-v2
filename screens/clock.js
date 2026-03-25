// ===== 画面1：打刻画面 =====
const ClockScreen = (() => {
  let selectedStaffId = null;

  async function render() {
    const container = document.getElementById('screen-clock');
    const todayStr = Utils.today();
    const [staff, records] = await Promise.all([
      Storage.getStaff(),
      Storage.getTimeRecords(todayStr)
    ]);

    const statuses = {};
    staff.forEach(s => {
      const sr = records.filter(r => r.staffId === s.id).sort((a, b) => a.time.localeCompare(b.time));
      const last = sr[sr.length - 1];
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
      }
    });

    container.innerHTML = `
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
        <div class="clock-actions">
          <button class="btn btn-success clock-btn" data-type="clock_in" ${!selectedStaffId ? 'disabled' : ''}>出勤</button>
          <button class="btn btn-warning clock-btn" data-type="break_start" ${!selectedStaffId ? 'disabled' : ''}>休憩開始</button>
          <button class="btn btn-primary clock-btn" data-type="break_end" ${!selectedStaffId ? 'disabled' : ''}>休憩終了</button>
          <button class="btn btn-danger clock-btn" data-type="clock_out" ${!selectedStaffId ? 'disabled' : ''}>退勤</button>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">本日の勤務状況</h3>
        <ul class="status-list">
          ${staff.map(s => `
            <li class="status-item">
              <span class="name">${Utils.escapeHtml(s.name)}</span>
              <span class="badge ${statuses[s.id].status === 'working' ? 'badge-success' :
                statuses[s.id].status === 'break' ? 'badge-warning' :
                statuses[s.id].status === 'done' ? 'badge-info' : ''}">${statuses[s.id].label}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;

    container.querySelectorAll('.staff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedStaffId = btn.dataset.id;
        render();
      });
    });

    container.querySelectorAll('.clock-actions .btn').forEach(btn => {
      btn.addEventListener('click', () => handleClock(btn, btn.dataset.type));
    });
  }

  async function handleClock(btn, type) {
    if (!selectedStaffId) return;

    await Utils.withLoading(btn, async () => {
      const staff = await Storage.getStaff();
      const s = staff.find(st => st.id === selectedStaffId);
      if (!s) return;

      const typeLabels = { clock_in: '出勤', break_start: '休憩開始', break_end: '休憩終了', clock_out: '退勤' };
      const now = new Date();
      const timeStr = Utils.formatTime(now);

      const record = {
        id: Utils.generateId(),
        staffId: selectedStaffId,
        date: Utils.today(),
        type: type,
        time: now.toISOString(),
        modified: false
      };

      await Storage.addTimeRecord(record);
      Utils.showToast(`${s.name}さん：${typeLabels[type]}（${timeStr}）`, 'success');
      await render();
    });
  }

  return { render };
})();
