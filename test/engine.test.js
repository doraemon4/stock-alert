import assert from "node:assert/strict";
import test from "node:test";
import { evaluate } from "../src/engine.js";
import { DEFAULT_SETTINGS, normalizePosition } from "../src/model.js";

function settings(extra = {}) {
  return { ...DEFAULT_SETTINGS, ...extra };
}

function pos(extra = {}) {
  const { state, ...input } = extra;
  const position = normalizePosition({
    code: "600519",
    name: "贵州茅台",
    quantity: 100,
    costPrice: 100,
    costAmount: 10000,
    ...input
  });
  if (state) position.state = state;
  return position;
}

function tick(position, price, at, mode = "auto", extraSettings = {}, quote = {}) {
  const result = evaluate(position, { price, high: price, ...quote }, settings(extraSettings), at, mode);
  return { result, position: { ...position, state: result.state } };
}

test("take profit alerts once, then waits until price leaves and cooldown ends", () => {
  let position = pos();
  let step = tick(position, 120, 1_000);
  assert.equal(step.result.alerts.length, 1);
  assert.deepEqual(step.result.alerts[0].types, ["takeProfit"]);
  assert.match(step.result.alerts[0].title, /止盈/);
  assert.equal(step.result.alerts[0].body, "止盈提醒：贵州茅台 盈利已达 20%，建议分批止盈");

  position = step.position;
  step = tick(position, 121, 2_000);
  assert.equal(step.result.alerts.length, 0);
  assert.equal(step.result.state.inZone.takeProfit, true);

  position = step.position;
  step = tick(position, 119, 3_000);
  assert.equal(step.result.state.inZone.takeProfit, true);

  position = step.position;
  step = tick(position, 110, 4_000);
  assert.equal(step.result.state.inZone.takeProfit, false);

  position = step.position;
  step = tick(position, 130, 5_000);
  assert.equal(step.result.alerts.length, 0);

  position = step.position;
  step = tick(position, 100, 6_000);
  position = step.position;
  step = tick(position, 130, 5_000 + 20 * 3600 * 1000);
  assert.equal(step.result.alerts.length, 1);
});

test("a per-stock take profit line overrides the global one", () => {
  const position = pos({ takeProfitPct: 5 });
  const step = tick(position, 106, 1_000);
  assert.deepEqual(step.result.alerts[0].types, ["takeProfit"]);
  const quiet = tick(pos(), 106, 1_000);
  assert.equal(quiet.result.alerts.length, 0);
  assert.match(quiet.result.snapshot.lines.join(" "), /还差/);
});

test("stop loss alerts on the way down", () => {
  let position = pos();
  let step = tick(position, 90, 1_000);
  assert.deepEqual(step.result.alerts[0].types, ["stopLoss"]);
  assert.equal(step.result.alerts[0].body, "止损提醒：贵州茅台 亏损已达 10%，触发止损线");
  position = step.position;
  step = tick(position, 89, 2_000);
  assert.equal(step.result.alerts.length, 0);
});

test("manual high alerts when price comes back, and does not also arm auto recovery", () => {
  let position = pos({ refHigh: 100, stopLossPct: 80, takeProfitPct: 200 });
  let step = tick(position, 80, 1_000);
  assert.equal(step.result.state.fell, false);
  assert.equal(step.result.alerts.length, 0);
  position = step.position;
  step = tick(position, 96.9, 2_000);
  assert.equal(step.result.alerts.length, 0);
  position = step.position;
  step = tick(position, 97, 3_000);
  assert.deepEqual(step.result.alerts[0].types, ["nearHigh"]);
  assert.equal(step.result.alerts[0].body, "前高提醒：贵州茅台 已回到前期高点 100 附近，注意压力");
  position = step.position;
  step = tick(position, 95, 5_000);
  assert.equal(step.result.state.inZone.nearHigh, true);
  assert.equal(step.result.alerts.length, 0);
  position = step.position;
  step = tick(position, 94, 6_000);
  assert.equal(step.result.state.inZone.nearHigh, false);
});

test("without a manual high, a 15% drop then a return alerts", () => {
  let position = pos({ stopLossPct: 80, takeProfitPct: 200 });
  let step = tick(position, 100, 1_000);
  position = step.position;
  step = tick(position, 80, 2_000);
  assert.equal(step.result.state.fell, true);
  assert.equal(step.result.state.armedHigh, 100);
  position = step.position;
  step = tick(position, 97, 3_000);
  assert.deepEqual(step.result.alerts[0].types, ["recovery"]);
});

test("breakeven only rings after a deep loss and then a return to cost", () => {
  let position = pos({ stopLossPct: 80, takeProfitPct: 50 });
  let step = tick(position, 100, 1_000);
  position = step.position;
  step = tick(position, 91, 2_000);
  assert.equal(step.result.state.wasUnderwater, true);
  assert.equal(step.result.alerts.length, 0);
  position = step.position;
  step = tick(position, 101, 3_000);
  assert.deepEqual(step.result.alerts[0].types, ["breakeven"]);
  position = step.position;
  step = tick(position, 101, 4_000);
  assert.equal(step.result.alerts.length, 0);
  position = step.position;
  step = tick(position, 110, 5_000);
  assert.equal(step.result.state.wasUnderwater, false);
  position = step.position;
  step = tick(position, 101, 6_000);
  assert.equal(step.result.alerts.length, 0);
});

test("paused and missing quotes do not alert or wipe memory", () => {
  const paused = tick(pos({ enabled: false }), 150, 1_000);
  assert.equal(paused.result.alerts.length, 0);
  assert.match(paused.result.snapshot.lines.join(" "), /暂停/);

  let position = pos();
  let step = tick(position, 130, 1_000);
  position = step.position;
  const lost = evaluate(position, { price: 0 }, settings(), 2_000, "auto");
  assert.equal(lost.alerts.length, 0);
  assert.equal(lost.state.inZone.takeProfit, true);
});

test("force sends again, silent only remembers", () => {
  let position = pos();
  let step = tick(position, 130, 1_000, "silent");
  assert.equal(step.result.alerts.length, 0);
  assert.equal(step.result.state.inZone.takeProfit, true);
  position = step.position;
  step = tick(position, 130, 2_000, "auto");
  assert.equal(step.result.alerts.length, 0);
  step = tick(position, 130, 3_000, "force");
  assert.equal(step.result.alerts.length, 1);
});

test("the written plan is included in the wechat text", () => {
  const position = pos({ plan: "回到前高就卖" });
  const step = tick(position, 130, 1_000);
  assert.match(step.result.alerts[0].body, /回到前高就卖/);
});

test("breaking the 5-day and 20-day lines uses the short copy, once until reclaimed", () => {
  let position = pos({ stopLossPct: 80, takeProfitPct: 200 });
  let step = tick(position, 80, 1_000, "auto", {}, { ma5: 90, ma20: 100 });
  assert.deepEqual(step.result.alerts[0].types, ["ma20", "ma5"]);
  assert.equal(
    step.result.alerts[0].body,
    "破位提醒：贵州茅台 跌破 20 日线，趋势转弱\n破位提醒：贵州茅台 跌破 5 日线，趋势转弱"
  );
  position = step.position;
  step = tick(position, 80, 2_000, "auto", {}, { ma5: 90, ma20: 100 });
  assert.equal(step.result.alerts.length, 0);

  position = step.position;
  step = tick(position, 101, 3_000 + 20 * 3600 * 1000, "auto", {}, { ma5: 90, ma20: 100 });
  assert.equal(step.result.state.inZone.ma20, false);
  assert.equal(step.result.state.inZone.ma5, false);
  position = step.position;
  step = tick(position, 80, 4_000 + 20 * 3600 * 1000, "auto", {}, { ma5: 90, ma20: 100 });
  assert.deepEqual(step.result.alerts[0].types, ["ma20", "ma5"]);
});

test("a switched-off indicator does not push", () => {
  const step = tick(pos(), 130, 1_000, "auto", { alertTakeProfit: false });
  assert.equal(step.result.alerts.length, 0);
  assert.equal(step.result.snapshot.zones.includes("takeProfit"), false);
});

test("a big daily move alerts once per quote date", () => {
  let position = pos({ stopLossPct: 80, takeProfitPct: 200 });
  let step = tick(position, 100, 1_000, "auto", {}, { changePct: 6, time: "2026-11-13 10:00:00" });
  assert.equal(step.result.alerts[0].body, "异动：贵州茅台 单日涨跌超 5%");
  position = step.position;
  step = tick(position, 100, 2_000, "auto", {}, { changePct: 6.2, time: "2026-11-13 14:00:00" });
  assert.equal(step.result.alerts.length, 0);
  position = step.position;
  step = tick(position, 100, 3_000, "auto", {}, { changePct: -6, time: "2026-11-16 10:00:00" });
  assert.equal(step.result.alerts[0].body, "异动：贵州茅台 单日涨跌超 5%");
});
