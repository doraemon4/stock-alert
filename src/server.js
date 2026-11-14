import os from "node:os";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bad } from "./errors.js";
import { normalizePosition, normalizeSettings } from "./model.js";
import { refreshQuotes, runCycle, sendTest, view } from "./monitor.js";
import { lookupSymbol, searchStocks } from "./quotes.js";
import { load, save } from "./store.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const indexFile = path.join(root, "public", "index.html");
const port = Number(process.env.PORT) || 8787;

let chain = Promise.resolve();

function withDb(fn) {
  const run = chain.then(() => fn(load()));
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type, x-token",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "cache-control": "no-store"
  };
  if (status === 204) {
    res.writeHead(204, headers);
    res.end();
    return;
  }
  headers["content-type"] = type;
  const payload = Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, headers);
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(bad(413, "请求太大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(bad(400, "请求不是合法的 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function authorized(req, db) {
  const token = db.settings.apiToken || "";
  if (!token) return true;
  return req.headers["x-token"] === token;
}

async function fillName(position) {
  if (position.name) return;
  try {
    const info = await lookupSymbol(position.code);
    position.name = info.name || position.code;
  } catch {
    position.name = position.code;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");
    const url = new URL(req.url || "/", "http://127.0.0.1");

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const html = fs.readFileSync(indexFile);
      return send(res, 200, html, "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return send(res, 200, { ok: true });
    }
    if (!url.pathname.startsWith("/api/")) return send(res, 404, { error: "没有这个页面" });

    const payload = await withDb(async (db) => {
      if (!authorized(req, db)) throw bad(401, "访问口令不对");
      if (req.method === "GET" && url.pathname === "/api/bootstrap") {
        try {
          await refreshQuotes(db);
          db.meta.lastError = "";
        } catch (error) {
          db.meta.lastError = error.message || "行情获取失败";
        }
        save(db);
        return view(db);
      }
      if (req.method === "GET" && url.pathname === "/api/search") {
        const q = (url.searchParams.get("q") || "").trim();
        if (q.length > 20) throw bad(400, "搜索词太长");
        return searchStocks(q);
      }
      if (req.method === "GET" && url.pathname === "/api/lookup") {
        return lookupSymbol(url.searchParams.get("code") || "");
      }
      if (req.method === "POST" && url.pathname === "/api/positions") {
        if (db.positions.length >= 100) throw bad(400, "最多记录 100 只股票");
        const body = await readBody(req);
        const position = normalizePosition(body);
        await fillName(position);
        db.positions.push(position);
        save(db);
        const check = await runCycle(db, { focusIds: [position.id] });
        return { position: view(db).positions.find((item) => item.id === position.id), check };
      }
      const positionMatch = url.pathname.match(/^\/api\/positions\/([^/]+)$/);
      const positionId = positionMatch ? decodeURIComponent(positionMatch[1]) : "";
      if (positionMatch && req.method === "PUT") {
        const body = await readBody(req);
        const index = db.positions.findIndex((item) => item.id === positionId);
        if (index < 0) throw bad(404, "没有这只股票");
        const position = normalizePosition(body, db.positions[index]);
        await fillName(position);
        db.positions[index] = position;
        save(db);
        const check = await runCycle(db, { focusIds: [position.id] });
        return { position: view(db).positions.find((item) => item.id === position.id), check };
      }
      if (positionMatch && req.method === "DELETE") {
        const before = db.positions.length;
        db.positions = db.positions.filter((item) => item.id !== positionId);
        if (db.positions.length === before) throw bad(404, "没有这只股票");
        save(db);
        return { ok: true };
      }
      if (req.method === "PUT" && url.pathname === "/api/settings") {
        const body = await readBody(req);
        db.settings = normalizeSettings(body, db.settings);
        save(db);
        const check = await runCycle(db, { force: false });
        return { settings: db.settings, check };
      }
      if (req.method === "POST" && url.pathname === "/api/check") {
        const now = Date.now();
        if (now - (db.meta.lastManualAt || 0) < 10_000) throw bad(429, "刚检查过，等几秒再试");
        db.meta.lastManualAt = now;
        return runCycle(db, { force: true });
      }
      if (req.method === "POST" && url.pathname === "/api/notify/test") {
        const delivery = await sendTest(db);
        if (!delivery.delivered) throw bad(400, delivery.error || "推送失败");
        return { ok: true, channel: delivery.channel };
      }
      throw bad(404, "没有这个接口");
    });
    send(res, 200, payload);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    send(res, status, { error: error.status ? error.message : "服务内部出错" });
  }
});

async function tick() {
  try {
    await withDb((db) => runCycle(db, { force: false }));
  } catch (error) {
    console.error(new Date().toISOString(), "检查失败", error);
  }
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${port} 已被占用。关掉另一个提醒服务，或换端口后重启（环境变量 PORT）。`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, "0.0.0.0", () => {
  const urls = lanUrls(port);
  console.log("止盈提醒已启动");
  console.log(`本机打开  http://127.0.0.1:${port}`);
  for (const item of urls) console.log(`同一 Wi-Fi 打开  ${item}`);
  console.log("小程序里的服务器地址填上面的地址");
  setTimeout(tick, 5000);
  setInterval(tick, 60_000);
});

function lanUrls(listenPort) {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      const v4 = item.family === "IPv4" || item.family === 4;
      if (v4 && !item.internal) urls.push(`http://${item.address}:${listenPort}`);
    }
  }
  return urls;
}
