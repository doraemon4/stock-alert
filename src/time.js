const HOUR = 60;

export function shanghaiParts(date) {
  const shifted = new Date(date.getTime() + 8 * 3600 * 1000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    mm: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay()
  };
}

export function pad(n) {
  return String(n).padStart(2, "0");
}

export function shanghaiDate(date) {
  const parts = shanghaiParts(date);
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`;
}

export function formatShanghai(value) {
  const date = value instanceof Date ? value : new Date(value);
  const parts = shanghaiParts(date);
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)} ${pad(parts.hh)}:${pad(parts.mm)}`;
}

function minutes(date) {
  const parts = shanghaiParts(date);
  return parts.hh * HOUR + parts.mm;
}

function isWeekday(date) {
  const day = shanghaiParts(date).weekday;
  return day !== 0 && day !== 6;
}

/** Weekday 09:15–20:00 Shanghai. Covers the A-share session and a few hours after the close. */
export function inAlertSession(date) {
  if (!isWeekday(date)) return false;
  const mins = minutes(date);
  return mins >= 9 * HOUR + 15 && mins <= 20 * HOUR;
}

/** Weekday 09:25–09:40 Shanghai, one digest before the cash open. */
export function inDigestWindow(date) {
  if (!isWeekday(date)) return false;
  const mins = minutes(date);
  return mins >= 9 * HOUR + 25 && mins < 9 * HOUR + 40;
}

export function quoteDate(quote) {
  const raw = String(quote?.time || "");
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})/) || raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!matched) return "";
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

export function quoteIsLive(quote, now) {
  if (!quote || !(Number(quote.price) > 0)) return false;
  if (!inAlertSession(new Date(now))) return false;
  return quoteDate(quote) === shanghaiDate(new Date(now));
}
