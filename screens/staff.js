// ===== 画面7：スタッフ管理 =====
const StaffScreen = (() => {
  let editingId = null;
  let editingStaff = null;
  let minWagesForSubmit = null;
  const NEW_STAFF_DEFAULT_WAGE = 1172; // 新規スタッフ登録時の時給の初期値

  function formatHireDate(dateStr) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [y, m, d] = dateStr.split('-').map(Number);
      return `${y}年${m}月${d}日`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatEffectiveDate(dateStr) {
    return dateStr === Calc.WAGE_BASE_DATE ? '初期（全期間）' : `${formatHireDate(dateStr)}〜`;
  }

  // その日を含む締め期間（前月21日〜当月20日）と支払月
  function payPeriodOf(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    let year = y, month = m - 1;
    if (d > 20) { month++; if (month > 11) { month = 0; year++; } }
    return { ...Utils.getPayPeriod(year, month), payMonth: month + 1 };
  }

  async function render() {
    const container = document.getElementById('screen-staff');
    const [activeStaff, wageHistory, loadedMinWages] = await Promise.all([
      Storage.getStaff(),
      Storage.getWageHistory(),
      Storage.getMinWages()
    ]);
    const minWages = loadedMinWages || Calc.DEFAULT_MIN_WAGES;
    minWagesForSubmit = minWages;
    const historyAvailable = wageHistory !== null;

    editingStaff = null;
    if (editingId) {
      const allStaff = await Storage.getAllStaff();
      editingStaff = allStaff.find(st => st.id === editingId) || null;
    }
    const wageTable = Calc.buildWageTable(editingStaff ? [...activeStaff, editingStaff] : activeStaff, wageHistory);
    const todayStr = Utils.today();
    const todayMinWage = Calc.minWageAt(minWages, todayStr);

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title">スタッフ管理</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:16px;">登録人数：${activeStaff.length}</p>
        ${historyAvailable ? '' : `
          <div class="alert-box alert-warning">時給履歴を読み込めませんでした（GASの再デプロイ前の可能性があります）。時給は旧仕様の値を表示しており、時給の変更はできません。</div>`}

        <div class="table-wrap mb-16">
          <table>
            <thead>
              <tr><th>氏名</th><th>時給（今日時点）</th><th>試用期間</th><th>通勤距離</th><th>入社日</th><th>その他手当</th><th>源泉区分</th><th>扶養人数</th><th>操作</th></tr>
            </thead>
            <tbody>
              ${activeStaff.map(s => {
                const wage = Calc.wageAt(wageTable[String(s.id)], todayStr);
                return `
                <tr>
                  <td><strong>${Utils.escapeHtml(s.name)}</strong></td>
                  <td class="num">
                    ${Utils.formatCurrency(wage)}
                    ${todayMinWage && wage < todayMinWage ? '<span class="badge badge-danger">最賃未満</span>' : ''}
                  </td>
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
              `;
              }).join('')}
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
            ${editingId ? `
              <div class="form-group"><label class="form-label">時給（今日時点）</label>
                <input type="text" class="form-input" value="${editingStaff ? Utils.formatCurrency(Calc.wageAt(wageTable[String(editingStaff.id)], todayStr)) : ''}" disabled style="background:var(--bg);">
                <div style="font-size:0.8rem;color:var(--text-light);margin-top:4px;">時給は下の「時給履歴」の「時給を変更」から変更します</div>
              </div>` : `
              <div class="form-group"><label class="form-label">時給（円）</label><input type="number" class="form-input" id="sf-wage" value="${NEW_STAFF_DEFAULT_WAGE}" min="1" max="5000" step="1"></div>`}
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">通勤距離（km）</label><input type="number" class="form-input" id="sf-distance" value="0" min="0" max="100" step="0.1"></div>
            <div class="form-group"><label class="form-label">入社日</label><input type="date" class="form-input" id="sf-hire-date"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">その他手当（円/月）</label><input type="number" class="form-input" id="sf-other" value="0" min="0"></div>
            <div class="form-group"><label class="form-label">試用期間（表示用。時給には影響しません）</label>
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
            <button type="submit" class="btn btn-primary" id="sf-submit-btn">${editingId ? '更新' : '登録'}</button>
            ${editingId ? '<button type="button" class="btn btn-secondary" id="sf-cancel">キャンセル</button>' : ''}
          </div>
        </form>
      </div>

      ${editingStaff ? renderWageHistoryHTML(editingStaff, wageTable[String(editingStaff.id)], historyAvailable, minWages) : ''}
    `;

    // 編集時のデータ設定
    if (editingStaff) {
      const s = editingStaff;
      document.getElementById('sf-name').value = s.name || '';
      document.getElementById('sf-distance').value = s.commuteDistance || 0;
      document.getElementById('sf-hire-date').value = s.hireDate || '';
      document.getElementById('sf-other').value = s.otherAllowance || 0;
      document.getElementById('sf-probation').value = s.probation ? 'true' : 'false';
      document.getElementById('sf-tax-category').value = s.taxCategory || 'kou';
      document.getElementById('sf-dependents').value = s.dependents || 0;
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
      btn.addEventListener('click', async () => {
        editingId = btn.dataset.id;
        await render();
        document.getElementById('sf-name').focus();
      });
    });

    container.querySelectorAll('.staff-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const s = activeStaff.find(st => st.id === btn.dataset.id);
        const ok = await Utils.showConfirm('スタッフ削除', `${s ? s.name : ''}さんを削除しますか？`);
        if (ok) {
          await Utils.withLoading(btn, async () => {
            await Storage.deleteStaff(btn.dataset.id);
            Utils.showToast('スタッフを削除しました');
            if (editingId === btn.dataset.id) editingId = null;
            await render();
          });
        }
      });
    });

    if (editingStaff && historyAvailable) {
      bindWageHistoryEvents(container, editingStaff, wageTable[String(editingStaff.id)], minWages);
    }
  }

  function renderWageHistoryHTML(staff, wageList, historyAvailable, minWages) {
    const realEntries = wageList.filter(h => !h.virtual);
    const latest = realEntries[realEntries.length - 1];
    const canUndo = historyAvailable && realEntries.length > 1;
    return `
      <div class="card">
        <h3 class="card-title">時給履歴（${Utils.escapeHtml(staff.name)}）</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:12px;">
          勤務日ごとに「その日以前で最も新しい適用開始日」の時給で給与を計算します。過去の履歴は編集・削除できません（一番新しい履歴のみ取り消し可）。
        </p>
        <div class="table-wrap mb-16">
          <table>
            <thead><tr><th>適用開始日</th><th>時給</th><th>メモ</th><th>登録日時</th><th>操作</th></tr></thead>
            <tbody>
              ${wageList.map(h => {
                const mw = Calc.minWageAt(minWages, h.effectiveDate);
                return `
                <tr>
                  <td>${formatEffectiveDate(h.effectiveDate)}</td>
                  <td class="num">${Utils.formatCurrency(h.hourlyWage)}${mw && h.hourlyWage < mw ? ' <span class="badge badge-danger">最賃未満</span>' : ''}</td>
                  <td>${Utils.escapeHtml(h.note || '')}</td>
                  <td>${h.createdAt ? Utils.formatDateTime(h.createdAt) : '-'}</td>
                  <td>${canUndo && latest && h.id === latest.id ? `<button class="btn btn-sm btn-danger" id="wh-undo-btn" data-id="${h.id}">取り消し</button>` : ''}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
        </div>
        ${historyAvailable ? `
          <button type="button" class="btn btn-primary" id="wh-open-btn">時給を変更</button>
          <div id="wh-form" style="display:none;margin-top:12px;">
            <div class="form-row">
              <div class="form-group"><label class="form-label">新しい時給（円）</label><input type="number" class="form-input" id="wh-wage" min="1" max="5000" step="1"></div>
              <div class="form-group"><label class="form-label">適用開始日</label><input type="date" class="form-input" id="wh-date"></div>
            </div>
            <div class="form-group"><label class="form-label">メモ</label><input type="text" class="form-input" id="wh-note" maxlength="100" placeholder="例：最低賃金改定に伴う昇給"></div>
            <div id="wh-error" class="error-text" style="display:none;"></div>
            <div class="btn-group mt-8">
              <button type="button" class="btn btn-primary" id="wh-save-btn">登録</button>
              <button type="button" class="btn btn-secondary" id="wh-cancel-btn">キャンセル</button>
            </div>
          </div>` : ''}
      </div>
    `;
  }

  function bindWageHistoryEvents(container, staff, wageList, minWages) {
    const form = document.getElementById('wh-form');
    const errorEl = document.getElementById('wh-error');
    document.getElementById('wh-open-btn').addEventListener('click', () => { form.style.display = 'block'; });
    document.getElementById('wh-cancel-btn').addEventListener('click', () => { form.style.display = 'none'; errorEl.style.display = 'none'; });

    document.getElementById('wh-save-btn').addEventListener('click', async function() {
      const entry = {
        staffId: String(staff.id),
        effectiveDate: document.getElementById('wh-date').value,
        hourlyWage: Number(document.getElementById('wh-wage').value),
        note: document.getElementById('wh-note').value.trim()
      };
      const error = Calc.validateWageChange(wageList, entry, minWages);
      if (error) {
        errorEl.textContent = error;
        errorEl.style.display = 'block';
        Utils.showToast(error, 'error');
        return;
      }
      errorEl.style.display = 'none';

      const lines = [`${staff.name}さんの時給を ${entry.effectiveDate} から ${entry.hourlyWage.toLocaleString('ja-JP')}円 に変更します。`];
      const period = payPeriodOf(entry.effectiveDate);
      if (period.end < Utils.today()) {
        lines.push(`※適用開始日が締め済みの期間（${period.payMonth}月支払分：${period.start}〜${period.end}）に含まれるため、その期間以降の給与計算結果が変わります。`);
      }
      Calc.laterMinWageRaises(entry.hourlyWage, entry.effectiveDate, minWages).forEach(m => {
        lines.push(`※${m.effectiveDate}から最低賃金が${m.minWage.toLocaleString('ja-JP')}円になり、この時給を下回ります。`);
      });
      lines.push('登録した履歴は編集できません（一番新しい履歴のみ取り消し可）。');
      const ok = await Utils.showConfirm('時給の変更', lines.join('\n'));
      if (!ok) return;

      await Utils.withLoading(this, async () => {
        try {
          // ローカルモードで初回追加時は、仮の初期時給も保存しておく
          const base = wageList[0] && wageList[0].virtual
            ? { staffId: String(staff.id), effectiveDate: wageList[0].effectiveDate, hourlyWage: wageList[0].hourlyWage, note: '移行時の時給（旧仕様から自動登録）' }
            : null;
          await Storage.addWageHistory(entry, base);
          Utils.showToast('時給を変更しました', 'success');
          await render();
        } catch (e) {
          errorEl.textContent = e.message;
          errorEl.style.display = 'block';
          Utils.showToast('登録できませんでした：' + e.message, 'error');
        }
      });
    });

    document.getElementById('wh-undo-btn')?.addEventListener('click', async function() {
      const btn = this;
      const idx = wageList.findIndex(h => h.id === btn.dataset.id);
      const target = wageList[idx];
      const prev = wageList[idx - 1];
      const ok = await Utils.showConfirm('時給履歴の取り消し',
        `${formatEffectiveDate(target.effectiveDate)} ${target.hourlyWage.toLocaleString('ja-JP')}円 の履歴を取り消します。\n` +
        `取り消すと、${target.effectiveDate} 以降も ${prev.hourlyWage.toLocaleString('ja-JP')}円 で計算されます。よろしいですか？`);
      if (!ok) return;
      await Utils.withLoading(btn, async () => {
        try {
          await Storage.deleteWageHistory(String(staff.id), target.id);
          Utils.showToast('時給履歴を取り消しました');
          await render();
        } catch (e) {
          Utils.showToast('取り消せませんでした：' + e.message, 'error');
        }
      });
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('sf-name').value.trim();
    if (!name) { Utils.showToast('氏名を入力してください', 'error'); return; }
    const hireDate = document.getElementById('sf-hire-date').value || '';

    let hourlyWage;
    if (editingId) {
      // 既存スタッフの staff.hourlyWage（後方互換用の列）はそのまま残す
      hourlyWage = editingStaff ? editingStaff.hourlyWage : '';
    } else {
      hourlyWage = Number(document.getElementById('sf-wage').value);
      if (!Number.isInteger(hourlyWage) || hourlyWage <= 0) { Utils.showToast('時給は1円以上の整数で入力してください', 'error'); return; }
      const checkDate = hireDate > Utils.today() ? hireDate : Utils.today();
      const minWage = Calc.minWageAt(minWagesForSubmit, checkDate);
      if (minWage && hourlyWage < minWage) {
        Utils.showToast(`最低賃金を下回るため登録できません（${checkDate}時点の最低賃金：${minWage.toLocaleString('ja-JP')}円）`, 'error');
        return;
      }
    }

    const submitBtn = document.getElementById('sf-submit-btn');
    await Utils.withLoading(submitBtn, async () => {
      const staff = {
        id: editingId || Utils.generateId(),
        name,
        hourlyWage,
        commuteDistance: parseFloat(document.getElementById('sf-distance').value) || 0,
        hireDate,
        otherAllowance: parseInt(document.getElementById('sf-other').value) || 0,
        probation: document.getElementById('sf-probation').value === 'true',
        taxCategory: document.getElementById('sf-tax-category').value || 'kou',
        dependents: parseInt(document.getElementById('sf-dependents').value) || 0,
        active: true
      };

      try {
        await Storage.saveStaff(staff);
      } catch (err) {
        Utils.showToast('保存できませんでした：' + err.message, 'error');
        return;
      }
      Utils.showToast(editingId ? 'スタッフ情報を更新しました' : 'スタッフを登録しました', 'success');
      editingId = null;
      await render();
    });
  }

  return { render };
})();
