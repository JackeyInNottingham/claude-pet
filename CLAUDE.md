# CLAUDE.md

本文件为 Claude Code（claude.ai/code）在此仓库中工作时提供指导。

## 项目概述

Claude Pet 是一个 Claude Code 插件，在透明、置顶的 Electron 窗口中运行桌面宠物——Claude Code 终端吉祥物 Clawd 的像素艺术渲染。它实时反映 Claude Code 的活动状态（读取、写入、执行等），并在 Claude 需要用户授权时弹出权限对话框。

## 安装脚本

提供跨平台一键安装脚本，从 GitHub 拉取源代码并完成配置：

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash

# 国内网络（使用 Electron 镜像）
curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | USE_CN_MIRROR=1 bash
```

```powershell
# Windows (PowerShell)
iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex

# 国内网络
$UseCnMirror=$true; iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex
```

安装脚本执行以下步骤：

1. 检查前置依赖（Node.js 18+、npm、git）
2. Clone 仓库到 `~/.claude/skills/claude-pet`（skills-dir 插件自动加载，无需手动注册）
3. 安装 Electron 依赖（`cd electron && npm install`）
4. 运行 `claude plugin validate` 验证插件结构
5. 询问是否启用会话自动启动

脚本幂等：重复运行会 `git pull` 更新到最新版本。

手动安装：

```bash
git clone https://github.com/JackeyInNottingham/claude-pet.git ~/.claude/skills/claude-pet
cd ~/.claude/skills/claude-pet/electron
npm install
# 插件自动加载为 claude-pet@skills-dir，重启 Claude Code 生效
```

手动更新：

```bash
cd ~/.claude/skills/claude-pet && git pull && cd electron && npm install
```

## 开发命令

```bash
# 启动桌宠（正式环境：透明 256×256 置顶窗口）
cd electron && npm install && npm start

# 启动动画 + 权限 Demo（独立窗口 520×780，非透明）
cd electron && npm run demo

# 国内下载 Electron 时先设置镜像：
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

本仓库未配置测试套件或代码检查工具。

### Demo 说明

Demo 使用独立的入口文件 `demo-main.js`（非 `main.js`），在 520×780 非透明窗口中运行，包含 Canvas 动画区和下方独立的权限控制面板。Demo 中权限弹窗位于 canvas **下方独立面板**（避免与 canvas 层级冲突），与正式环境的叠加弹窗不同。

| Demo 操作 | 说明 |
| --------- | ---- |
| 自动随机切换 | 循环 7 种工具状态，展示过渡动画 |
| 1–4 样例按钮 / 数字键 | 4 种权限场景（短命令、长命令、多 Always allow、Edit） |
| P | 循环切换权限样例 |
| Space | 立即随机切换工具状态 |

Demo 专有文件：`demo-main.js`、`demo.html`、`demo.css`、`demo.js`。

## 架构

### 插件层（Claude Code Hooks）

Hook 定义在 [hooks/hooks.json](hooks/hooks.json) 和 [.claude-plugin/plugin.json](.claude-plugin/plugin.json)。所有 Hook 委托给 **[hooks/notify-pet.js](hooks/notify-pet.js)**——一个纯 Node.js 脚本，仅使用 `http`、`fs`、`path`、`os`、`crypto` 内置模块，**无需 bash 或 curl**，跨平台一致运行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/notify-pet.js" <action> "${CLAUDE_PLUGIN_ROOT}"
```

Hook 脚本共同依赖共享工具模块 **[hooks/pet-utils.js](hooks/pet-utils.js)**（纯 Node.js 内置模块），提供 `getPort`、`healthCheck`、`isPidAlive`、`tryAcquireLock`、`releaseLock`、`httpGet`/`httpPost`/`postJSON` 等函数，被 `notify-pet.js`、`session-start.js`、`pet-control.js` 统一引用，避免代码重复。

Windows 额外提供 `.cmd` 启动器作为备选。

| Hook 事件                                       | 行为                                                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PreToolUse`                                  | 工具名 → reading/searching/writing/executing                                                                                                                   |
| `PostToolUse`                                 | 转入 `thinking`（3 秒后自动回到 idle）                                                                                                                        |
| `PostToolUseFailure`                          | 转入 `error`（3 秒后自动清除）                                                                                                                                |
| `Stop`                                        | 回到 `idle`                                                                                                                                                   |
| `Notification`（匹配: `permission_prompt`） | 触发 `permission` 动画（非阻塞）                                                                                                                              |
| `PermissionRequest`                           | **阻塞式** — 发送完整 payload 到 Electron，轮询 `~/.claude-pet/permission-response` 等待用户决定，通过 stdout `hookSpecificOutput.decision` 返回结果 |

`SessionStart` Hook（[hooks/session-start](hooks/session-start)）自动启动 Electron 进程，除非存在 `~/.claude-pet/auto-start-disabled` 文件或宠物已在运行。

### Electron 应用（`electron/`）

**`main.js`** — 入口。创建 256×256 透明无边框置顶窗口，在随机端口启动 HTTP 服务（端口写入 `~/.claude-pet/port`），设置系统托盘菜单，处理窗口位置持久化（`~/.claude-pet/position.json`）。IPC 通道 `permission-response` 将用户决定写入 Hook 脚本轮询的响应文件。

**`preload.js`** — 上下文桥接。暴露 `window.electronAPI`，提供 `onStateChange`、`onPermissionRequest` 和 `sendPermissionResponse`。

**`renderer.js`** — 以 10 FPS 启动 Canvas 动画循环。将状态机的 `applyRemoteState` 连接到 IPC `state-change` 事件，将 `PermissionDialog.show` 连接到 `permission-request` 事件。

**`state-machine.js`** — 包含 10 个状态的有限状态机（`idle`、`reading`、`searching`、`thinking`、`writing`、`executing`、`error`、`permission`、`permission_allow`、`permission_deny`）。关键行为：

- `isPermissionLocked()` — 权限流程期间，忽略收到的 `/status` 更新（`idle` 除外）
- `enterThinking()` → 3 秒后自动转入 `idle`
- `toolFailed()` → 3 秒后自动转入 `idle`
- `permissionResolved()` → 显示 allow/deny 反馈 350ms，然后回到 thinking 或 idle

**`sprites.js`** — 使用终端 `An()` 组件规范渲染 Clawd 吉祥物：每个方块字符 2×4 字符单元，调色板映射像素网格（32×32 逻辑像素，8 倍缩放至 256）。**`PetAnimator`** 处理 6 帧状态过渡：第 0–2 帧显示旧状态上升，第 3 帧切换到新状态，第 4–5 帧回落到原位。每个状态的道具（眼镜、放大镜、齿轮、问号、感叹号、键盘、对勾、错误效果）以像素叠加方式绘制。`arms-up` SCF 姿态已被禁用（不对称、终端外效果差）。

**`permission-format.js`** — 解析 Claude Code `PermissionRequest` JSON 结构。提取标题、详情文本（按工具类型：Bash→command，Read/Write/Edit→file_path），构建选项按钮（Yes / Always allow 建议项 / No）。

**`permission-dialog.js`** — 权限弹窗的 DOM 控制器。通过 CSS 动画类（`is-open`、`waiting`、`hiding`、`hidden`）控制显示/隐藏。用户点击后通过回调返回 `decision` 对象。

**`speech-bubble.js`** — 在宠物上方显示工具状态标签文本（如"Reading…"、"Writing code…"），持续 3 秒。

**参考艺术文件** — `electron/` 下有多个 `.txt` 文件（`an-component.txt`、`extracted-art.txt`、`welcome-pixel-art.txt`、`welcome-back-art.txt`、`welcome-back-large.txt`），包含从 Claude Code 终端提取的 Clawd `An()` 组件原始定义和渲染参考。这些文件不在运行时使用，但理解 `sprites.js` 的像素渲染逻辑时需要参考。

### 通信流程

```
Claude Code Hook → notify-pet.js（纯 Node.js） → POST /status（或 /permission） → Electron HTTP 服务
  → IPC 到渲染进程 → 状态机 → Canvas 动画

PermissionRequest（阻塞式）：
  Claude Code → Hook → notify-pet.js → POST /permission → Electron → 用户点击
  → IPC 回传 → 写入 permission-response 文件 → Hook 轮询并读取 → stdout → Claude Code
```

端点：

| 端点 | 方法 | 用途 |
| ---- | ---- | ---- |
| `/status` | POST | 更新状态 `{ state, detail }` |
| `/permission` | POST | 触发权限弹窗（PermissionRequest 完整 payload） |
| `/shutdown` | POST | 优雅关闭 Electron 应用 |
| `/health` | GET | 健康检查 |

端口随机分配，存储在 `~/.claude-pet/port`（第一行端口号，第二行 PID）。

### 系统托盘

`main.js` 创建系统托盘图标，右键菜单提供 **Start Pet** / **Stop Pet** / **Quit Claude Pet**。托盘图标为 16×16 的程序化 PNG（内联 base64）。

### 窗口拖拽与位置持久化

用户拖拽宠物窗口时，renderer 通过 `window-dragged` IPC 通知主进程，自动保存新位置到 `~/.claude-pet/position.json`。

### config.json

主进程启动时加载 `~/.claude-pet/config.json`，在窗口加载完成后通过 IPC `config` 事件发送给渲染进程。当前支持的配置项：

```json
{
  "permissionTimeoutMs": 30000,
  "timeoutBehavior": "allow"
}
```

| 配置项 | 默认值 | 说明 |
| ------ | ------ | ---- |
| `permissionTimeoutMs` | `30000` | 权限弹窗 **UI 侧**自动关闭超时（毫秒），由 `permission-dialog.js` 消费 |
| `timeoutBehavior` | `"allow"` | 超时行为：`"allow"` / `"deny"` / `"ignore"`（关闭弹窗不回复） |

> **注意区分两套超时：** 上表是 UI 弹窗的自动关闭超时。Hook 侧（`notify-pet.js`）另有一个硬编码的 **600 秒**轮询超时（`deadline`），超过此时间未收到用户决定则返回 `deny`。两者独立工作——弹窗可能先关闭，但 Hook 侧继续等待；反之 Hook 侧到 600 秒上限也会强制返回。

### 权限弹窗队列

`PermissionDialog` 内部维护请求队列。若权限弹窗正在显示时收到新的权限请求，新请求会进入队列等待当前弹窗关闭后再展示。弹窗关闭后自动处理队列中的下一个请求。`permission-dialog.js` 通过 `respond()` 处理用户点击，`_showNext()` 驱动队列消费。

### Hook 定义重复

Hook 定义在 **两个文件** 中重复出现：[hooks/hooks.json](hooks/hooks.json) 和 [.claude-plugin/plugin.json](.claude-plugin/plugin.json)。修改 Hook 时必须**同步更新两处**，否则会出现不一致。

### 版本管理

**[VERSION](VERSION) 是唯一的权威版本号来源。** 它只是一个纯文本文件，包含一行版本号（如 `0.1.1`）。所有构建脚本和 CI 流水线都从这里读取。

**同步关系：**

- `VERSION` → 运行 `node scripts/sync-version.js` 同步到 `plugin.json` 和 `package.json`
- `npm start` / `npm run demo` 自动在启动前执行同步
- `package-release.sh` 构建时自动同步
- `update-checker.js` 优先读 `VERSION`，依次 fallback 到 `plugin.json`、`package.json`

**版本号规则（手动判断）：**

```
MAJOR.MINOR.PATCH
  │     │     │
  │     │     └─ PATCH: bug 修复，每次 +1，MINOR 和 MAJOR 不变
  │     │        例: 0.1.1 → 0.1.2
  │     │
  │     └─ MINOR: 新功能，每次 +1，PATCH 归零
  │        例: 0.1.2 → 0.2.0
  │
  └─ MAJOR: 稳定版发布，架构大改，每次 +1，MINOR 和 PATCH 归零
      例: 0.2.0 → 1.0.0
```

**发布流程：**

```bash
# 1. 判断本次改动的类型，更新 VERSION
echo "0.1.2" > VERSION

# 2. 提交版本号变更
git add VERSION && git commit -m "chore: bump version to 0.1.2"

# 3. 打 tag（注意加 v 前缀）
git tag v0.1.2

# 4. 推送
git push && git push --tags
# CI 自动构建 4 个平台的预打包 Release
```

> **判断原则：** Claude 在每次改动后自动判断是否需要 bump 版本以及 bump 哪一位。纯 bug 修复 bump PATCH，新增功能/文件 bump MINOR，稳定版发布 bump MAJOR。不确定时可以在提交信息中说明理由。

### 版本自动更新检查

[electron/update-checker.js](electron/update-checker.js)（主进程，纯 Node.js 内置模块）在窗口加载 60 秒后首次检查，之后每 30 分钟轮询一次，由 `shouldCheck()` 根据 `~/.claude-pet/version.json` 中的 `lastCheck` 时间戳强制 24 小时间隔。

| 组件 | 文件 | 作用 |
| ---- | ---- | ---- |
| 版本检查器 | `update-checker.js` | `shouldCheck()` / `checkForUpdates()` / `runUpdate()` |
| 更新提示 UI | `update-dialog.js` | 蓝色主题弹窗（底部），含 Update / Skip 按钮 |
| 版本状态 | `~/.claude-pet/version.json` | `{ lastCheck, skippedVersion }` |

**通信流程：**

```text
主进程定时器 → checkForUpdates()
  → GET https://api.github.com/repos/JackeyInNottingham/claude-pet/releases/latest
  → 比较 semver → webContents.send('update-available')
    ↓
渲染进程 → UpdateDialog.show() → 用户点击
  → Update → ipcRenderer.send('update-action', {action:'update'})
    → 主进程 runUpdate() → git pull + npm install → reply('update-result')
  → Skip  → ipcRenderer.send('update-action', {action:'skip', version})
    → 主进程记录 skippedVersion，避免重复提示同一版本
```

- 仅在本地版本 < GitHub release tag 且未被跳过时提示
- 版本比较使用纯 JS 实现（按 `.` 分割逐段对比），不引入 semver 包
- GitHub API 请求设置 `User-Agent: claude-pet-update-checker/1.0`，超时 10 秒
- `runUpdate()` 执行 `git pull --ff-only origin main` + `npm install`，超时 2 分钟

### 插件命令实现细节

`/pet` 定义在 [commands/pet.md](commands/pet.md)，委托给 [commands/pet-control.js](commands/pet-control.js) 执行（`.sh` / `.cmd` 为平台启动器）：

| 操作 | 实现 |
| ---- | ---- |
| `start` | 检查 `port` 文件健康状态，若过期则清理；按需 `npm install`；直接调用 `electron.exe`（Windows）或 `.bin/electron`（Unix）启动（**自动过滤 `ELECTRON_RUN_AS_NODE`**） |
| `stop` | 向 `/shutdown` 发送 POST 请求优雅关闭，清理 `port` 和 `permission-response` 文件 |
| `toggle` | 创建/删除 `~/.claude-pet/auto-start-disabled` 文件 |
| `status` | 通过 `/health` 端点检查 Electron 进程是否存活 |

### 跨平台设计（Node.js 纯内置模块）

**⚠️ 关键约束：所有 Hook 脚本和命令处理脚本必须仅使用 Node.js 内置模块**（`http`、`fs`、`path`、`os`、`crypto`、`child_process`）。不得引入 npm 包——这是跨平台零依赖运行的基础。修改 `notify-pet.js`、`session-start.js`、`pet-control.js` 时必须遵守此约束。

当前实现：

| 脚本 | 替代 | 平台 |
| ---- | ---- | ---- |
| [hooks/notify-pet.js](hooks/notify-pet.js) | notify-pet.sh | 主入口，`node .../notify-pet.js <action>` |
| [hooks/notify-pet.cmd](hooks/notify-pet.cmd) | — | Windows `.cmd` 启动器（2 行，转发到 .js） |
| [hooks/pet-utils.js](hooks/pet-utils.js) | — | **共享工具模块**（lock/health/http），被所有 Hook 脚本引用 |
| [hooks/session-start.js](hooks/session-start.js) | session-start (bash) | 自动启动逻辑 |
| [commands/pet-control.js](commands/pet-control.js) | pet-control.sh | `/pet` 命令实现 |
| [commands/pet-control.sh](commands/pet-control.sh) | — | Unix 启动器（2 行，转发到 .js） |
| [commands/pet-control.cmd](commands/pet-control.cmd) | — | Windows 启动器（2 行，转发到 .js） |

原有的 `.sh` 脚本保留作为 Unix 备选，`run-hook.cmd` 和 `platform-shell.sh` 保留作为向后兼容的 Windows bash 桥接器（不再需要，但保留以避免破坏旧配置）。

**关键优势：** Windows 不再需要安装 Git Bash。唯一硬依赖是 Node.js 18+（Electron 本身也需要）。

### `session-start` 脚本细节

[hooks/session-start.js](hooks/session-start.js) 在启动前额外检查：若 port 文件存在但健康检查失败，读取第二行 PID 用 `process.kill(pid, 0)` 检测进程是否存活——若 PID 已死则清理过期 port 文件。

**单实例互斥锁：** 使用 `~/.claude-pet/.launcher.lock` 原子文件锁（`fs.writeFileSync` + `wx` flag）防止多个 Claude Code 会话启动重复的桌宠进程。`session-start.js` 和 `pet-control.js start` 在启动 Electron 前尝试获取锁；Electron 的 `main.js` 在 HTTP 服务启动后释放锁，退出时也清理锁。锁持有者 PID 写入文件，供后续进程检测过期锁。

### 辅助脚本

| 脚本 | 用途 |
| ---- | ---- |
| [install.sh](install.sh) / [install.ps1](install.ps1) | 从 GitHub 一键安装（用户使用） |
| [uninstall.sh](uninstall.sh) / [uninstall.ps1](uninstall.ps1) | 卸载插件 + 清理数据目录 |
| [dev-install.sh](dev-install.sh) / [dev-install.ps1](dev-install.ps1) | **本地测试安装**——从本地源码目录拷贝/软链接到 `~/.claude/skills/claude-pet`，不从云端拉取 |

### Git 提交规范

提交信息以 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 结尾。

## 关键设计决策

- **32×32 逻辑像素 × 8 最近邻缩放** = 256×256 窗口，像素艺术清晰锐利
- **10 FPS** 动画循环 — 匹配像素风节奏，降低 CPU 占用
- **thinking 用 `?`，permission 用 `!`** — 语义区分"Claude 在思考"与"Claude 需要你的决定"
- **权限锁定** — 权限流程期间，忽略来自 Hook 的工具状态更新，避免对话框被中断
- **通过文件轮询实现阻塞 Hook** — PermissionRequest Hook 脚本轮询 `permission-response`，超时 600 秒；没有长连接 HTTP
- **状态过渡**为 6 帧（约 600ms），带正弦波跳跃：旧状态上升，中点切换，新状态回落

## 平台说明

- 宠物窗口使用操作系统特定 API：`setVisibleOnAllWorkspaces`（macOS）、`skipTaskbar`（Windows）
- **Windows 不再需要 Git Bash**——Hook 脚本已用纯 Node.js 重写，仅需 Node.js 18+
- 需要 Node.js 18+；Electron 33.x
- **重要**：如果环境变量 `ELECTRON_RUN_AS_NODE=1` 被设置，Electron 会退化为纯 Node.js 模式，桌宠窗口无法启动。`session-start.js` 和 `pet-control.js` 在 spawn Electron 时会**完全过滤**该变量（而非设为空字符串，空字符串在某些版本下仍会触发电 Node 模式）。手动启动时也需注意：`export -n ELECTRON_RUN_AS_NODE && cd electron && npm start`
