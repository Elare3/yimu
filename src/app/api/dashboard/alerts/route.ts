import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse } from '@/lib/utils';
import { TAX_RULES_2026 } from '@/lib/rules';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// GET /api/dashboard/alerts — 主动提醒（逾期/到期/税务/截止日）
export async function GET() {
  try {
    const userId = await requireUserId();
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    // 当月起止
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // 当季起止
    const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const quarterEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + 3, 1);

    const [overduePayments, upcomingPayments, deadlineProjects, monthlyIncome, quarterlyIncome, tomorrowPayments] =
      await Promise.all([
        // 逾期收款
        prisma.paymentNode.findMany({
          where: { userId, status: { in: ['pending', 'reminded'] }, dueDate: { lt: now } },
          include: {
            project: { select: { name: true } },
            client: { select: { name: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
        // 3天内到期收款
        prisma.paymentNode.findMany({
          where: { userId, status: { in: ['pending', 'reminded'] }, dueDate: { gte: now, lte: threeDaysLater } },
          include: {
            project: { select: { name: true } },
            client: { select: { name: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 5,
        }),
        // 5天内截止项目
        prisma.project.findMany({
          where: { userId, status: { in: ['in_progress', 'review'] }, deadline: { gte: now, lte: fiveDaysLater } },
          include: { client: { select: { name: true } } },
          orderBy: { deadline: 'asc' },
          take: 5,
        }),
        // 当月收入
        prisma.transaction.aggregate({
          where: { userId, type: 'income', date: { gte: monthStart, lt: monthEnd } },
          _sum: { amount: true },
        }),
        // 当季收入
        prisma.transaction.aggregate({
          where: { userId, type: 'income', date: { gte: quarterStart, lt: quarterEnd } },
          _sum: { amount: true },
        }),
        // 明天到期
        prisma.paymentNode.findMany({
          where: {
            userId,
            status: { in: ['pending', 'reminded'] },
            dueDate: {
              gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
              lt: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2),
            },
          },
          include: {
            project: { select: { name: true } },
            client: { select: { name: true } },
          },
        }),
      ]);

    type Alert = {
      id: string;
      type: 'overdue' | 'upcoming' | 'deadline' | 'tax' | 'tomorrow';
      icon: string;
      message: string;
      link: string;
      priority: 'urgent' | 'warning' | 'info';
    };

    const alerts: Alert[] = [];

    // 逾期收款 (urgent)
    for (const p of overduePayments) {
      const overdueDays = Math.ceil((now.getTime() - new Date(p.dueDate).getTime()) / 86400000);
      alerts.push({
        id: `overdue-${p.id}`,
        type: 'overdue',
        icon: '🔴',
        message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 已逾期 ${overdueDays} 天`,
        link: '/payments',
        priority: 'urgent',
      });
    }

    // 明天到期 (urgent)
    for (const p of tomorrowPayments) {
      alerts.push({
        id: `tomorrow-${p.id}`,
        type: 'tomorrow',
        icon: '⏰',
        message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 明天到期`,
        link: '/payments',
        priority: 'urgent',
      });
    }

    // 3天内到期 (warning)
    for (const p of upcomingPayments) {
      const daysLeft = Math.ceil((new Date(p.dueDate).getTime() - now.getTime()) / 86400000);
      if (daysLeft > 1) { // 明天的已在上面处理
        alerts.push({
          id: `upcoming-${p.id}`,
          type: 'upcoming',
          icon: '💰',
          message: `${p.client?.name || '客户'}的「${p.name}」¥${p.amount.toLocaleString()} 还有 ${daysLeft} 天到期`,
          link: '/payments',
          priority: 'warning',
        });
      }
    }

    // 项目截止日 (warning)
    for (const p of deadlineProjects) {
      const daysLeft = Math.ceil((new Date(p.deadline!).getTime() - now.getTime()) / 86400000);
      alerts.push({
        id: `deadline-${p.id}`,
        type: 'deadline',
        icon: '📋',
        message: `「${p.name}」(${p.client?.name || '客户'}) 截止日还剩 ${daysLeft} 天`,
        link: `/projects/${p.id}`,
        priority: 'warning',
      });
    }

    // 税务预警 (info)
    const monthlyIncomeAmount = monthlyIncome._sum.amount || 0;
    const quarterlyIncomeAmount = quarterlyIncome._sum.amount || 0;
    const taxAlerts = TAX_RULES_2026.checkTaxThresholds({
      monthlyIncome: monthlyIncomeAmount,
      quarterlyIncome: quarterlyIncomeAmount,
      yearlyProfit: 0,
      entityType: 'individual',
    });
    for (let idx = 0; idx < taxAlerts.length; idx++) {
      const alert = taxAlerts[idx];
      alerts.push({
        id: `tax-${idx}`,
        type: 'tax',
        icon: '📊',
        message: alert,
        link: '/finance',
        priority: 'info',
      });
    }

    return successResponse({ alerts });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('Dashboard alerts error:', e);
    return errorResponse('获取提醒失败', 500);
  }
}
