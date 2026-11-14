import { highText, signedPct, trimNum } from "./format.js";
import { quoteDate } from "./time.js";

const ZONE_ORDER = ["takeProfit", "stopLoss", "nearHigh", "recovery", "breakeven", "ma20", "ma5", "dayMove"];

export function emptyState() {
  return {
    peak: 0,
    armedHigh: 0,
    fell: false,
    wasUnderwater: false,
    dayMoveDate: "",
    inZone: {
      stopLoss: false,
      takeProfit: false,
      nearHigh: false,
      recovery: false,
      breakeven: false,
      ma5: false,
      ma20: false,
      dayMove: false
    },
    lastFired: {}
  };
}

export function normalizeState(state) {
  const base = emptyState();
  if (!state || typeof state !== "object") return base;
  return {
    peak: Number(state.peak) || 0,
    armedHigh: Number(state.armedHigh) || 0,
    fell: Boolean(state.fell),
    wasUnderwater: Boolean(state.wasUnderwater),
    dayMoveDate: typeof state.dayMoveDate === "string" ? state.dayMoveDate : "",
    inZone: { ...base.inZone, ...(state.inZone || {}) },
    lastFired: { ...(state.lastFired || {}) }
  };
}

export function thresholds(position, settings) {
  return {
    takeProfitPct: pickPct(position.takeProfitPct, settings.takeProfitPct),
    stopLossPct: pickPct(position.stopLossPct, settings.stopLossPct),
    nearHighPct: pickPct(position.nearHighPct, settings.nearHighPct),
    breakevenBandPct: Number(settings.breakevenBandPct),
    underwaterMarkPct: Number(settings.underwaterMarkPct),
    drawdownPct: Number(settings.drawdownPct),
    dayMovePct: Number(settings.dayMovePct),
    cooldownMs: Number(settings.cooldownHours) * 3600 * 1000
  };
}

function pickPct(value, fallback) {
  if (value === null || value === undefined || value === "") return Number(fallback);
  const n = Number(value);
  return Number.isFinite(n) ? n : Number(fallback);
}

function enabled(settings, key) {
  return settings?.[key] !== false;
}

function asQuote(value) {
  if (value && typeof value === "object") return value;
  return { price: value };
}

function pctText(n) {
  const v = Math.round(Math.abs(Number(n)) * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function levelText(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "--";
  const text = v < 2 ? v.toFixed(3) : v.toFixed(2);
  return text.replace(/\.?0+$/, "");
}

function toneOf(zones, changePct) {
  if (zones.includes("stopLoss")) return "stop";
  if (zones.includes("ma5") || zones.includes("ma20")) return "break";
  if (zones.includes("takeProfit")) return "take";
  if (zones.includes("nearHigh") || zones.includes("recovery")) return "high";
  if (zones.includes("dayMove")) return Number(changePct) < 0 ? "stop" : "move";
  if (zones.includes("breakeven")) return "even";
  return "hold";
}

export function alertLine(type, position, snap) {
  const name = position.name || position.code;
  const th = snap.thresholds;
  if (type === "takeProfit") return `止盈提醒：${name} 盈利已达 ${pctText(snap.pnlPct)}%，建议分批止盈`;
  if (type === "stopLoss") return `止损提醒：${name} 亏损已达 ${pctText(snap.pnlPct)}%，触发止损线`;
  if (type === "nearHigh") return `前高提醒：${name} 已回到前期高点 ${levelText(position.refHigh)} 附近，注意压力`;
  if (type === "recovery") return `前高提醒：${name} 已回到前期高点 ${levelText(snap.armedHigh)} 附近，注意压力`;
  if (type === "breakeven") return `回本提醒：${name} 已回到成本附近`;
  if (type === "ma5") return `破位提醒：${name} 跌破 5 日线，趋势转弱`;
  if (type === "ma20") return `破位提醒：${name} 跌破 20 日线，趋势转弱`;
  if (type === "dayMove") return `异动：${name} 单日涨跌超 ${pctText(th.dayMovePct)}%`;
  return "";
}

function holdLines(position, snap, settings) {
  const th = snap.thresholds;
  const lines = [];
  const gapToProfit = th.takeProfitPct - snap.pnlPct;
  if (enabled(settings, "alertTakeProfit") && snap.pnlPct >= 0 && gapToProfit > 0) {
    lines.push(`距止盈线 ${trimNum(th.takeProfitPct)}% 还差 ${gapToProfit.toFixed(1)} 个点`);
  } else if (enabled(settings, "alertStopLoss") && snap.pnlPct < 0) {
    lines.push(`距止损线 ${trimNum(th.stopLossPct)}% 还有 ${(snap.pnlPct + th.stopLossPct).toFixed(1)} 个点`);
  } else {
    lines.push(`盈亏 ${signedPct(snap.pnlPct)}`);
  }
  if (enabled(settings, "alertNearHigh")) {
    if (Number(position.refHigh) > 0) lines.push(highText(snap.price, position.refHigh));
    else if (snap.armedHigh > 0) lines.push(highText(snap.price, snap.armedHigh, "监控高点"));
  }
  const ma = [];
  if (enabled(settings, "alertMa5") && snap.ma5 > 0) ma.push(`5日线 ${levelText(snap.ma5)}`);
  if (enabled(settings, "alertMa20") && snap.ma20 > 0) ma.push(`20日线 ${levelText(snap.ma20)}`);
  if (ma.length) lines.push(ma.join(" · "));
  return lines;
}

export function snapshot(position, quoteOrPrice, settings) {
  const quote = asQuote(quoteOrPrice);
  const th = thresholds(position, settings);
  const state = normalizeState(position.state);
  const costPrice = Number(position.costPrice);
  const quantity = Number(position.quantity);
  const paused = position.enabled === false;
  const numericPrice = Number(quote.price);
  const priceOk = numericPrice > 0 && costPrice > 0 && quantity > 0;
  const ma5 = Number(quote.ma5) || 0;
  const ma20 = Number(quote.ma20) || 0;
  const changePct = Number(quote.changePct);

  if (!priceOk) {
    return {
      valid: false,
      paused,
      price: numericPrice > 0 ? numericPrice : 0,
      costPrice: costPrice > 0 ? costPrice : 0,
      quantity: quantity > 0 ? quantity : 0,
      costAmount: Number(position.costAmount) || 0,
      marketValue: 0,
      pnlAmount: 0,
      pnlPct: 0,
      distanceToHighPct: null,
      armedHigh: state.armedHigh || 0,
      ma5,
      ma20,
      changePct: Number.isFinite(changePct) ? changePct : 0,
      zones: [],
      tone: "hold",
      lines: [paused ? "提醒已暂停" : "暂时没有拿到报价"],
      thresholds: th
    };
  }

  const costAmount = Number(position.costAmount) > 0 ? Number(position.costAmount) : costPrice * quantity;
  const marketValue = numericPrice * quantity;
  const pnlAmount = marketValue - costAmount;
  const pnlPct = Math.round((((numericPrice - costPrice) / costPrice) * 100) * 10000) / 10000;
  const zones = [];
  let distanceToHighPct = null;

  if (!paused) {
    if (enabled(settings, "alertStopLoss") && pnlPct <= -th.stopLossPct) zones.push("stopLoss");
    if (enabled(settings, "alertTakeProfit") && pnlPct >= th.takeProfitPct) zones.push("takeProfit");
    if (enabled(settings, "alertNearHigh") && Number(position.refHigh) > 0) {
      distanceToHighPct = ((numericPrice - Number(position.refHigh)) / Number(position.refHigh)) * 100;
      if (numericPrice >= Number(position.refHigh) * (1 - th.nearHighPct / 100)) zones.push("nearHigh");
    } else if (enabled(settings, "alertNearHigh") && state.fell && state.armedHigh > 0) {
      distanceToHighPct = ((numericPrice - state.armedHigh) / state.armedHigh) * 100;
      if (numericPrice >= state.armedHigh * (1 - th.nearHighPct / 100)) zones.push("recovery");
    }
    if (state.wasUnderwater && pnlPct >= -th.breakevenBandPct && pnlPct <= th.breakevenBandPct) {
      zones.push("breakeven");
    }
    if (enabled(settings, "alertMa20") && ma20 > 0 && numericPrice < ma20) zones.push("ma20");
    if (enabled(settings, "alertMa5") && ma5 > 0 && numericPrice < ma5) zones.push("ma5");
    if (enabled(settings, "alertDayMove") && Math.abs(changePct) >= th.dayMovePct) zones.push("dayMove");
  }

  const snap = {
    valid: true,
    paused,
    price: numericPrice,
    costPrice,
    quantity,
    costAmount,
    marketValue,
    pnlAmount,
    pnlPct: Math.round(pnlPct * 100) / 100,
    distanceToHighPct: distanceToHighPct === null ? null : Math.round(distanceToHighPct * 100) / 100,
    armedHigh: state.armedHigh || 0,
    ma5,
    ma20,
    changePct: Number.isFinite(changePct) ? changePct : 0,
    zones,
    tone: paused ? "hold" : toneOf(zones, changePct),
    lines: [],
    thresholds: th
  };
  snap.lines = paused
    ? ["提醒已暂停，这笔仍会计入总资产"]
    : zones.length
      ? zones.map((type) => alertLine(type, position, snap))
      : holdLines(position, snap, settings);
  return snap;
}

function upperZone(active, value, line, hysteresis) {
  return active ? value >= line - hysteresis : value >= line;
}

function lowerZone(active, value, line, hysteresis) {
  return active ? value <= line + hysteresis : value <= line;
}

function belowLine(active, price, line) {
  if (!(line > 0)) return false;
  return active ? price < line * 1.005 : price < line;
}

function cooldownReady(last, now, cooldownMs) {
  if (last === undefined || last === null || last === "") return true;
  return now - last >= cooldownMs;
}

export function alertContent(position, snap, types) {
  const ordered = ZONE_ORDER.filter((type) => types.includes(type));
  const lines = ordered.map((type) => alertLine(type, position, snap)).filter(Boolean);
  if (position.plan) lines.push(`你写下的计划：${position.plan}`);
  const title = lines[0] || `${position.name || position.code} 持仓提醒`;
  return { types: ordered, title: title.slice(0, 64), body: lines.join("\n") };
}

export function digestText(entries) {
  const title = `开盘前 · ${entries.length} 条告警`;
  const body = entries.map(({ snap }) => snap.lines.join("\n")).join("\n");
  return { title, body };
}

export function firedRecently(state, now, windowMs = 6 * 3600 * 1000) {
  return Object.values(normalizeState(state).lastFired).some((ts) => ts && now - ts < windowMs);
}

/**
 * mode:
 * - auto: alert when a zone is newly entered and cooldown has passed
 * - force: alert for every zone the price is strictly inside now
 * - silent: update memory only
 */
export function evaluate(position, quote, settings, now, mode = "auto") {
  const prev = normalizeState(position.state);
  const price = Number(quote?.price);
  const costPrice = Number(position.costPrice);
  const quantity = Number(position.quantity);

  if (!(price > 0) || !(costPrice > 0) || !(quantity > 0) || position.enabled === false) {
    return { state: prev, alerts: [], snapshot: snapshot(position, quote, settings) };
  }

  const state = structuredClone(prev);
  const observed = Math.max(price, Number(quote?.high) || 0);
  if (observed > state.peak) state.peak = observed;

  const th = thresholds(position, settings);
  const pnlPct = Math.round((((price - costPrice) / costPrice) * 100) * 10000) / 10000;
  if (pnlPct <= -th.underwaterMarkPct) state.wasUnderwater = true;

  if (!(Number(position.refHigh) > 0) && state.peak > 0 && price <= state.peak * (1 - th.drawdownPct / 100)) {
    state.armedHigh = state.peak;
    state.fell = true;
  }

  const nextZone = {
    stopLoss: enabled(settings, "alertStopLoss") && lowerZone(prev.inZone.stopLoss, pnlPct, -th.stopLossPct, 2),
    takeProfit: enabled(settings, "alertTakeProfit") && upperZone(prev.inZone.takeProfit, pnlPct, th.takeProfitPct, 2),
    nearHigh: false,
    recovery: false,
    breakeven: false,
    ma5: enabled(settings, "alertMa5") && belowLine(prev.inZone.ma5, price, Number(quote?.ma5)),
    ma20: enabled(settings, "alertMa20") && belowLine(prev.inZone.ma20, price, Number(quote?.ma20)),
    dayMove: false
  };

  if (enabled(settings, "alertNearHigh") && Number(position.refHigh) > 0) {
    const lower = Number(position.refHigh) * (1 - th.nearHighPct / 100);
    const exit = lower * (1 - 0.03);
    nextZone.nearHigh = prev.inZone.nearHigh ? price >= exit : price >= lower;
  } else if (enabled(settings, "alertNearHigh") && state.fell && state.armedHigh > 0) {
    const lower = state.armedHigh * (1 - th.nearHighPct / 100);
    const exit = lower * (1 - 0.03);
    nextZone.recovery = prev.inZone.recovery ? price >= exit : price >= lower;
  }

  if (state.wasUnderwater) {
    const band = th.breakevenBandPct;
    nextZone.breakeven = prev.inZone.breakeven
      ? pnlPct >= -(band + 2) && pnlPct <= band + 2
      : pnlPct >= -band && pnlPct <= band;
  }

  const day = quoteDate(quote);
  const changePct = Number(quote?.changePct);
  const dayHot = enabled(settings, "alertDayMove") && Boolean(day) && Math.abs(changePct) >= th.dayMovePct;
  nextZone.dayMove = dayHot;

  const prevZone = { ...prev.inZone };
  if (day && state.dayMoveDate !== day) prevZone.dayMove = false;

  const viewPosition = { ...position, state };
  const strict = snapshot(viewPosition, quote, settings);
  const entered = ZONE_ORDER.filter((key) => nextZone[key] && !prevZone[key]);
  let types = [];
  if (mode === "force") types = strict.zones.slice();
  else if (mode === "auto") {
    types = entered.filter((key) => {
      if (key === "dayMove") return state.dayMoveDate !== day;
      return cooldownReady(state.lastFired[key], now, th.cooldownMs);
    });
  }

  if (dayHot && day) state.dayMoveDate = day;

  const alerts = [];
  if (types.length) {
    alerts.push(alertContent(position, strict, types));
    for (const key of types) state.lastFired[key] = now;
  }

  if (pnlPct > th.breakevenBandPct + 2) state.wasUnderwater = false;
  state.inZone = nextZone;

  return {
    state,
    alerts,
    snapshot: snapshot({ ...position, state }, quote, settings)
  };
}
