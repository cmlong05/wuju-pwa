# 物居 (Wuju) — 家用物品管理 PWA

一个轻量级的 **渐进式网页应用（PWA）**，帮你管理家里的物品、存放空间和保质期、支持条码/二维码扫码识别。

> 原项目为 SwiftUI iOS App，已完整重写为 HTML5 PWA，无需 Mac / Xcode，任何设备都能用。

## ✨ 功能

- **物品管理** — 名称、数量、分类、保质期、备注
- **容器嵌套** — 无限层级（家 → 厨房 → 冰箱 → 冷藏层）
- **物品关联** — 属于 / 搭配 / 替换 / 备用
- **智能提醒** — 已过期 🔴 临期 🟠 低库存 🟡
- **搜索筛选** — 按名称搜索、按分类过滤、多维度排序
- **扫码识别** — 摄像头实时扫描条码/二维码，支持从相册选择图片
- **离线可用** — Service Worker 缓存，无网络也能打开
- **添加到主屏幕** — iOS/Android 均可安装为独立 App

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端框架 | Vanilla JS（无框架），虚拟 DOM |
| 扫码引擎 | **ZXing**（@zxing/browser + @zxing/library）— BrowserMultiFormatReader + canvas 手动抓帧 |
| 编码码检测 | Native BarcodeDetector API（优先，GPU 加速）|
| 存储 | IndexedDB（Dexie.js），数据全在浏览器端 |
| 离线 | Service Worker（预缓存 + 网络优先策略）|
| 部署 | Nginx Alpine on Docker，镜像 ~7MB |
| 证书 | Let's Encrypt（Certbot auto-renew）|

## 🏗 架构

原单体 `app.js`（~1645 行）已拆分为职责清晰的模块化结构：

- **`app.js`** — 薄入口，仅导入 `bootstrap` 并调用 `init()`
- **`core/`** — 应用骨架：状态管理、导航栈、DOM 工具
- **`views/`** — 页面渲染：物品、容器、提醒
- **`scanner.js`** — 扫码能力：摄像头 + ZXing 解码循环
- **`ui.js`** — 可复用 UI 构件：弹窗、表单、删除确认
- **`bootstrap.js`** — 启动流程：加载配置、注册 SW、绑定事件、首次渲染

## 📁 项目结构

```
wuju-pwa/
├── index.html              # 应用入口（PWA manifest + 库加载）
├── manifest.json           # PWA 清单（图标/颜色/名称）
├── sw.js                   # Service Worker（离线缓存策略）
├── nginx.conf              # Nginx 配置（SSL + 子路径路由）
├── Dockerfile              # Docker 构建（Nginx Alpine）
├── docker-compose.yml      # 一键部署
├── css/
│   └── style.css           # iOS 风格样式
├── js/
│   ├── app.js              # 入口（3 行，仅导入 bootstrap）
│   ├── bootstrap.js        # 启动流程（配置/事件/首次渲染）
│   ├── db.js               # IndexedDB 数据层（Schema + 迁移）
│   ├── scanner.js          # 扫码（摄像头 + ZXing 解码）
│   ├── ui.js               # 可复用 UI（弹窗/表单/确认框）
│   ├── core/
│   │   ├── app-shell.js    # 应用骨架（状态/导航/渲染调度）
│   │   └── dom.js          # DOM 工具
│   ├── views/
│   │   ├── items.js        # 物品列表/详情/编辑
│   │   ├── containers.js   # 容器树/详情/编辑
│   │   └── alerts.js       # 提醒页（过期/临期/低库存）
│   ├── dexie.min.js        # IndexedDB 封装（Dexie.js）
│   ├── zxing-library.min.js  # ZXing 核心解码库
│   └── zxing-browser.min.js  # ZXing 浏览器封装
├── icons/                  # PWA 图标（192/512px）
└── README.md
```

## 🔍 扫码技术说明

- **ZXing 引擎** — 使用 `@zxing/browser` 的 `BrowserMultiFormatReader`，手动 canvas 抓帧 + `decodeBitmap` 解码，绕过 `decodeFromVideoElement` 在 iOS Safari 上的兼容问题
- **Canvas 抓帧** — 每帧 `ctx.drawImage(video)` 后创建 `HTMLCanvasElementLuminanceSource` → `HybridBinarizer` → `decodeBitmap`
- **配置** — TRY_HARDER: true, QR_CODE+EAN+CODE128/39 多格式, 1280×720 分辨率
- **降级** — BarcodeDetector API 作为优先路径（GPU 加速），失败后自动降级到 ZXing

## 🚀 部署

### Docker（推荐）

```bash
docker compose up -d
```

访问 `https://wuju.bumooby.com:8444/wuju-pwa/`

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

## 📄 License

MIT
