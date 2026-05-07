// ============================================================
// 一木 YiMu — OPC业务规则引擎
// 这个文件是一木的核心资产，包含200+条OPC行业规则
// 竞品看到的是"一个报价单表单"，看不到的是每个字段背后的行业规则
// ============================================================

// ═══════════════════════════════════════
// 一、报价规则
// ═══════════════════════════════════════

export interface PaymentSplit {
  percent: number;
  trigger: string;
  label: string;
}

/** 付款节点自动分档规则 */
export const PAYMENT_SPLIT_RULES = {
  thresholds: [
    { max: 3000, strategy: 'full_upfront' as const, label: '全款预付', splits: [
      { percent: 100, trigger: 'sign', label: '全款预付' },
    ]},
    { max: 8000, strategy: 'two_phase' as const, label: '两期付款', splits: [
      { percent: 50, trigger: 'sign', label: '签约首付' },
      { percent: 50, trigger: 'delivery', label: '交付尾款' },
    ]},
    { max: 30000, strategy: 'three_phase' as const, label: '三期付款', splits: [
      { percent: 30, trigger: 'sign', label: '签约首付' },
      { percent: 30, trigger: 'midterm', label: '中期确认款' },
      { percent: 40, trigger: 'delivery', label: '验收尾款' },
    ]},
    { max: Infinity, strategy: 'four_phase' as const, label: '四期付款', splits: [
      { percent: 20, trigger: 'sign', label: '签约首付' },
      { percent: 30, trigger: 'design_confirm', label: '设计确认款' },
      { percent: 30, trigger: 'midterm', label: '中期开发款' },
      { percent: 20, trigger: 'delivery', label: '验收尾款' },
    ]},
  ],

  /** 根据金额匹配付款方案 */
  getPlan(totalAmount: number) {
    return this.thresholds.find(t => totalAmount <= t.max)!;
  },

  /** 根据客户信用等级调整首付比例 */
  creditAdjustment(clientPaymentSpeed: string, baseSplits: PaymentSplit[]): PaymentSplit[] {
    if (clientPaymentSpeed === 'slow' || clientPaymentSpeed === 'deadbeat') {
      return baseSplits.map((s, i) => i === 0
        ? { ...s, percent: Math.min(s.percent + 20, 70) }
        : { ...s, percent: Math.max(s.percent - Math.floor(20 / (baseSplits.length - 1)), 10) }
      );
    }
    return baseSplits;
  },
};

/** 报价合理性校验规则（防AI幻觉+防用户误输入） */
export const QUOTE_VALIDATION_RULES = {
  priceRanges: {
    'design_logo':         { min: 500, max: 50000, median: 3000, unit: '套' },
    'design_vi':           { min: 3000, max: 200000, median: 15000, unit: '套' },
    'design_poster':       { min: 200, max: 5000, median: 800, unit: '张' },
    'design_banner':       { min: 100, max: 2000, median: 500, unit: '张' },
    'design_packaging':    { min: 1000, max: 30000, median: 5000, unit: '套' },
    'dev_website':         { min: 3000, max: 200000, median: 15000, unit: '个' },
    'dev_miniprogram':     { min: 5000, max: 300000, median: 30000, unit: '个' },
    'dev_h5':              { min: 1000, max: 30000, median: 5000, unit: '页' },
    'dev_app':             { min: 20000, max: 500000, median: 80000, unit: '个' },
    'content_article':     { min: 100, max: 3000, median: 500, unit: '篇' },
    'content_video_short': { min: 500, max: 10000, median: 2000, unit: '条' },
    'content_video_long':  { min: 3000, max: 50000, median: 10000, unit: '条' },
    'content_copywriting': { min: 200, max: 5000, median: 1000, unit: '套' },
    'consulting_hour':     { min: 200, max: 2000, median: 500, unit: '小时' },
    'operation_month':     { min: 3000, max: 30000, median: 8000, unit: '月' },
  } as Record<string, { min: number; max: number; median: number; unit: string }>,

  /** 校验单项报价是否合理 */
  validateItem(category: string, unitPrice: number): { valid: boolean; warning?: string } {
    const range = this.priceRanges[category];
    if (!range) return { valid: true };

    if (unitPrice < range.min * 0.5) {
      return { valid: false, warning: `${category}单价¥${unitPrice}过低，行业最低约¥${range.min}，可能影响专业形象` };
    }
    if (unitPrice > range.max * 1.5) {
      return { valid: false, warning: `${category}单价¥${unitPrice}异常偏高，行业最高约¥${range.max}，请确认` };
    }
    if (unitPrice < range.min) {
      return { valid: true, warning: `提醒：${category}单价¥${unitPrice}低于行业均价¥${range.median}` };
    }
    return { valid: true };
  },

  /** 校验整单报价 */
  validateQuote(items: { category: string; unitPrice: number; amount: number }[], totalAmount: number): string[] {
    const warnings: string[] = [];

    items.forEach(item => {
      const result = this.validateItem(item.category, item.unitPrice);
      if (result.warning) warnings.push(result.warning);
    });

    if (totalAmount > 500000) warnings.push('总金额超过50万，建议拆分为多个合同降低风险');
    if (totalAmount < 500) warnings.push('总金额低于500元，考虑是否值得签正式合同');

    return warnings;
  },
};


// ═══════════════════════════════════════
// 二、项目规则
// ═══════════════════════════════════════

/** 项目状态机 + 业务副作用 */
export const PROJECT_STATE_MACHINE = {
  transitions: {
    quoted: ['in_progress', 'cancelled'],
    in_progress: ['review', 'cancelled'],
    review: ['completed', 'in_progress', 'cancelled'],
    completed: [],
    cancelled: ['quoted'],
  } as Record<string, string[]>,

  /** 状态变更时的副作用（跨模块联动的核心） */
  sideEffects: {
    'quoted→in_progress': [
      'createPaymentNodes',
      'schedulePaymentReminders',
      'setProjectStartDate',
    ],
    'in_progress→review': ['notifyClientReview'],
    'review→completed': [
      'markAllDeliverablesComplete',
      'triggerFinalPayment',
      'updateClientTotalRevenue',
      'recordCompletionEvent',
    ],
    'review→in_progress': ['incrementRevisionCount'],
    '*→cancelled': [
      'cancelPendingPayments',
      'recordCancellationReason',
    ],
  } as Record<string, string[]>,

  canTransition(from: string, to: string): boolean {
    return this.transitions[from]?.includes(to) ?? false;
  },

  getSideEffects(from: string, to: string): string[] {
    return this.sideEffects[`${from}→${to}`] || this.sideEffects[`*→${to}`] || [];
  },
};

/** 排期冲突检测规则 */
export const SCHEDULING_RULES = {
  maxConcurrentProjects: 4,

  detectConflicts(activeProjects: { name: string; deadline: Date; estimatedHoursLeft: number }[]): string[] {
    const warnings: string[] = [];

    if (activeProjects.length > this.maxConcurrentProjects) {
      warnings.push(`当前${activeProjects.length}个项目同时进行，超过建议上限${this.maxConcurrentProjects}个，可能影响交付质量`);
    }

    const deadlineWeeks = new Map<string, string[]>();
    activeProjects.forEach(p => {
      const weekKey = getWeekKey(p.deadline);
      const existing = deadlineWeeks.get(weekKey) || [];
      existing.push(p.name);
      deadlineWeeks.set(weekKey, existing);
    });

    deadlineWeeks.forEach((projects, week) => {
      if (projects.length >= 2) {
        warnings.push(`${week}周有${projects.length}个项目截止（${projects.join('、')}），建议协调错开`);
      }
    });

    const thisWeekHours = activeProjects
      .filter(p => isThisWeek(p.deadline))
      .reduce((sum, p) => sum + p.estimatedHoursLeft, 0);
    if (thisWeekHours > 50) {
      warnings.push(`本周预计需要${thisWeekHours}小时工作量，建议重新评估优先级`);
    }

    return warnings;
  },
};


// ═══════════════════════════════════════
// 三、财务规则
// ═══════════════════════════════════════

/** 2026年OPC税务规则 */
export const TAX_RULES_2026 = {
  vat: {
    smallScaleThresholdMonthly: 100000,
    smallScaleThresholdQuarterly: 300000,
    smallScaleRate: 0.01,
    generalRate: 0.06,
  },

  corporateIncomeTax: {
    microEnterprise: [
      { maxProfit: 1000000, effectiveRate: 0.025 },
      { maxProfit: 3000000, effectiveRate: 0.05 },
      { maxProfit: Infinity, effectiveRate: 0.25 },
    ],
  },

  individualBusinessTax: {
    brackets: [
      { maxIncome: 30000, rate: 0.05, deduction: 0 },
      { maxIncome: 90000, rate: 0.10, deduction: 1500 },
      { maxIncome: 300000, rate: 0.20, deduction: 10500 },
      { maxIncome: 500000, rate: 0.30, deduction: 40500 },
      { maxIncome: Infinity, rate: 0.35, deduction: 65500 },
    ],
    halfExemptionThreshold: 2000000,
  },

  checkTaxThresholds(data: {
    monthlyIncome: number;
    quarterlyIncome: number;
    yearlyProfit: number;
    entityType: 'individual' | 'sole_proprietor' | 'micro_company';
  }): string[] {
    const alerts: string[] = [];

    const monthlyRemaining = this.vat.smallScaleThresholdMonthly - data.monthlyIncome;
    if (monthlyRemaining > 0 && monthlyRemaining < 20000) {
      alerts.push(`本月收入距免税额度¥10万还差¥${monthlyRemaining.toLocaleString()}，注意控制开票节奏`);
    }
    if (monthlyRemaining <= 0) {
      alerts.push(`本月收入已超¥10万免税线，超出部分需按1%缴纳增值税`);
    }

    const quarterlyRemaining = this.vat.smallScaleThresholdQuarterly - data.quarterlyIncome;
    if (quarterlyRemaining > 0 && quarterlyRemaining < 50000) {
      alerts.push(`本季度收入距免税额度¥30万还差¥${quarterlyRemaining.toLocaleString()}，可考虑推迟部分收入确认`);
    }

    if (data.entityType === 'micro_company') {
      if (data.yearlyProfit > 2500000 && data.yearlyProfit < 3000000) {
        alerts.push(`年利润¥${(data.yearlyProfit / 10000).toFixed(0)}万，接近300万小微企业税率跳档线（超过后税率从5%跳到25%），考虑年底加速成本支出`);
      }
    }

    if (data.entityType === 'individual' || data.entityType === 'sole_proprietor') {
      if (data.yearlyProfit > 1800000 && data.yearlyProfit < 2000000) {
        alerts.push(`年利润接近200万个体户减半征收线，超过后税负将翻倍`);
      }
    }

    return alerts;
  },

  estimateTax(yearlyProfit: number, entityType: string): { tax: number; effectiveRate: number; tips: string[] } {
    const tips: string[] = [];
    let tax = 0;

    if (entityType === 'micro_company') {
      for (const bracket of this.corporateIncomeTax.microEnterprise) {
        if (yearlyProfit <= bracket.maxProfit) {
          tax = yearlyProfit * bracket.effectiveRate;
          break;
        }
      }
    } else {
      for (const bracket of this.individualBusinessTax.brackets) {
        if (yearlyProfit <= bracket.maxIncome) {
          tax = yearlyProfit * bracket.rate - bracket.deduction;
          break;
        }
      }
      if (yearlyProfit <= this.individualBusinessTax.halfExemptionThreshold) {
        tax = tax / 2;
        tips.push('享受2026年个体户≤200万减半征收优惠');
      }
    }

    return { tax: Math.max(0, tax), effectiveRate: yearlyProfit > 0 ? tax / yearlyProfit : 0, tips };
  },
};

/** 记账分类智能推导规则 */
export const TRANSACTION_INFERENCE_RULES = {
  keywordMap: {
    '阿里云|腾讯云|华为云|AWS|Azure|服务器|ECS|轻量|VPS': { category: '云服务', subcategory: '云服务器', isDeductible: true },
    'MongoDB|MySQL|RDS|数据库|Atlas|Redis': { category: '云服务', subcategory: '数据库', isDeductible: true },
    'CDN|OSS|存储|带宽|流量包': { category: '云服务', subcategory: 'CDN存储', isDeductible: true },
    '域名|DNS|备案|万网|GoDaddy|\\.com|\\.cn': { category: '云服务', subcategory: '域名', isDeductible: true },
    'SSL|证书|HTTPS': { category: '云服务', subcategory: 'SSL证书', isDeductible: true },
    '百炼|DashScope|通义|千问|Qwen': { category: 'AI服务', subcategory: '通义千问', isDeductible: true },
    'DeepSeek|深度求索': { category: 'AI服务', subcategory: 'DeepSeek', isDeductible: true },
    'OpenAI|GPT|Claude|Anthropic|智谱|GLM|Kimi|Gemini|文心': { category: 'AI服务', subcategory: '其他AI', isDeductible: true },
    'Figma|Sketch|Adobe|PS|Photoshop|Illustrator|Canva|即时设计|MasterGo': { category: '软件订阅', subcategory: '设计工具', isDeductible: true },
    'JetBrains|IDEA|WebStorm|Copilot|Cursor|GitHub|Vercel|VSCode': { category: '软件订阅', subcategory: '开发工具', isDeductible: true },
    'Notion|飞书|钉钉|企业微信|企微|Slack|语雀|石墨|腾讯文档|WPS': { category: '软件订阅', subcategory: '办公工具', isDeductible: true },
    'ChatGPT Plus|Claude Pro|Midjourney|Stable Diffusion': { category: '软件订阅', subcategory: 'AI工具', isDeductible: true },
    'DOU\\+|投放|推广|小红书薯条|直通车|广告|竞价|信息流|百度推广': { category: '营销推广', subcategory: '广告投放', isDeductible: true },
    '种草|投稿|互推|合作推广|KOL|达人|红人': { category: '营销推广', subcategory: '内容推广', isDeductible: true },
    '工位|联合办公|WeWork|共享办公|场地|房租': { category: '办公费用', subcategory: '办公空间', isDeductible: true },
    'MacBook|ThinkPad|显示器|键盘|鼠标|电脑|iPad|手绘板|相机|麦克风': { category: '办公费用', subcategory: '设备采购', isDeductible: true },
    '打印|纸|墨盒|文具|耗材|办公用品': { category: '办公费用', subcategory: '办公用品', isDeductible: true },
    '话费|宽带|流量|手机套餐|电话费': { category: '办公费用', subcategory: '通讯费', isDeductible: true },
    '外包设计|设计师|美工': { category: '外包费用', subcategory: '设计外包', isDeductible: true },
    '外包开发|程序员|技术外包': { category: '外包费用', subcategory: '开发外包', isDeductible: true },
    '外包文案|写手|翻译外包|配音': { category: '外包费用', subcategory: '内容外包', isDeductible: true },
    '增值税|销项税': { category: '税费', subcategory: '增值税', isDeductible: false },
    '所得税|个税|经营所得': { category: '税费', subcategory: '所得税', isDeductible: false },
    '印花税|附加税|城建税|教育附加': { category: '税费', subcategory: '印花税', isDeductible: false },
    '社保|公积金|医保|养老': { category: '税费', subcategory: '社保公积金', isDeductible: false },
    '外卖|美团|饿了么|午饭|晚饭|咖啡|奶茶|餐饮': { category: '生活开支', subcategory: '餐饮', isDeductible: false },
    '滴滴|出租车|地铁|公交|打车|停车|加油': { category: '生活开支', subcategory: '交通', isDeductible: false },
    '网购|衣服|娱乐|电影|游戏|个人消费': { category: '生活开支', subcategory: '个人消费', isDeductible: false },
    'LOGO|VI|海报|UI|名片|包装|插画|详情页|主图|Banner': { category: '项目收入', subcategory: '设计服务', isDeductible: false },
    '网站|小程序|APP|开发|前端|后端|系统|程序|代码|部署': { category: '项目收入', subcategory: '开发服务', isDeductible: false },
    '咨询|方案|评审|培训|教学|顾问': { category: '咨询服务', subcategory: '咨询服务', isDeductible: false },
    '文案|撰写|短视频|拍摄|剪辑|脚本|公众号|小红书|内容': { category: '项目收入', subcategory: '内容创作', isDeductible: false },
    'SEO|SEM|代运营|抖音运营|引流': { category: '项目收入', subcategory: '运营服务', isDeductible: false },
    '分成|佣金|抽成|推荐奖励|CPS': { category: '被动收入', subcategory: '平台分成', isDeductible: false },
    '版权|授权|使用费|许可费': { category: '被动收入', subcategory: '版权收入', isDeductible: false },
    '课程|网课|训练营|知识星球|付费专栏': { category: '被动收入', subcategory: '课程培训', isDeductible: false },
    '模板|素材|工具|插件|主题': { category: '被动收入', subcategory: '模板销售', isDeductible: false },
  } as Record<string, { category: string; subcategory: string; isDeductible: boolean }>,

  /** 先走关键词匹配（免费+快），匹配不到再调AI */
  tryLocalClassify(description: string): { category: string; subcategory: string; isDeductible: boolean; confidence: number } | null {
    for (const [pattern, result] of Object.entries(this.keywordMap) as [string, { category: string; subcategory: string; isDeductible: boolean }][]) {
      if (new RegExp(pattern, 'i').test(description)) {
        return { ...result, confidence: 0.95 };
      }
    }
    return null;
  },

  /** 金额合理性校验 */
  amountSanityCheck(subcategory: string, amount: number): { valid: boolean; warning?: string } {
    const ranges: Record<string, [number, number]> = {
      '云服务器': [10, 100000],
      '数据库': [10, 50000],
      'CDN存储': [5, 10000],
      '域名': [10, 5000],
      'SSL证书': [10, 5000],
      '通义千问': [1, 10000],
      'DeepSeek': [1, 10000],
      '其他AI': [1, 50000],
      '设计工具': [50, 10000],
      '开发工具': [50, 10000],
      '办公工具': [10, 5000],
      'AI工具': [50, 10000],
      '广告投放': [10, 100000],
      '设备采购': [100, 50000],
      '办公用品': [5, 5000],
      '通讯费': [10, 2000],
      '餐饮': [5, 500],
      '交通': [1, 2000],
    };

    const range = ranges[subcategory];
    if (!range) return { valid: true };

    if (amount < range[0] || amount > range[1]) {
      return { valid: false, warning: `${subcategory}金额¥${amount}超出常规范围¥${range[0]}-${range[1]}，请确认` };
    }
    return { valid: true };
  },
};


// ═══════════════════════════════════════
// 四、催款规则
// ═══════════════════════════════════════

/** 催款自动升级策略 */
export const REMINDER_ESCALATION_RULES = {
  levels: [
    { level: 0, name: '温馨提醒', triggerDays: 0, tone: 'warm', channels: ['wechat'] as string[], generatePDF: false },
    { level: 1, name: '正式请求', triggerDays: 3, tone: 'formal', channels: ['wechat'] as string[], generatePDF: false },
    { level: 2, name: '严肃催促', triggerDays: 7, tone: 'serious', channels: ['wechat', 'phone'] as string[], generatePDF: false },
    { level: 3, name: '施压催款', triggerDays: 14, tone: 'pressure', channels: ['wechat', 'email'] as string[], generatePDF: false },
    { level: 4, name: '正式催款函', triggerDays: 21, tone: 'legal_warning', channels: ['email'] as string[], generatePDF: true },
    { level: 5, name: '法律警告', triggerDays: 30, tone: 'legal_threat', channels: ['email'] as string[], generatePDF: true },
    { level: 6, name: '律师函', triggerDays: 45, tone: 'lawyer_letter', channels: ['registered_mail'] as string[], generatePDF: true },
  ],

  /** 根据逾期天数自动确定催款级别 */
  getLevel(overdueDays: number, previousReminders: number): number {
    let targetLevel = 0;
    for (const l of this.levels) {
      if (l.triggerDays !== undefined && overdueDays >= l.triggerDays) targetLevel = l.level;
    }
    return Math.min(targetLevel, previousReminders + 1);
  },

  /** 逾期利息计算 */
  calculateOverdueInterest(amount: number, overdueDays: number, lprRate: number = 0.036): {
    interest: number;
    dailyRate: number;
    legalBasis: string;
  } {
    const annualRate = lprRate * 1.3;
    const dailyRate = annualRate / 365;
    const interest = amount * dailyRate * overdueDays;

    return {
      interest: Math.round(interest * 100) / 100,
      dailyRate: Math.round(dailyRate * 10000) / 10000,
      legalBasis: `依据最高人民法院关于买卖合同司法解释第十八条，按LPR(${(lprRate * 100).toFixed(1)}%)+30%计算`,
    };
  },
};


// ═══════════════════════════════════════
// 五、经营洞察规则
// ═══════════════════════════════════════

/** 六维健康度评分规则 */
export const HEALTH_SCORE_RULES = {
  dimensions: {
    income: {
      weight: 0.25,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      score(monthIncome: number, lastMonthIncome: number): number {
        if (monthIncome >= 50000) return 95;
        if (monthIncome >= 20000) return 80;
        if (monthIncome >= 10000) return 60;
        if (monthIncome >= 5000) return 40;
        return 20;
      },
    },
    cost: {
      weight: 0.15,
      score(profitRate: number): number {
        if (profitRate >= 0.7) return 95;
        if (profitRate >= 0.5) return 80;
        if (profitRate >= 0.3) return 60;
        if (profitRate >= 0.1) return 35;
        return 10;
      },
    },
    cashflow: {
      weight: 0.20,
      score(overdueCount: number, maxOverdueDays: number, receivableRatio: number): number {
        let s = 100;
        s -= overdueCount * 15;
        if (maxOverdueDays > 30) s -= 30;
        else if (maxOverdueDays > 7) s -= 15;
        if (receivableRatio > 1) s -= 20;
        else if (receivableRatio > 0.5) s -= 10;
        return Math.max(0, s);
      },
    },
    clientDiversity: {
      weight: 0.15,
      score(topClientRatio: number, activeClientCount: number): number {
        let s = 50;
        if (topClientRatio < 0.3) s += 30;
        else if (topClientRatio < 0.5) s += 15;
        else s -= 15;
        if (activeClientCount >= 5) s += 20;
        else if (activeClientCount >= 3) s += 10;
        return Math.min(100, Math.max(0, s));
      },
    },
    pipeline: {
      weight: 0.15,
      score(activeProjects: number, hasLeads: boolean, hasConflicts: boolean): number {
        let s = 50;
        if (activeProjects >= 2 && activeProjects <= 4) s += 30;
        else if (activeProjects === 1 || activeProjects === 5) s += 10;
        else if (activeProjects === 0) s -= 30;
        else s -= 15;
        if (hasLeads) s += 20;
        if (hasConflicts) s -= 20;
        return Math.min(100, Math.max(0, s));
      },
    },
    taxEfficiency: {
      weight: 0.10,
      score(nearThreshold: boolean, hasOptimizationOpportunity: boolean): number {
        let s = 70;
        if (nearThreshold) s -= 30;
        if (hasOptimizationOpportunity) s += 20;
        return Math.min(100, Math.max(0, s));
      },
    },
  },

  /** 计算综合健康分 */
  calculateOverall(scores: Record<string, number>): number {
    let total = 0;
    for (const [dim, config] of Object.entries(this.dimensions) as [string, { weight: number }][]) {
      total += (scores[dim] || 50) * config.weight;
    }
    return Math.round(total);
  },
};


// ═══════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════

// 周分组与"本周"判断按北京时间。原版用 d.getDay()/setDate 走服务器本地 TZ，
// UTC 服务器会把北京周日 23:30 的 deadline 归到下一周。
function getWeekKey(date: Date): string {
  // 用 BJ_OFFSET 平移到 UTC 维度，按周日往前回退到周日（保留原版 getDay() 周日=0 起点语义）
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
  const bj = new Date(date.getTime() + BJ_OFFSET_MS);
  const day = bj.getUTCDay(); // 0=Sun .. 6=Sat
  bj.setUTCDate(bj.getUTCDate() - day);
  return `${bj.getUTCMonth() + 1}月${Math.ceil(bj.getUTCDate() / 7)}`;
}

function isThisWeek(date: Date): boolean {
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
  const nowBj = new Date(Date.now() + BJ_OFFSET_MS);
  const day = nowBj.getUTCDay();
  // 北京本周日 00:00 的"墙上时间"（UTC 维度）
  const weekStartBjWall = new Date(
    Date.UTC(nowBj.getUTCFullYear(), nowBj.getUTCMonth(), nowBj.getUTCDate() - day),
  );
  // 还原到绝对时间
  const weekStart = new Date(weekStartBjWall.getTime() - BJ_OFFSET_MS);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  return date >= weekStart && date < weekEnd;
}

/** 根据付款触发条件计算到期日（按北京时间日历日 + 北京时间 23:59:59.999） */
export function calculateDueDate(trigger: string, startDate?: Date | null): Date {
  const base = startDate || new Date();
  // "北京日历日 + N 天后的 23:59:59.999" 的绝对时刻：
  // 1) 把 base 平移到北京时间下的"今天 00:00"
  // 2) +N 天
  // 3) +1 天 - 1ms = 当天 23:59:59.999（北京）
  const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;
  function bjEodAfterDays(d: Date, days: number): Date {
    const bjMs = d.getTime() + BJ_OFFSET_MS;
    const bjMidnightAsUtc = Math.floor(bjMs / 86_400_000) * 86_400_000;
    const baseAbs = bjMidnightAsUtc - BJ_OFFSET_MS;
    return new Date(baseAbs + (days + 1) * 86_400_000 - 1);
  }
  switch (trigger) {
    case 'sign': return bjEodAfterDays(new Date(base), 0);
    case 'design_confirm': return bjEodAfterDays(new Date(base), 14);
    case 'midterm': return bjEodAfterDays(new Date(base), 30);
    case 'delivery': return bjEodAfterDays(new Date(base), 45);
    default: return bjEodAfterDays(new Date(base), 0);
  }
}

/** 根据报价项推断项目类别 */
export function guessCategory(items: { name: string }[]): string {
  const text = items.map(i => i.name).join(' ').toLowerCase();
  if (/logo|vi|品牌|海报|banner|包装|设计/.test(text)) return 'design';
  if (/网站|小程序|app|h5|开发|前端|后端/.test(text)) return 'development';
  if (/文案|视频|文章|内容|运营/.test(text)) return 'content';
  if (/咨询|顾问|培训/.test(text)) return 'consulting';
  return 'other';
}
