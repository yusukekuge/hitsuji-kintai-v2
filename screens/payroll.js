// ===== 画面5：給与計算 =====
const PayrollScreen = (() => {
  let currentYear, currentMonth;

  function init() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
  }

  async function render() {
    if (currentYear === undefined) init();
    const container = document.getElementById('screen-payroll');
    const period = Utils.getPayPeriod(currentYear, currentMonth);
    const [staff, records] = await Promise.all([
      Storage.getStaff(),
      Storage.getTimeRecordsByRange(period.start, period.end)
    ]);

    const payrolls = [];
    for (const s of staff) {
      const dates = [...new Set(records.filter(r => r.staffId === s.id).map(r => r.date))];
      const dayWorks = dates.map(date => Calc.calcDayWork(records, s.id, date));
      payrolls.push(Calc.calcMonthlyPay(s, dayWorks));
    }

    const payDay = Storage.getSetting('pay_day', '25');
    const payDateStr = `${currentYear}年${currentMonth + 1}月${payDay}日`;
    const ps = period.start.split('-');
    const pe = period.end.split('-');
    const periodJP = `${parseInt(ps[0])}年${parseInt(ps[1])}月${parseInt(ps[2])}日〜${parseInt(pe[1])}月${parseInt(pe[2])}日`;

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
        </p>
      </div>

      <div class="card">
        <h3 class="card-title">給与一覧</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>スタッフ</th><th>出勤日数</th><th>総労働</th><th>深夜</th><th>残業</th>
                <th>基本給</th><th>深夜手当</th><th>残業代</th><th>通勤手当</th><th>その他</th>
                <th>総支給</th><th>所得税</th><th>手取り</th>
              </tr>
            </thead>
            <tbody>
              ${payrolls.map(p => `
                <tr>
                  <td>${Utils.escapeHtml(p.staffName)}</td>
                  <td class="num">${p.workDays}日</td>
                  <td class="num">${Utils.minutesToHM(p.totalWorkMinutes)}</td>
                  <td class="num">${Utils.minutesToHM(p.totalNightMinutes)}</td>
                  <td class="num">${Utils.minutesToHM(p.totalOvertimeMinutes)}</td>
                  <td class="num">${Utils.formatCurrency(p.basePay)}</td>
                  <td class="num">${Utils.formatCurrency(p.nightPay)}</td>
                  <td class="num">${Utils.formatCurrency(p.overtimePay)}</td>
                  <td class="num">${Utils.formatCurrency(p.commutePay)}</td>
                  <td class="num">${Utils.formatCurrency(p.otherPay)}</td>
                  <td class="num">${Utils.formatCurrency(p.totalPay)}</td>
                  <td class="num" style="color:var(--danger);">${Utils.formatCurrency(p.incomeTax)}</td>
                  <td class="num"><strong>${Utils.formatCurrency(p.netPay)}</strong></td>
                </tr>
              `).join('')}
              ${payrolls.length === 0 ? '<tr><td colspan="13" style="text-align:center;color:var(--text-light);">データがありません</td></tr>' : ''}
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
        ${payrolls.map((p, idx) => renderPayslipHTML(p, period, periodJP, payDateStr, currentYear, currentMonth, idx)).join('')}
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
      Utils.withLoading(this, async () => exportPayrollCSV(payrolls, period));
    });

    container.querySelectorAll('.payslip-pdf-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const p = payrolls.find(pay => pay.staffId === btn.dataset.staff);
        if (p) Utils.withLoading(this, () => generateSinglePayslipPDF(p, period));
      });
    });
  }

  function renderPayslipHTML(p, period, periodJP, payDateStr, year, month, index) {
    const taxCatLabel = p.taxCategory === 'otsu' ? '乙欄' : `甲欄（扶養${p.dependents}人）`;
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
                  <tr><td>労働時間</td><td class="ps-val">${Utils.minutesToHM(p.totalWorkMinutes)}</td></tr>
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
                  <tr class="ps-total-row"><td><strong>総支給合計</strong></td><td class="ps-val"><strong>${Utils.formatCurrency(p.totalPay)}</strong></td></tr>
                </tbody>
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
        ${index % 2 === 0 && index < 99 ? '<div class="ps-page-break"></div>' : ''}
      </div>
    `;
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

  function exportPayrollCSV(payrolls, period) {
    if (payrolls.length === 0) { Utils.showToast('出力するデータがありません', 'error'); return; }
    const headers = ['スタッフ名', '時給', '出勤日数', '総労働時間(分)', '残業時間(分)', '深夜時間(分)',
      '基本給', '残業手当', '深夜手当', '通勤手当', 'その他手当', '総支給額', '課税額', '所得税', '手取り額'];
    const rows = payrolls.map(p => [
      p.staffName, p.wage, p.workDays, p.totalWorkMinutes, p.totalOvertimeMinutes, p.totalNightMinutes,
      p.basePay, p.overtimePay, p.nightPay, p.commutePay, p.otherPay, p.totalPay, p.taxableAmount, p.incomeTax, p.netPay
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
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

  return { render };
})();
