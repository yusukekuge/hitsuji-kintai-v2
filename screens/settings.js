// ===== 画面8：設定 =====
const SettingsScreen = (() => {
  function render() {
    const container = document.getElementById('screen-settings');
    const currentPin = Storage.getPin();
    const closingDay = Storage.getSetting('closing_day', '20');
    const payDay = Storage.getSetting('pay_day', '25');
    const gasUrl = Storage.getGasUrl();

    container.innerHTML = `
      <!-- GAS連携 -->
      <div class="card">
        <h3 class="card-title">Google Apps Script (GAS) 連携</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:12px;">
          GAS WebアプリURLを設定するとGoogleスプレッドシートにデータが保存されます。
          未設定時はブラウザのlocalStorageにデータが保存されます（ローカルモード）。
          ${Storage.isGasMode() ? '<span class="badge badge-success">GAS接続中</span>' : '<span class="badge badge-warning">ローカルモード</span>'}
        </p>
        <div class="form-group">
          <label class="form-label">GAS WebアプリURL</label>
          <input type="url" class="form-input" id="set-gas-url" value="${Utils.escapeHtml(gasUrl)}" placeholder="https://script.google.com/macros/s/xxx/exec">
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" id="set-gas-save">URLを保存</button>
          ${gasUrl ? '<button class="btn btn-secondary" id="set-gas-test">接続テスト</button>' : ''}
          ${gasUrl ? '<button class="btn btn-danger" id="set-gas-clear">GAS連携を解除</button>' : ''}
        </div>
        <div id="gas-test-result" style="margin-top:12px;"></div>
      </div>

      <!-- PINコード設定 -->
      <div class="card">
        <h3 class="card-title">管理者PINコード</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:12px;">
          管理者画面へのアクセスを制限するPINコード（4桁）を設定します。
          ${currentPin ? '<span class="badge badge-success">設定済み</span>' : '<span class="badge badge-warning">未設定</span>'}
        </p>
        <div class="form-row">
          <div class="form-group"><label class="form-label">新しいPINコード</label>
            <input type="password" class="form-input" id="set-pin" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="4桁の数字">
          </div>
          <div class="form-group"><label class="form-label">PINコード（確認）</label>
            <input type="password" class="form-input" id="set-pin-confirm" maxlength="4" pattern="[0-9]{4}" inputmode="numeric" placeholder="もう一度入力">
          </div>
        </div>
        <div class="btn-group">
          <button class="btn btn-primary" id="set-pin-save">PINコードを設定</button>
          ${currentPin ? '<button class="btn btn-danger" id="set-pin-clear">PINコードを解除</button>' : ''}
        </div>
      </div>

      <!-- 締め日・支払日 -->
      <div class="card">
        <h3 class="card-title">締め日・支払日設定</h3>
        <div class="form-row">
          <div class="form-group"><label class="form-label">締め日</label>
            <select class="form-select" id="set-closing-day">
              ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${closingDay == String(i + 1) ? 'selected' : ''}>${i + 1}日</option>`).join('')}
            </select>
          </div>
          <div class="form-group"><label class="form-label">支払日</label>
            <select class="form-select" id="set-pay-day">
              ${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}" ${payDay == String(i + 1) ? 'selected' : ''}>${i + 1}日</option>`).join('')}
            </select>
          </div>
        </div>
        <button class="btn btn-primary" id="set-date-save">保存</button>
      </div>

      <!-- データ管理 -->
      <div class="card">
        <h3 class="card-title">データ管理</h3>
        <p style="color:var(--text-light);font-size:0.85rem;margin-bottom:12px;">
          データのバックアップ・復元・初期化を行います。<br>
          毎月20日の給与計算日にバックアップすることを推奨します。
        </p>

        <h4 style="font-size:0.9rem;margin:16px 0 8px;color:var(--text);">バックアップ（エクスポート）</h4>
        <div class="btn-group" style="flex-wrap:wrap;margin-bottom:16px;">
          <button class="btn btn-success" id="set-csv-backup">CSVバックアップ（全データ）</button>
          <button class="btn btn-secondary" id="set-json-export">JSONエクスポート</button>
        </div>

        <h4 style="font-size:0.9rem;margin:16px 0 8px;color:var(--text);">復元（インポート）</h4>
        <p style="color:var(--text-light);font-size:0.8rem;margin-bottom:8px;">
          CSVインポート：バックアップで出力した3つのCSVファイルを選択してください。<br>
          JSONインポート：JSONバックアップファイルを選択してください。
        </p>
        <div class="btn-group" style="flex-wrap:wrap;margin-bottom:16px;">
          <button class="btn btn-warning" id="set-csv-import">CSVインポート</button>
          <button class="btn btn-secondary" id="set-json-import">JSONインポート</button>
        </div>

        <h4 style="font-size:0.9rem;margin:16px 0 8px;color:var(--danger);">危険な操作</h4>
        <div class="btn-group">
          <button class="btn btn-danger" id="set-reset">データ初期化</button>
        </div>

        <input type="file" id="set-import-file-json" accept=".json" style="display:none;">
        <input type="file" id="set-import-file-csv" accept=".csv" multiple style="display:none;">
      </div>
    `;

    // === GAS設定 ===
    document.getElementById('set-gas-save').addEventListener('click', function() {
      Utils.withLoading(this, async () => {
        const url = document.getElementById('set-gas-url').value.trim();
        Storage.setGasUrl(url);
        Storage.init();
        Utils.showToast(url ? 'GAS URLを保存しました' : 'GAS URLをクリアしました', 'success');
        render();
      });
    });

    document.getElementById('set-gas-test')?.addEventListener('click', async function() {
      const btn = this;
      Utils.btnLoading(btn, true);
      const resultEl = document.getElementById('gas-test-result');
      resultEl.innerHTML = '<span style="color:var(--text-light);">接続テスト中...</span>';
      try {
        const res = await fetch(Storage.getGasUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ping' })
        });
        const json = await res.json();
        if (json.success || json.data) {
          resultEl.innerHTML = '<span style="color:var(--success);font-weight:700;">✅ GAS接続成功！</span>';
          Utils.showToast('GAS接続成功！', 'success');
        } else {
          resultEl.innerHTML = `<span style="color:var(--danger);">❌ GAS応答エラー: ${json.error || '不明'}</span>`;
        }
      } catch (e) {
        resultEl.innerHTML = `<span style="color:var(--danger);">❌ 接続失敗: ${e.message}</span>`;
      } finally {
        Utils.btnLoading(btn, false);
      }
    });

    document.getElementById('set-gas-clear')?.addEventListener('click', () => {
      Storage.setGasUrl('');
      Storage.init();
      Utils.showToast('GAS連携を解除しました（ローカルモードに切り替え）');
      render();
    });

    // === PINコード設定 ===
    document.getElementById('set-pin-save').addEventListener('click', () => {
      const pin = document.getElementById('set-pin').value;
      const pinConfirm = document.getElementById('set-pin-confirm').value;
      if (!/^\d{4}$/.test(pin)) { Utils.showToast('PINコードは4桁の数字で入力してください', 'error'); return; }
      if (pin !== pinConfirm) { Utils.showToast('PINコードが一致しません', 'error'); return; }
      Storage.setPin(pin);
      Utils.showToast('PINコードを設定しました', 'success');
      render();
    });

    document.getElementById('set-pin-clear')?.addEventListener('click', async () => {
      const ok = await Utils.showConfirm('PIN解除', 'PINコードを解除しますか？');
      if (ok) { Storage.setPin(''); Utils.showToast('PINコードを解除しました'); render(); }
    });

    // === 締め日・支払日 ===
    document.getElementById('set-date-save').addEventListener('click', () => {
      Storage.setSetting('closing_day', document.getElementById('set-closing-day').value);
      Storage.setSetting('pay_day', document.getElementById('set-pay-day').value);
      Utils.showToast('締め日・支払日を保存しました', 'success');
    });

    // === CSV/JSONエクスポート・インポート ===
    document.getElementById('set-csv-backup').addEventListener('click', exportAllCSV);

    document.getElementById('set-csv-import').addEventListener('click', () => {
      document.getElementById('set-import-file-csv').click();
    });
    document.getElementById('set-import-file-csv').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      const ok = await Utils.showConfirm('CSVインポート', `${files.length}個のCSVファイルを読み込みます。\n現在のデータは上書きされます。よろしいですか？`);
      if (!ok) { e.target.value = ''; return; }
      try {
        await importCSVFiles(files);
        render();
      } catch (err) {
        Utils.showToast('CSVインポート失敗: ' + err.message, 'error');
      }
      e.target.value = '';
    });

    document.getElementById('set-json-export').addEventListener('click', () => {
      const data = Storage.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `勤怠バックアップ_${Utils.today()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Utils.showToast('データをエクスポートしました', 'success');
    });

    document.getElementById('set-json-import').addEventListener('click', () => {
      document.getElementById('set-import-file-json').click();
    });
    document.getElementById('set-import-file-json').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await Utils.showConfirm('データインポート', '現在のデータが上書きされます。よろしいですか？');
      if (!ok) { e.target.value = ''; return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        Storage.importAllData(data);
        Utils.showToast('データをインポートしました', 'success');
        render();
      } catch (err) {
        Utils.showToast('ファイル形式が正しくありません', 'error');
      }
      e.target.value = '';
    });

    document.getElementById('set-reset').addEventListener('click', async () => {
      const ok = await Utils.showConfirm('データ初期化', '全てのデータが削除されます。この操作は取り消せません。本当によろしいですか？');
      if (ok) { Storage.resetAllData(); Utils.showToast('データを初期化しました'); render(); }
    });
  }

  // === CSVパーサー ===
  function parseCSVProper(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
    const rows = [];
    let i = 0;
    while (i < text.length) {
      const row = [];
      while (true) {
        let field = '';
        if (i < text.length && text[i] === '"') {
          i++;
          while (i < text.length) {
            if (text[i] === '"') {
              if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2; }
              else { i++; break; }
            } else { field += text[i]; i++; }
          }
        } else {
          while (i < text.length && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') { field += text[i]; i++; }
        }
        row.push(field);
        if (i < text.length && text[i] === ',') { i++; } else { break; }
      }
      if (i < text.length && text[i] === '\r') i++;
      if (i < text.length && text[i] === '\n') i++;
      if (row.length === 1 && row[0] === '' && i >= text.length) break;
      rows.push(row);
    }
    return rows;
  }

  async function importCSVFiles(files) {
    let importCount = { staff: 0, records: 0, shifts: 0 };
    for (const file of files) {
      const text = await file.text();
      const rows = parseCSVProper(text);
      if (rows.length < 2) continue;
      const header = rows[0];
      const dataRows = rows.slice(1);
      const col0 = header[0].trim(), col1 = header.length > 1 ? header[1].trim() : '';

      if (col0 === 'ID' && col1 === '氏名') {
        const data = dataRows.map(r => ({
          id: r[0] || '', name: r[1] || '', hourlyWage: Number(r[2]) || 1150,
          probation: r[3] === '1', commuteDistance: Number(r[4]) || 0,
          hireDate: r[5] || '', otherAllowance: Number(r[6]) || 0,
          taxCategory: r[7] || 'kou', dependents: Number(r[8]) || 0, active: r[9] !== '0'
        })).filter(s => s.id && s.name);
        if (data.length > 0) { localStorage.setItem('staff', JSON.stringify(data)); importCount.staff = data.length; }
      } else if (col0 === 'ID' && col1 === 'スタッフID') {
        const data = dataRows.map(r => ({
          id: r[0] || '', staffId: r[1] || '', date: r[2] || '',
          type: r[3] || '', time: r[4] || '', modified: r[5] === '1'
        })).filter(r => r.id && r.staffId);
        if (data.length > 0) { localStorage.setItem('time_records', JSON.stringify(data)); importCount.records = data.length; }
      } else if (col0 === 'スタッフID' && col1 === '日付') {
        const data = dataRows.map(r => ({
          staffId: r[0] || '', date: r[1] || '', startTime: r[2] || '', endTime: r[3] || ''
        })).filter(s => s.staffId && s.date);
        if (data.length > 0) { localStorage.setItem('shifts', JSON.stringify(data)); importCount.shifts = data.length; }
      } else {
        throw new Error(`不明なCSV形式: "${file.name}"`);
      }
    }
    const parts = [];
    if (importCount.staff) parts.push(`スタッフ ${importCount.staff}件`);
    if (importCount.records) parts.push(`打刻記録 ${importCount.records}件`);
    if (importCount.shifts) parts.push(`シフト ${importCount.shifts}件`);
    if (parts.length === 0) throw new Error('インポートできるデータがありませんでした');
    Utils.showToast(`インポート完了: ${parts.join('、')}`, 'success');
  }

  function exportAllCSV() {
    const data = Storage.exportAllData();
    const today = Utils.today();
    downloadCSV(`スタッフ_${today}.csv`, [
      ['ID', '氏名', '時給', '試用期間', '通勤距離', '入社日', 'その他手当', '源泉区分', '扶養人数', '有効'],
      ...(data.staff || []).map(s => [s.id, s.name, s.hourlyWage || 1150, s.probation ? '1' : '0', s.commuteDistance || 0, s.hireDate || '', s.otherAllowance || 0, s.taxCategory || 'kou', s.dependents || 0, s.active !== false ? '1' : '0'])
    ]);
    downloadCSV(`打刻記録_${today}.csv`, [
      ['ID', 'スタッフID', '日付', '種別', '時刻', '修正済'],
      ...(data.time_records || []).map(r => [r.id, r.staffId, r.date, r.type, r.time, r.modified ? '1' : '0'])
    ]);
    downloadCSV(`シフト_${today}.csv`, [
      ['スタッフID', '日付', '開始', '終了'],
      ...(data.shifts || []).map(s => [s.staffId, s.date, s.startTime || '', s.endTime || ''])
    ]);
    Utils.showToast('CSVバックアップを出力しました（3ファイル）', 'success');
  }

  function downloadCSV(filename, rows) {
    const csv = '\uFEFF' + rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  return { render };
})();
