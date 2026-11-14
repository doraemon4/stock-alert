const api = require("../../utils/api");
const format = require("../../utils/format");

function trimCalc(n, digits) {
  const v = Math.round(Number(n) * 10 ** digits) / 10 ** digits;
  return String(v);
}

Page({
  data: {
    id: "",
    code: "",
    name: "",
    quantity: "",
    costAmount: "",
    costPrice: "",
    refHigh: "",
    plan: "",
    takeProfitPct: "",
    stopLossPct: "",
    nearHighPct: "",
    enabled: true,
    custom: false,
    lastCostEdit: "amount",
    results: [],
    hint: "输入代码后可以查出名称，以及近半年最高价。",
    recentHigh: null,
    saving: false
  },
  onLoad(query) {
    this.id = query.id || "";
    this.setData({ id: this.id });
    wx.setNavigationBarTitle({ title: this.id ? "修改持仓" : "记一笔" });
    if (this.id) this.load();
  },
  onUnload() {
    clearTimeout(this.timer);
  },
  load() {
    const page = this;
    api.get("/api/bootstrap").then(function (data) {
      const found = (data.positions || []).find(function (item) { return item.id === page.id; });
      if (!found) {
        wx.showModal({ title: "没有这只股票", showCancel: false });
        return;
      }
      page.setData({
        code: found.code,
        name: found.name === found.code ? "" : found.name,
        quantity: String(found.quantity),
        costAmount: String(found.costAmount),
        costPrice: String(found.costPrice),
        refHigh: found.refHigh ? String(found.refHigh) : "",
        plan: found.plan || "",
        takeProfitPct: found.takeProfitPct == null ? "" : String(found.takeProfitPct),
        stopLossPct: found.stopLossPct == null ? "" : String(found.stopLossPct),
        nearHighPct: found.nearHighPct == null ? "" : String(found.nearHighPct),
        enabled: found.enabled !== false,
        custom: found.takeProfitPct != null || found.stopLossPct != null || found.nearHighPct != null,
        lastCostEdit: "price"
      });
    }).catch(function (error) {
      wx.showModal({ title: "没读到", content: error.message, showCancel: false });
    });
  },
  onCode(event) {
    const code = event.detail.value;
    this.setData({ code: code });
    const page = this;
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { page.search(code); }, 300);
  },
  search(query) {
    const text = (query || "").trim();
    if (!text) {
      this.setData({ results: [] });
      return;
    }
    const page = this;
    api.get("/api/search?q=" + encodeURIComponent(text)).then(function (list) {
      page.setData({ results: list || [] });
    }).catch(function () {
      page.setData({ results: [] });
    });
  },
  pick(event) {
    const item = this.data.results[event.currentTarget.dataset.i];
    if (!item) return;
    this.setData({ code: item.code, name: item.name, results: [] });
    this.lookup(item.symbol || item.code);
  },
  onBlurCode() {
    if (this.data.code) this.lookup(this.data.code);
  },
  lookup(code) {
    const page = this;
    api.get("/api/lookup?code=" + encodeURIComponent(code)).then(function (info) {
      const patch = {
        hint: format.lookupHint(info),
        recentHigh: info.recentHigh || null,
        results: []
      };
      if (!page.data.name || page.data.name === page.data.code) patch.name = info.name;
      page.setData(patch);
    }).catch(function (error) {
      page.setData({ hint: error.message, recentHigh: null });
    });
  },
  useHigh() {
    if (!this.data.recentHigh) return;
    this.setData({ refHigh: String(this.data.recentHigh.price) });
  },
  onField(event) {
    const key = event.currentTarget.dataset.key;
    const value = event.detail.value;
    const data = {};
    data[key] = value;
    if (key === "quantity" || key === "costAmount" || key === "costPrice") {
      if (key === "costAmount") data.lastCostEdit = "amount";
      if (key === "costPrice") data.lastCostEdit = "price";
      const mode = key === "costPrice" ? "price" : key === "costAmount" ? "amount" : this.data.lastCostEdit;
      const quantity = Number(key === "quantity" ? value : this.data.quantity);
      if (quantity > 0 && mode === "price") {
        const costPrice = Number(key === "costPrice" ? value : this.data.costPrice);
        if (costPrice > 0) data.costAmount = trimCalc(costPrice * quantity, 2);
      }
      if (quantity > 0 && mode !== "price") {
        const amount = Number(key === "costAmount" ? value : this.data.costAmount);
        if (amount > 0) data.costPrice = trimCalc(amount / quantity, 4);
      }
    }
    this.setData(data);
  },
  onPlan(event) { this.setData({ plan: event.detail.value }); },
  onEnabled(event) { this.setData({ enabled: event.detail.value }); },
  onCustom(event) { this.setData({ custom: event.detail.value }); },
  optional(value) {
    return value === "" ? null : Number(value);
  },
  save() {
    if (this.data.saving) return;
    if (!(Number(this.data.quantity) > 0)) {
      wx.showModal({ title: "数量要大于 0", showCancel: false });
      return;
    }
    if (!(Number(this.data.costAmount) > 0) && !(Number(this.data.costPrice) > 0)) {
      wx.showModal({ title: "请填写投入金额或成本价", showCancel: false });
      return;
    }
    const page = this;
    const body = {
      code: this.data.code.trim(),
      name: this.data.name.trim(),
      quantity: Number(this.data.quantity),
      costAmount: this.data.costAmount === "" ? null : Number(this.data.costAmount),
      costPrice: this.data.costPrice === "" ? null : Number(this.data.costPrice),
      refHigh: this.data.refHigh,
      plan: this.data.plan,
      takeProfitPct: this.data.custom ? this.optional(this.data.takeProfitPct) : null,
      stopLossPct: this.data.custom ? this.optional(this.data.stopLossPct) : null,
      nearHighPct: this.data.custom ? this.optional(this.data.nearHighPct) : null,
      enabled: this.data.enabled
    };
    const request = this.id
      ? api.put("/api/positions/" + encodeURIComponent(this.id), body)
      : api.post("/api/positions", body);
    this.setData({ saving: true });
    request.then(function (result) {
      page.setData({ saving: false });
      const created = result.check && result.check.alerts ? result.check.alerts : [];
      const done = function () {
        wx.navigateBack({ fail: function () { wx.reLaunch({ url: "/pages/index/index" }); } });
      };
      if (created.length && !created[0].delivered) {
        wx.showModal({
          title: "已记下",
          content: "这只已经在提醒区，但还没配微信推送，先写进了记录。",
          showCancel: false,
          success: done
        });
        return;
      }
      done();
    }).catch(function (error) {
      page.setData({ saving: false });
      wx.showModal({ title: "没保存", content: error.message, showCancel: false });
    });
  },
  remove() {
    const page = this;
    wx.showModal({
      title: "删除这只股票",
      content: "已发出的记录还留着。",
      confirmColor: "#c23a2e",
      success(res) {
        if (!res.confirm) return;
        api.del("/api/positions/" + encodeURIComponent(page.id)).then(function () {
          wx.navigateBack({ fail: function () { wx.reLaunch({ url: "/pages/index/index" }); } });
        }).catch(function (error) {
          wx.showModal({ title: "没删掉", content: error.message, showCancel: false });
        });
      }
    });
  }
});
