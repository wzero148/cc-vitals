// Claude Code statusline — 输入框下方实时状态栏
// 显示: 模型 · effort 等级 · 上下文用量(进度条) · 会话累计 token · 缓存命中率 · 会话名称
// 纯本地脚本,零 API token 开销
const fs = require("fs");
const os = require("os");
const path = require("path");

// ANSI 颜色
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

// effort 扫描缓存:文件未变化时不重复扫描
let effortCache = { key: "", value: "" };

// ---- transcript 扫描 ----
function scanTranscript(tp) {
  try {
    const lines = fs.readFileSync(tp, "utf8").split("\n");
    // 优先: UpdateSettings 工具调用中的 effort 记录(/effort 命令写入)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.includes("UpdateSettings")) continue;
      const m = line.match(/"effortLevel"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
      const m2 = line.match(/"effort"\s*:\s*"([^"]+)"/);
      if (m2) return m2[1];
    }
    // 兜底: 任意行中的 effortLevel
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/"effortLevel"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }
  } catch (_) {}
  return "";
}

// effort 等级显示: 如实显示实际等级 (low/medium/high/xhigh/max)
function getEffort(json) {
  // 1. 新版 statusline 输入: json.effort = {level:"xhigh"} 或 "xhigh"
  if (json.effort) {
    if (typeof json.effort === "object" && json.effort.level) return String(json.effort.level);
    if (typeof json.effort === "string") return json.effort;
  }
  if (json.effortLevel) return String(json.effortLevel);
  if (json.model) {
    if (json.model.effort) return String(json.model.effort);
    if (json.model.effortLevel) return String(json.model.effortLevel);
  }
  // 2. transcript 倒序扫描(带缓存)
  const tp = json.transcript_path;
  if (tp && fs.existsSync(tp)) {
    try {
      const st = fs.statSync(tp);
      const key = tp + ":" + st.size + ":" + st.mtimeMs;
      if (effortCache.key !== key) {
        effortCache = { key, value: scanTranscript(tp) };
      }
      return effortCache.value;
    } catch (_) {}
  }
  // 3. fallback: 用户 settings.json
  try {
    const s = JSON.parse(
      fs.readFileSync(path.join(os.homedir(), ".claude", "settings.json"), "utf8")
    );
    if (s.effortLevel) return String(s.effortLevel);
  } catch (_) {}
  return "";
}

function getSessionName(json) {
  // 1. 新版 statusline 若直接提供
  if (json.session_name) return String(json.session_name);
  if (json.session && json.session.name) return String(json.session.name);
  // 2. transcript 首行 session 条目中的 name 字段
  const tp = json.transcript_path;
  if (tp && fs.existsSync(tp)) {
    try {
      const first = fs.readFileSync(tp, "utf8").split("\n")[0];
      const obj = JSON.parse(first);
      if (obj && obj.name && String(obj.name).trim()) return String(obj.name).trim();
    } catch (_) {}
  }
  // 3. fallback: 工作目录名
  if (json.cwd) return path.basename(json.cwd);
  return "";
}

// 上下文用量: 直接采用 Claude Code 报告的窗口大小
function getContext(json) {
  const cw = json.context_window || json.context || {};
  // 已用 tokens = 本次窗口 input + cache_read + cache_creation
  const cu = cw.current_usage || {};
  let used = null;
  if (
    typeof cu.input_tokens === "number" ||
    typeof cu.cache_read_input_tokens === "number" ||
    typeof cu.cache_creation_input_tokens === "number"
  ) {
    used =
      (cu.input_tokens || 0) +
      (cu.cache_read_input_tokens || 0) +
      (cu.cache_creation_input_tokens || 0);
  }
  const total = typeof cw.context_window_size === "number" ? cw.context_window_size : null;
  // 用窗口总量重算占用百分比;拿不到时退回 Claude Code 给的百分比
  let percent = null;
  if (used != null && total) {
    percent = Math.round((used / total) * 100);
  } else if (typeof cw.used_percentage === "number") {
    percent = cw.used_percentage;
  }
  return { percent, used, total };
}

function bar(percent) {
  const n = 10;
  const filled = Math.max(0, Math.min(n, Math.round((percent / 100) * n)));
  return "█".repeat(filled) + "░".repeat(n - filled);
}

function fmt(n) {
  if (typeof n !== "number" || !isFinite(n)) return null;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

function buildLine(json) {
  const useColor = json.output_style
    ? json.output_style.colors !== "false"
    : true;

  const c = (code, s) => (useColor ? code + s + C.reset : s);
  const sep = c(C.gray, " · ");

  const parts = [];

  // 模型(剥离 [1M]/[200K] 等窗口后缀, 仅用于显示)
  let model = "";
  if (json.model) model = json.model.display_name || json.model.id || "";
  if (!model && json.model_name) model = json.model_name;
  if (model) {
    model = String(model).replace(/\[\d+[mMkK]\]/g, "").trim();
    parts.push(c(C.bold + C.cyan, model));
  }

  // effort 等级(实际值)
  const effort = getEffort(json);
  if (effort) parts.push(c(C.dim, "effort:" + effort));

  // 上下文用量: 百分比 + 进度条 + 已用/窗口总量(来自 Claude Code)
  const ctx = getContext(json);
  if (ctx.percent != null) {
    const p = Math.round(ctx.percent);
    const col = p > 80 ? C.red : p > 60 ? C.yellow : C.green;
    let txt = p + "%";
    if (useColor) txt += " " + bar(p);
    if (ctx.used != null && ctx.total) {
      txt += " (" + fmt(ctx.used) + "/" + fmt(ctx.total) + ")";
    }
    parts.push(c(col, "ctx " + txt));
  }

  // 会话累计 token(真实值,来自 context_window)
  const cw = json.context_window || json.context || {};
  let tokTxt = "";
  {
    const ti = cw.total_input_tokens;
    const to = cw.total_output_tokens;
    const s = [];
    if (typeof ti === "number" && ti > 0) s.push("⇣" + fmt(ti));
    if (typeof to === "number" && to > 0) s.push("⇡" + fmt(to));
    if (s.length) tokTxt = "tok " + s.join(" ");
  }
  if (tokTxt) parts.push(c(C.blue, tokTxt));

  // 缓存命中率: cache_read / (input + cache_read + cache_creation)
  const cUsage = cw.current_usage || {};
  const cRead = cUsage.cache_read_input_tokens || 0;
  const cCreate = cUsage.cache_creation_input_tokens || 0;
  const cInput = cUsage.input_tokens || 0;
  const cTotal = cRead + cCreate + cInput;
  if (cTotal > 0) {
    const rate = (cRead / cTotal) * 100;
    const col = rate > 90 ? C.green : rate > 50 ? C.yellow : C.red;
    parts.push(c(col, "cache " + rate.toFixed(1) + "%"));
  }

  // 会话名称
  const name = getSessionName(json);
  if (name) parts.push(c(C.gray, "📄 " + name));

  return parts.join(sep);
}

// ---- 入口 ----
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  try {
    let json = {};
    try {
      json = JSON.parse(raw);
    } catch (_) {}
    // 调试用: 缓存最后一次输入,字段有疑问时查看此文件
    try {
      fs.writeFileSync(
        path.join(os.homedir(), ".claude", "statusline-last-input.json"),
        raw
      );
    } catch (_) {}
    const line = buildLine(json);
    process.stdout.write(line.replace(/\r?\n/g, "")); // 必须单行
  } catch (_) {
    process.stdout.write("statusline error");
  }
});
