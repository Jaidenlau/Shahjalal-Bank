/**
 * Date formatting. The house style for this client is `17 Sep 2026`.
 * Everything renders in Asia/Dhaka so the demo reads correctly regardless of
 * the machine's timezone.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Shift a Date into Asia/Dhaka (UTC+6) wall-clock parts. */
function dhaka(d: Date): Date {
  return new Date(d.getTime() + 6 * 60 * 60 * 1000);
}

/** `17 Sep 2026` */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = dhaka(new Date(d));
  return `${dt.getUTCDate().toString().padStart(2, "0")} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

/** `17 Sep 2026, 3:00 PM` */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = dhaka(new Date(d));
  let h = dt.getUTCHours();
  const m = dt.getUTCMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${formatDate(d)}, ${h}:${m} ${ampm}`;
}

/** `3:00 PM` */
export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = dhaka(new Date(d));
  let h = dt.getUTCHours();
  const m = dt.getUTCMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

/** `Monday` */
export function formatDayName(d: Date | string): string {
  return DAYS[dhaka(new Date(d)).getUTCDay()];
}

/** Whole days between now and then. Negative means in the past. */
export function daysFromNow(d: Date | string | null | undefined): number {
  if (!d) return 0;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/** `3 days ago`, `in 11 days`, `today` */
export function relativeDays(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const n = daysFromNow(d);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${Math.abs(n)} days ago`;
}

/** Age of a record in days, for list "Age" columns. */
export function ageInDays(d: Date | string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / (24 * 60 * 60 * 1000)));
}

/** Countdown used on open tenders: `2d 14h` / `closed`. */
export function countdown(to: Date | string | null | undefined): string {
  if (!to) return "—";
  const ms = new Date(to).getTime() - Date.now();
  if (ms <= 0) return "closed";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Bangladeshi financial year label for a date: July–June. */
export function financialYear(d: Date = new Date()): string {
  const dt = dhaka(d);
  const y = dt.getUTCFullYear();
  return dt.getUTCMonth() >= 6 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function addHours(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 3_600_000);
}
