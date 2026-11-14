export async function pushMessage(settings, title, content) {
  const jobs = [];
  if (settings.pushplusToken) jobs.push(sendPushPlus(settings.pushplusToken, title, content));
  if (settings.serverchanKey) jobs.push(sendServerChan(settings.serverchanKey, title, content));
  if (!jobs.length) return { delivered: false, channel: "none", error: "还没配置微信推送" };

  const results = await Promise.all(jobs);
  const ok = results.filter((item) => item.ok);
  if (ok.length) {
    return { delivered: true, channel: ok.map((item) => item.channel).join("+"), error: "" };
  }
  return {
    delivered: false,
    channel: results.map((item) => item.channel).join("+"),
    error: results.map((item) => item.error).filter(Boolean).join("；") || "推送失败"
  };
}

export async function pushAlerts(settings, pending) {
  const title = pending.length === 1 ? pending[0].title : `${pending.length} 条持仓提醒`;
  const content = pending.map((item) => item.body).join("\n\n");
  return pushMessage(settings, title, content);
}

async function sendPushPlus(token, title, content) {
  try {
    const res = await fetch("https://www.pushplus.plus/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, title, content, template: "txt" }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.code === 200 || data.code === 0)) return { ok: true, channel: "pushplus", error: "" };
    return { ok: false, channel: "pushplus", error: data.msg || "PushPlus 推送失败" };
  } catch {
    return { ok: false, channel: "pushplus", error: "PushPlus 连不上" };
  }
}

async function sendServerChan(key, title, content) {
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${encodeURIComponent(key)}.send`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ title: title.slice(0, 32), desp: content }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.code === 0 || data.code === 200)) return { ok: true, channel: "serverchan", error: "" };
    return { ok: false, channel: "serverchan", error: data.message || data.msg || "Server酱推送失败" };
  } catch {
    return { ok: false, channel: "serverchan", error: "Server酱连不上" };
  }
}
