import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/onboarding — 检查新用户状态
export const GET = withAuth(async (userId) => {
  const [clientCount, projectCount, quoteCount] = await Promise.all([
    prisma.client.count({ where: { userId } }),
    prisma.project.count({ where: { userId } }),
    prisma.quote.count({ where: { userId } }),
  ]);

  const isNewUser = clientCount === 0 && projectCount === 0 && quoteCount === 0;

  return successResponse({
    isNewUser,
    progress: {
      hasClients: clientCount > 0,
      hasProjects: projectCount > 0,
      hasQuotes: quoteCount > 0,
    },
  });
}, '获取引导状态失败');

// POST /api/onboarding — 一键导入演示数据
export const POST = withAuth(async (userId, req: Request) => {
  const { action } = await req.json();

    if (action === 'import_demo') {
      // 检查是否已有数据，防止重复导入
      const existingClients = await prisma.client.count({ where: { userId } });
      if (existingClients > 0) {
        return errorResponse('已有数据，无需导入演示数据');
      }

      // 创建演示客户
      const demoClients = await Promise.all([
        prisma.client.create({
          data: {
            userId,
            name: '极氪科技',
            contactPerson: '张总',
            phone: '13800001111',
            wechat: 'zeekr_zhang',
            tags: ['科技', '新能源'],
            source: 'demo',
            notes: '演示数据 - 新能源汽车品牌，需要品牌升级设计',
            status: 'active',
            totalRevenue: 0,
            projectCount: 0,
          },
        }),
        prisma.client.create({
          data: {
            userId,
            name: '青藤教育',
            contactPerson: '李经理',
            phone: '13800002222',
            email: 'li@qingteng.edu',
            wechat: 'qingteng_li',
            tags: ['教育', '互联网'],
            source: 'demo',
            notes: '演示数据 - 在线教育平台，需要小程序开发',
            status: 'active',
            totalRevenue: 0,
            projectCount: 0,
          },
        }),
        prisma.client.create({
          data: {
            userId,
            name: '山海咖啡',
            contactPerson: '王姐',
            phone: '13800003333',
            wechat: 'shanhai_coffee',
            tags: ['餐饮', '连锁'],
            source: 'demo',
            notes: '演示数据 - 精品咖啡连锁品牌，需要门店视觉升级',
            status: 'active',
            totalRevenue: 0,
            projectCount: 0,
          },
        }),
      ]);

      // 创建演示项目
      const now = new Date();
      const twoWeeksLater = new Date(now.getTime() + 14 * 86400000);
      const oneMonthLater = new Date(now.getTime() + 30 * 86400000);

      const demoProjects = await Promise.all([
        prisma.project.create({
          data: {
            userId,
            clientId: demoClients[0].id,
            name: '极氪科技品牌VI升级',
            description: '品牌视觉识别系统全面升级，包括LOGO优化、VI手册、物料设计',
            status: 'in_progress',
            priority: 'high',
            category: 'design',
            totalAmount: 25000,
            paidAmount: 7500,
            startDate: new Date(now.getTime() - 7 * 86400000),
            deadline: twoWeeksLater,
            deliverables: {
              create: [
                { name: 'LOGO优化方案', status: 'done', completedAt: new Date(now.getTime() - 3 * 86400000), order: 0 },
                { name: 'VI标准手册', status: 'pending', completedAt: null, order: 1 },
                { name: '物料设计(名片/信封/工牌)', status: 'pending', completedAt: null, order: 2 },
              ],
            },
            tags: ['品牌设计', 'VI'],
            notes: '演示数据',
          },
        }),
        prisma.project.create({
          data: {
            userId,
            clientId: demoClients[1].id,
            name: '青藤教育小程序开发',
            description: '课程展示+在线报名+学员管理小程序',
            status: 'quoted',
            priority: 'medium',
            category: 'development',
            totalAmount: 35000,
            paidAmount: 0,
            deadline: oneMonthLater,
            deliverables: {
              create: [
                { name: '需求文档', status: 'done', completedAt: new Date(now.getTime() - 1 * 86400000), order: 0 },
                { name: 'UI设计稿', status: 'pending', completedAt: null, order: 1 },
                { name: '前端开发', status: 'pending', completedAt: null, order: 2 },
                { name: '后端+接口', status: 'pending', completedAt: null, order: 3 },
              ],
            },
            tags: ['小程序', '教育'],
            notes: '演示数据',
          },
        }),
      ]);

      // 创建演示收款节点
      await Promise.all([
        prisma.paymentNode.create({
          data: {
            userId,
            projectId: demoProjects[0].id,
            clientId: demoClients[0].id,
            name: '签约首付(30%)',
            amount: 7500,
            dueDate: new Date(now.getTime() - 5 * 86400000),
            status: 'paid',
            paidAt: new Date(now.getTime() - 5 * 86400000),
            paidAmount: 7500,
            notes: '演示数据',
          },
        }),
        prisma.paymentNode.create({
          data: {
            userId,
            projectId: demoProjects[0].id,
            clientId: demoClients[0].id,
            name: '中期款(30%)',
            amount: 7500,
            dueDate: new Date(now.getTime() + 3 * 86400000),
            status: 'pending',
            notes: '演示数据',
          },
        }),
        prisma.paymentNode.create({
          data: {
            userId,
            projectId: demoProjects[0].id,
            clientId: demoClients[0].id,
            name: '验收尾款(40%)',
            amount: 10000,
            dueDate: twoWeeksLater,
            status: 'pending',
            notes: '演示数据',
          },
        }),
      ]);

      // 创建演示收支记录
      await Promise.all([
        prisma.transaction.create({
          data: {
            userId,
            type: 'income',
            amount: 7500,
            category: '设计服务',
            description: '极氪科技VI项目首付',
            projectId: demoProjects[0].id,
            clientId: demoClients[0].id,
            date: new Date(now.getTime() - 5 * 86400000),
            paymentMethod: 'bank_transfer',
            isBusiness: true,
          },
        }),
        prisma.transaction.create({
          data: {
            userId,
            type: 'expense',
            amount: 299,
            category: '工具订阅',
            subcategory: 'Adobe Creative Cloud',
            description: 'Adobe CC月费',
            date: new Date(now.getTime() - 3 * 86400000),
            paymentMethod: 'alipay',
            isBusiness: true,
          },
        }),
        prisma.transaction.create({
          data: {
            userId,
            type: 'expense',
            amount: 35,
            category: '交通',
            description: '去极氪科技打车',
            projectId: demoProjects[0].id,
            date: new Date(now.getTime() - 2 * 86400000),
            paymentMethod: 'wechat',
            isBusiness: true,
          },
        }),
      ]);

      // 更新客户统计
      await Promise.all([
        prisma.client.update({
          where: { id: demoClients[0].id },
          data: { projectCount: 1, totalRevenue: 7500 },
        }),
        prisma.client.update({
          where: { id: demoClients[1].id },
          data: { projectCount: 1 },
        }),
      ]);

      return successResponse({ message: '演示数据已导入' });
    }

    if (action === 'clear_demo') {
      // 清除演示数据 (notes包含"演示数据"的记录)
      await Promise.all([
        prisma.transaction.deleteMany({ where: { userId, description: { contains: '演示' } } }),
        prisma.paymentNode.deleteMany({ where: { userId, notes: '演示数据' } }),
        prisma.project.deleteMany({ where: { userId, notes: '演示数据' } }),
        prisma.client.deleteMany({ where: { userId, source: 'demo' } }),
      ]);

      return successResponse({ message: '演示数据已清除' });
    }

  return errorResponse('未知操作');
}, '操作失败');
