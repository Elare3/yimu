import { prisma } from '@/lib/prisma';
import { successResponse, beijingMidnight } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// GET /api/notifications — 获取用户通知列表
// 通知来源：逾期收款、即将到期收款、报价即将过期、项目截止日临近、待验收项目、最近完成
export const GET = withAuth(async (userId) => {
  const now = new Date();
  // 逾期判定线：北京今天 00:00（= 昨天 24:00）。截止当天 24:00 前都不算逾期
  const todayBjMidnight = beijingMidnight(now);
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

  // 并行查各类通知数据
  const [overduePayments, upcomingPayments, expiringQuotes, deadlineProjects, reviewProjects, recentlyCompleted] =
    await Promise.all([
      // 1. 已逾期未收款（dueDate < 北京今天 00:00）
      prisma.paymentNode.findMany({
        where: {
          userId,
          status: { in: ['pending', 'reminded'] },
          dueDate: { lt: todayBjMidnight },
        },
        include: {
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      // 2. 3 天内即将到期的收款（含今天，dueDate >= 北京今天 00:00）
      prisma.paymentNode.findMany({
        where: {
          userId,
          status: { in: ['pending', 'reminded'] },
          dueDate: { gte: todayBjMidnight, lte: threeDaysLater },
        },
        include: {
          project: { select: { id: true, name: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 10,
      }),
      // 3. 报价即将过期（3天内，状态为 draft/sent）
      prisma.quote.findMany({
        where: {
          userId,
          status: { in: ['draft', 'sent'] },
          validUntil: { gte: now, lte: threeDaysLater },
        },
        include: {
          client: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { validUntil: 'asc' },
        take: 10,
      }),
      // 4. 项目截止日临近（5天内，进行中的项目）
      prisma.project.findMany({
        where: {
          userId,
          status: { in: ['in_progress', 'review'] },
          deadline: { gte: now, lte: fiveDaysLater },
        },
        include: {
          client: { select: { id: true, name: true } },
        },
        orderBy: { deadline: 'asc' },
        take: 10,
      }),
      // 5. 待验收的项目
      prisma.project.findMany({
        where: { userId, status: 'review' },
        include: {
          client: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      // 6. 最近完成的项目（7天内）
      prisma.project.findMany({
        where: {
          userId,
          status: 'completed',
          completedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
        },
        include: {
          client: { select: { id: true, name: true } },
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
      }),
    ]);

  // 组装通知列表
  type Notification = {
    id: string;
    type: 'overdue' | 'upcoming' | 'quote_expiring' | 'deadline' | 'review' | 'completed';
    title: string;
    description: string;
    time: string;
    link: string;
    priority: 'high' | 'medium' | 'low';
  };

  const notifications: Notification[] = [];

  // 逾期 — 高优先
  for (const p of overduePayments) {
    const overdueDays = Math.ceil(
      (now.getTime() - new Date(p.dueDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    notifications.push({
      id: `overdue-${p.id}`,
      type: 'overdue',
      title: `${p.client?.name ?? '客户'} 收款已逾期`,
      description: `「${p.project?.name ?? '项目'}」的"${p.name}" ¥${p.amount.toLocaleString()} 已逾期 ${overdueDays} 天`,
      time: p.dueDate.toISOString(),
      link: '/payments',
      priority: 'high',
    });
  }

  // 即将到期 — 中优先
  for (const p of upcomingPayments) {
    const daysLeft = Math.ceil(
      (new Date(p.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    notifications.push({
      id: `upcoming-${p.id}`,
      type: 'upcoming',
      title: `收款即将到期`,
      description: `「${p.project?.name ?? '项目'}」的"${p.name}" ¥${p.amount.toLocaleString()} 还有 ${daysLeft} 天到期`,
      time: p.dueDate.toISOString(),
      link: '/payments',
      priority: 'medium',
    });
  }

  // 报价即将过期 — 高优先
  for (const q of expiringQuotes) {
    const daysLeft = Math.ceil(
      (new Date(q.validUntil!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    notifications.push({
      id: `quote-expiring-${q.id}`,
      type: 'quote_expiring',
      title: `报价单即将过期`,
      description: `「${q.title}」(${q.client?.name ?? '客户'}) ¥${q.total.toLocaleString()} 还有 ${daysLeft} 天过期`,
      time: q.validUntil!.toISOString(),
      link: `/quotes/${q.id}`,
      priority: 'high',
    });
  }

  // 项目截止日临近 — 高优先
  for (const p of deadlineProjects) {
    const daysLeft = Math.ceil(
      (new Date(p.deadline!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    notifications.push({
      id: `deadline-${p.id}`,
      type: 'deadline',
      title: `项目截止日临近`,
      description: `「${p.name}」(${p.client?.name ?? '客户'}) 还有 ${daysLeft} 天到截止日`,
      time: p.deadline!.toISOString(),
      link: `/projects/${p.id}`,
      priority: 'high',
    });
  }

  // 待验收项目 — 中优先
  for (const p of reviewProjects) {
    notifications.push({
      id: `review-${p.id}`,
      type: 'review',
      title: `项目待验收`,
      description: `「${p.name}」(${p.client?.name ?? '客户'}) 已进入验收阶段`,
      time: p.updatedAt.toISOString(),
      link: `/projects/${p.id}`,
      priority: 'medium',
    });
  }

  // 最近完成 — 低优先
  for (const p of recentlyCompleted) {
    notifications.push({
      id: `completed-${p.id}`,
      type: 'completed',
      title: `项目已完成`,
      description: `「${p.name}」(${p.client?.name ?? '客户'}) 已完成交付`,
      time: (p.completedAt ?? p.updatedAt).toISOString(),
      link: `/projects/${p.id}`,
      priority: 'low',
    });
  }

  // 按优先级+时间排序
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  notifications.sort(
    (a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  return successResponse({
    items: notifications,
    total: notifications.length,
    unreadCount: overduePayments.length + upcomingPayments.length + expiringQuotes.length + deadlineProjects.length + reviewProjects.length,
  });
}, '获取通知失败');
