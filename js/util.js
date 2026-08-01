// 通用工具：日期与 ID
export function pad(n) { return n < 10 ? '0' + n : '' + n; }

// Date -> 'YYYY-MM-DD'（本地时区）
export function fmtDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr() { return fmtDate(new Date()); }

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekdayName(dateStr) {
  return WEEKDAYS[parseDate(dateStr).getDay()];
}

// 返回包含 dateStr 那一周的周一日期
export function mondayOf(dateStr) {
  const d = parseDate(dateStr);
  const day = d.getDay() || 7; // 周日按 7 算
  d.setDate(d.getDate() - (day - 1));
  return fmtDate(d);
}

// 一周的 7 天（周一到周日）
export function weekDates(mondayStr) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function todayLabel() {
  const t = todayStr();
  const d = parseDate(t);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayName(t)}`;
}
