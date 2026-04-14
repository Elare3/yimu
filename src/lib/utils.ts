// 项目状态流转规则
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  quoted: ['in_progress', 'cancelled'],
  in_progress: ['review', 'cancelled'],
  review: ['completed', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: ['quoted'],
};

// 状态中文映射
export const STATUS_LABELS: Record<string, string> = {
  quoted: '已报价',
  in_progress: '进行中',
  review: '验收中',
  completed: '已完成',
  cancelled: '已取消',
};

// 金额格式化
export function formatAmount(amount: number | undefined | null): string {
  const val = amount ?? 0;
  return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 日期格式化
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 手机号脱敏
export function maskPhone(phone: string): string {
  if (phone.length !== 11) return phone;
  return `${phone.slice(0, 3)}****${phone.slice(7)}`;
}

// 通用API响应
export function successResponse(data: unknown) {
  return Response.json({ success: true, data });
}

export function errorResponse(error: string, status = 400) {
  return Response.json({ success: false, error }, { status });
}

// 分页参数解析
export function parsePagination(searchParams: URLSearchParams) {
  const rawPage = parseInt(searchParams.get('page') || '1');
  const rawPageSize = parseInt(searchParams.get('pageSize') || '20');
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const pageSize = isNaN(rawPageSize) || rawPageSize < 1 ? 20 : Math.min(rawPageSize, 100);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

// 安全的数值解析（用于金额等字段）
export function safeParseFloat(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(String(value));
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}
