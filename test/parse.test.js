import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCode } from "../src/market.js";
import { DEFAULT_SETTINGS, normalizePosition, normalizeSettings } from "../src/model.js";
import { decodeGbk, movingAverages, parseSuggest, parseTencentQuotes } from "../src/quotes.js";
import { inAlertSession, inDigestWindow, quoteIsLive } from "../src/time.js";

test("recognizes A-share, Beijing and Hong Kong codes", () => {
  assert.equal(normalizeCode("600519").symbol, "sh600519");
  assert.equal(normalizeCode("SH600519").market, "sh");
  assert.equal(normalizeCode("000001").market, "sz");
  assert.equal(normalizeCode("300750").market, "sz");
  assert.equal(normalizeCode("688981").market, "sh");
  assert.equal(normalizeCode("920001").market, "bj");
  assert.equal(normalizeCode("900901").market, "sh");
  assert.equal(normalizeCode("510300").market, "sh");
  assert.equal(normalizeCode("159915").market, "sz");
  assert.deepEqual(normalizeCode("00700"), { market: "hk", code: "00700", symbol: "hk00700" });
  assert.equal(normalizeCode("hk700").symbol, "hk00700");
  assert.equal(normalizeCode("600519.SS").symbol, "sh600519");
  assert.equal(normalizeCode(""), null);
  assert.equal(normalizeCode("茅台"), null);
});

test("derives cost from the money spent", () => {
  const position = normalizePosition({ code: "600519", quantity: "100", costAmount: "1000" });
  assert.equal(position.symbol, "sh600519");
  assert.equal(position.costPrice, 10);
  assert.equal(position.costAmount, 1000);
  assert.equal(position.takeProfitPct, null);
  assert.equal(position.enabled, true);
  assert.throws(() => normalizePosition({ code: "abc", quantity: 1, costAmount: 1 }), /无法识别/);
  assert.throws(() => normalizeSettings({ takeProfitPct: 0 }, DEFAULT_SETTINGS), /止盈线/);
});

test("parses a real Tencent quote payload", () => {
  const sample =
    'v_sh600519="1~贵州茅台~600519~1435.26~1410.27~1404.00~41780~22449~19331~1435.00~1~1434.80~1~1434.68~1~1434.60~1~1434.55~1~1435.26~2~1435.27~3~1435.38~6~1435.49~9~1435.50~9~~20261113161455~24.99~1.77~1437.69~1394.00~1435.26/41780/5954834070~41780~595483~0.33~21.84~~1437.69~1394.00~3.10~17941.92~17941.92~6.62~1551.30~1269.24~1.28~-24~1425.29~20.87~21.80~~~-0.04~595483.4070~200.9364~14~   A~GP-A~6.38~-1.22~3.62~30.29~26.74~1539.98~1151.01~3.10~8.00~5.90~1250081601~1250081601~-70.59~-2.78~1250081601~~~1.19~0.36~~CNY~0~___D__F__N~1435.60~-17~";';
  const [quote] = parseTencentQuotes(sample);
  assert.equal(quote.symbol, "sh600519");
  assert.equal(quote.name, "贵州茅台");
  assert.equal(quote.price, 1435.26);
  assert.equal(quote.prevClose, 1410.27);
  assert.equal(quote.change, 24.99);
  assert.equal(quote.changePct, 1.77);
  assert.equal(quote.high, 1437.69);
  assert.equal(quote.low, 1394);
  assert.equal(quote.time, "2026-11-13 16:14:55");
});

test("decodes gbk names and unicode-escaped search hits", () => {
  assert.equal(decodeGbk(Buffer.from("b9f3d6ddc3a9cca8", "hex")), "贵州茅台");
  const text = String.raw`v_hint="sh~000001~\u4e0a\u8bc1\u6307\u6570~szzs~ZS^sh~600519~\u8d35\u5dde\u8305\u53f0~gzmt~GP-A^sz~000001~\u5e73\u5b89\u94f6\u884c~payh~GP-A"`;
  const items = parseSuggest(text);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "贵州茅台");
  assert.equal(items[0].symbol, "sh600519");
  assert.equal(items[1].name, "平安银行");
});

test("moving averages ignore today's unfinished bar", () => {
  const bars = [];
  for (let i = 1; i <= 20; i += 1) bars.push({ date: `2026-10-${String(i).padStart(2, "0")}`, close: i });
  bars.push({ date: "2026-11-13", close: 1000 });
  const ma = movingAverages(bars, "2026-11-13");
  assert.equal(ma.ma5, 18);
  assert.equal(ma.ma20, 10.5);
});

test("indicator switches can be turned off", () => {
  const next = normalizeSettings({ alertMa20: false, dayMovePct: 8 }, DEFAULT_SETTINGS);
  assert.equal(next.alertMa20, false);
  assert.equal(next.alertMa5, true);
  assert.equal(next.dayMovePct, 8);
});

test("session clock follows Shanghai weekdays", () => {
  assert.equal(inAlertSession(new Date("2026-11-13T01:30:00Z")), true);
  assert.equal(inDigestWindow(new Date("2026-11-13T01:25:00Z")), true);
  assert.equal(inDigestWindow(new Date("2026-11-13T01:40:00Z")), false);
  assert.equal(inAlertSession(new Date("2026-11-14T01:30:00Z")), false);
  assert.equal(inAlertSession(new Date("2026-11-13T12:01:00Z")), false);
  assert.equal(
    quoteIsLive({ price: 10, time: "2026-11-13 10:00:00" }, Date.parse("2026-11-13T02:00:00Z")),
    true
  );
  assert.equal(
    quoteIsLive({ price: 10, time: "2026-11-12 15:00:00" }, Date.parse("2026-11-13T02:00:00Z")),
    false
  );
});
