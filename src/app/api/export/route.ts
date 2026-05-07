import { prisma } from '@/lib/prisma';
import { errorResponse, formatDate } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';
import { NextResponse } from 'next/server';

// GET /api/export?type=clients|projects|transactions|payments
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');

  if (!type || !['clients', 'projects', 'transactions', 'payments'].includes(type)) {
    return errorResponse('请指定导出类型: clients|projects|transactions|payments');
  }

  let csv = '';

  switch (type) {
    case 'clients': {
      const items = await prisma.client.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      csv = '\uFEFF客户名称,联系人,电话,邮箱,微信,标签,累计收入,项目数,状态,创建日期\n';
      csv += items.map(c => csvRow([
        c.name, c.contactPerson, c.phone, c.email, c.wechat,
        c.tags.join(';'), String(c.totalRevenue), String(c.projectCount),
        c.status, formatDate(c.createdAt),
      ])).join('\n');
      break;
    }
    case 'projects': {
      const items = await prisma.project.findMany({
        where: { userId },
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      csv = '\uFEFF项目名称,客户,状态,优先级,总金额,已收金额,开始日期,截止日期,修订次数,创建日期\n';
      csv += items.map(p => csvRow([
        p.name, p.client?.name ?? '', statusLabel(p.status), p.priority,
        String(p.totalAmount), String(p.paidAmount),
        p.startDate ? formatDate(p.startDate) : '', p.deadline ? formatDate(p.deadline) : '',
        String(p.revisionCount), formatDate(p.createdAt),
      ])).join('\n');
      break;
    }
    case 'transactions': {
      const items = await prisma.transaction.findMany({
        where: { userId },
        include: {
          project: { select: { name: true } },
          client: { select: { name: true } },
        },
        orderBy: { date: 'desc' },
      });
      csv = '\uFEFF类型,金额,分类,子分类,描述,关联项目,关联客户,日期,支付方式,标签\n';
      csv += items.map(t => csvRow([
        t.type === 'income' ? '收入' : '支出', String(t.amount),
        t.category, t.subcategory, t.description,
        t.project?.name ?? '', t.client?.name ?? '',
        formatDate(t.date), paymentMethodLabel(t.paymentMethod), t.tags.join(';'),
      ])).join('\n');
      break;
    }
    case 'payments': {
      const items = await prisma.paymentNode.findMany({
        where: { userId },
        include: {
          project: { select: { name: true } },
          client: { select: { name: true } },
        },
        orderBy: { dueDate: 'asc' },
      });
      csv = '\uFEFF节点名称,项目,客户,金额,到期日,状态,实收金额,收款日期,催款次数\n';
      csv += items.map(p => csvRow([
        p.name, p.project?.name ?? '', p.client?.name ?? '',
        String(p.amount), formatDate(p.dueDate),
        paymentStatusLabel(p.status), String(p.paidAmount),
        p.paidAt ? formatDate(p.paidAt) : '', String(p.reminderCount),
      ])).join('\n');
      break;
    }
  }

  // 审计：敏感数据导出落 ActivityLog
  prisma.activityLog.create({
    data: {
      userId,
      entityType: 'export',
      entityId: userId,
      action: 'data_exported',
      description: `导出数据 (${type})`,
      metadata: JSON.stringify({ type, format: 'csv' }),
    },
  }).catch((err) => console.error('[export] audit failed:', err));

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${type}_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, '导出失败');

// CSV 单元格转义
function csvCell(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(',');
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    quoted: '已报价', in_progress: '进行中',
    review: '验收中', completed: '已完成', cancelled: '已取消',
  };
  return map[s] || s;
}

function paymentMethodLabel(s: string): string {
  const map: Record<string, string> = {
    wechat: '微信', alipay: '支付宝', bank_transfer: '银行转账',
    cash: '现金', transfer: '转账', other: '其他',
  };
  return map[s] || s;
}

function paymentStatusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '待收款', reminded: '已催款', paid: '已收款', overdue: '已逾期',
  };
  return map[s] || s;
}
