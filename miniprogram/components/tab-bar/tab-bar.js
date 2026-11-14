Component({
  properties: {
    active: { type: String, value: "home" },
    fresh: { type: Boolean, value: false }
  },
  methods: {
    go(event) {
      const key = event.currentTarget.dataset.key;
      if (key === this.properties.active) return;
      const url = {
        home: "/pages/index/index",
        alerts: "/pages/alerts/alerts",
        settings: "/pages/settings/settings"
      }[key];
      wx.reLaunch({ url });
    }
  }
});
