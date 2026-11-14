const api = require("../../utils/api");

function num(value) {
  return Number(value);
}

function or(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

Page({
  data: {
    serverBase: "",
    takeProfitPct: "20",
    stopLossPct: "10",
    nearHighPct: "3",
    breakevenBandPct: "2",
    underwaterMarkPct: "8",
    drawdownPct: "15",
    cooldownHours: "20",
    dayMovePct: "5",
    digestEnabled: true,
    alertTakeProfit: true,
    alertStopLoss: true,
    alertNearHigh: true,
    alertMa5: true,
    alertMa20: true,
    alertDayMove: true,
    pushplusToken: "",
    serverchanKey: "",
    apiToken: "",
    error: "",
    saving: false
  },
  onShow() {
    if (!this.dirty) this.load();
  },
  load() {
    const page = this;
    const base = wx.getStorageSync("serverBase") || "http://127.0.0.1:8787";
    this.setData({ serverBase: base, apiToken: wx.getStorageSync("apiToken") || "" });
    api.get("/api/bootstrap").then(function (data) {
      const saved = data.settings || {};
      page.setData({
        error: "",
        takeProfitPct: String(or(saved.takeProfitPct, 20)),
        stopLossPct: String(or(saved.stopLossPct, 10)),
        nearHighPct: String(or(saved.nearHighPct, 3)),
        breakevenBandPct: String(or(saved.breakevenBandPct, 2)),
        underwaterMarkPct: String(or(saved.underwaterMarkPct, 8)),
        drawdownPct: String(or(saved.drawdownPct, 15)),
        cooldownHours: String(or(saved.cooldownHours, 20)),
        dayMovePct: String(or(saved.dayMovePct, 5)),
        digestEnabled: saved.digestEnabled !== false,
        alertTakeProfit: saved.alertTakeProfit !== false,
        alertStopLoss: saved.alertStopLoss !== false,
        alertNearHigh: saved.alertNearHigh !== false,
        alertMa5: saved.alertMa5 !== false,
        alertMa20: saved.alertMa20 !== false,
        alertDayMove: saved.alertDayMove !== false,
        pushplusToken: saved.pushplusToken || "",
        serverchanKey: saved.serverchanKey || "",
        apiToken: saved.apiToken || ""
      });
      page.dirty = false;
    }).catch(function (error) {
      page.setData({ error: error.message || "连不上提醒服务" });
    });
  },
  onBase(event) { this.dirty = true; this.setData({ serverBase: event.detail.value }); },
  onField(event) {
    this.dirty = true;
    const data = {};
    data[event.currentTarget.dataset.key] = event.detail.value;
    this.setData(data);
  },
  onDigest(event) { this.dirty = true; this.setData({ digestEnabled: event.detail.value }); },
  onFlag(event) {
    this.dirty = true;
    const data = {};
    data[event.currentTarget.dataset.key] = event.detail.value;
    this.setData(data);
  },
  copy(event) {
    wx.setClipboardData({ data: event.currentTarget.dataset.url });
  },
  payload() {
    return {
      takeProfitPct: num(this.data.takeProfitPct),
      stopLossPct: num(this.data.stopLossPct),
      nearHighPct: num(this.data.nearHighPct),
      breakevenBandPct: num(this.data.breakevenBandPct),
      underwaterMarkPct: num(this.data.underwaterMarkPct),
      drawdownPct: num(this.data.drawdownPct),
      cooldownHours: num(this.data.cooldownHours),
      dayMovePct: num(this.data.dayMovePct),
      digestEnabled: this.data.digestEnabled,
      alertTakeProfit: this.data.alertTakeProfit,
      alertStopLoss: this.data.alertStopLoss,
      alertNearHigh: this.data.alertNearHigh,
      alertMa5: this.data.alertMa5,
      alertMa20: this.data.alertMa20,
      alertDayMove: this.data.alertDayMove,
      pushplusToken: this.data.pushplusToken,
      serverchanKey: this.data.serverchanKey,
      apiToken: this.data.apiToken
    };
  },
  save(options) {
    const page = this;
    const quiet = options && options.quiet;
    const base = (this.data.serverBase || "http://127.0.0.1:8787").trim().replace(/\/$/, "");
    wx.setStorageSync("serverBase", base);
    this.setData({ saving: true, serverBase: base });
    return api.put("/api/settings", this.payload()).then(function () {
      wx.setStorageSync("apiToken", (page.data.apiToken || "").trim());
      page.dirty = false;
      page.setData({ saving: false });
      if (!quiet) wx.showToast({ title: "已保存", icon: "success" });
    }).catch(function (error) {
      page.setData({ saving: false });
      if (!quiet) wx.showModal({ title: "没保存", content: error.message, showCancel: false });
      else throw error;
    });
  },
  testPush() {
    const page = this;
    this.save({ quiet: true }).then(function () {
      return api.post("/api/notify/test");
    }).then(function () {
      wx.showModal({ title: "已发送", content: "去微信里看有没有「测试提醒」。", showCancel: false });
    }).catch(function (error) {
      if (error && error.message) {
        wx.showModal({ title: "测试没发出去", content: error.message, showCancel: false });
      }
    });
  }
});
