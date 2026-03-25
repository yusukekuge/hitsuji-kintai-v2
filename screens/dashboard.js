// ===== 画面3：管理者ダッシュボード =====
const DashboardScreen = (() => {
  async function render() {
    const container = document.getElementById('screen-dashboard');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const period = Utils.getPayPeriod(year, month);

    // 年間累計用：1月の給与期間開始〜今月の給与期間終了を1回で取得
    const janPeriod = Utils.getPayPeriod(year, 0);
    const [staff, records, annualRecords] = await Promise.all([
      Storage.getStaff(),
      Storage.getTimeRecordsByRange(period.start, period.end),
      Storage.getTimeRecordsByRange(janPeriod.start, period.end)
    ]);

    const summaries = [];
    for (const s of staff) {
      const staffRecords = records.filter(r => r.staffId === s.id);
      const dates = [...new Set(staffRecords.map(r => r.date))];
      let totalWork = 0, totalNight = 0, workDays = 0;
      dates.forEach(date => {
        const dw = Calc.calcDayWork(staffRecords, s.id, date);
        if (dw.isComplete) { totalWork += dw.workMinutes; totalNight += dw.nightMinutes; workDays++; }
      });

      // 年間累計（1月から今月まで）- annualRecordsから月別に集計
      let annualTotal = 0;
      const wage = s.probation ? Calc.DEFAULTS.probationWage : (s.hourlyWage || Calc.DEFAULTS.hourlyWage);
      for (let m = 0; m <= month; m++) {
        const p = Utils.getPayPeriod(year, m);
        const monthRecords = annualRecords.filter(r => r.date >= p.start && r.date <= p.end);
        const monthDates = [...new Set(monthRecords.filter(r => r.staffId === s.id).map(r => r.date))];
        let monthWork = 0;
        monthDates.forEach(date => {
          const dw = Calc.calcDayWork(monthRecords, s.id, date);
          if (dw.isComplete) monthWork += dw.workMinutes;
        });
        annualTotal += Math.floor(wage * monthWork / 60);
      }

      const warnings = Calc.calcDependentWarning(annualTotal, month + 1);
      summaries.push({ staff: s, workDays, totalWork, totalNight, annualTotal, warnings });
    }

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title">管理者ダッシュボード</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:16px;">
          対象期間：${period.start} 〜 ${period.end}
          ${Storage.isGasMode() ? '<span class="badge badge-success" style="margin-left:8px;">GAS接続中</span>' : '<span class="badge badge-warning" style="margin-left:8px;">ローカルモード</span>'}
        </p>
      </div>

      <div class="summary-grid">
        ${summaries.map(sum => `
          <div class="summary-card">
            <h3>${Utils.escapeHtml(sum.staff.name)}</h3>
            <div class="flex-between mb-8"><span>出勤日数</span><span class="value" style="font-size:1.2rem;">${sum.workDays}日</span></div>
            <div class="flex-between mb-8"><span>総労働時間</span><span>${Utils.minutesToHMJP(sum.totalWork)}</span></div>
            <div class="flex-between mb-8"><span>深夜時間</span><span>${Utils.minutesToHMJP(sum.totalNight)}</span></div>
            <div class="flex-between mb-8"><span>年間累計</span><span>${Utils.formatCurrency(sum.annualTotal)}</span></div>
            ${sum.warnings.map(w => `
              <div class="alert-box alert-${w.type}"><strong>${w.line}</strong> ${w.message}</div>
            `).join('')}
          </div>
        `).join('')}
        ${summaries.length === 0 ? '<p style="color:var(--text-light);">スタッフが登録されていません。</p>' : ''}
      </div>
    `;
  }

  return { render };
})();
