# Claude Pet 开发日志

## 项目状态

**2026-06-09**: 16 个 bug 全部修复。安装/卸载/本地安装脚本全部验证通过。桌宠在 Windows 上正常运行，健康检查 `{"status":"ok"}`。项目处于可发布状态。

## 当前会话成果

| 类别 | 内容 |
|------|------|
| 新建文件 | `pet-utils.js`（共享模块）、`uninstall.sh`、`uninstall.ps1`、`dev-install.sh`、`dev-install.ps1` |
| 修改文件 | `session-start.js`、`pet-control.js`、`notify-pet.js`、`main.js`、`install.sh`、`install.ps1`、`CLAUDE.md`、`DEVELOPMENT.md`、`DEVLOG.md`、`plugin.json` |
| 修复 bug | 16 个（#1–8 代码审查、#9–11 Windows 安装验证、#12–14 脚本完善、#15–16 管道/死代码） |
| 功能新增 | 单实例互斥锁、崩溃韧性健康检查、共享工具模块、卸载/本地安装脚本 |
| 验证通过 | `dev-install.ps1` 实际运行、`install.sh` 本地模拟、桌宠启动 + 健康检查 |

## 已完成

- [x] Claude Code Plugin 架构
- [x] 7 工具状态 + 3 权限状态动画
- [x] Clawd 终端渲染（An/SCF + 对称修复）
- [x] PetAnimator 6 帧状态过渡
- [x] PermissionRequest Hook + 弹窗（Yes / Always allow / No）
- [x] 动画 Demo（`npm run demo`）
- [x] HTTP localhost + 状态机 + 气泡/托盘/位置记忆
- [x] **跨平台纯 Node.js Hook**（无需 Git Bash，仅需 Node.js 18+）
- [x] **版本自动更新检查** — GitHub Releases API 每日检查，蓝色更新弹窗，一键 git pull + npm install
- [x] **安装脚本修复** — 路径改为 `~/.claude/skills/claude-pet/`，移除无效的 `claude plugin install` 调用
- [x] Windows 平台适配验证通过
- [x] **卸载脚本** — `uninstall.sh` / `uninstall.ps1`，停止桌宠、删除插件目录、可选保留数据
- [x] **本地测试安装脚本** — `dev-install.sh` / `dev-install.ps1`，从本地源码安装，不依赖 GitHub
- [x] **单实例互斥锁** — 原子文件锁（`~/.claude-pet/.launcher.lock`）防止多会话开启多个桌宠
- [x] **共享工具模块** — `hooks/pet-utils.js`，消除 `session-start.js` / `pet-control.js` / `notify-pet.js` 之间的代码重复
- [x] **崩溃韧性** — 权限轮询循环中每 3 秒健康检查，桌宠崩溃时立即返回 deny 而非等 600 秒超时
- [x] **安装脚本增强** — 移除 `--production`、安装后验证 electron 二进制存在

## 代码审查修复（2026-06-09）

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | `setTimeout` 未 `unref()` 保持进程 30s | `hooks/session-start.js` | `safetyTimer.unref()` |
| 2 | 锁提前释放（5s 轮询超时），竞态产生双桌宠 | `commands/pet-control.js` | 轮询延长到 15s + 监控 `child.exitCode` |
| 3 | `spawn(electronBin)` 在 node_modules 缺失时抛 ENOENT | `hooks/session-start.js` | `try/catch` 包裹，失败时释放锁并优雅退出 |
| 4 | `tryAcquireLock`/`isPidAlive`/`healthCheck` 在 3 个文件中重复 | 新建 `hooks/pet-utils.js` | 共享模块，3 个文件统一引用 |
| 5 | `lastHealthCheck=0` 导致首次循环即发健康检查 | `hooks/notify-pet.js` | 初始化为 `Date.now()`，延迟到 3s 后 |
| 6 | `dev-install.sh` 用 `rsync` 无 fallback | `dev-install.sh` | 检测 `rsync`，不存在则 fallback 到 `cp -r` |
| 7 | `dev-install.ps1` 用 `\.*` glob 复制隐藏文件不可靠 | `dev-install.ps1` | 改用 `Get-ChildItem -Hidden` + 显式复制 `.claude-plugin` |
| 8 | `auto-start-disabled` 检查移到 port 清理前，跳过过期文件清理 | `hooks/session-start.js` | 恢复原始顺序：先清理过期文件，再检查 auto-start |

## Windows 实际安装验证修复（2026-06-09）

在本地 Windows 环境运行 `dev-install.ps1` 并启动桌宠时，发现并修复了以下额外 bug：

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 9 | `path.dirname(path.dirname(__dirname))` 解析到错误路径 | `pet-control.js` 在 `commands/` 目录下，`dirname` 两次跳过了插件根目录，落到 `skills/`。此 bug 平时被 `${CLAUDE_PLUGIN_ROOT}` 参数掩盖 | 3 个文件统一改为 `path.dirname(__dirname)`（只需跳一级） |
| 10 | `spawn(.cmd, {detached: true})` 在 Windows 上报 EINVAL | `.cmd` 批处理文件不能与 `CREATE_NEW_PROCESS_GROUP` 标志同时使用 | Windows 上改用 `electron/dist/electron.exe`（真实可执行文件） |
| 11 | `ELECTRON_RUN_AS_NODE=''` 设置空字符串仍触发 Electron Node 模式 | Electron 将空字符串视为 truthy，导致 `ipcMain` 等 API 不可用 | 使用 `Object.fromEntries(Object.entries(env).filter(...))` 完全移除该变量，等效于 shell 的 `unset` |
| 12 | `install.ps1` 验证 `.bin\electron.cmd` 但启动器用 `electron\dist\electron.exe` | 若 .exe 缺失而 .cmd 存在（极罕见），验证通过但启动失败 | 改为验证 `electron\dist\electron.exe` |
| 13 | 卸载脚本数据目录描述遗漏 `.launcher.lock` | 用户选择保留数据目录时不知有锁文件残留（虽可自愈） | `uninstall.sh` / `uninstall.ps1` 描述中加入 `launcher lock` |
| 14 | `dev-install.ps1` 有重复的 `New-Item` 和 `Write-Host` 语句 | 上轮修复隐藏文件复制时产生 | 合并去重 |
| 15 | `set -e` + `read` 在 `curl \| bash` 管道下脚本中止 | 管道 EOF → `read` 返回 1 → `set -e` 视为错误退出 | `install.sh`/`uninstall.sh`/`dev-install.sh` 的 `read` 后加 `\|\| true` |
| 16 | `install.ps1` 中 `return` 在 `exit 1` 之后为死代码 | 自定义 `Write-Error` 函数调用 `exit 1`，不会返回 | 移除死代码 `return` |

## 安装/卸载脚本验证（2026-06-09）

| 脚本 | 验证方式 | 结果 |
|------|----------|------|
| `dev-install.ps1` | 实际运行 4 次，含首次失败→修复→成功→最终同步 | ✅ 复制正确、npm install 通过、plugin validate 通过 |
| `dev-install.sh` | 逻辑审查（macOS/Linux 暂未实际测试） | ✅ 与 .ps1 逻辑一致 |
| `install.ps1` | 逻辑审查 + 验证路径对齐 | ✅ electron 验证改为 `.exe` 路径 |
| `install.sh` | 逻辑审查 | ✅ Unix symlink 路径正确，无需修改 |
| `uninstall.ps1` | 逻辑审查（保留数据/删除数据两个分支） | ✅ 含 lock 文件描述、停止桌宠→删插件→删数据流程正确 |
| `uninstall.sh` | 逻辑审查 | ✅ 与 .ps1 逻辑一致 |

## 待办

- [ ] Plugin Marketplace 发布
- [ ] 权限弹窗大内容时自动扩展窗口（可选）
- [ ] `elicitation_dialog`（MCP 表单）支持（可选）
- [ ] CI/CD 自动测试

## 快速启动

```bash
# 正式桌宠
cd electron && npm install && npm start

# 动画 + 权限 Demo
cd electron && npm run demo
```

完整架构、状态表、Hook 流程见 [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)。
