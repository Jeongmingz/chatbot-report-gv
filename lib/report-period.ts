export function seoulDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(now);
}

export function shiftDate(day: string, days: number): string {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getUTCDate()).padStart(2, "0");
  return [year, month, dayOfMonth].join("-");
}

export function presetDates(preset: string, today = seoulDate()) {
  if (preset === "month") return { from: today.slice(0, 8) + "01", to: today };
  const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 0;
  return { from: shiftDate(today, -days), to: today };
}

export function validReportDate(value: string | null) {
  if (!value) return true;
  if (value.startsWith("0000-")) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
