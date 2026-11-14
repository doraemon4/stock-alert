import { digestText, evaluate, firedRecently, snapshot } from "./engine.js";
import { marketLabel } from "./market.js";
import { pushAlerts, pushMessage } from "./notify.js";
import { fetchMovingAverages, fetchQuotes } from "./quotes.js";
import { save } from "./store.js";
import { inDigestWindow, quoteIsLive, shanghaiDate } from "./time.js";

export async function refreshQuotes(db) {
  const symbols = [...new Set(db.positions.map((position) => position.symbol))];
  db.meta.lastQuoteAt = Date.now();
  if (!symbols.length) return;
  const quotes = await fetchQuotes(symbols);
  const bySymbol = new Map(quotes.map((quote) => [quote.symbol, quote]));
  const today = shanghaiDate(new Date());
  await Promise.all([...bySymbol.keys()].map(async (symbol) => {
    const quote = bySymbol.get(symbol);
    const prev = db.positions.find((item) => item.symbol === symbol)?.lastQuote;
    try {
      const ma = await fetchMovingAverages(symbol, today);
      if (ma.ma5) quote.ma5 = ma.ma5;
      if (ma.ma20) quote.ma20 = ma.ma20;
    } catch {
      // A missing average must not drop the live price.
    }
    if (!quote.ma5 && prev?.ma5) quote.ma5 = prev.ma5;
    if (!quote.ma20 && prev?.ma20) quote.ma20 = prev.ma20;
  }));
  let hit = 0;
  for (const position of db.positions) {
    const quote = bySymbol.get(position.symbol);
    if (!quote || !(quote.price > 0)) continue;
    hit += 1;
    position.lastQuote = quote;
    if (!position.name || position.name === position.code) position.name = quote.name || position.name;
  }
  if (!hit) throw new Error("行情源没有返回这些股票");
}

export async function runCycle(db, { force = false, focusIds = [] } = {}) {
  const now = Date.now();
  const settings = db.settings;
  try {
    await refreshQuotes(db);
    db.meta.lastError = "";
  } catch (error) {
    db.meta.lastError = error.message || "行情获取失败";
    db.meta.lastCheckAt = now;
    save(db);
    return { alerts: [], digest: false, error: db.meta.lastError };
  }

  const focus = new Set(focusIds);
  const digestDue =
    !force &&
    focus.size === 0 &&
    settings.digestEnabled !== false &&
    inDigestWindow(new Date(now)) &&
    db.meta.lastDigestDate !== shanghaiDate(new Date(now));

  const pending = [];
  if (digestDue) {
    for (const position of db.positions) {
      if (!(Number(position.lastQuote?.price) > 0)) continue;
      position.state = evaluate(position, position.lastQuote, settings, now, "silent").state;
    }
    const entries = [];
    for (const position of db.positions) {
      const view = snapshot(position, position.lastQuote, settings);
      if (!view.valid || view.paused || !view.zones.length) continue;
      if (firedRecently(position.state, now)) continue;
      entries.push({ position, snap: view });
    }
    db.meta.lastDigestDate = shanghaiDate(new Date(now));
    if (entries.length) {
      const text = digestText(entries);
      pending.push(recordDraft({
        positionId: "",
        name: "开盘前提醒",
        code: "",
        types: ["digest"],
        title: text.title,
        body: text.body,
        price: 0,
        pnlPct: 0
      }));
    }
  } else {
    for (const position of db.positions) {
      const focused = focus.has(position.id);
      if (!force && !focused && !quoteIsLive(position.lastQuote, now)) continue;
      if (!(Number(position.lastQuote?.price) > 0)) continue;
      const result = evaluate(position, position.lastQuote, settings, now, force ? "force" : "auto");
      position.state = result.state;
      for (const alert of result.alerts) {
        pending.push(recordDraft({
          positionId: position.id,
          name: position.name || position.code,
          code: position.code,
          types: alert.types,
          title: alert.title,
          body: alert.body,
          price: result.snapshot.price,
          pnlPct: result.snapshot.pnlPct
        }));
      }
    }
  }

  const delivery = pending.length
    ? await pushAlerts(settings, pending)
    : { delivered: false, channel: "", error: "" };
  const records = pending.map((item) => ({
    id: crypto.randomUUID(),
    ...item,
    createdAt: new Date(now).toISOString(),
    delivered: delivery.delivered,
    channel: delivery.channel,
    error: delivery.delivered ? "" : delivery.error
  }));
  if (records.length) db.alerts = [...records, ...(db.alerts || [])].slice(0, 200);
  db.meta.lastCheckAt = now;
  save(db);
  return { alerts: records, digest: digestDue, error: "" };
}

function recordDraft(item) {
  return item;
}

export async function sendTest(db) {
  const delivery = await pushMessage(
    db.settings,
    "测试提醒",
    "这是一条测试。微信里能看到，就说明止盈、止损和前高提醒会走这条通道。"
  );
  db.alerts = [
    {
      id: crypto.randomUUID(),
      positionId: "",
      name: "测试",
      code: "",
      types: ["test"],
      title: "测试提醒",
      body: "这是一条测试。微信里能看到，就说明止盈、止损和前高提醒会走这条通道。",
      price: 0,
      pnlPct: 0,
      createdAt: new Date().toISOString(),
      delivered: delivery.delivered,
      channel: delivery.channel,
      error: delivery.delivered ? "" : delivery.error
    },
    ...(db.alerts || [])
  ].slice(0, 200);
  save(db);
  return delivery;
}

export function view(db) {
  const positions = db.positions.map((position) => decorate(position, db.settings));
  positions.sort(comparePositions);
  return {
    positions,
    summary: summarize(positions),
    settings: db.settings,
    alerts: (db.alerts || []).slice(0, 80),
    meta: {
      lastCheckAt: db.meta.lastCheckAt || 0,
      lastQuoteAt: db.meta.lastQuoteAt || 0,
      lastDigestDate: db.meta.lastDigestDate || "",
      lastError: db.meta.lastError || ""
    }
  };
}

function decorate(position, settings) {
  const metrics = snapshot(position, position.lastQuote, settings);
  return {
    id: position.id,
    code: position.code,
    market: position.market,
    marketLabel: marketLabel(position.market),
    symbol: position.symbol,
    name: position.name || position.code,
    quantity: position.quantity,
    costPrice: position.costPrice,
    costAmount: position.costAmount,
    refHigh: position.refHigh,
    plan: position.plan,
    takeProfitPct: position.takeProfitPct,
    stopLossPct: position.stopLossPct,
    nearHighPct: position.nearHighPct,
    enabled: position.enabled !== false,
    quote: position.lastQuote
      ? {
          price: position.lastQuote.price,
          prevClose: position.lastQuote.prevClose,
          change: position.lastQuote.change,
          changePct: position.lastQuote.changePct,
          high: position.lastQuote.high,
          low: position.lastQuote.low,
          time: position.lastQuote.time,
          ma5: position.lastQuote.ma5 || null,
          ma20: position.lastQuote.ma20 || null
        }
      : null,
    metrics
  };
}

function comparePositions(a, b) {
  if (a.metrics.paused !== b.metrics.paused) return a.metrics.paused ? 1 : -1;
  const rank = { stop: 0, break: 1, take: 2, high: 3, move: 4, even: 5, hold: 6 };
  const diff = (rank[a.metrics.tone] ?? 9) - (rank[b.metrics.tone] ?? 9);
  if (diff) return diff;
  return (b.metrics.pnlPct || 0) - (a.metrics.pnlPct || 0);
}

function summarize(positions) {
  let marketValue = 0;
  let costAmount = 0;
  let quoteMissing = 0;
  let zoneCount = 0;
  for (const position of positions) {
    if (!position.metrics.valid) {
      quoteMissing += 1;
      continue;
    }
    marketValue += position.metrics.marketValue;
    costAmount += position.metrics.costAmount;
    if (!position.metrics.paused && position.metrics.zones.length) zoneCount += 1;
  }
  const pnlAmount = marketValue - costAmount;
  const pnlPct = costAmount > 0 ? (pnlAmount / costAmount) * 100 : 0;
  return {
    marketValue,
    costAmount,
    pnlAmount,
    pnlPct: Math.round(pnlPct * 100) / 100,
    zoneCount,
    quoteMissing,
    direction: pnlAmount > 0.005 ? "up" : pnlAmount < -0.005 ? "down" : "flat"
  };
}
