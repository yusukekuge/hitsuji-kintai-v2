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
    const staff = await Storage.getStaff();
    const shifts = await Storage.getShifts(currentYear, currentMonth);
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
      // html2canvasをページ内の実際の要素に対して直接実行
      // オフスクリーンのクローンではなく、一時的に幅を固定して描画精度を上げる
      const origOverflow = tableArea.style.overflow;
      const origMinW = tableArea.style.minWidth;
      tableArea.style.overflow = 'visible';
      tableArea.style.minWidth = '1100px';

      // 少し待ってレイアウトを安定させる
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(tableArea, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      // スタイルを元に戻す
      tableArea.style.overflow = origOverflow;
      tableArea.style.minWidth = origMinW;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('l', 'mm', 'a4'); // A4横向き
      const pageW = 297, pageH = 210, margin = 8;
      const availW = pageW - margin * 2;
      const availH = pageH - margin * 2;

      // タイトルを描画
      const titleText = titleEl ? titleEl.textContent : '';
      doc.setFontSize(14);
      doc.text(titleText, pageW / 2, margin + 4, { align: 'center' });

      // カレンダー画像を描画（タイトル分のスペースを確保）
      const titleSpace = 12;
      const imgAreaH = availH - titleSpace;
      const imgW = availW;
      const imgH = canvas.height * imgW / canvas.width;

      if (imgH <= imgAreaH) {
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin, margin + titleSpace, imgW, imgH);
      } else {
        const scale = imgAreaH / imgH;
        const scaledW = imgW * scale;
        doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', margin + (availW - scaledW) / 2, margin + titleSpace, scaledW, imgAreaH);
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
