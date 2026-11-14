function request(method, path, data) {
  const base = String(wx.getStorageSync("serverBase") || "http://127.0.0.1:8787").replace(/\/$/, "");
  const token = wx.getStorageSync("apiToken") || "";
  return new Promise(function (resolve, reject) {
    const options = {
      url: base + path,
      method: method,
      timeout: 15000,
      header: {
        "content-type": "application/json",
        "x-token": token
      },
      success(res) {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(body.error || "请求失败 " + res.statusCode));
      },
      fail() {
        reject(new Error("连不上提醒服务。请先在电脑上打开 start.bat，并检查服务器地址。"));
      }
    };
    if (method !== "GET" && method !== "DELETE") options.data = data || {};
    wx.request(options);
  });
}

module.exports = {
  get(path) { return request("GET", path); },
  post(path, data) { return request("POST", path, data); },
  put(path, data) { return request("PUT", path, data); },
  del(path) { return request("DELETE", path); }
};
