import { prisma } from '@/lib/prisma';
import { successResponse } from '@/lib/utils';
import { withAuth } from '@/lib/with-auth';

// 需要读取会话 cookie，无法静态渲染
export const dynamic = 'force-dynamic';

// 任务展示分组（按业务域归类，用于 by-task 统计）
function taskGroup(task: string): string {
  if (task.startsWith('quote')) return 'quote';
  if (task.startsWith('reminder')) return 'reminder';
  if (task.startsWith('insight')) return 'insight';
  if (task.startsWith('transaction')) return 'transaction';
  if (task.startsWith('contract')) return 'contract';
  return task;
}

// GET /api/users/ai-logs?days=7 — 查询当前用户的AI调用记录 + 安全防御统计
export const GET = withAuth(async (userId, req: Request) => {
  const url = new URL(req.url);
  const days = Math.min(parseInt(url.searchParams.get('days') || '7', 10), 90);

  const since = new Date();
  since.setDate(since.getDate() - days);

  // 并行查询 AICallLog（用户语义日志） + AIAuditLog（安全防御日志）
  const [callLogs, auditLogs] = await Promise.all([
    prisma.aICallLog.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.aIAuditLog.findMany({
      where: { userId, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
      take: 500, // 审计日志可以多点，因为只用聚合
      select: {
        task: true,
        threats: true,
        sensitiveRedacted: true,
        outputValid: true,
        outputIssues: true,
        tokenPrompt: true,
        tokenCompletion: true,
        tokenTotal: true,
        latencyMs: true,
      },
    }),
  ]);

  // 调用层统计
  const total = callLogs.length;
  const cacheHitCount = callLogs.filter(l => l.cacheHit).length;
  const intentOnlyCount = callLogs.filter(l => l.dataSent === 'intent_only').length;
  const noneCount = callLogs.filter(l => l.dataSent === 'none').length;

  // 按任务分组次数
  const byTask: Record<string, number> = {};
  for (const l of callLogs) {
    const g = taskGroup(l.task);
    byTask[g] = (byTask[g] ?? 0) + 1;
  }

  // 安全防御统计（来自 AIAuditLog）
  let threatBlockedCount = 0;       // 触发威胁拦截的次数（threats 非空）
  let sensitiveRedactedCount = 0;   // 触发敏感数据脱敏的次数
  let outputInvalidCount = 0;       // 输出验证失败次数
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalLatencyMs = 0;
  let auditWithLatency = 0;

  // 收集威胁/敏感类型 top 列表
  const threatTypeCount = new Map<string, number>();
  const sensitiveTypeCount = new Map<string, number>();

  for (const a of auditLogs) {
    if (a.threats && a.threats.length > 0) {
      threatBlockedCount++;
      for (const t of a.threats) {
        // threats 形如 "critical:role_hijack"，取冒号后那段
        const type = t.includes(':') ? t.split(':')[1] : t;
        threatTypeCount.set(type, (threatTypeCount.get(type) ?? 0) + 1);
      }
    }
    if (a.sensitiveRedacted && a.sensitiveRedacted.length > 0) {
      sensitiveRedactedCount++;
      for (const s of a.sensitiveRedacted) {
        sensitiveTypeCount.set(s, (sensitiveTypeCount.get(s) ?? 0) + 1);
      }
    }
    if (!a.outputValid) outputInvalidCount++;
    totalPromptTokens += a.tokenPrompt ?? 0;
    totalCompletionTokens += a.tokenCompletion ?? 0;
    totalTokens += a.tokenTotal ?? 0;
    if (a.latencyMs > 0) {
      totalLatencyMs += a.latencyMs;
      auditWithLatency++;
    }
  }

  const sortMap = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

  return successResponse({
    logs: callLogs.map(l => ({
      createdAt: l.createdAt.toISOString(),
      task: l.task,
      intentParams: l.intentParams,
      dataSent: l.dataSent,
      cacheHit: l.cacheHit,
    })),
    stats: {
      total,
      cacheHitCount,
      intentOnlyCount,
      noneCount,
      days,
      byTask,
    },
    security: {
      auditCount: auditLogs.length,
      threatBlockedCount,
      sensitiveRedactedCount,
      outputInvalidCount,
      topThreats: sortMap(threatTypeCount),
      topSensitive: sortMap(sensitiveTypeCount),
    },
    cost: {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      avgLatencyMs: auditWithLatency > 0 ? Math.round(totalLatencyMs / auditWithLatency) : 0,
    },
  });
}, '查询失败');
