export function normalizeCode(input) {
  let raw = String(input ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;

  let market = "";
  const prefixed = raw.match(/^(sh|sz|bj|hk)(\d+)$/);
  if (prefixed) {
    market = prefixed[1];
    raw = prefixed[2];
  } else {
    raw = raw.replace(/\D/g, "");
  }
  if (!raw) return null;

  if (market === "hk" || (!market && raw.length <= 5)) {
    const code = raw.padStart(5, "0");
    if (!/^\d{5}$/.test(code)) return null;
    return { market: "hk", code, symbol: `hk${code}` };
  }

  if (!/^\d{6}$/.test(raw)) return null;
  if (!market) market = inferMarket(raw);
  if (!market) return null;
  return { market, code: raw, symbol: `${market}${raw}` };
}

export function marketLabel(market) {
  return { sh: "沪", sz: "深", bj: "京", hk: "港" }[market] || "";
}

function inferMarket(code) {
  if (code.startsWith("92") || code.startsWith("8") || code.startsWith("4")) return "bj";
  if (code.startsWith("6") || code.startsWith("9") || code.startsWith("11") || code.startsWith("5")) return "sh";
  if (
    code.startsWith("0") ||
    code.startsWith("3") ||
    code.startsWith("12") ||
    code.startsWith("15") ||
    code.startsWith("16")
  ) {
    return "sz";
  }
  return "";
}
