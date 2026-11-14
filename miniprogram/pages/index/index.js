const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: {
    loaded: false,
    positions: [],
    summary: { pnlText: "--", marketText: "--", costText: "--", pctText: "--", tone: "" },
    error: "",
    checking: false,
    fresh: false,
    statusText: "",
    zoneCount: 0,
    quoteMissing: 0
  },
  onShow() {
    this.load();
  },
  onPullDownRefresh() {
    this.load().finally(function () { wx.stopPullDownRefresh(); });
  },
  load() {
    const page = this;
    return api.get("/api/bootstrap").then(function (data) {
      page.setData(Object.assign({ loaded: true, error: "" }, format.home(data)));
    }).catch(function (error) {
      page.setData({ loaded: true, error: error.message || "连不上提醒服务" });
    });
  },
  open(event) {
    wx.navigateTo({ url: "/pages/edit/edit?id=" + event.currentTarget.dataset.id });
  },
  add() {
    wx.navigateTo({ url: "/pages/edit/edit" });
  },
  check() {
    const page = this;
    wx.showModal({
      title: "按最新价检查",
      content: "已经在提醒区里的股票会再发一条微信。",
      confirmText: "检查并推送",
      success(res) {
        if (res.confirm) page.runCheck();
      }
    });
  },
  runCheck() {
    const page = this;
    this.setData({ checking: true });
    api.post("/api/check").then(function (result) {
      page.setData({ checking: false });
      page.load();
      let content = "现在没有股票在提醒区";
      if (result.error) content = result.error;
      else if (result.alerts && result.alerts.length) {
        content = result.alerts[0].delivered
          ? "发了 " + result.alerts.length + " 条微信"
          : "记了 " + result.alerts.length + " 条，但还没配微信推送";
      }
      wx.showModal({ title: "检查结果", content: content, showCancel: false });
    }).catch(function (error) {
      page.setData({ checking: false });
      wx.showModal({ title: "没检查成", content: error.message, showCancel: false });
    });
  }
});
