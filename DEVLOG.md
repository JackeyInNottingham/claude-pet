# Claude Pet 开发日志

## 项目状态

**2026-06-07**: 基础功能已完成，Electron 应用可启动，Hook 系统可通信。吉祥物精灵图待优化。

## 需求

- [x] Claude Code Plugin 架构（用户通过安装 plugin 使用桌宠）
- [x] 7 状态实时动画（idle/reading/searching/thinking/writing/executing/error）
- [x] 状态机 + Hook 事件驱动
- [x] HTTP localhost 通信（Hook → Electron）
- [x] 透明无边框窗口、永远置顶、可拖动
- [x] 对话气泡 + 权限请求对话框
- [x] 位置记忆 + 系统托盘图标
- [x] `/pet start|stop|toggle|status` 命令
- [ ] **吉祥物精灵图重绘** — 当前像素数组设计不够还原 CLI 角色，需用户用外部工具重绘
- [ ] 上线到 Claude Code Plugin Marketplace
- [ ] Windows 平台完整测试

## 架构

```
Claude Code Hooks (hooks.json)
    ↓ curl POST localhost
Electron App (electron/)
    ├── main.js — 窗口管理 + HTTP Server + IPC
    ├── preload.js — contextBridge
    ├── renderer.js — 动画循环 (10 FPS, Canvas 8x scale)
    ├── state-machine.js — 7 状态 FSM
    ├── sprites.js — 像素精灵绘制 (32×32 → 256×256)
    ├── speech-bubble.js — 对话气泡
    └── permission-dialog.js — 权限对话框
```

## 代办

### 近期
1. **精灵素材重做** — 两种路径可选：
   - A: 用户提供 32×32 基础角色 PNG，代码叠加表情/道具
   - B: 用户提供 7 张精灵表 PNG（每张对应一个状态），代码只做帧切换
2. 精灵素材敲定后，调整 `sprites.js` 适配新素材格式
3. 视觉调优：实际观看各个状态的动画效果，微调帧率和细节

### 远期
4. Plugin Marketplace 发布
5. Windows 平台测试
6. 性能优化（CPU 占用控制）
7. 多显示器支持

## 文件结构

```
claude-pet/
├── .claude-plugin/plugin.json
├── commands/pet.md
├── electron/
│   ├── main.js               (178 行)
│   ├── preload.js            (21 行)
│   ├── index.html
│   ├── style.css
│   ├── renderer.js           (86 行)
│   ├── state-machine.js      (102 行)
│   ├── sprites.js            (244 行) ← 等素材替换后重写
│   ├── speech-bubble.js      (20 行)
│   ├── permission-dialog.js  (38 行)
│   └── package.json
├── hooks/
│   ├── hooks.json
│   ├── notify-pet.sh
│   ├── session-start
│   └── platform-shell.sh
├── docs/
│   └── superpowers/
│       ├── specs/2026-06-07-claude-pet-design.md
│       └── plans/2026-06-07-claude-pet-plan.md
└── README.md
```

## 已知问题

1. 吉祥物视觉不理想 — 当前像素数组绘制的角色与 CLI 吉祥物差异较大，等用户提供精灵素材后替换
2. Electron 二进制下载需国内镜像（`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`）
3. npm install 首次较慢，session-start 中用了后台异步安装避免阻塞

## 启动方式

```bash
cd electron
npm install
npm start
# 或: npx electron .
```

## 技术栈

- Electron 33
- Vanilla JS (Canvas API)
- Claude Code Hooks & Plugin System
- Bash scripts (hook communication)
