# Claude Pet 开发日志

## 项目状态

**2026-06-08**: 吉祥物已对齐 Claude Code 终端 Clawd；10 状态动画 + 过渡 + 权限互动已完成。详见 **[docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)**。

## 已完成

- [x] Claude Code Plugin 架构
- [x] 7 工具状态 + 3 权限状态动画
- [x] Clawd 终端渲染（An/SCF + 对称修复）
- [x] PetAnimator 6 帧状态过渡
- [x] PermissionRequest Hook + 弹窗（Yes / Always allow / No）
- [x] 动画 Demo（`npm run demo`）
- [x] HTTP localhost + 状态机 + 气泡/托盘/位置记忆

## 待办

- [ ] Plugin Marketplace 发布
- [ ] Windows 平台完整测试
- [ ] 权限弹窗大内容时自动扩展窗口（可选）

## 快速启动

```bash
# 正式桌宠
cd electron && npm install && npm start

# 动画 + 权限 Demo
cd electron && npm run demo
```

完整架构、状态表、Hook 流程见 [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)。
