// ===== 画面4：勤務記録一覧 =====
const RecordsScreen = (() => {
  let currentYear, currentMonth, filterStaffId = 'all';

  function init() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
  }

  async function render() {
    if (currentYear === undefined) init();
    const container = document.getElementById('screen-records');
    const staff = await Storage.getStaff();
    const records = await Storage.getTimeRecordsByMonth(currentYear, currentMonth);
    const daysInMonth = Utils.getDaysInMonth(currentYear, currentMonth);

    const filteredStaff = filterStaffId === 'all' ? staff : staff.filter(s => s.id === filterStaffId);

    const dayData = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      filteredStaff.forEach(s => {
        const dw = Calc.calcDayWork(records, s.id, dateStr);
        if (dw.clockIn || dw.clockOut) {
          dayData.push({ ...dw, staffName: s.name });
        }
      });
    }

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title">勤務記録一覧</h3>
        <div class="flex-between mb-16" style="flex-wrap:wrap;gap:8px;">
          <div class="month-nav" style="margin-bottom:0;">
            <button class="btn btn-sm btn-secondary" id="rec-prev">&lt;</button>
            <span class="month-label">${currentYear}年${currentMonth + 1}月</span>
            <button class="btn btn-sm btn-secondary" id="rec-next">&gt;</button>
          </div>
          <div class="form-inline">
            <label class="form-label" style="margin-bottom:0;">スタッフ:</label>
            <select class="form-select" id="rec-staff-filter" style="width:auto;">
              <option value="all">全員</option>
              ${staff.map(s => `<option value="${s.id}" ${filterStaffId === s.id ? 'selected' : ''}>${Utils.escapeHtml(s.name)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>日付</th><th>スタッフ</th><th>出勤</th><th>退勤</th><th>休憩</th><th>実働</th><th>深夜</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${dayData.length === 0 ? '<tr><td colspan="8" style="text-align:center;color:var(--text-light);">記録がありません</td></tr>' : ''}
              ${dayData.map(dw => `
                <tr>
                  <td>${Utils.formatDateJP(dw.date)}</td>
                  <td>${Utils.escapeHtml(dw.staffName)}</td>
                  <td>${dw.clockIn ? Utils.formatTime(dw.clockIn) : '-'}</td>
                  <td>${dw.clockOut ? Utils.formatTime(dw.clockOut) : '-'}</td>
                  <td class="num">${dw.breakMinutes > 0 ? Utils.minutesToHM(dw.breakMinutes) : '-'}</td>
                  <td class="num">${dw.isComplete ? Utils.minutesToHM(dw.workMinutes) : '-'}</td>
                  <td class="num">${dw.nightMinutes > 0 ? Utils.minutesToHM(dw.nightMinutes) : '-'}</td>
                  <td><button class="btn btn-sm btn-secondary rec-edit-btn" data-staff="${dw.staffId}" data-date="${dw.date}">修正</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('rec-prev').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      render();
    });
    document.getElementById('rec-next').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      render();
    });
    document.getElementById('rec-staff-filter').addEventListener('change', (e) => {
      filterStaffId = e.target.value;
      render();
    });

    container.querySelectorAll('.rec-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => editRecord(btn.dataset.staff, btn.dataset.date));
    });
  }

  async function editRecord(staffId, date) {
    const records = await Storage.getTimeRecords(date);
    const staffRecords = records.filter(r => r.staffId === staffId).sort((a, b) => a.time.localeCompare(b.time));
    const staff = await Storage.getStaff();
    const s = staff.find(st => st.id === staffId);

    const typeLabels = { clock_in: '出勤', break_start: '休憩開始', break_end: '休憩終了', clock_out: '退勤' };

    function toHHMM(timeStr) {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return '00:00';
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }

    function isValidHHMM(val) {
      return /^([01]\d|2[0-3]):([0-5]\d)$/.test(val);
    }

    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = `${s ? s.name : ''} - ${Utils.formatDateJP(date)} の打刻修正`;
    const msgEl = document.getElementById('confirm-message');
    msgEl.innerHTML = `
      <div style="text-align:left;max-height:360px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <tbody>
            ${staffRecords.map(r => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px 4px;white-space:nowrap;font-weight:600;width:80px;">${typeLabels[r.type] || r.type}</td>
                <td style="padding:8px 4px;">
                  <input type="text" class="form-input edit-time-input" data-id="${r.id}" data-type="${r.type}" value="${toHHMM(r.time)}" pattern="[0-9]{2}:[0-9]{2}" placeholder="00:00" maxlength="5" style="width:100px;padding:6px 8px;font-size:16px;text-align:center;">
                </td>
                <td style="padding:8px 4px;text-align:right;white-space:nowrap;">
                  <button class="btn btn-sm btn-primary edit-save-btn" data-id="${r.id}" data-type="${r.type}">修正</button>
                  <button class="btn btn-sm btn-danger edit-delete-btn" data-id="${r.id}" data-type="${r.type}" style="margin-left:4px;">削除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${staffRecords.length === 0 ? '<p style="color:var(--text-light);text-align:center;">打刻記録がありません</p>' : ''}
        <div style="margin-top:16px;padding-top:12px;border-top:2px solid var(--border);">
          <div style="font-weight:600;margin-bottom:8px;">打刻追加</div>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:4px;">
                <select id="edit-add-type" class="form-select" style="width:100%;padding:6px 8px;">
                  <option value="clock_in">出勤</option>
                  <option value="break_start">休憩開始</option>
                  <option value="break_end">休憩終了</option>
                  <option value="clock_out">退勤</option>
                </select>
              </td>
              <td style="padding:4px;">
                <input type="text" id="edit-add-time" class="form-input" pattern="[0-9]{2}:[0-9]{2}" placeholder="00:00" maxlength="5" style="width:100px;padding:6px 8px;font-size:16px;text-align:center;">
              </td>
              <td style="padding:4px;text-align:right;">
                <button class="btn btn-sm btn-primary" id="edit-add-btn">追加</button>
              </td>
            </tr>
          </table>
        </div>
      </div>
    `;
    modal.classList.add('active');

    // 修正ボタン
    msgEl.querySelectorAll('.edit-save-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const typeName = typeLabels[btn.dataset.type] || btn.dataset.type;
        const input = msgEl.querySelector(`.edit-time-input[data-id="${id}"]`);
        const timeVal = input.value.trim();
        if (!isValidHHMM(timeVal)) {
          Utils.showToast('時刻はHH:MM形式で入力してください（例: 09:07）', 'error');
          return;
        }
        if (!confirm(`${typeName}の打刻時間を ${timeVal} に修正しますか？`)) return;
        const rec = staffRecords.find(r => r.id === id);
        if (rec) {
          const [h, m] = timeVal.split(':').map(Number);
          const newTime = new Date(rec.time);
          newTime.setHours(h, m, 0, 0);
          rec.time = newTime.toISOString();
          rec.modified = true;
          await Storage.updateTimeRecord(rec);
          Utils.showToast('打刻時刻を修正しました', 'success');
          modal.classList.remove('active');
          render();
        }
      });
    });

    // 削除ボタン
    msgEl.querySelectorAll('.edit-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const typeName = typeLabels[btn.dataset.type] || btn.dataset.type;
        if (!confirm(`${typeName}の打刻を削除しますか？\nこの操作は元に戻せません。`)) return;
        await Storage.deleteTimeRecord(btn.dataset.id);
        Utils.showToast('打刻を削除しました');
        modal.classList.remove('active');
        render();
      });
    });

    // 追加
    document.getElementById('edit-add-btn')?.addEventListener('click', async () => {
      const type = document.getElementById('edit-add-type').value;
      const timeVal = document.getElementById('edit-add-time').value.trim();
      if (!isValidHHMM(timeVal)) {
        Utils.showToast('時刻はHH:MM形式で入力してください（例: 09:07）', 'error');
        return;
      }
      const [h, m] = timeVal.split(':').map(Number);
      const newTime = new Date(date);
      newTime.setHours(h, m, 0, 0);
      await Storage.addTimeRecord({
        id: Utils.generateId(), staffId, date, type,
        time: newTime.toISOString(), modified: true
      });
      Utils.showToast('打刻を追加しました', 'success');
      modal.classList.remove('active');
      render();
    });

    // OKボタンでモーダル閉じる
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    function closeEditModal() {
      modal.classList.remove('active');
      okBtn.removeEventListener('click', closeEditModal);
      cancelBtn.removeEventListener('click', closeEditModal);
      render();
    }
    okBtn.addEventListener('click', closeEditModal);
    cancelBtn.addEventListener('click', closeEditModal);
  }

  return { render };
})();
