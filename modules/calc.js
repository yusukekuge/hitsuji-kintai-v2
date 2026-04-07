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

    const startTime = new Date(clockIn.time);
    const endTime = new Date(clockOut.time);
    const totalMinutes = Math.floor((endTime - startTime) / 60000);

    // 休憩計算
    let breakMinutes = 0;
    if (breakStarts.length > 0) {
      // 打刻ベース
      for (let i = 0; i < breakStarts.length; i++) {
        const bs = new Date(breakStarts[i].time);
        const be = breakEnds[i] ? new Date(breakEnds[i].time) : endTime;
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

    // 基本給（通常時間 = 総労働 - 残業）
    const normalMinutes = totalWorkMinutes - totalOvertimeMinutes;
    const basePay = Math.floor(wage * normalMinutes / 60);

    // 残業代（法定超25%）
    const overtimePay = Math.floor(wage * (1 + DEFAULTS.overtimeRate) * totalOvertimeMinutes / 60) -
                        Math.floor(wage * totalOvertimeMinutes / 60);

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
      normalMinutes,
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

  // 甲欄テーブル: [課税支給額上限, 扶養0人, 1人, 2人, 3人, 4人, 5人]
  const TAX_TABLE_KOU = [
    [88000, 0, 0, 0, 0, 0, 0],
    [89000, 130, 0, 0, 0, 0, 0],
    [90000, 180, 0, 0, 0, 0, 0],
    [91000, 230, 0, 0, 0, 0, 0],
    [92000, 290, 0, 0, 0, 0, 0],
    [93000, 340, 0, 0, 0, 0, 0],
    [94000, 390, 0, 0, 0, 0, 0],
    [95000, 440, 0, 0, 0, 0, 0],
    [96000, 490, 0, 0, 0, 0, 0],
    [97000, 540, 0, 0, 0, 0, 0],
    [98000, 590, 0, 0, 0, 0, 0],
    [99000, 640, 0, 0, 0, 0, 0],
    [101000, 720, 180, 0, 0, 0, 0],
    [103000, 830, 250, 0, 0, 0, 0],
    [105000, 930, 340, 0, 0, 0, 0],
    [107000, 1030, 430, 0, 0, 0, 0],
    [109000, 1130, 530, 0, 0, 0, 0],
    [111000, 1240, 630, 0, 0, 0, 0],
    [113000, 1340, 720, 120, 0, 0, 0],
    [115000, 1440, 820, 210, 0, 0, 0],
    [117000, 1540, 920, 310, 0, 0, 0],
    [119000, 1640, 1020, 410, 0, 0, 0],
    [121000, 1750, 1120, 510, 0, 0, 0],
    [123000, 1850, 1210, 600, 0, 0, 0],
    [125000, 1950, 1310, 700, 100, 0, 0],
    [127000, 2050, 1410, 800, 190, 0, 0],
    [129000, 2150, 1510, 900, 290, 0, 0],
    [131000, 2260, 1610, 1000, 390, 0, 0],
    [133000, 2360, 1720, 1100, 490, 0, 0],
    [135000, 2460, 1820, 1200, 590, 0, 0],
    [137000, 2550, 1920, 1300, 690, 80, 0],
    [139000, 2610, 2020, 1400, 790, 180, 0],
    [141000, 2680, 2120, 1500, 890, 280, 0],
    [143000, 2740, 2210, 1600, 990, 380, 0],
    [145000, 2810, 2300, 1700, 1080, 470, 0],
    [147000, 2870, 2390, 1790, 1180, 570, 0],
    [149000, 2940, 2480, 1870, 1270, 660, 50],
    [151000, 3000, 3000, 1960, 1360, 750, 140],
    [153000, 3140, 2580, 2050, 1450, 840, 230],
    [155000, 3200, 2640, 2140, 1540, 930, 320],
    [157000, 3270, 2700, 2230, 1630, 1020, 410],
    [159000, 3340, 2780, 2310, 1720, 1110, 500],
    [161000, 3400, 2850, 2400, 1800, 1200, 590],
    [163000, 3470, 2930, 2480, 1890, 1280, 680],
    [165000, 3540, 3000, 2570, 1980, 1370, 760],
    [167000, 3600, 3070, 2650, 2060, 1460, 850],
    [169000, 3670, 3140, 2730, 2150, 1550, 940],
    [171000, 3740, 3200, 2810, 2240, 1640, 1030],
    [173000, 3800, 3270, 2900, 2320, 1720, 1120],
    [175000, 3870, 3340, 2980, 2410, 1810, 1210],
    [177000, 3940, 3400, 3060, 2500, 1900, 1290],
    [179000, 4000, 3470, 3140, 2580, 1980, 1380],
    [181000, 4070, 3540, 3220, 2670, 2070, 1470],
    [183000, 4140, 3600, 3300, 2750, 2160, 1550],
    [185000, 4200, 3670, 3380, 2840, 2240, 1640],
    [187000, 4270, 3740, 3460, 2920, 2330, 1730],
    [189000, 4340, 3800, 3540, 3010, 2420, 1820],
    [191000, 4400, 3870, 3620, 3090, 2500, 1910],
    [193000, 4470, 3940, 3700, 3180, 2590, 1990],
    [195000, 4530, 4000, 3780, 3260, 2680, 2080],
    [197000, 4600, 4070, 3860, 3350, 2760, 2170],
    [199000, 4670, 4140, 3940, 3430, 2850, 2250],
    [201000, 4740, 4200, 4020, 3520, 2930, 2340],
    [203000, 4810, 4270, 4100, 3600, 3020, 2430],
    [205000, 4880, 4340, 4170, 3680, 3100, 2520],
    [207000, 4950, 4410, 4240, 3760, 3190, 2600],
    [209000, 5020, 4480, 4310, 3830, 3270, 2690],
    [211000, 5090, 4550, 4380, 3900, 3350, 2770],
    [213000, 5160, 4620, 4450, 3980, 3430, 2860],
    [215000, 5230, 4690, 4520, 4050, 3510, 2940],
    [217000, 5300, 4760, 4590, 4120, 3590, 3030],
    [219000, 5370, 4830, 4660, 4200, 3660, 3110],
    [221000, 5440, 4900, 4730, 4270, 3740, 3190],
    [224000, 5550, 5010, 4840, 4380, 3850, 3300],
    [227000, 5700, 5160, 4990, 4530, 3990, 3440],
    [230000, 5850, 5310, 5130, 4670, 4140, 3590],
    [233000, 5990, 5450, 5280, 4820, 4290, 3740],
    [236000, 6110, 5600, 5430, 4960, 4440, 3890],
    [239000, 6260, 5750, 5570, 5110, 4580, 4030],
    [242000, 6410, 5890, 5720, 5260, 4730, 4180],
    [245000, 6560, 6040, 5870, 5400, 4880, 4330],
    [248000, 6710, 6190, 6010, 5550, 5020, 4470],
    [251000, 6860, 6330, 6160, 5700, 5170, 4620],
    [254000, 7000, 6480, 6310, 5840, 5320, 4770],
    [257000, 7150, 6630, 6450, 5990, 5460, 4920],
    [260000, 7300, 6770, 6600, 6140, 5610, 5060],
    [263000, 7450, 6920, 6750, 6280, 5760, 5210],
    [266000, 7590, 7070, 6890, 6430, 5910, 5360],
    [269000, 7740, 7210, 7040, 6580, 6050, 5500],
    [272000, 7890, 7360, 7190, 6720, 6200, 5650],
    [275000, 8040, 7510, 7330, 6870, 6350, 5800],
    [278000, 8180, 7660, 7480, 7020, 6490, 5940],
    [281000, 8330, 7800, 7630, 7160, 6640, 6090],
    [284000, 8480, 7950, 7780, 7310, 6790, 6240],
    [287000, 8630, 8100, 7920, 7460, 6930, 6390],
    [290000, 8770, 8250, 8070, 7600, 7080, 6530],
    [293000, 8920, 8390, 8220, 7750, 7230, 6680],
    [296000, 9070, 8540, 8370, 7900, 7380, 6830],
    [299000, 9210, 8690, 8510, 8050, 7520, 6980],
    [302000, 9360, 8830, 8660, 8190, 7670, 7120],
    [305000, 9510, 8980, 8810, 8340, 7820, 7270],
    [308000, 9660, 9130, 8950, 9490, 7960, 7420],
    [311000, 9800, 9280, 9100, 8640, 8110, 7560],
    [314000, 9950, 9420, 9250, 8780, 8260, 7710],
    [317000, 10100, 9570, 9400, 8930, 8410, 7860],
    [320000, 10240, 9720, 9540, 9080, 8550, 8010],
    [323000, 10390, 9870, 9690, 9220, 8700, 8150],
    [326000, 10540, 10010, 9840, 9370, 8850, 8300],
    [329000, 10690, 10160, 9990, 9520, 8990, 8450],
    [332000, 10830, 10310, 10130, 9670, 9140, 8590],
    [335000, 10980, 10450, 10280, 9810, 9290, 8740],
    [338000, 11130, 10600, 10430, 9960, 9440, 8890],
    [341000, 11270, 10750, 10570, 10110, 9580, 9040],
  ];

  // 乙欄テーブル: [課税支給額上限, 税額]
  const TAX_TABLE_OTSU = [
    [88000, 0.03063],   // 3.063% (税率で保持)
    [89000, 0],         // 以下は固定税額で保持
  ];

  // 乙欄: 金額帯別の税額テーブル（主要金額帯）
  // [上限金額, 税額] - 令和8年分月額表乙欄
  const TAX_TABLE_OTSU_FIXED = [
    [88000, -1],     // 税率計算（3.063%）
    [89000, 2830],
    [90000, 2870],
    [91000, 2910],
    [92000, 2960],
    [93000, 3000],
    [94000, 3040],
    [95000, 3090],
    [96000, 3130],
    [97000, 3170],
    [98000, 3220],
    [99000, 3260],
    [101000, 3350],
    [103000, 3490],
    [105000, 3570],
    [107000, 3660],
    [109000, 3740],
    [111000, 3830],
    [113000, 3910],
    [115000, 4000],
    [117000, 4080],
    [119000, 4170],
    [121000, 4250],
    [123000, 4340],
    [125000, 4420],
    [127000, 4510],
    [129000, 4600],
    [131000, 4680],
    [133000, 4770],
    [135000, 4850],
    [137000, 4940],
    [139000, 5020],
    [141000, 5110],
    [143000, 5190],
    [145000, 5280],
    [147000, 5360],
    [149000, 5450],
    [151000, 5530],
    [153000, 5620],
    [155000, 5710],
    [157000, 5790],
    [159000, 5880],
    [161000, 5960],
    [163000, 6050],
    [165000, 6130],
    [167000, 6220],
    [169000, 6300],
    [171000, 6390],
    [173000, 6480],
    [175000, 6560],
    [177000, 6650],
    [179000, 6730],
    [181000, 6820],
    [183000, 6900],
    [185000, 6990],
    [187000, 7070],
    [189000, 7160],
    [191000, 7240],
    [193000, 7330],
    [195000, 7410],
    [197000, 7500],
    [199000, 7580],
    [201000, 7670],
    [203000, 7760],
    [205000, 7840],
    [207000, 7930],
    [209000, 8010],
    [211000, 8100],
    [213000, 8180],
    [215000, 8270],
    [217000, 8350],
    [219000, 8440],
    [221000, 8520],
    [224000, 8710],
    [227000, 8900],
    [230000, 9080],
    [233000, 9270],
    [236000, 9460],
    [239000, 9640],
    [242000, 9830],
    [245000, 10020],
    [248000, 10200],
    [251000, 10390],
    [254000, 10580],
    [257000, 10770],
    [260000, 10950],
    [263000, 11140],
    [266000, 11330],
    [269000, 11510],
    [272000, 11700],
    [275000, 11890],
    [278000, 12070],
    [281000, 12260],
    [284000, 12450],
    [287000, 12630],
    [290000, 12820],
    [293000, 13010],
    [296000, 13200],
    [299000, 13380],
    [302000, 13570],
    [305000, 13760],
    [308000, 13940],
    [311000, 14130],
    [314000, 14320],
    [317000, 14500],
    [320000, 14690],
    [323000, 14880],
    [326000, 15070],
    [329000, 15250],
    [332000, 15440],
    [335000, 15630],
    [338000, 15810],
    [341000, 16000],
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
    // テーブル範囲外（341,000円以上）: 概算 - 課税所得 × 概算税率
    const lastEntry = TAX_TABLE_KOU[TAX_TABLE_KOU.length - 1];
    const baseTax = lastEntry[dep + 1] || 0;
    const excess = taxableAmount - lastEntry[0];
    return baseTax + Math.floor(excess * 0.0408);
  }

  // 乙欄で源泉徴収税額を計算
  function calcTaxOtsu(taxableAmount) {
    if (taxableAmount <= 0) return 0;
    // 88,000円未満: 3.063%
    if (taxableAmount < 88000) {
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
