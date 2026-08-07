#!/usr/bin/env node
// Claude Code Statusline — 一键安装脚本
// 用法: node install.js
// 自动完成:
//   1. 复制 statusline.js → ~/.claude/statusline.js
//   2. 用当前 node 完整路径拼出 command
//   3. 写入 ~/.claude/settings.json 的 statusLine 块(保留原有所有配置)
//   4. 幂等: 已配置且一致时跳过, 不会重复修改
// 跨平台: Windows / macOS / Linux

const fs = require("fs");
const os = require("os");
const path = require("path");

const CLI_HOME = path.join(os.homedir(), ".claude");
const SRC = path.join(__dirname, "statusline.js");
const DEST = path.join(CLI_HOME, "statusline.js");
const SETTINGS = path.join(CLI_HOME, "settings.json");

// 路径含空格时加双引号, 兼容各平台 shell
function fmtPath(p) {
  return /\s/.test(p) ? `"${p}"` : p;
}

function main() {
  console.log("=== Claude Code Statusline 一键安装 ===\n");

  // 1. 校验源脚本(应与本安装脚本同目录)
  if (!fs.existsSync(SRC)) {
    console.error("✗ 未找到 statusline.js, 请确保它与 install.js 在同一目录");
    process.exit(1);
  }

  // 2. 确保 ~/.claude 目录存在
  if (!fs.existsSync(CLI_HOME)) {
    fs.mkdirSync(CLI_HOME, { recursive: true });
    console.log(`· 创建目录: ${CLI_HOME}`);
  }

  // 3. 复制 statusline.js(内容一致时跳过)
  const srcContent = fs.readFileSync(SRC, "utf8");
  let installed = false;
  if (fs.existsSync(DEST) && fs.readFileSync(DEST, "utf8") === srcContent) {
    console.log("· statusline.js 已是最新, 跳过复制");
  } else {
    fs.copyFileSync(SRC, DEST);
    installed = true;
    console.log(`· 已安装 statusline.js → ${DEST}`);
  }

  // 4. 读取/初始化 settings.json
  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
    } catch (e) {
      const bak = `${SETTINGS}.bak-${Date.now()}`;
      fs.copyFileSync(SETTINGS, bak);
      console.warn(`! settings.json 不是合法 JSON, 已备份到: ${bak}`);
      settings = {};
    }
  } else {
    console.log("· 未找到 settings.json, 将新建");
  }

  // 5. 生成 command: <node 完整路径> <statusline.js 完整路径>
  const nodePath = process.execPath;
  const command = `${fmtPath(nodePath)} ${fmtPath(DEST)}`;

  // 6. 幂等写入 statusLine 块
  const existing = settings.statusLine;
  if (existing && existing.type === "command" && existing.command === command) {
    console.log("· statusLine 已配置且一致, 无需修改");
  } else {
    settings.statusLine = { type: "command", command };
    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
    console.log(`· 已写入 statusLine 配置:`);
    console.log(`    ${command}`);
  }

  console.log("\n✓ 安装完成!");
  console.log("  请重启 Claude Code, 输入框下方即可看到状态栏。");
  console.log("  若未生效, 请检查 " + SETTINGS + " 中 statusLine 配置。");
}

// 卸载: node install.js --uninstall
function uninstall() {
  console.log("=== Claude Code Statusline 卸载 ===\n");

  // 1. 从 settings.json 移除 statusLine 块(保留其余所有配置)
  let removed = false;
  if (fs.existsSync(SETTINGS)) {
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS, "utf8"));
      if (settings.statusLine) {
        delete settings.statusLine;
        fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
        console.log("· 已从 settings.json 移除 statusLine 配置");
        removed = true;
      }
    } catch (_) {}
  }

  // 2. 删除脚本与调试缓存文件
  let deleted = 0;
  for (const f of [DEST, path.join(CLI_HOME, "statusline-last-input.json")]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log("· 已删除 " + f);
      deleted++;
    }
  }

  if (!removed && deleted === 0) {
    console.log("· 未检测到已安装的 statusline, 可能已卸载");
  }

  console.log("\n✓ 卸载完成! 重启 Claude Code 后状态栏将消失。");
}

if (process.argv.includes("--uninstall") || process.argv.includes("-u")) {
  uninstall();
} else {
  main();
}
