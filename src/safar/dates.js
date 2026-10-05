export const fa = (n) => Number(n).toLocaleString('fa-IR');
export const day = (iso, n) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const dateLabel = (iso, options = {}) =>
  new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    day: 'numeric',
    month: 'long',
    ...options,
  }).format(new Date(`${iso}T12:00:00Z`));
const parts = (iso) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-u-ca-persian', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    })
      .formatToParts(new Date(`${iso}T12:00:00Z`))
      .map((p) => [p.type, p.value]),
  );
export function monthStart(iso) {
  return day(iso, 1 - Number(parts(iso).day));
}
export function shiftMonth(iso, direction) {
  const start = monthStart(iso);
  return direction < 0 ? monthStart(day(start, -1)) : monthStart(day(start, 32));
}
export function monthDays(iso) {
  const start = monthStart(iso),
    next = shiftMonth(start, 1),
    count = Math.round((Date.parse(next) - Date.parse(start)) / 86400000),
    offset = (new Date(`${start}T12:00:00Z`).getUTCDay() + 1) % 7;
  return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => day(start, i))];
}
