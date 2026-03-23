// ===== 画面7：スタッフ管理 =====
const StaffScreen = (() => {
  let editingId = null;

  function formatHireDate(dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return `${y}年${m}月${d}日`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  async function render() {
    const container = document.getElementById('screen-staff');
    const activeStaff = await Storage.getStaff();

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title">スタッフ管理</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:16px;">登録人数：${activeStaff.length}</p>

        <div class="table-wrap mb-16">
          <table>
            <thead>
              <tr><th>氏名</th><th>時給</th><th>試用期間</th><th>通勤距離</th><th>入社日</th><th>その他手当</th><th>源泉区分</th><th>扶養人数</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${activeStaff.map(s => `
                <tr>
                  <td><strong>${Utils.escapeHtml(s.name)}</strong></td>
                  <td class="num">${Utils.formatCurrency(s.hourlyWage || 1150)}</td>
                  <td>${s.probation ? '<span class="badge badge-warning">試用期間</span>' : '-'}</td>
                  <td class="num">${s.commuteDistance || 0}km</td>
                  <td>${s.hireDate ? formatHireDate(s.hireDate) : '-'}</td>
                  <td class="num">${Utils.formatCurrency(s.otherAllowance || 0)}</td>
                  <td>${(s.taxCategory || 'kou') === 'kou' ? '<span class="badge badge-info">甲欄</span>' : '<span class="badge badge-warning">乙欄</span>'}</td>
                  <td class="num">${(s.taxCategory || 'kou') === 'kou' ? (s.dependents || 0) + '人' : '-'}</td>
                  <td>
                    <div class="btn-group">
                      <button class="btn btn-sm btn-primary staff-edit-btn" data-id="${s.id}">編集</button>
                      <button class="btn btn-sm btn-danger staff-delete-btn" data-id="${s.id}">削除</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
              ${activeStaff.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:var(--text-light);">スタッフが登録されていません</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <h3 class="card-title">${editingId ? 'スタッフ編集' : '新規スタッフ登録'}</h3>
        <form id="staff-form">
          <div class="form-row">
            <div class="form-group"><label class="form-label">氏名 *</label><input type="text" class="form-input" id="sf-name" required maxlength="20"></div>
            <div class="form-group"><label class="form-label">時給（円）</label><input type="number" class="form-input" id="sf-wage" value="1150" min="0" max="5000"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">通勤距離（km）</label><input type="number" class="form-input" id="sf-distance" value="0" min="0" max="100" step="0.1"></div>
            <div class="form-group"><label class="form-label">入社日</label><input type="date" class="form-input" id="sf-hire-date"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">その他手当（円/月）</label><input type="number" class="form-input" id="sf-other" value="0" min="0"></div>
            <div class="form-group"><label class="form-label">試用期間</label>
              <select class="form-select" id="sf-probation"><option value="false">なし</option><option value="true">試用期間中</option></select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">源泉徴収区分</label>
              <select class="form-select" id="sf-tax-category"><option value="kou">甲欄（主たる給与）</option><option value="otsu">乙欄（従たる給与）</option></select>
            </div>
            <div class="form-group" id="sf-dependents-group"><label class="form-label">扶養人数（甲欄の場合）</label>
              <select class="form-select" id="sf-dependents">
                ${[0,1,2,3,4,5].map(n => `<option value="${n}">${n}人</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="btn-group mt-16">
            <button type="submit" class="btn btn-primary">${editingId ? '更新' : '登録'}</button>
            ${editingId ? '<button type="button" class="btn btn-secondary" id="sf-cancel">キャンセル</button>' : ''}
          </div>
        </form>
      </div>
    `;

    // 編集時のデータ設定
    if (editingId) {
      const allStaff = await Storage.getAllStaff();
      const s = allStaff.find(st => st.id === editingId);
      if (s) {
        document.getElementById('sf-name').value = s.name || '';
        document.getElementById('sf-wage').value = s.hourlyWage || 1150;
        document.getElementById('sf-distance').value = s.commuteDistance || 0;
        document.getElementById('sf-hire-date').value = s.hireDate || '';
        document.getElementById('sf-other').value = s.otherAllowance || 0;
        document.getElementById('sf-probation').value = s.probation ? 'true' : 'false';
        document.getElementById('sf-tax-category').value = s.taxCategory || 'kou';
        document.getElementById('sf-dependents').value = s.dependents || 0;
      }
    }

    function toggleDependents() {
      const cat = document.getElementById('sf-tax-category').value;
      const group = document.getElementById('sf-dependents-group');
      if (group) {
        group.style.opacity = cat === 'kou' ? '1' : '0.4';
        document.getElementById('sf-dependents').disabled = cat !== 'kou';
      }
    }
    document.getElementById('sf-tax-category')?.addEventListener('change', toggleDependents);
    toggleDependents();

    document.getElementById('staff-form').addEventListener('submit', handleSubmit);
    document.getElementById('sf-cancel')?.addEventListener('click', () => { editingId = null; render(); });

    container.querySelectorAll('.staff-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editingId = btn.dataset.id;
        render();
        document.getElementById('sf-name').focus();
      });
    });

    container.querySelectorAll('.staff-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = activeStaff.find(st => st.id === btn.dataset.id);
        const ok = await Utils.showConfirm('スタッフ削除', `${s ? s.name : ''}さんを削除しますか？`);
        if (ok) {
          await Storage.deleteStaff(btn.dataset.id);
          Utils.showToast('スタッフを削除しました');
          if (editingId === btn.dataset.id) editingId = null;
          render();
        }
      });
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('sf-name').value.trim();
    if (!name) { Utils.showToast('氏名を入力してください', 'error'); return; }

    const staff = {
      id: editingId || Utils.generateId(),
      name,
      hourlyWage: parseInt(document.getElementById('sf-wage').value) || 1150,
      commuteDistance: parseFloat(document.getElementById('sf-distance').value) || 0,
      hireDate: document.getElementById('sf-hire-date').value || '',
      otherAllowance: parseInt(document.getElementById('sf-other').value) || 0,
      probation: document.getElementById('sf-probation').value === 'true',
      taxCategory: document.getElementById('sf-tax-category').value || 'kou',
      dependents: parseInt(document.getElementById('sf-dependents').value) || 0,
      active: true
    };

    await Storage.saveStaff(staff);
    Utils.showToast(editingId ? 'スタッフ情報を更新しました' : 'スタッフを登録しました', 'success');
    editingId = null;
    render();
  }

  return { render };
})();
