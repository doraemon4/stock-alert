import { bad } from "./errors.js";
import { emptyState, normalizeState } from "./engine.js";
import { normalizeCode } from "./market.js";

export const DEFAULT_SETTINGS = {
  takeProfitPct: 20,
  stopLossPct: 10,
  nearHighPct: 3,
  breakevenBandPct: 2,
  underwaterMarkPct: 8,
  drawdownPct: 15,
  cooldownHours: 20,
  dayMovePct: 5,
  digestEnabled: true,
  alertTakeProfit: true,
  alertStopLoss: true,
  alertNearHigh: true,
  alertMa5: true,
  alertMa20: true,
  alertDayMove: true,
  pushplusToken: "",
  serverchanKey: "",
  apiToken: ""
};

const SETTING_RANGES = [
  ["takeProfitPct", 0.5, 300, "止盈线"],
  ["stopLossPct", 0.5, 80, "止损线"],
  ["nearHighPct", 0.5, 30, "前高范围"],
  ["breakevenBandPct", 0.5, 15, "回本带宽"],
  ["underwaterMarkPct", 3, 50, "套牢标记"],
  ["drawdownPct", 5, 60, "自动回撤"],
  ["cooldownHours", 1, 168, "提醒间隔"],
  ["dayMovePct", 1, 30, "单日涨跌"]
];

const SETTING_FLAGS = [
  "digestEnabled",
  "alertTakeProfit",
  "alertStopLoss",
  "alertNearHigh",
  "alertMa5",
  "alertMa20",
  "alertDayMove"
];

export function emptyMeta() {
  return {
    lastCheckAt: 0,
    lastQuoteAt: 0,
    lastDigestDate: "",
    lastError: "",
    lastManualAt: 0
  };
}

export function normalizeSettings(input = {}, prev = DEFAULT_SETTINGS) {
  const next = { ...DEFAULT_SETTINGS, ...prev };
  for (const [key, min, max, label] of SETTING_RANGES) {
    if (input[key] === undefined) continue;
    const n = Number(input[key]);
    if (!Number.isFinite(n) || n < min || n > max) {
      throw bad(400, `${label}要在 ${min} 到 ${max} 之间`);
    }
    next[key] = n;
  }
  for (const key of SETTING_FLAGS) {
    if (input[key] !== undefined) next[key] = Boolean(input[key]);
  }
  if (input.pushplusToken !== undefined) next.pushplusToken = cleanToken(input.pushplusToken, 120);
  if (input.serverchanKey !== undefined) next.serverchanKey = cleanToken(input.serverchanKey, 120);
  if (input.apiToken !== undefined) next.apiToken = cleanToken(input.apiToken, 80);
  return next;
}

function cleanToken(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizePosition(input, prev) {
  const parsed = normalizeCode(input.code || prev?.code);
  if (!parsed) throw bad(400, "股票代码无法识别，A 股输入 6 位代码，港股输入 hk00700");

  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) {
    throw bad(400, "数量要大于 0");
  }

  const rawAmount = Number(input.costAmount);
  const rawPrice = Number(input.costPrice);
  if (!(rawAmount > 0) && !(rawPrice > 0)) throw bad(400, "请填写投入金额或成本价");
  if (rawPrice > 1e7 || rawAmount > 1e12) throw bad(400, "金额大得不像个人持仓");

  const costPrice = roundTo(rawPrice > 0 ? rawPrice : rawAmount / quantity, 4);
  const costAmount = roundTo(rawAmount > 0 ? rawAmount : costPrice * quantity, 2);
  if (!(costPrice > 0) || !(costAmount > 0)) throw bad(400, "请填写投入金额或成本价");

  const refHigh = blank(input.refHigh) ? 0 : Number(input.refHigh);
  if (!Number.isFinite(refHigh) || refHigh < 0 || refHigh > 1e7) {
    throw bad(400, "前期高点填价格，没有就留空");
  }

  const enabled = input.enabled !== false && input.enabled !== "false";
  let state = emptyState();
  let lastQuote = null;
  if (prev && prev.symbol === parsed.symbol) {
    state = normalizeState(prev.state);
    lastQuote = prev.lastQuote || null;
    if (prev.enabled === false && enabled) state.inZone = emptyState().inZone;
  }

  return {
    id: prev?.id || crypto.randomUUID(),
    code: parsed.code,
    market: parsed.market,
    symbol: parsed.symbol,
    name: String(input.name || prev?.name || "").trim().slice(0, 20),
    quantity,
    costPrice,
    costAmount,
    refHigh,
    plan: String(input.plan || "").trim().slice(0, 80),
    takeProfitPct: optionalPct(input.takeProfitPct, 0.5, 300, "这只的止盈线"),
    stopLossPct: optionalPct(input.stopLossPct, 0.5, 80, "这只的止损线"),
    nearHighPct: optionalPct(input.nearHighPct, 0.5, 30, "这只的前高范围"),
    enabled,
    createdAt: prev?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state,
    lastQuote
  };
}

function optionalPct(value, min, max, label) {
  if (blank(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw bad(400, `${label}请填 ${min} 到 ${max} 之间的数字，留空则用全局设置`);
  }
  return n;
}

function blank(value) {
  return value === null || value === undefined || value === "";
}

function roundTo(n, digits) {
  const m = 10 ** digits;
  return Math.round((n + Number.EPSILON) * m) / m;
}
