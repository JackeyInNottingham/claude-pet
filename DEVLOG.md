# Claude Pet 开发日志

## 项目状态

**2026-06-08**: 跨平台 Node.js Hook + 版本自动更新 + 安装脚本修复已完成。详见 **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)**。

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

## 待办

- [ ] Plugin Marketplace 发布
- [ ] 权限弹窗大内容时自动扩展窗口（可选）
- [ ] `elicitation_dialog`（MCP 表单）支持（可选）

## 快速启动

```bash
# 正式桌宠
cd electron && npm install && npm start

# 动画 + 权限 Demo
cd electron && npm run demo
```

完整架构、状态表、Hook 流程见 [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)。
