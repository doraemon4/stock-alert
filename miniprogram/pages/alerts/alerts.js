const api = require("../../utils/api");
const format = require("../../utils/format");

Page({
  data: { loaded: false, alerts: [], error: "" },
  onShow() { this.load(); },
  onPullDownRefresh() {
    this.load().finally(function () { wx.stopPullDownRefresh(); });
  },
  load() {
    const page = this;
    return api.get("/api/bootstrap").then(function (data) {
      page.setData({ loaded: true, error: "", alerts: format.mapAlerts(data.alerts) });
    }).catch(function (error) {
      page.setData({ loaded: true, error: error.message || "连不上提醒服务" });
    });
  }
});
