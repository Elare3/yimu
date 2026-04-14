import { prisma } from '@/lib/prisma';
import { requireUserId } from '@/lib/session';
import { successResponse, errorResponse, parsePagination, safeParseFloat } from '@/lib/utils';

// GET /api/payments - 收款节点列表
export async function GET(req: Request) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || '';
    const projectId = searchParams.get('projectId') || '';
    const { page, pageSize, skip, take } = parsePagination(searchParams);

    // 自动将已过期的收款节点标记为 overdue（pending/reminded 且 dueDate 已过）
    await prisma.paymentNode.updateMany({
      where: {
        userId,
        status: { in: ['pending', 'reminded'] },
        dueDate: { lt: new Date() },
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
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    return errorResponse('获取收款列表失败', 500);
  }
}

// POST /api/payments - 创建收款节点
export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
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
        dueDate: new Date(dueDate),
        notes: notes || '',
      },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    });

    return successResponse(paymentNode);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return errorResponse('请先登录', 401);
    }
    console.error('创建收款节点失败:', e);
    return errorResponse('创建失败', 500);
  }
}
