# 物居 (Wuju) — 家用物品管理 PWA

一个轻量级的 **渐进式网页应用（PWA）**，帮你管理家里的物品、存放空间和保质期。

> 原项目为 SwiftUI iOS App，已完整重写为 HTML5 PWA，无需 Mac / Xcode，任何设备都能用。

## ✨ 功能

- **物品管理** — 名称、数量、分类、保质期、备注
- **容器嵌套** — 无限层级（家 → 厨房 → 冰箱 → 冷藏层）
- **物品关联** — 属于 / 搭配 / 替换 / 备用
- **智能提醒** — 已过期 🔴 临期 🟠 低库存 🟡
- **搜索筛选** — 按名称搜索、按分类过滤、多维度排序
- **离线可用** — Service Worker 缓存，无网络也能打开
- **添加到主屏幕** — iOS/Android 均可安装为独立 App

## 📸 截图

| 物品列表 | 容器空间 | 提醒 |
|---|---|---|
| 搜索 + 分类筛选 + 排序 | 无限嵌套树形结构 | 过期/临期/低库存 |

## 🚀 部署

### Docker（推荐）

```bash
docker compose up -d
```

访问 `http://localhost:8080/wuju-pwa/`

### 手动部署

把整个目录放到任意 Web 服务器下：

```bash
# Nginx
cp -r wuju-pwa/ /var/www/

# 或 Python 快速测试
cd /var/www && python3 -m http.server 8080
```

### 添加到手机桌面

1. 用手机浏览器打开部署地址
2. **iOS Safari** → 分享 → 添加到主屏幕
3. **Android Chrome** → 自动弹出安装提示

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vanilla JS（无框架），~40KB |
| 存储 | IndexedDB（Dexie.js），数据全在浏览器端 |
| 离线 | Service Worker |
| 部署 | Nginx Alpine，镜像 ~5MB |

## 📁 项目结构

```
wuju-pwa/
├── index.html          # 应用入口
├── manifest.json       # PWA 清单
├── sw.js               # Service Worker
├── Dockerfile          # Docker 构建
├── docker-compose.yml  # 一键部署
├── css/style.css       # iOS 风格样式
├── js/
│   ├── db.js           # IndexedDB 数据层
│   └── app.js          # 主应用逻辑
└── icons/              # PWA 图标
```

## 📄 License

MIT
