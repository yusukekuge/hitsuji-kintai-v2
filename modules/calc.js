// ===== 計算モジュール =====
const Calc = (() => {
  // デフォルト設定
  const DEFAULTS = {
    hourlyWage: 1150,
    probationWage: 1116,
    commuteCostPerKm: 10,
    commuteMaxPerDay: 500,
    nightStart: 22,
    nightEnd: 5,
    overtimeRate: 0.25,      // 法定超25%
    nightRate: 0.25,          // 深夜25%
    holidayRate: 0.35,        // 法定休日35%
    closingDay: 20,
    payDay: 25
  };

  // 秒を四捨五入して分単位に丸める（30秒以上で切り上げ）
  function roundToMinute(d) {
    const sec = d.getSeconds();
    const rounded = new Date(d);
    rounded.setSeconds(0, 0);
    if (sec >= 30) rounded.setMinutes(rounded.getMinutes() + 1);
    return rounded;
  }

  // 休憩ルール（打刻がない場合の自動付与）
  function getAutoBreakMinutes(workMinutes) {
    if (workMinutes <= 360) return 0;        // 6時間以内→0分
    if (workMinutes <= 480) return 45;       // 6時間超8時間以内→45分
    return 60;                                // 8時間超→60分
  }

  // 1日の勤務を計算
  function calcDayWork(records, staffId, date) {
    const dayRecords = records
      .filter(r => r.staffId === staffId && r.date === date)
      .sort((a, b) => a.time.localeCompare(b.time));

    const clockIn = dayRecords.find(r => r.type === 'clock_in');
    const clockOut = dayRecords.find(r => r.type === 'clock_out');
    const breakStarts = dayRecords.filter(r => r.type === 'break_start');
    const breakEnds = dayRecords.filter(r => r.type === 'break_end');

    if (!clockIn || !clockOut) {
      return {
        date,
        staffId,
        clockIn: clockIn ? clockIn.time : null,
        clockOut: clockOut ? clockOut.time : null,
        totalMinutes: 0,
        breakMinutes: 0,
        workMinutes: 0,
        nightMinutes: 0,
        overtimeMinutes: 0,
        isComplete: false
      };
    }

    const startTime = roundToMinute(new Date(clockIn.time));
    const endTime = roundToMinute(new Date(clockOut.time));
    const totalMinutes = Math.floor((endTime - startTime) / 60000);

    // 休憩計算
    let breakMinutes = 0;
    if (breakStarts.length > 0) {
      // 打刻ベース
      for (let i = 0; i < breakStarts.length; i++) {
        const bs = roundToMinute(new Date(breakStarts[i].time));
        const be = roundToMinute(breakEnds[i] ? new Date(breakEnds[i].time) : endTime);
        breakMinutes += Math.floor((be - bs) / 60000);
      }
    } else {
      // 自動付与
      breakMinutes = getAutoBreakMinutes(totalMinutes);
    }

    const workMinutes = Math.max(0, totalMinutes - breakMinutes);

    // 深夜時間計算（22:00〜5:00）
    const nightMinutes = calcNightMinutes(startTime, endTime, breakMinutes);

    // 残業計算（1日8時間超が法定超）
    const overtimeMinutes = Math.max(0, workMinutes - 480);

    return {
      date,
      staffId,
      clockIn: clockIn.time,
      clockOut: clockOut.time,
      totalMinutes,
      breakMinutes,
      workMinutes,
      nightMinutes,
      overtimeMinutes,
      isComplete: true
    };
  }

  // 深夜時間の計算
  function calcNightMinutes(start, end, breakMin) {
    let nightMin = 0;
    const sDate = new Date(start);
    const eDate = new Date(end);

    // 当日22:00〜翌5:00をチェック
    const day = new Date(sDate);
    day.setHours(0,0,0,0);

    // 当日の22:00
    const nightStart = new Date(day);
    nightStart.setHours(22, 0, 0, 0);

    // 翌日の5:00
    const nightEnd = new Date(day);
    nightEnd.setDate(nightEnd.getDate() + 1);
    nightEnd.setHours(5, 0, 0, 0);

    // 前日の22:00〜当日5:00もチェック
    const prevNightStart = new Date(day);
    prevNightStart.setDate(prevNightStart.getDate() - 1);
    prevNightStart.setHours(22, 0, 0, 0);
    const prevNightEnd = new Date(day);
    prevNightEnd.setHours(5, 0, 0, 0);

    // 前日深夜帯との重複
    const overlapPrev = calcOverlap(sDate, eDate, prevNightStart, prevNightEnd);
    // 当日深夜帯との重複
    const overlapCur = calcOverlap(sDate, eDate, nightStart, nightEnd);

    nightMin = overlapPrev + overlapCur;

    // 休憩分を按分で引く（簡易計算）
    const totalWork = Math.floor((eDate - sDate) / 60000);
    if (totalWork > 0 && breakMin > 0) {
      const breakRatio = breakMin / totalWork;
      nightMin = Math.max(0, Math.floor(nightMin * (1 - breakRatio)));
    }

    return nightMin;
  }

  // 2つの時間範囲の重複分数を計算
  function calcOverlap(s1, e1, s2, e2) {
    const start = s1 > s2 ? s1 : s2;
    const end = e1 < e2 ? e1 : e2;
    if (start >= end) return 0;
    return Math.floor((end - start) / 60000);
  }

  // 月次給与計算
  function calcMonthlyPay(staff, dayWorks) {
    const wage = staff.probation ? DEFAULTS.probationWage : (staff.hourlyWage || DEFAULTS.hourlyWage);
    let totalWorkMinutes = 0;
    let totalNightMinutes = 0;
    let totalOvertimeMinutes = 0;
    let workDays = 0;

    dayWorks.forEach(dw => {
      if (dw.isComplete) {
        totalWorkMinutes += dw.workMinutes;
        totalNightMinutes += dw.nightMinutes;
        totalOvertimeMinutes += dw.overtimeMinutes;
        workDays++;
      }
    });

    // 基本給（全労働時間 × 時給）
    const basePay = Math.floor(wage * totalWorkMinutes / 60);

    // 残業代（割増分のみ：時給 × 25% × 残業時間）
    const overtimePay = Math.floor(wage * DEFAULTS.overtimeRate * totalOvertimeMinutes / 60);

    // 深夜割増（25%）
    const nightPay = Math.floor(wage * DEFAULTS.nightRate * totalNightMinutes / 60);

    // 通勤手当
    const commuteDistance = staff.commuteDistance || 0;
    const dailyCommute = Math.min(commuteDistance * DEFAULTS.commuteCostPerKm, DEFAULTS.commuteMaxPerDay);
    const commutePay = Math.floor(dailyCommute * workDays);

    // その他手当
    const otherPay = staff.otherAllowance || 0;

    const totalPay = basePay + overtimePay + nightPay + commutePay + otherPay;

    // 所得税計算
    const taxCategory = staff.taxCategory || 'kou';
    const dependents = staff.dependents || 0;
    const incomeTax = calcIncomeTax(totalPay, commutePay, taxCategory, dependents);
    const taxableAmount = Math.max(0, totalPay - commutePay);
    const netPay = totalPay - incomeTax;

    return {
      staffId: staff.id,
      staffName: staff.name,
      wage,
      workDays,
      totalWorkMinutes,
      totalNightMinutes,
      totalOvertimeMinutes,
      basePay,
      overtimePay,
      nightPay,
      commutePay,
      otherPay,
      totalPay,
      taxCategory,
      dependents,
      taxableAmount,
      incomeTax,
      netPay
    };
  }

  // ===== 源泉徴収税額計算（令和8年分 月額表ベース） =====
  // 令和8年分 給与所得の源泉徴収税額表（月額表）に基づく

  // 甲欄テーブル: [課税支給額上限, 扶養0人, 1人, 2人, 3人, 4人, 5人]
  const TAX_TABLE_KOU = [
    // 105,000円未満：全扶養人数で0円
    [105000, 0, 0, 0, 0, 0, 0],
    [107000, 170, 0, 0, 0, 0, 0],
    [109000, 280, 0, 0, 0, 0, 0],
    [111000, 380, 0, 0, 0, 0, 0],
    [113000, 480, 0, 0, 0, 0, 0],
    [115000, 580, 0, 0, 0, 0, 0],
    [117000, 680, 0, 0, 0, 0, 0],
    [119000, 790, 0, 0, 0, 0, 0],
    [121000, 890, 0, 0, 0, 0, 0],
    [123000, 990, 0, 0, 0, 0, 0],
    [125000, 1090, 0, 0, 0, 0, 0],
    [127000, 1190, 0, 0, 0, 0, 0],
    [129000, 1300, 0, 0, 0, 0, 0],
    [131000, 1400, 0, 0, 0, 0, 0],
    [133000, 1500, 0, 0, 0, 0, 0],
    [135000, 1600, 0, 0, 0, 0, 0],
    [137000, 1710, 0, 0, 0, 0, 0],
    [139000, 1810, 190, 0, 0, 0, 0],
    [141000, 1910, 300, 0, 0, 0, 0],
    [143000, 2010, 400, 0, 0, 0, 0],
    [145000, 2110, 500, 0, 0, 0, 0],
    [147000, 2220, 600, 0, 0, 0, 0],
    [149000, 2320, 700, 0, 0, 0, 0],
    [151000, 2420, 810, 0, 0, 0, 0],
    [153000, 2520, 910, 0, 0, 0, 0],
    [155000, 2620, 1010, 0, 0, 0, 0],
    [157000, 2730, 1110, 0, 0, 0, 0],
    [159000, 2830, 1210, 0, 0, 0, 0],
    [161000, 2910, 1300, 0, 0, 0, 0],
    [163000, 2980, 1370, 0, 0, 0, 0],
    [165000, 3050, 1440, 0, 0, 0, 0],
    [167000, 3120, 1510, 0, 0, 0, 0],
    [169000, 3200, 1580, 0, 0, 0, 0],
    [171000, 3270, 1650, 0, 0, 0, 0],
    [173000, 3340, 1730, 100, 0, 0, 0],
    [175000, 3410, 1800, 170, 0, 0, 0],
    [177000, 3480, 1870, 250, 0, 0, 0],
    [179000, 3550, 1940, 320, 0, 0, 0],
    [181000, 3620, 2010, 390, 0, 0, 0],
    [183000, 3700, 2080, 460, 0, 0, 0],
    [185000, 3770, 2150, 530, 0, 0, 0],
    [187000, 3840, 2230, 600, 0, 0, 0],
    [189000, 3910, 2300, 670, 0, 0, 0],
    [191000, 3980, 2370, 750, 0, 0, 0],
    [193000, 4050, 2440, 820, 0, 0, 0],
    [195000, 4120, 2510, 890, 0, 0, 0],
    [197000, 4200, 2580, 960, 0, 0, 0],
    [199000, 4270, 2650, 1030, 0, 0, 0],
    [201000, 4340, 2730, 1100, 0, 0, 0],
    [203000, 4410, 2800, 1170, 0, 0, 0],
    [205000, 4480, 2870, 1250, 0, 0, 0],
    [207000, 4550, 2940, 1320, 0, 0, 0],
    [209000, 4630, 3010, 1390, 0, 0, 0],
    [211000, 4700, 3080, 1460, 0, 0, 0],
    [213000, 4770, 3150, 1530, 0, 0, 0],
    [215000, 4840, 3230, 1600, 0, 0, 0],
    [217000, 4910, 3300, 1670, 0, 0, 0],
    [219000, 4980, 3370, 1750, 130, 0, 0],
    [221000, 5050, 3440, 1820, 200, 0, 0],
    [224000, 5150, 3520, 1910, 300, 0, 0],
    [227000, 5250, 3630, 2020, 400, 0, 0],
    [230000, 5360, 3740, 2120, 510, 0, 0],
    [233000, 5460, 3850, 2240, 610, 0, 0],
    [236000, 5570, 3950, 2340, 720, 0, 0],
    [239000, 5680, 4060, 2450, 830, 0, 0],
    [242000, 5790, 4170, 2550, 940, 0, 0],
    [245000, 5890, 4280, 2660, 1040, 0, 0],
    [248000, 6000, 4380, 2770, 1150, 0, 0],
    [251000, 6110, 4490, 2880, 1260, 0, 0],
    [254000, 6220, 4590, 2980, 1370, 0, 0],
    [257000, 6320, 4710, 3090, 1470, 0, 0],
    [260000, 6430, 4810, 3200, 1580, 0, 0],
    [263000, 6530, 4920, 3310, 1680, 0, 0],
    [266000, 6650, 5020, 3410, 1800, 170, 0],
    [269000, 6750, 5140, 3520, 1900, 290, 0],
    [272000, 6860, 5240, 3620, 2010, 390, 0],
    // 272,000円以上: 以下は概算計算にフォールバック
  ];

  // 乙欄: 金額帯別の税額テーブル（令和8年分月額表）
  // [上限金額, 税額]
  const TAX_TABLE_OTSU_FIXED = [
    [105000, -1],    // 105,000円未満: 税率計算（3.063%）
    [107000, 3800],
    [109000, 3800],
    [111000, 3900],
    [113000, 4000],
    [115000, 4100],
    [117000, 4100],
    [119000, 4200],
    [121000, 4300],
    [123000, 4300],
    [125000, 4400],
    [127000, 4700],
    [129000, 5000],
    [131000, 5300],
    [133000, 5500],
    [135000, 5800],
    [137000, 6100],
    [139000, 6400],
    [141000, 6700],
    [143000, 7000],
    [145000, 7400],
    [147000, 7700],
    [149000, 8000],
    [151000, 8300],
    [153000, 8600],
    [155000, 8900],
    [157000, 9200],
    [159000, 9500],
    [161000, 9800],
    [163000, 10100],
    [165000, 10400],
    [167000, 10700],
    [169000, 11000],
    [171000, 11300],
    [173000, 11500],
    [175000, 11800],
    [177000, 12100],
    [179000, 12500],
    [181000, 12800],
    [183000, 13300],
    [185000, 14000],
    [187000, 14700],
    [189000, 15400],
    [191000, 16100],
    [193000, 16800],
    [195000, 17600],
    [197000, 18300],
    [199000, 19000],
    [201000, 19700],
    [203000, 20400],
    [205000, 21000],
    [207000, 21700],
    [209000, 22500],
    [211000, 23000],
    [213000, 23600],
    [215000, 24100],
    [217000, 24700],
    [219000, 25300],
    [221000, 25800],
    [224000, 26400],
    [227000, 27500],
    [230000, 28500],
    [233000, 29500],
  ];

  // 甲欄で源泉徴収税額を計算
  function calcTaxKou(taxableAmount, dependents) {
    const dep = Math.min(Math.max(dependents || 0, 0), 5);
    // テーブルの範囲内を検索
    for (let i = 0; i < TAX_TABLE_KOU.length; i++) {
      if (taxableAmount < TAX_TABLE_KOU[i][0]) {
        return TAX_TABLE_KOU[i][dep + 1] || 0;
      }
    }
    // テーブル範囲外（272,000円以上）: 概算 - 課税所得 × 概算税率
    const lastEntry = TAX_TABLE_KOU[TAX_TABLE_KOU.length - 1];
    const baseTax = lastEntry[dep + 1] || 0;
    const excess = taxableAmount - lastEntry[0];
    return baseTax + Math.floor(excess * 0.0408);
  }

  // 乙欄で源泉徴収税額を計算
  function calcTaxOtsu(taxableAmount) {
    if (taxableAmount <= 0) return 0;
    // 105,000円未満: 3.063%
    if (taxableAmount < 105000) {
      return Math.floor(taxableAmount * 0.03063);
    }
    // テーブル検索
    for (let i = 0; i < TAX_TABLE_OTSU_FIXED.length; i++) {
      if (taxableAmount < TAX_TABLE_OTSU_FIXED[i][0]) {
        if (TAX_TABLE_OTSU_FIXED[i][1] === -1) {
          return Math.floor(taxableAmount * 0.03063);
        }
        return TAX_TABLE_OTSU_FIXED[i][1];
      }
    }
    // テーブル範囲外: 概算
    const lastEntry = TAX_TABLE_OTSU_FIXED[TAX_TABLE_OTSU_FIXED.length - 1];
    const baseTax = lastEntry[1];
    const excess = taxableAmount - lastEntry[0];
    return baseTax + Math.floor(excess * 0.0468);
  }

  // 所得税を計算
  function calcIncomeTax(totalPay, commutePay, taxCategory, dependents) {
    const taxableAmount = Math.max(0, totalPay - commutePay);
    if (taxCategory === 'otsu') {
      return calcTaxOtsu(taxableAmount);
    }
    // 甲欄（デフォルト）
    return calcTaxKou(taxableAmount, dependents || 0);
  }

  // 年間累計給与から扶養ライン警告を計算
  function calcDependentWarning(annualTotal, currentMonth) {
    const remainingMonths = 12 - currentMonth; // currentMonth: 1-12
    const line103 = 1030000;
    const line130 = 1300000;

    const remaining103 = line103 - annualTotal;
    const remaining130 = line130 - annualTotal;

    const warnings = [];
    if (remaining103 <= 0) {
      warnings.push({ type: 'danger', line: '103万円', message: `103万円ラインを超過しています（超過額: ${Utils.formatCurrency(Math.abs(remaining103))}）` });
    } else if (remainingMonths > 0) {
      const monthlyLimit103 = Math.floor(remaining103 / remainingMonths);
      if (monthlyLimit103 < 100000) {
        warnings.push({ type: 'warning', line: '103万円', message: `残り${Utils.formatCurrency(remaining103)}（月あたり${Utils.formatCurrency(monthlyLimit103)}まで / 残${remainingMonths}ヶ月）` });
      }
    }

    if (remaining130 <= 0) {
      warnings.push({ type: 'danger', line: '130万円', message: `130万円ラインを超過しています（超過額: ${Utils.formatCurrency(Math.abs(remaining130))}）` });
    } else if (remainingMonths > 0) {
      const monthlyLimit130 = Math.floor(remaining130 / remainingMonths);
      if (monthlyLimit130 < 120000) {
        warnings.push({ type: 'warning', line: '130万円', message: `残り${Utils.formatCurrency(remaining130)}（月あたり${Utils.formatCurrency(monthlyLimit130)}まで / 残${remainingMonths}ヶ月）` });
      }
    }

    return warnings;
  }

  // シフトデータから勤務時間を計算（HH:MM文字列 → 分）
  function calcShiftMinutes(startTime, endTime) {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
    let total = (eh * 60 + em) - (sh * 60 + sm);
    if (total <= 0) return 0;
    const breakMin = getAutoBreakMinutes(total);
    return Math.max(0, total - breakMin);
  }

  // スタッフ別シフト月次集計
  function calcShiftMonthlySummary(staffList, shifts) {
    return staffList.map(s => {
      const staffShifts = shifts.filter(sh => sh.staffId === s.id);
      let totalMinutes = 0;
      let shiftDays = 0;
      staffShifts.forEach(sh => {
        const mins = calcShiftMinutes(sh.startTime, sh.endTime);
        if (mins > 0) {
          totalMinutes += mins;
          shiftDays++;
        }
      });
      const wage = s.probation ? DEFAULTS.probationWage : (s.hourlyWage || DEFAULTS.hourlyWage);
      const estimatedPay = Math.floor(wage * totalMinutes / 60);
      let statusClass, statusLabel;
      if (estimatedPay < 85000) {
        statusClass = 'badge-success'; statusLabel = '余裕あり';
      } else if (estimatedPay < 103000) {
        statusClass = 'badge-warning'; statusLabel = '注意';
      } else {
        statusClass = 'badge-danger'; statusLabel = '要確認';
      }
      return { staffId: s.id, name: s.name, wage, shiftDays, totalMinutes, estimatedPay, statusClass, statusLabel };
    });
  }

  return {
    DEFAULTS,
    getAutoBreakMinutes,
    calcDayWork,
    calcNightMinutes,
    calcMonthlyPay,
    calcDependentWarning,
    calcIncomeTax,
    calcTaxKou,
    calcTaxOtsu,
    calcShiftMinutes,
    calcShiftMonthlySummary
  };
})();
