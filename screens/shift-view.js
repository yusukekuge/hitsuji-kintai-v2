// ===== 画面2：シフト表（閲覧・印刷・PDF） =====
const ShiftViewScreen = (() => {
  let currentYear, currentMonth;

  function init() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
  }

  async function render() {
    if (currentYear === undefined) init();
    const container = document.getElementById('screen-shift-view');
    const [staff, shifts] = await Promise.all([
      Storage.getStaff(),
      Storage.getShifts(currentYear, currentMonth)
    ]);
    const daysInMonth = Utils.getDaysInMonth(currentYear, currentMonth);
    const todayStr = Utils.today();
    const titleText = `${currentYear}年${currentMonth + 1}月 シフト表`;

    const dateHeaders = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = Utils.getDayOfWeek(currentYear, currentMonth, d);
      dateHeaders.push({ d, dateStr, dow, dayName: Utils.DAY_NAMES[dow] });
    }

    container.innerHTML = `
      <div class="card">
        <h3 class="card-title" id="sv-title">${titleText}</h3>
        <div class="flex-between mb-16" style="flex-wrap:wrap;gap:8px;">
          <div class="month-nav" style="margin-bottom:0;">
            <button class="btn btn-sm btn-secondary" id="sv-prev">&lt;</button>
            <span class="month-label">${currentYear}年${currentMonth + 1}月</span>
            <button class="btn btn-sm btn-secondary" id="sv-next">&gt;</button>
          </div>
          <div class="btn-group no-print">
            <button class="btn btn-sm btn-secondary" id="sv-pdf">PDFエクスポート</button>
            <button class="btn btn-sm btn-secondary" id="sv-print">印刷</button>
          </div>
        </div>

        <div class="table-wrap" id="sv-table-area">
          <div class="shift-calendar" style="grid-template-columns: 80px repeat(${daysInMonth}, 1fr);">
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
                      ${sh && sh.startTime ? `<div class="shift-time">${sh.startTime}<br>${sh.endTime || ''}</div>` : ''}
                    </div>
                  `;
                }).join('')}
              `;
            }).join('')}

            ${staff.length === 0 ? `<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-light);">スタッフが登録されていません</div>` : ''}
          </div>
        </div>
      </div>

      ${staff.length > 0 ? (() => {
        const summary = Calc.calcShiftMonthlySummary(staff, shifts);
        return `
          <div class="card no-print">
            <h3 class="card-title">月次集計（${currentYear}年${currentMonth + 1}月）</h3>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>スタッフ</th><th>出勤日数</th><th>合計勤務時間</th><th>時給</th><th>給与見込み</th><th>扶養ステータス</th></tr>
                </thead>
                <tbody>
                  ${summary.map(s => `
                    <tr>
                      <td>${Utils.escapeHtml(s.name)}</td>
                      <td class="num">${s.shiftDays}日</td>
                      <td class="num">${Utils.minutesToHM(s.totalMinutes)}</td>
                      <td class="num">${Utils.formatCurrency(s.wage)}</td>
                      <td class="num">${Utils.formatCurrency(s.estimatedPay)}</td>
                      <td><span class="badge ${s.statusClass}">${s.statusLabel}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })() : ''}
    `;

    document.getElementById('sv-prev').addEventListener('click', () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      render();
    });
    document.getElementById('sv-next').addEventListener('click', () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      render();
    });

    document.getElementById('sv-print').addEventListener('click', () => {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('print-target'));
      container.classList.add('print-target');
      window.print();
      container.classList.remove('print-target');
    });

    document.getElementById('sv-pdf').addEventListener('click', exportPDF);
  }

  async function exportPDF() {
    const tableArea = document.getElementById('sv-table-area');
    const titleEl = document.getElementById('sv-title');
    if (!tableArea) return;

    Utils.showToast('PDF生成中...', '');

    try {
      // タイトル＋カレンダーをまとめてキャプチャするためのラッパーを作成
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:absolute;left:0;top:0;background:#fff;padding:16px 12px;z-index:9999;';

      // タイトル要素を作成
      const titleDiv = document.createElement('div');
      titleDiv.textContent = titleEl ? titleEl.textContent : '';
      titleDiv.style.cssText = 'text-align:center;font-size:18px;font-weight:700;margin-bottom:12px;font-family:Noto Sans JP,sans-serif;';
      wrapper.appendChild(titleDiv);

      // テーブルエリアをクローンして追加
      const clone = tableArea.cloneNode(true);
      clone.style.overflow = 'visible';
      clone.style.minWidth = '1100px';
      wrapper.appendChild(clone);

      document.body.appendChild(wrapper);

      // レイアウト安定待ち
      await new Promise(r => setTimeout(r, 150));

      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      document.body.removeChild(wrapper);

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // A4横向き
      const pageW = 297, pageH = 210, margin = 8;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;

      // タイトル含むカレンダー全体を画像として描画
      const imgW = availW;
      const imgH = canvas.height * imgW / canvas.width;

      if (imgH <= availH) {
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin, imgW, imgH);
      } else {
        const scale = availH / imgH;
        const scaledW = imgW * scale;
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin + (availW - scaledW) / 2, margin, scaledW, availH);
      }

      const ym = `${currentYear}年${String(currentMonth + 1).padStart(2, '0')}月`;
      doc.save(`シフト表_${ym}.pdf`);
      Utils.showToast('PDFを出力しました', 'success');
    } catch (e) {
      console.error('PDF生成エラー:', e);
      Utils.showToast('PDF生成に失敗しました: ' + e.message, 'error');
    }
  }

  return { render };
})();
