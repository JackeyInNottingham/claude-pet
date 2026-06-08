# Claude Pet 🐾 · 桌宠插件

[English](./README.md)

一只可爱的像素风桌宠，栖息在你的桌面上，实时反映 Claude Code 的工作状态——读文件、写代码、搜代码、执行命令，并以互动弹窗处理权限请求。

## 它能显示什么

| 状态 | Claude 在做什么 | 权限互动 |
| ---- | -------------- | -------- |
| 😴 Idle | 等待你的输入 | — |
| 📖 Reading | 读取文件 | — |
| 🔍 Searching | 搜索代码 / 网页 | — |
| 🤔 Thinking | 思考 / 推理 | — |
| ✍️ Writing | 编辑文件 | — |
| ⚙️ Executing | 执行命令 | — |
| 😱 Error | 出错了 | — |
| 🙋 Permission | 需要你的授权 | 弹出对话框，显示工具详情 |
| ✅ Allowed | 已允许 | 短暂 ✓ 反馈动画 |
| ❌ Denied | 已拒绝 | 短暂下沉动画 |

吉祥物是 **Clawd**——Claude Code 的终端吉祥物，以锐利像素风渲染（32×32 逻辑像素 × 8 最近邻缩放），每种状态都有专属道具：阅读戴眼镜，搜索拿放大镜，执行头顶旋转齿轮，思考冒 `?`，权限闪 `!`。

## 安装

### 方法一：一键安装（推荐）

**macOS / Linux：**

```bash
curl -fsSL https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.sh | bash
```

**Windows（PowerShell）：**

```powershell
iwr -UseBasicParsing https://raw.githubusercontent.com/JackeyInNottingham/claude-pet/main/install.ps1 | iex
```

> 国内用户：加 `USE_CN_MIRROR=1`（macOS/Linux）或 `-UseCnMirror`（Windows）使用淘宝 Electron 镜像加速下载。

脚本会自动克隆仓库、安装依赖、注册插件，并询问是否开启自动启动。**幂等**：重复运行会执行 `git pull` 更新到最新版本。

### 方法二：手动安装

```bash
git clone https://github.com/JackeyInNottingham/claude-pet.git ~/.claude/skills/claude-pet
cd ~/.claude/skills/claude-pet/electron
npm install
# 插件自动加载为 claude-pet@skills-dir，重启 Claude Code 生效
```

更新：

```bash
cd ~/.claude/skills/claude-pet && git pull && cd electron && npm install
```

国内下载 Electron 时先设置镜像：

```bash
export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

## 命令

| 命令 | 操作 |
| ---- | ---- |
| `/pet start` | 启动桌宠窗口 |
| `/pet stop` | 关闭桌宠窗口 |
| `/pet toggle` | 切换「会话启动时自动启动」开关 |
| `/pet status` | 查看桌宠运行状态 |

## 工作原理

```
Claude Code Hook → notify-pet.sh → POST /status → Electron HTTP 服务
                                     → IPC → 渲染进程 → Canvas 动画

权限流程：
  Claude Code PermissionRequest → Hook → POST /permission → Electron 弹窗
  → 用户点击 → IPC 回传 → 写入响应文件 → Hook 轮询读取 → 返回 decision
```

插件是一个 **Electron 应用**（透明、无边框、置顶 256×256 窗口），由 **Claude Code Hook** 驱动。当 Claude 使用工具（读文件、写代码、执行命令等）时，Hook 触发并通过本地 HTTP 将状态变更发送到 Electron 进程内的状态机，驱动 10 FPS 的 Canvas 像素动画。

## 环境要求

| 依赖 | 版本 | 备注 |
| ---- | ---- | ---- |
| Node.js | 18+ | — |
| Electron | 33.x | npm 自动安装 |
| Git | 任意版本 | 克隆仓库 |

- **macOS**：已测试
- **Windows**：已测试 — Hook 脚本使用纯 Node.js，无需 Git Bash

## 平台说明

### Windows

- 安装 [Git for Windows](https://git-scm.com/download/win) 用于克隆仓库
- Hook 脚本为纯 Node.js 实现——**无需 Git Bash**
- 安装脚本使用 PowerShell；Hook 通过 `node` 运行（Node.js 内置）
- 宠物窗口使用 `skipTaskbar` 不在任务栏显示

### macOS

- 宠物窗口使用 `setVisibleOnAllWorkspaces`，切换桌面时跟随
- 启动前需 `unset ELECTRON_RUN_AS_NODE`——部分环境会设置此变量

### 重要提醒

如果环境中设置了 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化为纯 Node.js 模式，桌宠窗口无法启动。安装脚本和 `session-start` Hook 已自动 unset 此变量。手动启动时请注意：

```bash
unset ELECTRON_RUN_AS_NODE && cd electron && npm start
```

## 常见问题

| 问题 | 解决方案 |
| ---- | -------- |
| 宠物不出现 | 确认已安装 `claude` CLI。执行 `/pet start`。检查 `~/.claude-pet/port`。 |
| 窗口启动但空白 | 确保 `ELECTRON_RUN_AS_NODE` 未被设置。 |
| 权限弹窗不显示 | Windows 确保 `node` 在 PATH 中。确认宠物正在运行（`/pet status`）。 |
| Hook 未触发 | 确认插件已注册：`claude plugin list`。重试 `claude plugin install <path>`。 |
| port 文件过期 | 执行 `/pet stop` 再 `/pet start`。`session-start` 脚本会自动清理僵尸 PID。 |

## Demo

```bash
cd ~/.claude/skills/claude-pet/electron
npm run demo
```

打开独立窗口（520×780，非透明），自动循环展示所有动画状态，支持通过按钮或键盘测试 4 种权限场景。

## 文档

- [DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 架构、状态、动画、权限系统、设计决策
- [CLAUDE.md](./CLAUDE.md) — 给 Claude Code 在此仓库中工作的指导

---

**License**: MIT · **Author**: [Jiyao Fei](https://github.com/JackeyInNottingham)
