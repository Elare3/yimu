// ============================================================
// 一木 YiMu — 北京时间 helpers 单测
//
// 这套 helper 是 events.ts / cron / dashboard 等所有"今天/本月/逾期天数"逻辑的基石。
// 它们依赖纯偏移量（BJ_OFFSET_MS = 8h），不读 process.env.TZ / Intl.DateTimeFormat，
// 所以理论上跨 UTC / Asia-Shanghai 服务器表现一致。本测试用真实绝对时间（ISO with Z）
// 验证语义，不依赖运行时的本地 TZ。
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  beijingMidnight,
  formatBeijingDate,
  daysUntilBeijing,
  beijingMonthStart,
  beijingMonthRange,
  beijingQuarterStart,
  beijingWeekStart,
  beijingYMD,
  endOfDay,
  isOverdueDate,
} from '@/lib/utils';

describe('beijingMidnight', () => {
  it('北京 5/7 任意时刻 → 北京 5/7 00:00（绝对时间 = 5/6 16:00 UTC）', () => {
    // 北京 2026-05-07 14:30 = UTC 2026-05-07 06:30
    const now = new Date('2026-05-07T06:30:00Z');
    const m = beijingMidnight(now);
    // 北京 5/7 00:00 = UTC 5/6 16:00
    expect(m.toISOString()).toBe('2026-05-06T16:00:00.000Z');
  });

  it('北京当天凌晨 00:30 → 仍是当天 00:00（不会回退到昨天）', () => {
    // 北京 2026-05-07 00:30 = UTC 2026-05-06 16:30
    const now = new Date('2026-05-06T16:30:00Z');
    const m = beijingMidnight(now);
    expect(m.toISOString()).toBe('2026-05-06T16:00:00.000Z');
  });

  it('北京当天 23:59 → 当天 00:00（不会前进到明天）', () => {
    // 北京 2026-05-07 23:59 = UTC 2026-05-07 15:59
    const now = new Date('2026-05-07T15:59:00Z');
    const m = beijingMidnight(now);
    expect(m.toISOString()).toBe('2026-05-06T16:00:00.000Z');
  });

  it('UTC 服务器 14:30 → 北京 22:30 同一天，不会跨日', () => {
    // UTC 2026-05-07 14:30 = 北京 2026-05-07 22:30
    const now = new Date('2026-05-07T14:30:00Z');
    expect(beijingMidnight(now).toISOString()).toBe('2026-05-06T16:00:00.000Z');
  });

  it('跨年边界：北京 2026-01-01 00:30', () => {
    // 北京 2026-01-01 00:30 = UTC 2025-12-31 16:30
    const now = new Date('2025-12-31T16:30:00Z');
    expect(beijingMidnight(now).toISOString()).toBe('2025-12-31T16:00:00.000Z');
  });
});

describe('formatBeijingDate', () => {
  it('UTC 16:00 → 北京次日 00:00 → 显示次日的日期', () => {
    expect(formatBeijingDate(new Date('2026-05-06T16:00:00Z'))).toBe('2026-05-07');
  });

  it('UTC 15:59 → 北京当天 23:59 → 显示当天', () => {
    expect(formatBeijingDate(new Date('2026-05-07T15:59:00Z'))).toBe('2026-05-07');
  });

  it('跨年：UTC 2025-12-31 16:00 → 北京 2026-01-01', () => {
    expect(formatBeijingDate(new Date('2025-12-31T16:00:00Z'))).toBe('2026-01-01');
  });

  it('补零：1 月 9 日', () => {
    // 北京 2026-01-09 12:00 = UTC 04:00
    expect(formatBeijingDate(new Date('2026-01-09T04:00:00Z'))).toBe('2026-01-09');
  });
});

describe('daysUntilBeijing', () => {
  // 锚定"今天"为 北京 2026-05-07（任意时刻）
  const now = new Date('2026-05-07T06:30:00Z'); // 北京 14:30

  it('今天 = 0', () => {
    // dueDate = 北京 2026-05-07 18:00 = UTC 10:00
    const due = new Date('2026-05-07T10:00:00Z');
    expect(daysUntilBeijing(due, now)).toBe(0);
  });

  it('明天 = 1', () => {
    // dueDate = 北京 2026-05-08 06:00 = UTC 2026-05-07 22:00
    const due = new Date('2026-05-07T22:00:00Z');
    expect(daysUntilBeijing(due, now)).toBe(1);
  });

  it('昨天 = -1（已逾期 1 天）', () => {
    // dueDate = 北京 2026-05-06 任意时间
    const due = new Date('2026-05-06T03:00:00Z');
    expect(daysUntilBeijing(due, now)).toBe(-1);
  });

  it('30 天后 = 30', () => {
    // 北京 2026-06-06
    const due = new Date('2026-06-06T08:00:00Z');
    expect(daysUntilBeijing(due, now)).toBe(30);
  });

  it('UTC 服务器场景：dueDate 在 UTC 当天但北京已是次日', () => {
    // dueDate = UTC 2026-05-07 16:00 = 北京 2026-05-08 00:00
    // 当 now = 北京 5/7 → 距离 = 1 天，而非 0 天
    const due = new Date('2026-05-07T16:00:00Z');
    expect(daysUntilBeijing(due, now)).toBe(1);
  });
});

describe('beijingMonthStart / beijingMonthRange', () => {
  it('北京 5 月 7 日 → 月初 = 5 月 1 日 00:00 BJ = 4 月 30 日 16:00 UTC', () => {
    const now = new Date('2026-05-07T06:30:00Z');
    expect(beijingMonthStart(now).toISOString()).toBe('2026-04-30T16:00:00.000Z');
  });

  it('北京 1/1 00:30（UTC 上一年 12/31）→ 月初仍是 1 月 1 日', () => {
    const now = new Date('2025-12-31T16:30:00Z');
    expect(beijingMonthStart(now).toISOString()).toBe('2025-12-31T16:00:00.000Z');
  });

  it('beijingMonthRange(2026, 5) → [4/30 16Z, 5/31 16Z)', () => {
    const { start, end } = beijingMonthRange(2026, 5);
    expect(start.toISOString()).toBe('2026-04-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-31T16:00:00.000Z');
  });

  it('beijingMonthRange(2026, 12) → 跨年到 2027 年 1 月', () => {
    const { start, end } = beijingMonthRange(2026, 12);
    expect(start.toISOString()).toBe('2026-11-30T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T16:00:00.000Z');
  });
});

describe('beijingQuarterStart', () => {
  it('北京 5 月 → Q2 起 4/1', () => {
    const now = new Date('2026-05-07T06:30:00Z');
    expect(beijingQuarterStart(now).toISOString()).toBe('2026-03-31T16:00:00.000Z');
  });

  it('北京 1 月 → Q1 起 1/1', () => {
    // 北京 2026-01-15
    const now = new Date('2026-01-15T04:00:00Z');
    expect(beijingQuarterStart(now).toISOString()).toBe('2025-12-31T16:00:00.000Z');
  });

  it('北京 10 月 → Q4 起 10/1', () => {
    const now = new Date('2026-10-15T04:00:00Z');
    expect(beijingQuarterStart(now).toISOString()).toBe('2026-09-30T16:00:00.000Z');
  });

  it('UTC 跨季临界：UTC 6/30 16:00 = 北京 7/1 → Q3', () => {
    const now = new Date('2026-06-30T16:30:00Z');
    expect(beijingQuarterStart(now).toISOString()).toBe('2026-06-30T16:00:00.000Z');
  });
});

describe('beijingWeekStart', () => {
  it('北京周三 → 同周周一', () => {
    // 北京 2026-05-06（周三）任意时刻
    const wed = new Date('2026-05-06T08:00:00Z');
    const monday = beijingWeekStart(wed);
    // 北京 2026-05-04（周一）00:00 = UTC 2026-05-03 16:00
    expect(monday.toISOString()).toBe('2026-05-03T16:00:00.000Z');
  });

  it('北京周日 → 上一周周一（ISO 周）', () => {
    // 北京 2026-05-10（周日）任意时刻
    const sun = new Date('2026-05-10T08:00:00Z');
    const monday = beijingWeekStart(sun);
    expect(monday.toISOString()).toBe('2026-05-03T16:00:00.000Z');
  });

  it('北京周一 → 当天 00:00', () => {
    // 北京 2026-05-04（周一）任意时刻
    const mon = new Date('2026-05-04T08:00:00Z');
    expect(beijingWeekStart(mon).toISOString()).toBe('2026-05-03T16:00:00.000Z');
  });

  it('北京周日 23:59 不会被分到下周', () => {
    // 北京 2026-05-10 23:59 = UTC 15:59
    const lateSun = new Date('2026-05-10T15:59:00Z');
    expect(beijingWeekStart(lateSun).toISOString()).toBe('2026-05-03T16:00:00.000Z');
  });
});

describe('beijingYMD', () => {
  it('UTC 16:00 → 北京次日', () => {
    const d = new Date('2026-05-06T16:00:00Z');
    expect(beijingYMD(d)).toEqual({ year: 2026, month: 5, day: 7 });
  });

  it('UTC 15:59 → 北京当天', () => {
    const d = new Date('2026-05-07T15:59:00Z');
    expect(beijingYMD(d)).toEqual({ year: 2026, month: 5, day: 7 });
  });

  it('跨年：UTC 2025-12-31 16:00 → 北京 2026-01-01', () => {
    const d = new Date('2025-12-31T16:00:00Z');
    expect(beijingYMD(d)).toEqual({ year: 2026, month: 1, day: 1 });
  });
});

describe('endOfDay', () => {
  it('返回北京当天 23:59:59.999（绝对时间 = 北京次日 00:00 - 1ms）', () => {
    // 北京 2026-05-07 任意时刻 → 应得到 北京 5/7 23:59:59.999 = UTC 5/7 15:59:59.999
    const d = new Date('2026-05-07T06:30:00Z');
    expect(endOfDay(d).toISOString()).toBe('2026-05-07T15:59:59.999Z');
  });

  it('UTC 服务器场景：UTC 16:00 实为北京次日 → endOfDay 是次日的 23:59', () => {
    const d = new Date('2026-05-07T16:00:00Z'); // 北京 5/8 00:00
    expect(endOfDay(d).toISOString()).toBe('2026-05-08T15:59:59.999Z');
  });
});

describe('isOverdueDate', () => {
  // 锚定"今天"为 北京 2026-05-07
  const today1430 = new Date('2026-05-07T06:30:00Z'); // 北京 5/7 14:30
  const todayMorning = new Date('2026-05-06T16:00:00Z'); // 北京 5/7 00:00 整
  const todayLateNight = new Date('2026-05-07T15:59:00Z'); // 北京 5/7 23:59

  it('dueDate 是今天 → 不算逾期（无论 now 是今天什么时候）', () => {
    // dueDate = 北京 5/7 任意时刻
    const dueToday = new Date('2026-05-07T03:00:00Z'); // 北京 5/7 11:00
    expect(isOverdueDate(dueToday, today1430)).toBe(false);
    expect(isOverdueDate(dueToday, todayMorning)).toBe(false);
    expect(isOverdueDate(dueToday, todayLateNight)).toBe(false);
  });

  it('dueDate 是今天的早晨，now 是今天的晚上 → 仍然不算逾期（24:00 未到）', () => {
    // dueDate = 北京 5/7 09:00 = UTC 01:00
    const dueTodayMorning = new Date('2026-05-07T01:00:00Z');
    // now = 北京 5/7 22:00 = UTC 14:00
    const nowTodayEvening = new Date('2026-05-07T14:00:00Z');
    expect(isOverdueDate(dueTodayMorning, nowTodayEvening)).toBe(false);
  });

  it('dueDate 是昨天 → 算逾期（昨天 24:00 已过）', () => {
    // dueDate = 北京 5/6 任意时刻
    const dueYesterday = new Date('2026-05-06T08:00:00Z');
    expect(isOverdueDate(dueYesterday, today1430)).toBe(true);
  });

  it('边界：dueDate = 北京 5/6 23:59:59.999, now = 北京 5/7 00:00:00.000 → 刚好逾期', () => {
    // 这是 endOfDay(5/6) 的精确值，与 5/7 00:00 相差 1ms
    const dueEndOf6 = new Date('2026-05-06T15:59:59.999Z');
    const now7Midnight = new Date('2026-05-06T16:00:00.000Z');
    expect(isOverdueDate(dueEndOf6, now7Midnight)).toBe(true);
  });

  it('边界：dueDate = 北京 5/7 00:00, now = 北京 5/7 00:00 → 不算逾期', () => {
    const dueStartOf7 = new Date('2026-05-06T16:00:00Z');
    const now7Midnight = new Date('2026-05-06T16:00:00Z');
    expect(isOverdueDate(dueStartOf7, now7Midnight)).toBe(false);
  });

  it('dueDate 是明天 → 不算逾期', () => {
    // dueDate = 北京 5/8 任意
    const dueTomorrow = new Date('2026-05-08T03:00:00Z');
    expect(isOverdueDate(dueTomorrow, today1430)).toBe(false);
  });

  it('UTC 服务器场景：跨 UTC 16:00 边界，仍按北京时间判定', () => {
    // dueDate = 北京 5/7 任意时刻
    const dueToday = new Date('2026-05-07T03:00:00Z');
    // now = UTC 5/7 17:00 = 北京 5/8 01:00（已是次日凌晨）
    const nextDayBJ = new Date('2026-05-07T17:00:00Z');
    expect(isOverdueDate(dueToday, nextDayBJ)).toBe(true);
  });
});
