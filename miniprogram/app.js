App({
  onLaunch() {
    if (!wx.getStorageSync("serverBase")) {
      wx.setStorageSync("serverBase", "http://127.0.0.1:8787");
    }
  }
});
