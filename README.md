# Claude Code Statusline

在 Claude Code 输入框下方**实时显示**当前会话关键数据的状态栏脚本：

```
claude-opus-4-1 · effort:xhigh · ctx 42% ████░░░░░░ (420.0k/1.0M) · tok ⇣420.0k ⇡1.2k · cache 90.5% · 📄 my-project
```

**适用于所有 Claude Code 用户**，与模型供应商无关，**无需任何额外配置**。

## ✨ 特性

| 数据项 | 说明 |
|---|---|
| **模型** | 当前会话使用的模型名，加粗青色 |
| **effort 等级** | 如实显示 `low / medium / high / xhigh / max` |
| **上下文用量** | 百分比 + 进度条 + 已用/总量，>60% 变黄、>80% 变红 |
| **token 消耗** | 会话累计输入 `⇣` / 输出 `⇡`（真实值） |
| **缓存命中率** | `cache_read / 总输入`，>90% 绿、50~90% 黄、<50% 红 |
| **会话名** | 当前会话名称 |

- ✅ **零 token 消耗**：纯本地脚本，不调用任何模型 API，不产生任何费用
- ✅ 毫秒级渲染：只做本地文件 IO + 字符串拼接
- ✅ 主题自适应：随 `output_style.colors` 自动开启/关闭颜色与进度条
- ✅ 不依赖任何第三方 npm 包，仅需 Node.js

## 🧠 工作原理

Claude Code 的原生 `statusLine` 机制：每次刷新输入框时，Claude Code 把一段状态 JSON 通过 **stdin** 喂给 `statusline.js`，脚本处理后输出**一行文本**显示在输入框下方。

脚本直接采用 Claude Code 在状态数据里报告的 `context_window_size` 作为上下文总量，不向任何模型 API 发请求。整个过程**没有网络请求、不经过任何 LLM**，所以 token 消耗为零。

## 🚀 一键安装（作者未尝试，谨慎使用）

下载或克隆本仓库后，在仓库目录内运行：

```bash
node install.js
```

脚本会自动完成全部配置：

1. 复制 `statusline.js` 到 `~/.claude/`
2. 自动识别当前 `node` 的完整路径，生成 `statusLine` 命令并写入 `~/.claude/settings.json`
3. **完整保留你已有的所有配置**（API Key、模型、effort 等）

随后重启 Claude Code 即可生效。脚本是**幂等**的，重复运行不会重复修改。

## 📦 手动安装

### 1. 放置脚本

把 `statusline.js` 复制到 Claude Code 的配置目录（`~/.claude/`，全项目通用），或放到某个项目目录内（仅该项目生效，需相应修改 command 路径）。

### 2. 配置 `settings.json`

编辑 `~/.claude/settings.json`，加入 `statusLine` 块（参考 [settings.example.json](./settings.example.json)）：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node <statusline.js 的绝对路径>"
  }
}
```

将 `<statusline.js 的绝对路径>` 替换为脚本实际位置。若 `node` 不在 PATH 中，请写 node 的完整路径：

```bash
which node   # macOS / Linux 查看 node 路径
where node   # Windows (cmd / PowerShell)
```

### 3. 重启 Claude Code

修改 `settings.json` 后需重启会话生效。

## 🧹 卸载

### 一键卸载（推荐）

在仓库目录运行：

```bash
node install.js --uninstall
```

自动移除 `statusLine` 配置（**保留其余所有配置**）、删除脚本与缓存文件，重启后状态栏消失。

### 手动卸载

1. **删除配置**：编辑 `~/.claude/settings.json`，删除整个 `statusLine` 块（保留其余配置）：

   ```json
   {
     "statusLine": {
       "type": "command",
       "command": "node <statusline.js 的绝对路径>"
     }
   }
   ```

   即删掉上面 `"statusLine": { ... },` 这几行即可，其余字段（env、model 等）不要动。

2. **删除文件**：删除脚本与调试缓存：

   ```bash
   rm ~/.claude/statusline.js ~/.claude/statusline-last-input.json  # macOS / Linux
   del "%USERPROFILE%\.claude\statusline.js"                          # Windows (cmd)
   ```

3. **重启** Claude Code，输入框下方的状态栏即消失。

## 🔍 显示字段详解

- **ctx 42% ████░░░░░░ (420.0k/1.0M)**：上下文占用 42%，进度条 10 格，已用 420k / 总量 1M。总量来自 Claude Code 报告的 `context_window_size`。
- **tok ⇣420.0k ⇡1.2k**：会话累计输入 / 输出 token，来自 `context_window.total_input_tokens / total_output_tokens`。
- **cache 90.5%**：缓存命中率 = `cache_read_input_tokens ÷ (input + cache_read + cache_creation)`，来自 `context_window.current_usage`。

## ❓ 常见问题

**Q: 会消耗 token 吗？**
不会。脚本只读本地文件和 stdin，不调用 API。

**Q: 为什么我的上下文总量是 200K 而不是 1M？**
Claude Code 按模型 ID 上的 `[1M]` / `[200K]` 后缀管理上下文窗口，无后缀的模型默认 200K。若你的模型实际支持更大窗口，在模型 ID 上加上对应后缀即可（例如 `your-model[1M]`，Claude Code 会剥离后缀、只把裸 ID 发给 API）。

**Q: 运行时生成了 `statusline-last-input.json` 文件？**
是调试缓存，自动重建，已加入 `.gitignore`，无需理会。

## 📁 目录结构

```
.
├── install.js               # 一键安装脚本(推荐方式)
├── statusline.js            # 主脚本(唯一必需)
├── settings.example.json    # Claude Code 配置示例(不含真实 Key)
├── .gitignore
├── LICENSE
└── README.md
```

## 📄 License

[MIT](./LICENSE)
