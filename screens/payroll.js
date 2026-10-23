// ===== 画面5：給与計算 =====
const PayrollScreen = (() => {
  let currentYear, currentMonth;
  // 精算の下書き（未保存）：'YYYY-MM|staffId' → [{ name, amount, taxable, note }]
  const drafts = {};

  function init() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
  }

  async function render() {
    if (currentYear === undefined) init();
    const container = document.getElementById('screen-payroll');
    const period = Utils.getPayPeriod(currentYear, currentMonth);
    const payMonth = Utils.payMonthKey(currentYear, currentMonth);
    const [allStaff, records, wageHistory, minWages, closingsAll, adjustmentsAll] = await Promise.all([
      Storage.getAllStaff(),
      Storage.getTimeRecordsByRange(period.start, period.end),
      Storage.getWageHistory(),
      Storage.getMinWages(),
      Storage.getPayrollClosed(),
      Storage.getAdjustments()
    ]);
    // GASの再デプロイ前は確定・精算の機能を使えない（計算と表示は今まで通り）
    const closingAvailable = closingsAll !== null && adjustmentsAll !== null;
    const closings = closingsAll || [];
    const adjustments = adjustmentsAll || [];
    const monthClosings = closings.filter(c => c.status === 'active' && c.payMonth === payMonth);
    const monthAdjustments = adjustments.filter(a => a.payMonth === payMonth);

    // 在籍者＋この期間に打刻がある退職者。時給は勤務日ごとに時給履歴から決める
    const wageTable = Calc.buildWageTable(allStaff, wageHistory);
    const currentPayrolls = Calc.calcPayrollForPeriod(allStaff, records, wageTable, minWages, period,
      monthAdjustments, monthClosings.map(c => c.staffId));

    // 確定済みのスタッフは保存した明細を表示し、今のデータでの再計算と比べる
    const rows = currentPayrolls.map(current => {
      const closing = monthClosings.find(c => c.staffId === String(current.staffId)) || null;
      if (!closing) return { p: current, current, closing: null, cmp: null };
      const cmp = Calc.remainingSettlement(Calc.compareWithClosing(closing, current, records), closing, adjustments);
      return { p: { ...closing.payslip, retired: current.retired }, current, closing, cmp };
    });
    const payrolls = rows.map(r => r.p);

    const violations = currentPayrolls.filter(p => p.minWageViolations.length > 0);
    // 打刻漏れ（警告のみ。計算は変えない＝打刻漏れの日は0時間のまま）
    const punchIssues = Calc.findPunchIssues(records, currentPayrolls.map(p => p.staffId), Utils.today());
    const issuesByStaff = currentPayrolls
      .map(p => ({ p, issues: punchIssues.filter(i => i.staffId === p.staffId) }))
      .filter(x => x.issues.length > 0);

    const payDay = Storage.getSetting('pay_day', '25');
    const payDateStr = `${currentYear}年${currentMonth + 1}月${payDay}日`;
    const ps = period.start.split('-');
    const pe = period.end.split('-');
    const periodJP = `${parseInt(ps[0])}年${parseInt(ps[1])}月${parseInt(ps[2])}日〜${parseInt(pe[1])}月${parseInt(pe[2])}日`;
    const ctx = { container, period, payMonth, records, rows, closings, adjustments, closingAvailable };

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title">給与計算</h3>
        <div class="month-nav">
          <button class="btn btn-sm btn-secondary" id="pay-prev">&lt; 前月</button>
          <span class="month-label">${currentYear}年${currentMonth + 1}月 支払分</span>
          <button class="btn btn-sm btn-secondary" id="pay-next">翌月 &gt;</button>
        </div>
        <p style="color:var(--text-light);font-size:0.85rem;text-align:center;margin-bottom:16px;">
          締め期間：${period.start} 〜 ${period.end} ／ 支払日：${currentMonth + 1}月${payDay}日
          ${closingAvailable && rows.length > 0 ? `／ 確定済み ${rows.filter(r => r.closing).length} / ${rows.length} 名` : ''}
        </p>
        ${wageHistory === null ? `
          <div class="alert-box alert-warning no-print">
            時給履歴を読み込めませんでした（GASの再デプロイ前の可能性があります）。旧仕様の時給（スタッフ情報の時給・試用期間）で計算しています。
          </div>` : ''}
        ${!closingAvailable ? `
          <div class="alert-box alert-warning no-print">
            給与確定・精算/調整額の機能は、GASの再デプロイ後に使えます（計算と表示は今まで通りです）。
          </div>` : ''}
      </div>

      ${issuesByStaff.length > 0 ? `
        <div class="card no-print">
          <div class="alert-box alert-danger" style="color:var(--danger);display:block;">
            <strong>締め期間内に打刻漏れがあります（出勤・退勤の漏れは0時間、休憩の漏れは休憩時間が正しくない状態で計算されています）</strong>
            <ul style="margin:8px 0 0 1.2em;">
              ${issuesByStaff.map(({ p, issues }) => `
                <li>${Utils.escapeHtml(p.staffName)}：打刻漏れ ${issues.length}日（${issues.map(i => `${formatMD(i.date)} ${i.issues.join('・')}`).join('、')}）</li>
              `).join('')}
            </ul>
            <div style="margin-top:6px;font-size:0.85rem;">勤務記録の「修正」から打刻を追加してください。</div>
          </div>
        </div>
      ` : ''}

      ${violations.length > 0 ? `
        <div class="card no-print">
          <div class="alert-box alert-danger" style="color:var(--danger);display:block;">
            <strong>最低賃金を下回る時給で計算された勤務日があります</strong>
            <ul style="margin:8px 0 0 1.2em;">
              ${violations.map(p => summarizeViolations(p).map(v => `
                <li>${Utils.escapeHtml(p.staffName)}：時給${Utils.formatCurrency(v.wage)}（最低賃金${Utils.formatCurrency(v.minWage)}）で ${v.days}日（${formatMD(v.first)}〜${formatMD(v.last)}）</li>
              `).join('')).join('')}
            </ul>
            <div style="margin-top:6px;font-size:0.85rem;">スタッフ管理の「時給を変更」で、適用開始日つきの時給を登録してください。</div>
          </div>
        </div>
      ` : ''}

      <div class="card">
        <h3 class="card-title">給与一覧</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>スタッフ</th><th>出勤日数</th><th>総労働</th><th>深夜</th><th>残業</th>
                <th>基本給</th><th>深夜手当</th><th>残業代</th><th>通勤手当</th><th>その他</th><th>精算・調整</th>
                <th>総支給</th><th>所得税</th><th>手取り</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(({ p, closing, cmp }) => `
                <tr>
                  <td>
                    ${Utils.escapeHtml(p.staffName)}
                    ${p.retired ? '<span class="badge badge-warning">退職</span>' : ''}
                    ${closing ? `<span class="badge badge-info">確定済み（${formatClosedAt(closing.closedAt)}）</span>` : ''}
                    ${cmp && cmp.diffTotal !== 0 ? '<span class="badge badge-danger">差額あり</span>' : ''}
                    ${(p.minWageViolations || []).length > 0 ? '<span class="badge badge-danger">最賃未満</span>' : ''}
                    ${punchIssues.some(i => i.staffId === p.staffId) ? '<span class="badge badge-danger">打刻漏れ</span>' : ''}
                  </td>
                  <td class="num">${p.workDays}日</td>
                  <td class="num">${Utils.minutesToHM(p.totalWorkMinutes)}</td>
                  <td class="num">${Utils.minutesToHM(p.totalNightMinutes)}</td>
                  <td class="num">${Utils.minutesToHM(p.totalOvertimeMinutes)}</td>
                  <td class="num">${Utils.formatCurrency(p.basePay)}</td>
                  <td class="num">${Utils.formatCurrency(p.nightPay)}</td>
                  <td class="num">${Utils.formatCurrency(p.overtimePay)}</td>
                  <td class="num">${Utils.formatCurrency(p.commutePay)}</td>
                  <td class="num">${Utils.formatCurrency(p.otherPay)}</td>
                  <td class="num">${formatSigned((p.adjustmentsTaxable || 0) + (p.adjustmentsNonTaxable || 0))}</td>
                  <td class="num">${Utils.formatCurrency(p.totalPay)}</td>
                  <td class="num" style="color:var(--danger);">${Utils.formatCurrency(p.incomeTax)}</td>
                  <td class="num"><strong>${Utils.formatCurrency(p.netPay)}</strong></td>
                </tr>
              `).join('')}
              ${rows.length === 0 ? '<tr><td colspan="14" style="text-align:center;color:var(--text-light);">データがありません</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card no-print">
        <div class="btn-group" style="justify-content:center;flex-wrap:wrap;">
          <button class="btn btn-primary" id="pay-all-pdf">全員の給与明細PDF出力（A4に2名分）</button>
          <button class="btn btn-secondary" id="pay-all-print">全員の給与明細を印刷</button>
          <button class="btn btn-success" id="pay-csv-export">月次CSVエクスポート</button>
        </div>
      </div>

      <div id="payslip-preview-area">
        ${rows.map((row, idx) => renderPayslipHTML(row.p, period, periodJP, payDateStr, currentYear, currentMonth, idx, renderControlsHTML(row, ctx))).join('')}
      </div>
    `;

    document.getElementById('pay-prev').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      render();
    });
    document.getElementById('pay-next').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      render();
    });

    document.getElementById('pay-all-pdf').addEventListener('click', function() {
      Utils.withLoading(this, () => generateAllPayslipsPDF(payrolls, period));
    });
    document.getElementById('pay-all-print').addEventListener('click', () => {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('print-target'));
      container.classList.add('print-target');
      window.print();
      container.classList.remove('print-target');
    });
    document.getElementById('pay-csv-export').addEventListener('click', function() {
      Utils.withLoading(this, async () => exportPayrollCSV(rows, period));
    });

    container.querySelectorAll('.payslip-pdf-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const p = payrolls.find(pay => pay.staffId === btn.dataset.staff);
        if (p) Utils.withLoading(this, () => generateSinglePayslipPDF(p, period));
      });
    });

    if (closingAvailable) rows.forEach(row => bindControlEvents(row, ctx));
  }

  function minutesToTkcFormat(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}.${String(m).padStart(2, '0')}`;
  }

  // 'YYYY-MM-DD' → 'M/D'
  function formatMD(dateStr) {
    const [, m, d] = dateStr.split('-').map(Number);
    return `${m}/${d}`;
  }

  // 確定日時（ISO）→ 'M月D日'
  function formatClosedAt(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // ＋5,410円 / −824円
  function formatSigned(amount) {
    if (amount === 0) return '0円';
    return `${amount > 0 ? '＋' : '−'}${Math.abs(amount).toLocaleString('ja-JP')}円`;
  }

  // 最低賃金未満の勤務日を「時給・最低賃金」ごとにまとめる
  function summarizeViolations(p) {
    const groups = [];
    p.minWageViolations.forEach(v => {
      let g = groups.find(x => x.wage === v.wage && x.minWage === v.minWage);
      if (!g) { g = { wage: v.wage, minWage: v.minWage, days: 0, first: v.date, last: v.date }; groups.push(g); }
      g.days++;
      g.last = v.date;
    });
    return groups;
  }

  // 時給が複数ある場合の内訳（給与明細）
  function renderWageBreakdownHTML(p) {
    if (p.wageSegments.length <= 1) return '';
    return `
      <thead><tr><th colspan="2" class="ps-section-header">時給内訳</th></tr></thead>
      <tbody>
        ${p.wageSegments.map(s => `
          <tr>
            <td colspan="2" style="font-size:0.85em;">
              ${Utils.formatCurrency(s.wage)} × 労働時間 ${Utils.minutesToHM(s.normalMinutes)}（${formatMD(s.rangeStart)}〜${formatMD(s.rangeEnd)}）
              ${s.overtimeMinutes > 0 ? `<br>　残業 ${Utils.minutesToHM(s.overtimeMinutes)}` : ''}
              ${s.nightMinutes > 0 ? `<br>　深夜 ${Utils.minutesToHM(s.nightMinutes)}` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    `;
  }

  // TKC入力用：時給ごとの行（時給が1つなら従来どおり1組）
  function renderTkcWageRowsHTML(p) {
    if (p.wageSegments.length <= 1) {
      const s = p.wageSegments[0];
      return `
        <tr><td>出勤時間（通常勤務）</td><td class="tkc-val">${minutesToTkcFormat(s ? s.normalMinutes : 0)}</td></tr>
        <tr><td>平日残業</td><td class="tkc-val">${minutesToTkcFormat(s ? s.overtimeMinutes : 0)}</td></tr>
        <tr><td>平日深夜</td><td class="tkc-val">${minutesToTkcFormat(s ? s.nightMinutes : 0)}</td></tr>
      `;
    }
    return p.wageSegments.map(s => `
      <tr><td colspan="2" style="font-weight:700;padding-top:8px;">${formatMD(s.rangeStart)}〜${formatMD(s.rangeEnd)}</td></tr>
      <tr><td>時給</td><td class="tkc-val">${Utils.formatCurrency(s.wage)}</td></tr>
      <tr><td>出勤時間（通常勤務）</td><td class="tkc-val">${minutesToTkcFormat(s.normalMinutes)}</td></tr>
      <tr><td>平日残業</td><td class="tkc-val">${minutesToTkcFormat(s.overtimeMinutes)}</td></tr>
      <tr><td>平日深夜</td><td class="tkc-val">${minutesToTkcFormat(s.nightMinutes)}</td></tr>
    `).join('');
  }

  function adjustmentLabel(a) {
    return `${Utils.escapeHtml(a.name)}${a.taxable ? '' : '（非課税）'}`;
  }

  function renderPayslipHTML(p, period, periodJP, payDateStr, year, month, index, controlsHTML = '') {
    const taxCatLabel = p.taxCategory === 'otsu' ? '乙欄' : `甲欄（扶養${p.dependents}人）`;
    const normalMinutes = p.totalWorkMinutes - p.totalOvertimeMinutes;
    const adjustments = p.adjustments || [];
    return `
      <div class="card payslip-card" data-staff="${p.staffId}">
        <div class="payslip-new" id="payslip-${p.staffId}">
          <div class="ps-header">
            <h3 class="ps-title">給 料 明 細 書</h3>
            <div class="ps-period">${year}年${month + 1}月分給与（${periodJP}）</div>
          </div>
          <div class="ps-name">氏　名　<strong>${Utils.escapeHtml(p.staffName)}</strong>　様</div>
          <div class="ps-columns">
            <div class="ps-col">
              <table class="ps-table">
                <thead><tr><th colspan="2" class="ps-section-header">勤 怠</th></tr></thead>
                <tbody>
                  <tr><td>出勤日数</td><td class="ps-val">${p.workDays} 日</td></tr>
                  <tr><td>総労働時間</td><td class="ps-val">${Utils.minutesToHM(p.totalWorkMinutes)}</td></tr>
                  <tr><td>労働時間</td><td class="ps-val">${Utils.minutesToHM(normalMinutes)}</td></tr>
                  <tr><td>残業時間</td><td class="ps-val">${Utils.minutesToHM(p.totalOvertimeMinutes)}</td></tr>
                  <tr><td>深夜労働時間</td><td class="ps-val">${Utils.minutesToHM(p.totalNightMinutes)}</td></tr>
                </tbody>
                <thead><tr><th colspan="2" class="ps-section-header">支 給</th></tr></thead>
                <tbody>
                  <tr><td>基本給</td><td class="ps-val">${Utils.formatCurrency(p.basePay)}</td></tr>
                  <tr><td>残業手当</td><td class="ps-val">${Utils.formatCurrency(p.overtimePay)}</td></tr>
                  <tr><td>深夜手当</td><td class="ps-val">${Utils.formatCurrency(p.nightPay)}</td></tr>
                  <tr><td>通勤手当</td><td class="ps-val">${Utils.formatCurrency(p.commutePay)}</td></tr>
                  <tr><td>手当・その他</td><td class="ps-val">${Utils.formatCurrency(p.otherPay)}</td></tr>
                  ${adjustments.map(a => `<tr><td>${adjustmentLabel(a)}</td><td class="ps-val">${a.amount < 0 ? '−' + Utils.formatCurrency(-a.amount) : Utils.formatCurrency(a.amount)}</td></tr>`).join('')}
                  <tr class="ps-total-row"><td><strong>総支給合計</strong></td><td class="ps-val"><strong>${Utils.formatCurrency(p.totalPay)}</strong></td></tr>
                </tbody>
                ${renderWageBreakdownHTML(p)}
              </table>
            </div>
            <div class="ps-col">
              <table class="ps-table">
                <thead><tr><th colspan="2" class="ps-section-header">控 除</th></tr></thead>
                <tbody>
                  <tr><td>課税合計</td><td class="ps-val">${Utils.formatCurrency(p.taxableAmount)}</td></tr>
                  <tr><td>源泉区分</td><td class="ps-val">${taxCatLabel}</td></tr>
                  <tr><td>控除額（所得税）</td><td class="ps-val" style="color:var(--danger);">${Utils.formatCurrency(p.incomeTax)}</td></tr>
                </tbody>
                <thead><tr><th colspan="2" class="ps-section-header">差引支給</th></tr></thead>
                <tbody>
                  <tr class="ps-net-row"><td><strong>支給額（手取り）</strong></td><td class="ps-val ps-net"><strong>${Utils.formatCurrency(p.netPay)}</strong></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="ps-footer">支給日：${payDateStr}</div>
        </div>
        <div class="btn-group mt-8 no-print" style="justify-content:center;">
          <button class="btn btn-sm btn-primary payslip-pdf-btn" data-staff="${p.staffId}">PDF出力</button>
        </div>
        <div class="tkc-box no-print">
          <div class="tkc-header">TKC入力用</div>
          <div class="tkc-note">↓この数値をTKCにそのまま入力してください</div>
          <table class="tkc-table">
            <tbody>
              <tr><td>出勤日数</td><td class="tkc-val">${p.workDays} 日</td></tr>
              ${renderTkcWageRowsHTML(p)}
              <tr><td>(非)通勤手当</td><td class="tkc-val">${Utils.formatCurrency(p.commutePay)}</td></tr>
              ${p.wageSegments.length <= 1 ? `<tr><td>時給</td><td class="tkc-val">${Utils.formatCurrency(p.wage)}</td></tr>` : ''}
              ${adjustments.map(a => `<tr><td>${a.taxable ? '精算・調整（課税）' : '(非)精算・調整'}：${Utils.escapeHtml(a.name)}</td><td class="tkc-val">${formatSigned(a.amount)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${controlsHTML}
        ${index % 2 === 0 && index < 99 ? '<div class="ps-page-break"></div>' : ''}
      </div>
    `;
  }

  // ===== 確定・精算/調整額の操作欄（印刷しない） =====
  function renderControlsHTML(row, ctx) {
    if (!ctx.closingAvailable) return '';
    return `
      <div class="pay-controls no-print" data-staff="${row.p.staffId}">
        ${row.closing ? renderClosedHTML(row, ctx) : renderCloseFormHTML(row)}
        ${renderAdjustmentsHTML(row, ctx)}
      </div>
    `;
  }

  // 未確定：TKCの金額を入力して確定する
  function renderCloseFormHTML(row) {
    const p = row.p;
    return `
      <div class="pay-box">
        <div class="pay-box-title">給与確定</div>
        <button class="btn btn-sm btn-primary close-open-btn">確定する…</button>
        <div class="close-form" style="display:none;">
          <p style="font-size:0.85rem;margin:8px 0;">
            アプリの計算結果（上の明細）：総支給 <strong>${Utils.formatCurrency(p.totalPay)}</strong>
            ／ 所得税 <strong>${Utils.formatCurrency(p.incomeTax)}</strong>
            ／ 差引支給 <strong>${Utils.formatCurrency(p.netPay)}</strong>
          </p>
          <p style="font-size:0.85rem;margin-bottom:8px;">TKCで計算して実際に支払った額を入力してください（これを「実際の支払額」として保存します）。</p>
          <div class="form-row">
            <div class="form-group"><label class="form-label">TKC 支給合計（円）</label><input type="number" class="form-input tkc-in" data-key="tkcTotalPay" data-app="${p.totalPay}" step="1"></div>
            <div class="form-group"><label class="form-label">TKC 所得税（円）</label><input type="number" class="form-input tkc-in" data-key="tkcIncomeTax" data-app="${p.incomeTax}" step="1"></div>
            <div class="form-group"><label class="form-label">TKC 差引支給額（円）</label><input type="number" class="form-input tkc-in" data-key="tkcNetPay" data-app="${p.netPay}" step="1"></div>
          </div>
          <div class="close-diff" style="color:var(--danger);font-weight:700;font-size:0.9rem;"></div>
          <div class="form-group"><label class="form-label">メモ（アプリとTKCの差額の理由など）</label><input type="text" class="form-input close-note" maxlength="500"></div>
          <div class="btn-group">
            <button class="btn btn-sm btn-primary close-save-btn">この内容で確定</button>
            <button class="btn btn-sm btn-secondary close-cancel-btn">キャンセル</button>
          </div>
        </div>
      </div>
    `;
  }

  // その日の記録の要約
  function daySummary(d) {
    if (!d) return '記録なし';
    const t = iso => (iso ? Utils.formatTime(iso) : '—');
    if (!d.isComplete) return `${t(d.clockIn)}〜${t(d.clockOut)}（打刻漏れ・0時間）`;
    return `${t(d.clockIn)}〜${t(d.clockOut)} 実働${Utils.minutesToHM(d.workMinutes)}${d.breakMinutes ? `（休憩${Utils.minutesToHM(d.breakMinutes)}）` : ''}`;
  }

  // 確定済み：実際の支払額と、今のデータで再計算した額との差
  function renderClosedHTML(row, ctx) {
    const { closing, cmp, current } = row;
    const latest = Calc.latestActiveClosing(ctx.closings, closing.staffId);
    const nextPm = Calc.findNextOpenPayMonth(ctx.closings, closing.staffId, closing.payMonth);
    const appVsTkc = closing.payslip.totalPay - closing.tkcTotalPay;
    let diffHTML = '';
    if (cmp.diffTotal !== 0) {
      const kind = cmp.diffTotal > 0 ? '未払い' : '払いすぎ';
      const head = cmp.changedSinceClose ? '⚠ 確定後に記録が修正されています。' : '⚠ 確定時からアプリの計算とTKCの支給合計に差があります。';
      diffHTML = `
        <div class="alert-box alert-danger" style="color:var(--danger);display:block;">
          <strong>${head}正しい額との差：${formatSigned(cmp.diffTotal)}（${kind}）</strong>
          <div style="font-size:0.85rem;margin-top:4px;">
            正しい額（今のデータで再計算）${Utils.formatCurrency(current.totalPay)} − 実際の支払額（TKC）${Utils.formatCurrency(closing.tkcTotalPay)}
            ${cmp.settled.length ? `− 精算済み ${formatSigned(cmp.settled.reduce((s, a) => s + a.amount, 0))}` : ''}
            ／ 内訳：課税分 ${formatSigned(cmp.diffTaxable)}、非課税分（通勤手当）${formatSigned(cmp.diffNonTaxable)}
          </div>
          <button class="btn btn-sm btn-danger settle-btn" style="margin-top:8px;" data-next="${nextPm}">次の未確定の月（${Utils.payMonthLabel(nextPm)}支払分）に精算として追加</button>
        </div>`;
    } else if (cmp.settled.length > 0) {
      const settledTotal = cmp.settled.reduce((s, a) => s + a.amount, 0);
      const months = [...new Set(cmp.settled.map(a => Utils.payMonthLabel(a.payMonth) + '支払分'))].join('・');
      diffHTML = `<div class="alert-box alert-info">確定後の修正による差額 ${formatSigned(settledTotal)} は、${months}で精算済みです。</div>`;
    } else if (cmp.changedSinceClose) {
      diffHTML = '<div class="alert-box alert-info">確定後に記録が修正されていますが、実際の支払額との差はありません。</div>';
    }
    return `
      <div class="pay-box pay-box-closed">
        <div class="pay-box-title">確定済み（${formatClosedAt(closing.closedAt)}）</div>
        <p style="font-size:0.85rem;">
          この月は確定時の明細を表示しています。実際の支払額（TKC）：支給合計 <strong>${Utils.formatCurrency(closing.tkcTotalPay)}</strong>
          ／ 所得税 ${Utils.formatCurrency(closing.tkcIncomeTax)} ／ 差引支給 ${Utils.formatCurrency(closing.tkcNetPay)}
          ${appVsTkc !== 0 ? `<br><span style="color:var(--danger);">確定時のアプリの総支給との差：${formatSigned(-appVsTkc)}（TKC − アプリ）</span>` : ''}
          ${closing.note ? `<br>メモ：${Utils.escapeHtml(closing.note)}` : ''}
        </p>
        ${diffHTML}
        ${cmp.changedDays.length > 0 ? `
          <div style="font-size:0.85rem;margin-top:6px;"><strong>確定後に記録が変わった日</strong></div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>日付</th><th>確定時</th><th>現在</th></tr></thead>
              <tbody>
                ${cmp.changedDays.map(d => `<tr><td>${formatMD(d.date)}</td><td>${daySummary(d.before)}</td><td>${daySummary(d.after)}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>` : ''}
        ${latest && latest.id === closing.id ? '<button class="btn btn-sm btn-secondary close-undo-btn" style="margin-top:8px;">確定を取り消す</button>' : ''}
      </div>
    `;
  }

  // 精算・調整額（支払月ごと・スタッフごと）
  function renderAdjustmentsHTML(row, ctx) {
    const staffId = String(row.p.staffId);
    const list = ctx.adjustments.filter(a => a.payMonth === ctx.payMonth && a.staffId === staffId);
    const draftList = drafts[`${ctx.payMonth}|${staffId}`] || [];
    const closed = !!row.closing;
    return `
      <div class="pay-box">
        <div class="pay-box-title">精算・調整額（${Utils.payMonthLabel(ctx.payMonth)}支払分）</div>
        <p style="font-size:0.8rem;color:var(--text-light);">スタッフ管理の「その他手当（月額固定）」とは別に、この月だけの精算・調整を登録します。課税分は所得税の計算に含みます。</p>
        ${list.length > 0 ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>名称</th><th>区分</th><th>金額</th><th>メモ</th><th>登録日時</th>${closed ? '' : '<th></th>'}</tr></thead>
              <tbody>
                ${list.map(a => `
                  <tr>
                    <td>${Utils.escapeHtml(a.name)}</td>
                    <td>${a.taxable ? '課税' : '非課税'}</td>
                    <td class="num">${formatSigned(a.amount)}</td>
                    <td>${Utils.escapeHtml(a.note)}</td>
                    <td>${a.createdAt ? Utils.formatDateTime(a.createdAt) : ''}</td>
                    ${closed ? '' : `<td><button class="btn btn-sm btn-danger adj-delete-btn" data-id="${a.id}">削除</button></td>`}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>` : '<p style="font-size:0.85rem;">登録なし</p>'}
        ${closed ? '<p style="font-size:0.85rem;color:var(--text-light);">確定済みのため、精算・調整額は追加・変更できません。</p>' : `
          ${draftList.map((d, i) => renderAdjustmentFormHTML(d, i)).join('')}
          ${renderAdjustmentFormHTML(null, -1)}
        `}
      </div>
    `;
  }

  // 精算・調整額の入力欄（d が下書きなら値を入れておく）
  function renderAdjustmentFormHTML(d, draftIndex) {
    const isDraft = draftIndex >= 0;
    return `
      <div class="adj-form ${isDraft ? 'adj-draft' : ''}" data-draft="${draftIndex}">
        ${isDraft ? '<div class="adj-draft-label">精算の下書き（未保存）：内容を確認して「保存」してください</div>' : ''}
        <div class="form-row">
          <div class="form-group"><label class="form-label">名称</label><input type="text" class="form-input adj-name" maxlength="50" placeholder="例：6/30分精算、有給休暇" value="${isDraft ? Utils.escapeHtml(d.name) : ''}"></div>
          <div class="form-group"><label class="form-label">金額（円・マイナス可）</label><input type="number" class="form-input adj-amount" step="1" value="${isDraft ? d.amount : ''}"></div>
          <div class="form-group"><label class="form-label">区分</label>
            <select class="form-select adj-taxable">
              <option value="1" ${isDraft && d.taxable ? 'selected' : ''}>課税</option>
              <option value="0" ${isDraft && !d.taxable ? 'selected' : ''}>非課税</option>
            </select>
          </div>
        </div>
        <div class="form-group"><label class="form-label">メモ</label><input type="text" class="form-input adj-note" maxlength="200" value="${isDraft ? Utils.escapeHtml(d.note) : ''}"></div>
        <div class="btn-group">
          <button class="btn btn-sm btn-primary adj-save-btn">${isDraft ? '保存' : '追加'}</button>
          ${isDraft ? '<button class="btn btn-sm btn-secondary adj-discard-btn">破棄</button>' : ''}
        </div>
      </div>
    `;
  }

  function bindControlEvents(row, ctx) {
    const box = ctx.container.querySelector(`.pay-controls[data-staff="${row.p.staffId}"]`);
    if (!box) return;
    const staffId = String(row.p.staffId);

    // --- 確定 ---
    const form = box.querySelector('.close-form');
    if (form) {
      const inputs = [...form.querySelectorAll('.tkc-in')];
      const diffEl = form.querySelector('.close-diff');
      const labels = { tkcTotalPay: '支給合計', tkcIncomeTax: '所得税', tkcNetPay: '差引支給額' };
      // アプリとTKCの金額が違えば、確定前に赤字で差額を表示する
      const updateDiff = () => {
        diffEl.innerHTML = inputs
          .filter(i => i.value !== '' && Number(i.value) !== Number(i.dataset.app))
          .map(i => `${labels[i.dataset.key]}：TKC ${Utils.formatCurrency(Number(i.value))} − アプリ ${Utils.formatCurrency(Number(i.dataset.app))} ＝ 差 ${formatSigned(Number(i.value) - Number(i.dataset.app))}`)
          .join('<br>');
      };
      inputs.forEach(i => i.addEventListener('input', updateDiff));
      box.querySelector('.close-open-btn').addEventListener('click', () => { form.style.display = 'block'; });
      form.querySelector('.close-cancel-btn').addEventListener('click', () => { form.style.display = 'none'; });
      form.querySelector('.close-save-btn').addEventListener('click', async function() {
        const values = {};
        for (const i of inputs) {
          const v = Number(i.value);
          if (i.value === '' || !Number.isInteger(v)) { Utils.showToast(`TKCの${labels[i.dataset.key]}を整数で入力してください`, 'error'); return; }
          values[i.dataset.key] = v;
        }
        const note = form.querySelector('.close-note').value.trim();
        const hasDiff = inputs.some(i => Number(i.value) !== Number(i.dataset.app));
        const ok = await Utils.showConfirm('給与の確定',
          `${row.p.staffName}さんの${Utils.payMonthLabel(ctx.payMonth)}支払分を確定します。\n` +
          `実際の支払額（TKC）：支給合計 ${values.tkcTotalPay.toLocaleString('ja-JP')}円\n` +
          (hasDiff ? 'アプリの計算結果と差があります（赤字の差額を確認してください）。\n' : '') +
          '確定後はこの月の明細が固定され、精算・調整額も変更できなくなります。');
        if (!ok) return;
        await Utils.withLoading(this, async () => {
          try {
            await Storage.closePayroll({
              payMonth: ctx.payMonth, staffId, periodStart: ctx.period.start, periodEnd: ctx.period.end,
              ...values, note,
              // 画面の明細そのまま＋日ごとの記録（確定後の修正を検出するため）
              payslip: { ...row.current, days: Calc.snapshotDays(ctx.records, staffId) }
            });
            Utils.showToast('確定しました', 'success');
            await render();
          } catch (e) {
            Utils.showToast('確定できませんでした：' + e.message, 'error');
          }
        });
      });
    }

    // --- 確定の取り消し（一番新しい確定月だけ・理由必須） ---
    box.querySelector('.close-undo-btn')?.addEventListener('click', async function() {
      const reason = await Utils.promptReason('確定の取り消し',
        `${row.p.staffName}さんの${Utils.payMonthLabel(ctx.payMonth)}支払分の確定を取り消します。取り消しの理由を入力してください（履歴に残ります）。`);
      if (!reason) return;
      await Utils.withLoading(this, async () => {
        try {
          await Storage.cancelPayrollClose(row.closing.id, reason);
          Utils.showToast('確定を取り消しました');
          await render();
        } catch (e) {
          Utils.showToast('取り消せませんでした：' + e.message, 'error');
        }
      });
    });

    // --- 次の未確定の月に精算として追加（下書き） ---
    box.querySelector('.settle-btn')?.addEventListener('click', async function() {
      const nextPm = this.dataset.next;
      const list = Calc.buildSettlementDrafts(row.closing, row.cmp);
      drafts[`${nextPm}|${staffId}`] = (drafts[`${nextPm}|${staffId}`] || []).concat(list);
      const [y, m] = nextPm.split('-').map(Number);
      currentYear = y;
      currentMonth = m - 1;
      await render();
      Utils.showToast(`${Utils.payMonthLabel(nextPm)}支払分に精算の下書きを入れました。内容を確認して保存してください`, 'success');
      document.querySelector(`#screen-payroll .pay-controls[data-staff="${staffId}"] .adj-draft`)?.scrollIntoView({ block: 'center' });
    });

    // --- 精算・調整額の追加・保存・破棄・削除 ---
    box.querySelectorAll('.adj-form').forEach(f => {
      const draftIndex = Number(f.dataset.draft);
      const key = `${ctx.payMonth}|${staffId}`;
      f.querySelector('.adj-discard-btn')?.addEventListener('click', async () => {
        drafts[key].splice(draftIndex, 1);
        await render();
      });
      f.querySelector('.adj-save-btn').addEventListener('click', async function() {
        const name = f.querySelector('.adj-name').value.trim();
        const amount = Number(f.querySelector('.adj-amount').value);
        if (!name) { Utils.showToast('名称を入力してください', 'error'); return; }
        if (!Number.isInteger(amount) || amount === 0) { Utils.showToast('金額は0以外の整数で入力してください', 'error'); return; }
        const entry = { payMonth: ctx.payMonth, staffId, name, amount, taxable: f.querySelector('.adj-taxable').value === '1', note: f.querySelector('.adj-note').value.trim() };
        await Utils.withLoading(this, async () => {
          try {
            await Storage.addAdjustment(entry);
            if (draftIndex >= 0) drafts[key].splice(draftIndex, 1);
            Utils.showToast('精算・調整額を登録しました', 'success');
            await render();
          } catch (e) {
            Utils.showToast('登録できませんでした：' + e.message, 'error');
          }
        });
      });
    });
    box.querySelectorAll('.adj-delete-btn').forEach(btn => {
      btn.addEventListener('click', async function() {
        const ok = await Utils.showConfirm('精算・調整額の削除', 'この精算・調整額を削除しますか？（記録は削除済みとしてスプレッドシートに残ります）');
        if (!ok) return;
        await Utils.withLoading(this, async () => {
          try {
            await Storage.deleteAdjustment(btn.dataset.id);
            Utils.showToast('削除しました');
            await render();
          } catch (e) {
            Utils.showToast('削除できませんでした：' + e.message, 'error');
          }
        });
      });
    });
  }

  async function payslipToCanvas(staffId) {
    const el = document.getElementById('payslip-' + staffId);
    if (!el) return null;
    return await html2canvas(el, {
      scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff',
      scrollX: -window.scrollX, scrollY: -window.scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight
    });
  }

  async function generateSinglePayslipPDF(p, period) {
    Utils.showToast('PDF生成中...', '');
    const canvas = await payslipToCanvas(p.staffId);
    if (!canvas) { Utils.showToast('明細が見つかりません', 'error'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const imgW = 210;
    const imgH = canvas.height * imgW / canvas.width;
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 10, imgW, imgH);
    doc.save(`給与明細_${p.staffName}_${period.start}_${period.end}.pdf`);
    Utils.showToast('PDFを出力しました', 'success');
  }

  async function generateAllPayslipsPDF(payrolls, period) {
    if (payrolls.length === 0) { Utils.showToast('出力するデータがありません', 'error'); return; }
    Utils.showToast('PDF生成中...', '');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const halfH = 297 / 2;

    for (let i = 0; i < payrolls.length; i++) {
      const isTop = i % 2 === 0;
      if (i > 0 && isTop) doc.addPage();
      const canvas = await payslipToCanvas(payrolls[i].staffId);
      if (!canvas) continue;
      const imgW = 200;
      const imgH = canvas.height * imgW / canvas.width;
      const yPos = isTop ? 5 : halfH + 3;
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 5, yPos, imgW, Math.min(imgH, halfH - 10));
      if (isTop) {
        doc.setDrawColor(150);
        doc.setLineDashPattern([3, 3], 0);
        doc.line(10, halfH, 200, halfH);
        doc.setLineDashPattern([], 0);
        doc.setDrawColor(0);
      }
    }
    doc.save(`給与明細_全員_${period.start}_${period.end}.pdf`);
    Utils.showToast('全員分のPDFを出力しました', 'success');
  }

  // 月次CSVの行（確定済みのスタッフは確定した明細の値）
  function buildPayrollCsvRows(rows) {
    // 時給が複数ある場合、「時給」列は「1150/1200」、「時給内訳」列に期間ごとの明細を出す
    const headers = ['スタッフ名', '時給', '出勤日数', '総労働時間(分)', '残業時間(分)', '深夜時間(分)',
      '基本給', '残業手当', '深夜手当', '通勤手当', 'その他手当', '総支給額', '課税額', '所得税', '手取り額', '時給内訳',
      '精算・調整（課税）', '精算・調整（非課税）', '精算・調整内訳',
      '確定日時', 'TKC支給合計', 'TKC所得税', 'TKC差引支給額', '確定後の差額（再計算−実支払）'];
    const body = rows.map(({ p, closing, cmp }) => [
      p.staffName, p.wage !== null ? p.wage : p.wageSegments.map(s => s.wage).join('/'),
      p.workDays, p.totalWorkMinutes, p.totalOvertimeMinutes, p.totalNightMinutes,
      p.basePay, p.overtimePay, p.nightPay, p.commutePay, p.otherPay, p.totalPay, p.taxableAmount, p.incomeTax, p.netPay,
      p.wageSegments.length > 1
        ? p.wageSegments.map(s => `${s.wage}円 ${s.rangeStart}〜${s.rangeEnd} 通常${s.normalMinutes}分 残業${s.overtimeMinutes}分 深夜${s.nightMinutes}分`).join(' / ')
        : '',
      p.adjustmentsTaxable || 0, p.adjustmentsNonTaxable || 0,
      (p.adjustments || []).map(a => `${a.name}（${a.taxable ? '課税' : '非課税'}）${a.amount}円`).join(' / '),
      closing ? closing.closedAt : '', closing ? closing.tkcTotalPay : '', closing ? closing.tkcIncomeTax : '', closing ? closing.tkcNetPay : '',
      cmp ? cmp.diffTotal : ''
    ]);
    return [headers, ...body];
  }

  function exportPayrollCSV(rows, period) {
    if (rows.length === 0) { Utils.showToast('出力するデータがありません', 'error'); return; }
    const csv = '﻿' + buildPayrollCsvRows(rows).map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ym = `${currentYear}${String(currentMonth + 1).padStart(2, '0')}`;
    a.href = url;
    a.download = `給与データ_${ym}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Utils.showToast('CSVをエクスポートしました', 'success');
  }

  return { render, buildPayrollCsvRows };
})();
