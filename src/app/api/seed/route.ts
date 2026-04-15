import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';

// ── 辅助函数 ──

/** 随机整数 [min, max] */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 随机选一个 */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 随机选 n 个不重复 */
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** 生成过去 N 天内的随机日期 */
function randomPastDate(daysAgo: number): Date {
  const now = Date.now();
  return new Date(now - randInt(1, daysAgo) * 86400000);
}

/** 生成未来 N 天内的随机日期 */
function randomFutureDate(daysAhead: number): Date {
  const now = Date.now();
  return new Date(now + randInt(1, daysAhead) * 86400000);
}

/** 生成报价编号 */
function quoteNumber(index: number): string {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, '0');
  return `Q${y}${m}-${String(index).padStart(3, '0')}`;
}

// ── 测试数据模板 ──

const CLIENT_DATA = [
  { name: '极氪科技', contactPerson: '张总', phone: '13800001111', email: 'zhang@zeekr.com', wechat: 'zeekr_zhang', tags: ['科技', '新能源'], source: '朋友介绍' },
  { name: '青藤教育', contactPerson: '李经理', phone: '13800002222', email: 'li@qingteng.edu', wechat: 'qingteng_li', tags: ['教育', '互联网'], source: '线上咨询' },
  { name: '山海咖啡', contactPerson: '王姐', phone: '13800003333', email: 'wang@shanhai.coffee', wechat: 'shanhai_wang', tags: ['餐饮', '连锁'], source: '小红书' },
  { name: '蓝鲸传媒', contactPerson: '赵总', phone: '13900004444', email: 'zhao@bluewhale.media', wechat: 'bluewhale_zhao', tags: ['传媒', '广告'], source: '展会' },
  { name: '云起科技', contactPerson: '陈CTO', phone: '13700005555', email: 'chen@yunqi.tech', wechat: 'yunqi_chen', tags: ['科技', 'SaaS'], source: '朋友介绍' },
  { name: '橙色心理', contactPerson: '林老师', phone: '13600006666', email: 'lin@orange-psy.com', wechat: 'orange_lin', tags: ['健康', '心理'], source: '公众号' },
  { name: '本味餐饮集团', contactPerson: '周总', phone: '13500007777', email: 'zhou@benwei.food', wechat: 'benwei_zhou', tags: ['餐饮', '集团'], source: '老客户推荐' },
  { name: '极光电商', contactPerson: '吴总', phone: '13400008888', email: 'wu@aurora-ec.com', wechat: 'aurora_wu', tags: ['电商', '零售'], source: '线上咨询' },
  { name: '星辰律所', contactPerson: '孙律师', phone: '13300009999', email: 'sun@starlaw.cn', wechat: 'starlaw_sun', tags: ['法律', '专业服务'], source: '名片交换' },
  { name: '绿洲旅行', contactPerson: '刘经理', phone: '13200010000', email: 'liu@oasis-travel.com', wechat: 'oasis_liu', tags: ['旅游', '文旅'], source: '抖音' },
  { name: '白鹭摄影', contactPerson: '何老师', phone: '13100011111', email: 'he@egret-photo.com', wechat: 'egret_he', tags: ['摄影', '文创'], source: '朋友介绍' },
  { name: '九章数据', contactPerson: '黄总', phone: '13000012222', email: 'huang@ninedata.ai', wechat: 'ninedata_huang', tags: ['科技', '大数据'], source: '行业大会' },
];

const PROJECT_TEMPLATES = [
  { name: '品牌VI升级', category: 'design', desc: '品牌视觉识别系统全面升级，包括LOGO优化、VI手册、物料设计', amount: [15000, 35000], deliverables: ['LOGO优化方案', 'VI标准手册', '品牌物料设计', '品牌使用指南'] },
  { name: '企业官网设计开发', category: 'development', desc: '响应式企业官网设计与前端开发', amount: [12000, 30000], deliverables: ['需求文档', 'UI设计稿', '前端开发', '后端对接', '上线部署'] },
  { name: '小程序开发', category: 'development', desc: '微信小程序功能开发与UI设计', amount: [20000, 50000], deliverables: ['产品原型', 'UI设计稿', '前端开发', '后端+接口', '测试上线'] },
  { name: '品牌包装设计', category: 'design', desc: '产品包装视觉设计，含结构设计与印刷跟进', amount: [8000, 20000], deliverables: ['包装概念方案', '结构设计', '视觉设计', '印刷文件'] },
  { name: '短视频内容策划', category: 'content', desc: '品牌短视频内容策划与拍摄指导', amount: [5000, 15000], deliverables: ['内容策略方案', '脚本撰写(10条)', '拍摄指导', '数据复盘报告'] },
  { name: 'SEO优化服务', category: 'consulting', desc: '网站SEO诊断与3个月优化执行', amount: [6000, 18000], deliverables: ['SEO诊断报告', '关键词策略', '内容优化方案', '月度数据报告'] },
  { name: '电商详情页设计', category: 'design', desc: '天猫/京东产品详情页视觉设计', amount: [3000, 8000], deliverables: ['竞品分析', '设计方案', '详情页设计(5款)', '主图设计'] },
  { name: '企业画册设计', category: 'design', desc: '企业宣传画册设计排版', amount: [8000, 15000], deliverables: ['内容规划', '版式设计', '画册排版(20P)', '印刷跟进'] },
  { name: '数据可视化大屏', category: 'development', desc: '运营数据可视化大屏设计开发', amount: [15000, 40000], deliverables: ['数据梳理', 'UI设计', '前端开发', '数据对接', '部署交付'] },
  { name: '公众号代运营', category: 'operations', desc: '微信公众号内容运营与粉丝增长', amount: [4000, 10000], deliverables: ['运营策略', '内容排期表', '图文撰写(月8篇)', '月度报告'] },
  { name: 'App UI设计', category: 'design', desc: 'iOS/Android应用UI界面设计', amount: [20000, 50000], deliverables: ['用户调研', '信息架构', 'UI设计(40+页)', '设计规范', '切图标注'] },
  { name: '品牌策略咨询', category: 'consulting', desc: '品牌定位与营销策略咨询', amount: [10000, 30000], deliverables: ['市场调研报告', '品牌定位方案', '传播策略', '执行计划'] },
];

const EXPENSE_CATEGORIES = [
  { category: '工具订阅', subcategory: 'Adobe CC', desc: 'Adobe Creative Cloud月费', amount: [298, 298] },
  { category: '工具订阅', subcategory: 'Figma', desc: 'Figma专业版月费', amount: [90, 90] },
  { category: '工具订阅', subcategory: '语雀', desc: '语雀会员年费摊月', amount: [25, 25] },
  { category: '办公', subcategory: '文具', desc: '购买办公文具', amount: [30, 150] },
  { category: '办公', subcategory: '耗材', desc: '打印耗材', amount: [50, 200] },
  { category: '交通', subcategory: '打车', desc: '去客户公司打车', amount: [20, 80] },
  { category: '交通', subcategory: '地铁', desc: '地铁出行', amount: [5, 15] },
  { category: '餐饮', subcategory: '商务餐', desc: '客户商务餐', amount: [100, 500] },
  { category: '餐饮', subcategory: '工作餐', desc: '午餐/晚餐', amount: [20, 60] },
  { category: '设备', subcategory: '电脑配件', desc: '购买键盘/鼠标/配件', amount: [100, 800] },
  { category: '云服务', subcategory: '服务器', desc: '阿里云ECS续费', amount: [50, 300] },
  { category: '云服务', subcategory: '域名', desc: '域名续费', amount: [50, 100] },
  { category: '学习', subcategory: '课程', desc: '在线课程学习', amount: [99, 499] },
  { category: '学习', subcategory: '书籍', desc: '专业书籍', amount: [30, 120] },
  { category: '通信', subcategory: '话费', desc: '手机话费', amount: [58, 128] },
  { category: '保险', subcategory: '社保', desc: '自缴社保', amount: [1200, 2500] },
];

const PAYMENT_METHODS = ['wechat', 'alipay', 'bank_transfer', 'cash'];
const PROJECT_STATUSES = ['quoted', 'in_progress', 'review', 'completed', 'cancelled'];
const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];

// POST /api/seed — 生成大量测试数据
export async function POST(req: Request) {
  // 仅开发环境可用
  if (process.env.NODE_ENV === 'production') {
    return errorResponse('Seed API is disabled in production', 403);
  }

  try {
    // 必须登录；移除"第一个用户"降级，防止开发环境脏数据被任意灌入
    const userId = await requireUserId();

    const body = await req.json().catch(() => ({}));
    const clear = body.clear === true;

    // 清除该用户所有数据
    if (clear) {
      await prisma.activityLog.deleteMany({ where: { userId } });
      await prisma.pricingFeedback.deleteMany({ where: { userId } });
      await prisma.aICallLog.deleteMany({ where: { userId } });
      await prisma.transaction.deleteMany({ where: { userId } });
      await prisma.paymentNode.deleteMany({ where: { userId } });
      await prisma.quote.deleteMany({ where: { userId } });
      await prisma.project.deleteMany({ where: { userId } });
      await prisma.client.deleteMany({ where: { userId } });
    }

    // ═══════════════════════════════════════
    // 1. 创建 12 个客户
    // ═══════════════════════════════════════
    const clients = [];
    for (const c of CLIENT_DATA) {
      const client = await prisma.client.create({
        data: {
          userId,
          name: c.name,
          contactPerson: c.contactPerson,
          phone: c.phone,
          email: c.email || '',
          wechat: c.wechat || '',
          tags: c.tags,
          source: c.source,
          notes: `seed-data`,
          status: Math.random() > 0.15 ? 'active' : 'archived',
        },
      });
      clients.push(client);
    }

    // ═══════════════════════════════════════
    // 2. 创建 20+ 个项目（覆盖各状态）
    // ═══════════════════════════════════════
    const projects = [];

    for (const client of clients) {
      // 每个客户 1~3 个项目
      const projectCount = randInt(1, 3);
      for (let p = 0; p < projectCount; p++) {
        const tpl = pick(PROJECT_TEMPLATES);
        const amount = randInt(tpl.amount[0], tpl.amount[1]);
        const status = pick(PROJECT_STATUSES);
        const startDate = randomPastDate(120);
        const deadline = new Date(startDate.getTime() + randInt(14, 60) * 86400000);

        const isCompleted = status === 'completed';
        const isCancelled = status === 'cancelled';
        const paidRatio = isCompleted ? (Math.random() > 0.2 ? 1 : 0.7) : isCancelled ? 0 : Math.random() * 0.6;

        // 根据项目状态设置交付物状态
        const deliverables = tpl.deliverables.map((d, i) => {
          let dStatus = 'pending';
          if (isCompleted) {
            dStatus = 'done';
          } else if (status === 'in_progress' || status === 'review') {
            dStatus = i < Math.ceil(tpl.deliverables.length * 0.5) ? 'done' : 'pending';
          }
          return {
            name: d,
            status: dStatus,
            completedAt: dStatus === 'done' ? randomPastDate(30) : null,
          };
        });

        const project = await prisma.project.create({
          data: {
            userId,
            clientId: client.id,
            name: `${client.name} - ${tpl.name}`,
            description: tpl.desc,
            status,
            priority: pick(['low', 'medium', 'medium', 'high']),
            category: tpl.category,
            totalAmount: amount,
            paidAmount: Math.round(amount * paidRatio),
            startDate,
            deadline,
            completedAt: isCompleted ? randomPastDate(10) : undefined,
            deliverables,
            revisionCount: isCompleted || status === 'review' ? randInt(1, 4) : 0,
            tags: pickN(['品牌', '设计', '开发', '运营', '咨询', '小程序', '视觉'], 2),
            notes: 'seed-data',
          },
        });
        projects.push({ ...project, client });
      }
    }

    // ═══════════════════════════════════════
    // 3. 创建 25+ 份报价单
    // ═══════════════════════════════════════
    let quoteIdx = 1;
    const quotes = [];
    for (const proj of projects) {
      // 每个项目 0~2 份报价
      const qCount = randInt(0, 2);
      for (let q = 0; q < qCount; q++) {
        const itemCount = randInt(3, 7);
        const items = [];
        let subtotal = 0;
        for (let i = 0; i < itemCount; i++) {
          const unitPrice = randInt(500, 8000);
          const quantity = pick([1, 1, 1, 2, 3]);
          const amount = unitPrice * quantity;
          subtotal += amount;
          items.push({
            name: pick(['UI设计', '前端开发', '后端开发', '需求分析', '项目管理', '测试上线', '内容撰写', '视觉设计', '原型设计', '数据对接']),
            description: pick(['含修改3次', '按实际工期', '含1年维护', '含源文件交付', '']),
            quantity,
            unit: pick(['项', '页', '天', '套']),
            unitPrice,
            amount,
            priceReference: '',
          });
        }
        const taxRate = pick([0, 0, 0, 0.01, 0.03]);
        const taxAmount = Math.round(subtotal * taxRate);
        const discount = Math.random() > 0.7 ? randInt(500, 2000) : 0;
        const total = subtotal + taxAmount - discount;

        const quote = await prisma.quote.create({
          data: {
            userId,
            projectId: proj.id,
            clientId: proj.client.id,
            quoteNumber: quoteNumber(quoteIdx++),
            title: proj.name,
            items,
            subtotal,
            taxRate,
            taxAmount,
            discount,
            total,
            paymentTerms: pick(['签约30% / 中期30% / 尾款40%', '预付50% / 尾款50%', '按月结算', '验收后付清']),
            validUntil: randomFutureDate(30),
            status: pick(QUOTE_STATUSES),
            aiGenerated: Math.random() > 0.4,
            aiPrompt: Math.random() > 0.5 ? proj.description : '',
            notes: 'seed-data',
          },
        });
        quotes.push(quote);
      }
    }

    // ═══════════════════════════════════════
    // 4. 创建 50+ 条收款节点
    // ═══════════════════════════════════════
    const paymentNodes = [];
    for (const proj of projects) {
      if (proj.status === 'cancelled') continue;
      // 每个项目 2~4 个收款节点
      const nodeCount = randInt(2, 4);
      const portions = nodeCount === 2 ? [0.5, 0.5] : nodeCount === 3 ? [0.3, 0.3, 0.4] : [0.2, 0.3, 0.3, 0.2];

      for (let n = 0; n < nodeCount; n++) {
        const amount = Math.round(proj.totalAmount * portions[n]);
        const isPast = n < nodeCount - 1 && proj.status !== 'quoted';
        const dueDate = isPast ? randomPastDate(60) : randomFutureDate(45);

        let status = 'pending';
        let paidAt: Date | undefined;
        let paidAmount = 0;
        const reminderMessages: { sentAt: Date; channel: string; content: string; aiGenerated: boolean }[] = [];

        if (isPast && Math.random() > 0.3) {
          status = 'paid';
          paidAt = new Date(dueDate.getTime() + randInt(-3, 5) * 86400000);
          paidAmount = amount;
        } else if (isPast && dueDate < new Date()) {
          status = 'overdue';
          // 添加催款记录
          const reminderCount = randInt(1, 3);
          for (let r = 0; r < reminderCount; r++) {
            reminderMessages.push({
              sentAt: new Date(dueDate.getTime() + (r + 1) * 3 * 86400000),
              channel: pick(['wechat', 'sms']),
              content: pick([
                '您好，关于项目款项，想跟您确认一下付款时间。',
                '温馨提醒，上次沟通的款项可以安排一下吗？',
                '项目进展顺利，请问尾款方便安排吗？',
              ]),
              aiGenerated: true,
            });
          }
        }

        const names = ['签约首付', '设计确认款', '中期款', '开发完成款', '验收尾款', '终期款'];
        const node = await prisma.paymentNode.create({
          data: {
            userId,
            projectId: proj.id,
            clientId: proj.client.id,
            name: names[n] || `第${n + 1}期`,
            amount,
            dueDate,
            status,
            paidAt,
            paidAmount,
            reminderCount: reminderMessages.length,
            lastReminderAt: reminderMessages.length > 0 ? reminderMessages[reminderMessages.length - 1].sentAt : undefined,
            reminderMessages,
            notes: 'seed-data',
          },
        });
        paymentNodes.push(node);
      }
    }

    // ═══════════════════════════════════════
    // 5. 创建 150+ 条收支记录（覆盖最近6个月）
    // ═══════════════════════════════════════
    const transactions = [];

    // 5a. 收入记录 — 与项目关联
    for (const proj of projects) {
      if (proj.paidAmount <= 0) continue;
      // 将已收金额拆成1~3笔
      const splitCount = randInt(1, 3);
      let remaining = proj.paidAmount;
      for (let s = 0; s < splitCount && remaining > 0; s++) {
        const amount = s === splitCount - 1 ? remaining : Math.round(remaining * (0.3 + Math.random() * 0.4));
        remaining -= amount;
        if (amount <= 0) continue;

        const t = await prisma.transaction.create({
          data: {
            userId,
            type: 'income',
            amount,
            category: pick(['设计服务', '开发服务', '咨询服务', '运营服务', '内容服务']),
            description: `${proj.client.name} - ${proj.name.split(' - ')[1] || '项目收款'}`,
            projectId: proj.id,
            clientId: proj.client.id,
            date: randomPastDate(150),
            paymentMethod: pick(PAYMENT_METHODS),
            isBusiness: true,
          },
        });
        transactions.push(t);
      }
    }

    // 5b. 支出记录 — 日常经营开销（每月 10~20 笔，覆盖6个月）
    for (let month = 0; month < 6; month++) {
      const expenseCount = randInt(10, 20);
      for (let e = 0; e < expenseCount; e++) {
        const tpl = pick(EXPENSE_CATEGORIES);
        const amount = randInt(tpl.amount[0], tpl.amount[1]);
        const daysAgo = month * 30 + randInt(1, 28);
        const date = new Date(Date.now() - daysAgo * 86400000);

        // 部分支出关联到项目
        const linkedProject = Math.random() > 0.6 ? pick(projects) : null;

        const t = await prisma.transaction.create({
          data: {
            userId,
            type: 'expense',
            amount,
            category: tpl.category,
            subcategory: tpl.subcategory,
            description: tpl.desc + (linkedProject ? `(${linkedProject.client.name})` : ''),
            projectId: linkedProject?.id,
            clientId: linkedProject?.client.id,
            date,
            paymentMethod: pick(PAYMENT_METHODS),
            isBusiness: Math.random() > 0.1,
            aiClassified: Math.random() > 0.5,
          },
        });
        transactions.push(t);
      }
    }

    // 5c. 额外零散收入（私单、零星服务）
    const extraIncomes = randInt(5, 10);
    for (let i = 0; i < extraIncomes; i++) {
      const client = pick(clients);
      const t = await prisma.transaction.create({
        data: {
          userId,
          type: 'income',
          amount: randInt(500, 5000),
          category: pick(['设计服务', '咨询服务', '技术支持', '培训服务']),
          description: pick(['LOGO修改费', '紧急修图', '技术咨询', '线上培训', '方案修改费', '素材授权费']),
          clientId: client.id,
          date: randomPastDate(150),
          paymentMethod: pick(PAYMENT_METHODS),
          isBusiness: true,
          aiClassified: Math.random() > 0.5,
        },
      });
      transactions.push(t);
    }

    // ═══════════════════════════════════════
    // 6. 更新客户统计
    // ═══════════════════════════════════════
    for (const client of clients) {
      const clientProjects = projects.filter(p => p.client.id === client.id);
      const clientIncome = transactions.filter(
        t => t.clientId === client.id && t.type === 'income'
      ).reduce((sum, t) => sum + t.amount, 0);

      await prisma.client.update({
        where: { id: client.id },
        data: {
          projectCount: clientProjects.length,
          totalRevenue: clientIncome,
        },
      });
    }

    // ═══════════════════════════════════════
    // 7. 创建活动日志
    // ═══════════════════════════════════════
    const activityLogs = [];
    for (const proj of projects.slice(0, 15)) {
      const actions = [
        { action: 'created', description: `创建了项目「${proj.name}」` },
        { action: 'status_changed', description: `项目状态更新为「${proj.status}」` },
      ];
      if (proj.paidAmount > 0) {
        actions.push({ action: 'payment_received', description: `收到项目款 ¥${proj.paidAmount.toLocaleString()}` });
      }
      for (const act of actions) {
        activityLogs.push(
          prisma.activityLog.create({
            data: {
              userId,
              entityType: 'project',
              entityId: proj.id,
              action: act.action,
              description: act.description,
              createdAt: randomPastDate(90),
            },
          })
        );
      }
    }
    // 客户创建日志
    for (const client of clients.slice(0, 8)) {
      activityLogs.push(
        prisma.activityLog.create({
          data: {
            userId,
            entityType: 'client',
            entityId: client.id,
            action: 'created',
            description: `添加了客户「${client.name}」`,
            createdAt: randomPastDate(120),
          },
        })
      );
    }
    await Promise.all(activityLogs);

    // ═══════════════════════════════════════
    // 8. 创建报价反馈数据
    // ═══════════════════════════════════════
    const feedbacks = [];
    for (const quote of quotes.filter(q => q.status !== 'draft')) {
      const outcome = quote.status === 'accepted' ? 'accepted'
        : quote.status === 'rejected' ? pick(['rejected', 'expired_no_response'])
        : pick(['accepted', 'negotiated', 'rejected']);

      feedbacks.push(
        prisma.pricingFeedback.create({
          data: {
            userId,
            quoteId: quote.id,
            clientId: quote.clientId,
            outcome,
            quoteAmount: quote.total,
            finalAmount: outcome === 'negotiated' ? Math.round(quote.total * (0.8 + Math.random() * 0.15)) : outcome === 'accepted' ? quote.total : undefined,
            deviation: outcome === 'negotiated' ? -(5 + Math.random() * 15) : 0,
            category: pick(['design', 'development', 'consulting', 'content']),
            rejectReason: outcome === 'rejected' ? pick(['too_expensive', 'scope_mismatch', 'competitor', 'budget_cut']) : '',
            negotiationRounds: outcome === 'negotiated' ? randInt(1, 4) : 0,
            daysToDecision: randInt(1, 14),
          },
        })
      );
    }
    await Promise.all(feedbacks);

    // ═══════════════════════════════════════
    // 统计
    // ═══════════════════════════════════════
    const summary = {
      clients: clients.length,
      projects: projects.length,
      quotes: quotes.length,
      paymentNodes: paymentNodes.length,
      transactions: transactions.length,
      activityLogs: activityLogs.length,
      feedbacks: feedbacks.length,
    };

    return successResponse({
      message: '测试数据已生成',
      summary,
    });

  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('Seed error:', e);
    return errorResponse(`生成失败: ${e instanceof Error ? e.message : '未知错误'}`, 500);
  }
}
