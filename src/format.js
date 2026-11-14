export function fmtPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return n < 2 ? n.toFixed(3) : n.toFixed(2);
}

export function fmtMoney(value, withSign = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  const sign = n < 0 ? "-" : withSign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(2)}万`;
  return `${sign}${abs.toFixed(2)}`;
}

export function signedPct(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function trimNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  return String(Math.round(n * 10000) / 10000);
}

export function highText(price, high, label = "前期高点") {
  const pct = ((price - high) / high) * 100;
  if (pct >= 0) return `已高出${label} ${fmtPrice(high)} 的 ${pct.toFixed(1)}%`;
  return `距${label} ${fmtPrice(high)} 还差 ${Math.abs(pct).toFixed(1)}%`;
}
