function money(n, sign) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "--";
  const prefix = v < 0 ? "-" : sign && v > 0 ? "+" : "";
  const abs = Math.abs(v);
  return abs >= 10000 ? prefix + (abs / 10000).toFixed(2) + "万" : prefix + abs.toFixed(2);
}

function pct(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "--";
  return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}

function price(n) {
  const v = Number(n);
  if (!(v > 0)) return "--";
  return v < 2 ? v.toFixed(3) : v.toFixed(2);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function clock(value) {
  if (!value) return "还没有检查";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return (date.getMonth() + 1) + "/" + date.getDate() + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
}

function qty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "--";
  return String(Math.round(v * 10000) / 10000);
}

function badgeOf(tone) {
  if (tone === "stop") return "止损";
  if (tone === "take") return "止盈";
  if (tone === "high") return "前高";
  if (tone === "even") return "回本";
  if (tone === "break") return "破位";
  if (tone === "move") return "异动";
  return "";
}

function mapPosition(item) {
  const metrics = item.metrics || {};
  const quote = item.quote || {};
  const tone = metrics.paused ? "hold" : (metrics.tone || "hold");
  const meta = [qty(item.quantity) + "股", "成本 " + price(item.costPrice)];
  if (item.refHigh > 0) meta.push("前高 " + price(item.refHigh));
  const lines = (metrics.lines || []).slice();
  if (item.plan) lines.push("计划：" + item.plan);
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    marketLabel: item.marketLabel,
    meta: meta.join(" · "),
    pnlText: pct(metrics.pnlPct),
    pnlAmt: money(metrics.pnlAmount, true),
    pnlTone: (metrics.pnlAmount || 0) > 0 ? "up" : (metrics.pnlAmount || 0) < 0 ? "down" : "",
    priceText: price(quote.price),
    dayText: pct(quote.changePct),
    dayTone: (quote.changePct || 0) > 0 ? "up" : (quote.changePct || 0) < 0 ? "down" : "",
    showDay: !!quote.price,
    badge: metrics.paused ? "暂停" : badgeOf(tone),
    tone: tone,
    lines: lines
  };
}

function home(data) {
  const summary = data.summary || {};
  const meta = data.meta || {};
  const positions = (data.positions || []).map(mapPosition);
  let statusText = "还没有自动检查";
  if (meta.lastError) statusText = meta.lastError;
  else if (meta.lastCheckAt) statusText = "最近检查 " + clock(meta.lastCheckAt);
  const latest = (data.alerts || [])[0];
  const fresh = latest ? new Date(latest.createdAt).toDateString() === new Date().toDateString() : false;
  return {
    positions: positions,
    zoneCount: summary.zoneCount || 0,
    quoteMissing: summary.quoteMissing || 0,
    fresh: fresh,
    statusText: statusText,
    summary: {
      pnlText: money(summary.pnlAmount, true),
      marketText: money(summary.marketValue),
      costText: money(summary.costAmount),
      pctText: pct(summary.pnlPct),
      tone: summary.direction === "up" ? "up" : summary.direction === "down" ? "down" : ""
    }
  };
}

function mapAlerts(list) {
  return (list || []).map(function (item) {
    return {
      id: item.id,
      title: item.title,
      time: clock(item.createdAt),
      lines: String(item.body || "").split("\n"),
      status: item.delivered ? "已发微信" : (item.error || "未推送"),
      ok: !!item.delivered
    };
  });
}

function lookupHint(info) {
  if (!info || !info.price) return "";
  let text = "现价 " + price(info.price);
  if (info.recentHigh && info.recentHigh.price) {
    const dist = ((info.price - info.recentHigh.price) / info.recentHigh.price) * 100;
    const gap = dist >= 0 ? "已高出 " + dist.toFixed(1) + "%" : "还差 " + Math.abs(dist).toFixed(1) + "%";
    text += "，近半年最高 " + price(info.recentHigh.price) + "（" + info.recentHigh.date + "），" + gap;
  }
  return text;
}

module.exports = { money, pct, price, clock, home, mapAlerts, lookupHint };
