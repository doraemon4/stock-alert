import { bad } from "./errors.js";
import { normalizeCode } from "./market.js";

const HEADERS = {
  Referer: "https://gu.qq.com",
  "User-Agent": "Mozilla/5.0"
};

export function decodeGbk(buffer) {
  return new TextDecoder("gbk").decode(buffer);
}

export function formatQuoteTime(raw) {
  const matched = String(raw || "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!matched) return String(raw || "");
  return `${matched[1]}-${matched[2]}-${matched[3]} ${matched[4]}:${matched[5]}:${matched[6]}`;
}

export function parseTencentQuotes(text) {
  const quotes = [];
  const pattern = /v_([a-z0-9]+)="([^"]*)"/gi;
  let matched;
  while ((matched = pattern.exec(text))) {
    const parts = matched[2].split("~");
    const price = Number(parts[3]);
    if (!(price > 0) || !parts[1]) continue;
    quotes.push({
      symbol: matched[1].toLowerCase(),
      name: parts[1],
      code: parts[2],
      price,
      prevClose: Number(parts[4]) || 0,
      open: Number(parts[5]) || 0,
      change: Number(parts[31]) || 0,
      changePct: Number(parts[32]) || 0,
      high: Number(parts[33]) || 0,
      low: Number(parts[34]) || 0,
      time: formatQuoteTime(parts[30])
    });
  }
  return quotes;
}

export function parseSuggest(text) {
  const decoded = decodeMaybeUnicode(String(text || ""));
  const matched = decoded.match(/v_hint="([^"]*)"/);
  if (!matched || !matched[1]) return [];
  const rows = [];
  for (const row of matched[1].split("^")) {
    if (!row) continue;
    const [market, code, name, py, type] = row.split("~");
    if (!market || !code || !name) continue;
    const kind = type || "";
    if (kind && !kind.startsWith("GP") && market !== "hk") continue;
    rows.push({
      market,
      code,
      name,
      py: py || "",
      type: kind,
      symbol: `${market}${code}`
    });
  }
  return rows.slice(0, 8);
}

function decodeMaybeUnicode(value) {
  if (!value.includes("\\u")) return value;
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

async function getBuffer(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw bad(502, "行情源暂时不可用");
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    if (error.status) throw error;
    throw bad(502, error.name === "TimeoutError" ? "行情请求超时" : "行情源连不上");
  }
}

async function getText(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw bad(502, "行情源暂时不可用");
    return await res.text();
  } catch (error) {
    if (error.status) throw error;
    throw bad(502, error.name === "TimeoutError" ? "行情请求超时" : "行情源连不上");
  }
}

export async function fetchQuotes(symbols) {
  const unique = [...new Set(symbols.filter(Boolean))];
  const all = [];
  for (let i = 0; i < unique.length; i += 40) {
    const chunk = unique.slice(i, i + 40);
    const buf = await getBuffer(`https://qt.gtimg.cn/q=${chunk.join(",")}`);
    all.push(...parseTencentQuotes(decodeGbk(buf)));
  }
  return all;
}

export async function searchStocks(query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const text = await getText(`https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(q)}&t=gp`);
  return parseSuggest(text);
}

export function movingAverages(bars, today) {
  const closes = bars.filter((bar) => bar.date < today && bar.close > 0).map((bar) => bar.close);
  return { ma5: meanLast(closes, 5), ma20: meanLast(closes, 20) };
}

function meanLast(values, count) {
  if (values.length < count) return null;
  const slice = values.slice(-count);
  const avg = slice.reduce((sum, value) => sum + value, 0) / count;
  return Math.round(avg * 100) / 100;
}

function dailyCloses(json, symbol) {
  const data = json?.data || {};
  const node = data[symbol] || Object.values(data)[0];
  const rows = node?.day || node?.qfqday || [];
  return rows
    .map((row) => ({ date: String(row?.[0] || ""), close: Number(row?.[2]) }))
    .filter((row) => row.date && row.close > 0);
}

export async function fetchMovingAverages(symbol, today) {
  const text = await getText(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,40,`);
  return movingAverages(dailyCloses(JSON.parse(text), symbol), today);
}

export async function fetchRecentHigh(symbol, bars = 120) {
  const text = await getText(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,${bars},`);
  const json = JSON.parse(text);
  const data = json?.data || {};
  const node = data[symbol] || Object.values(data)[0];
  const rows = node?.day || node?.qfqday || [];
  let best = null;
  for (const row of rows) {
    const high = Number(row?.[3]);
    if (!(high > 0)) continue;
    if (!best || high >= best.price) best = { price: roundPrice(high), date: String(row[0]) };
  }
  return best;
}

function roundPrice(n) {
  return n < 2 ? Math.round(n * 1000) / 1000 : Math.round(n * 100) / 100;
}

export async function lookupSymbol(input) {
  const parsed = normalizeCode(input);
  if (!parsed) throw bad(400, "代码无法识别，A 股输入 6 位代码，港股输入 hk00700");
  const [quotes, recentHigh] = await Promise.all([
    fetchQuotes([parsed.symbol]),
    fetchRecentHigh(parsed.symbol).catch(() => null)
  ]);
  const quote = quotes.find((item) => item.symbol === parsed.symbol) || quotes[0];
  if (!quote) throw bad(404, "没有查到这只股票");
  return {
    market: parsed.market,
    code: parsed.code,
    symbol: parsed.symbol,
    name: quote.name,
    price: quote.price,
    changePct: quote.changePct,
    recentHigh
  };
}
