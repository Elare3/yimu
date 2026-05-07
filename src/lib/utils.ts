// 状态流转规则与标签已迁至 src/lib/constants.ts
// （PROJECT_STATUS_TRANSITIONS / PROJECT_STATUS_LABELS）

// 金额格式化
export function formatAmount(amount: number | undefined | null): string {
  const val = amount ?? 0;
  return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// 日期格式化（按北京时间，与服务器 TZ 无关）
// 产品仅服务大陆用户，所有日期一律按 UTC+8 展示。
// 服务器侧（CSV 导出、AI prompt）跑在 UTC 上若按 local TZ 会比北京时间早 8 小时，
// 跨日界处会出现"昨天/今天"错位 —— 所以一律走北京时间偏移量计算。
export function formatDate(date: Date | string): string {
  const d = new Date(date);
  const bj = new Date(d.getTime() + BJ_OFFSET_MS);
  return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}-${String(bj.getUTCDate()).padStart(2, '0')}`;
}

// ─── 北京时间辅助（产品仅服务大陆用户，所有"今天/昨天/N 天后"按 UTC+8 算） ───
// 不依赖 Intl/服务器 TZ，纯偏移量计算，跨服务器（UTC / Asia/Shanghai）行为一致
const BJ_OFFSET_MS = 8 * 60 * 60 * 1000;

// 将日期设为"北京时间当天 23:59:59.999"（收款截止时间）
// 不依赖服务器 TZ：UTC 服务器上 setHours(23,...) 会变成"北京次日 07:59"，
// 所以一律按 BJ 维度截到当天最后一刻。
export function endOfDay(date: Date | string): Date {
  const d = new Date(date);
  const bjMs = d.getTime() + BJ_OFFSET_MS;
  const bjMidnightAsUtc = Math.floor(bjMs / 86_400_000) * 86_400_000;
  const bjMidnightAbs = bjMidnightAsUtc - BJ_OFFSET_MS;
  return new Date(bjMidnightAbs + 86_400_000 - 1);
}

/** 北京时间"今天 00:00:00"对应的绝对时间（Date 对象） */
export function beijingMidnight(now: Date = new Date()): Date {
  // 绝对时间戳 → 加 8h → 在 UTC 维度截到当天 00:00 → 减 8h 还原
  const bjMs = now.getTime() + BJ_OFFSET_MS;
  const bjMidnightAsUtc = Math.floor(bjMs / 86_400_000) * 86_400_000;
  return new Date(bjMidnightAsUtc - BJ_OFFSET_MS);
}

/**
 * 按北京时区格式化日期为 YYYY-MM-DD（与服务器时区无关）。
 * formatDate 自身已是北京时间实现，此处仅作别名暴露 —— 让"我明确要按北京时间"
 * 的调用点（如 email 模板、跨时区聚合 key）有更清晰的语义标签。
 */
export const formatBeijingDate = formatDate;

/** 北京时间下，dueDate 距离 today 还有几个完整日历日（负数表示已逾期） */
export function daysUntilBeijing(dueDate: Date, now: Date = new Date()): number {
  const todayBj = beijingMidnight(now).getTime();
  const dueBjMidnight = beijingMidnight(dueDate).getTime();
  return Math.round((dueBjMidnight - todayBj) / 86_400_000);
}

/**
 * 判断 dueDate 是否已逾期（北京时间）。
 * 语义：截止当天 24:00 之前都不算逾期。
 *   - dueDate 落在今天/未来 → false
 *   - dueDate 落在昨天或更早 → true
 * 等价于 `endOfDay(dueDate) < now`，或 `dueDate < beijingMidnight(now)`（dueDate 已被规范化到当日范围时）。
 */
export function isOverdueDate(dueDate: Date | string, now: Date = new Date()): boolean {
  return endOfDay(dueDate).getTime() < now.getTime();
}

/** 北京时间"本月 1 号 00:00"对应的绝对时间 */
export function beijingMonthStart(now: Date = new Date()): Date {
  const bj = new Date(now.getTime() + BJ_OFFSET_MS);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), 1) - BJ_OFFSET_MS);
}

/** 北京时间下指定年月的 [start, end)，month 用 1-12（自然月） */
export function beijingMonthRange(year: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1) - BJ_OFFSET_MS);
  const end = new Date(Date.UTC(year, month1to12, 1) - BJ_OFFSET_MS);
  return { start, end };
}

/** 北京时间"本季度首日 00:00"对应的绝对时间 */
export function beijingQuarterStart(now: Date = new Date()): Date {
  const bj = new Date(now.getTime() + BJ_OFFSET_MS);
  const q = Math.floor(bj.getUTCMonth() / 3);
  return new Date(Date.UTC(bj.getUTCFullYear(), q * 3, 1) - BJ_OFFSET_MS);
}

/** 北京时间下，指定日期所在周的"周一 00:00"（ISO 周）对应的绝对时间 */
export function beijingWeekStart(date: Date): Date {
  const midnight = beijingMidnight(date);
  // 北京日历视角的星期：把 midnight 平移到 UTC 维度后取 day（midnight 的 UTC 时间 + 8h 就是北京当天 00:00 的 UTC 等价）
  const bjView = new Date(midnight.getTime() + BJ_OFFSET_MS);
  const day = bjView.getUTCDay(); // 0=Sun .. 6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(midnight.getTime() + mondayOffset * 86_400_000);
}

/** 北京年/月/日（用 1-12 自然月） */
export function beijingYMD(date: Date = new Date()): { year: number; month: number; day: number } {
  const bj = new Date(date.getTime() + BJ_OFFSET_MS);
  return {
    year: bj.getUTCFullYear(),
    month: bj.getUTCMonth() + 1,
    day: bj.getUTCDate(),
  };
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
