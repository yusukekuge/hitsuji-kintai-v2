// ===== 画面6：シフト作成（管理者用・編集＋保存） =====
const ShiftEditScreen = (() => {
  let currentYear, currentMonth;

  function init() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
  }

  async function render() {
    if (currentYear === undefined) init();
    const container = document.getElementById('screen-shift-edit');
    const staff = await Storage.getStaff();
    const shifts = await Storage.getShifts(currentYear, currentMonth);
    const daysInMonth = Utils.getDaysInMonth(currentYear, currentMonth);
    const todayStr = Utils.today();

    const dateHeaders = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = Utils.getDayOfWeek(currentYear, currentMonth, d);
      dateHeaders.push({ d, dateStr, dow, dayName: Utils.DAY_NAMES[dow] });
    }

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title">シフト作成・編集</h3>
        <div class="flex-between mb-16" style="flex-wrap:wrap;gap:8px;">
          <div class="month-nav" style="margin-bottom:0;">
            <button class="btn btn-sm btn-secondary" id="se-prev">&lt;</button>
            <span class="month-label">${currentYear}年${currentMonth + 1}月</span>
            <button class="btn btn-sm btn-secondary" id="se-next">&gt;</button>
          </div>
          <div class="btn-group no-print">
            <button class="btn btn-sm btn-primary" id="se-save">保存</button>
          </div>
        </div>

        <div class="table-wrap">
          <div class="shift-calendar" style="grid-template-columns: 70px repeat(${daysInMonth}, minmax(38px, 1fr));">
            <div class="shift-header-cell">名前</div>
            ${dateHeaders.map(h => `
              <div class="shift-header-cell ${h.dow === 0 ? 'sunday' : h.dow === 6 ? 'saturday' : ''}" style="${h.dow === 0 ? 'color:var(--danger);' : h.dow === 6 ? 'color:var(--info);' : ''}">
                ${h.d}<br>${h.dayName}
              </div>
            `).join('')}

            ${staff.map(s => {
              const staffShifts = {};
              shifts.filter(sh => sh.staffId === s.id).forEach(sh => { staffShifts[sh.date] = sh; });
              return `
                <div class="shift-name-cell">${Utils.escapeHtml(s.name)}</div>
                ${dateHeaders.map(h => {
                  const sh = staffShifts[h.dateStr];
                  const isToday = h.dateStr === todayStr;
                  return `
                    <div class="shift-cell ${isToday ? 'today' : ''} ${h.dow === 0 ? 'sunday' : h.dow === 6 ? 'saturday' : ''}">
                      <input type="text" class="shift-input" data-staff="${s.id}" data-date="${h.dateStr}" data-field="start"
                        value="${sh ? sh.startTime || '' : ''}" placeholder="--:--" maxlength="5">
                      <input type="text" class="shift-input" data-staff="${s.id}" data-date="${h.dateStr}" data-field="end"
                        value="${sh ? sh.endTime || '' : ''}" placeholder="--:--" maxlength="5">
                    </div>
                  `;
                }).join('')}
              `;
            }).join('')}

            ${staff.length === 0 ? `<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-light);">スタッフが登録されていません</div>` : ''}
          </div>
        </div>
      </div>
    `;

    document.getElementById('se-prev').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      render();
    });
    document.getElementById('se-next').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      render();
    });

    document.getElementById('se-save').addEventListener('click', saveShifts);
  }

  async function saveShifts() {
    const inputs = document.querySelectorAll('.shift-input');
    const shiftMap = {};

    inputs.forEach(input => {
      const key = `${input.dataset.staff}_${input.dataset.date}`;
      if (!shiftMap[key]) {
        shiftMap[key] = { staffId: input.dataset.staff, date: input.dataset.date, startTime: '', endTime: '' };
      }
      if (input.dataset.field === 'start') shiftMap[key].startTime = input.value.trim();
      if (input.dataset.field === 'end') shiftMap[key].endTime = input.value.trim();
    });

    const shifts = Object.values(shiftMap).filter(sh => sh.startTime || sh.endTime);
    await Storage.saveShiftsBulk(shifts);
    Utils.showToast('シフトを保存しました', 'success');
  }

  return { render };
})();
