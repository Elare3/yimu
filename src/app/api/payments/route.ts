import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse, parsePagination, safeParseFloat, endOfDay, beijingMidnight } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// GET /api/payments - 收款节点列表
export const GET = withAuth(async (userId, req: Request) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || '';
  const projectId = searchParams.get('projectId') || '';
  const { page, pageSize, skip, take } = parsePagination(searchParams);

  // 自动将已过期的收款节点标记为 overdue
  // 语义：截止当天 24:00 之前都不算逾期 ⇒ dueDate < 北京今天 00:00 (= 昨天 24:00)
  await prisma.paymentNode.updateMany({
    where: {
      userId,
      status: { in: ['pending', 'reminded'] },
      dueDate: { lt: beijingMidnight() },
    },
    data: { status: 'overdue' },
  });

  const where: Record<string, unknown> = { userId };
  if (status) where.status = status;
  if (projectId) where.projectId = projectId;

  const [items, total] = await Promise.all([
    prisma.paymentNode.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true, contactPerson: true } },
      },
      orderBy: { dueDate: 'asc' },
      skip,
      take,
    }),
    prisma.paymentNode.count({ where }),
  ]);

  return successResponse({ items, total, page, pageSize });
}, '获取收款列表失败');

// POST /api/payments - 创建收款节点
export const POST = withAuth(async (userId, req: Request) => {
  const { projectId, clientId, name, amount, dueDate, notes } = await req.json();

  if (!projectId) return errorResponse('请选择项目');
  if (!name) return errorResponse('请填写节点名称');
  if (!amount || amount <= 0) return errorResponse('请填写正确金额');
  if (!dueDate) return errorResponse('请选择到期日');

  // 验证项目
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) return errorResponse('项目不存在');

  const paymentNode = await prisma.paymentNode.create({
    data: {
      userId,
      projectId,
      clientId: clientId || project.clientId,
      name,
      amount: safeParseFloat(amount) ?? 0,
      dueDate: endOfDay(dueDate),
      notes: notes || '',
    },
    include: {
      project: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
  });

  return successResponse(paymentNode);
}, '创建失败');
