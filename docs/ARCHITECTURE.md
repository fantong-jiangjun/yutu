# 报图助手 · 项目架构

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                        微信客户端                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐  ┌──────────┐  │
│  │  index  │→ │ custom  │→ │  workspace  │→ │  result  │  │
│  │ 场景入口 │  │自定义规格│  │ 检测+处理   │  │ 对比+保存 │  │
│  └────┬────┘  └────┬────┘  └──────┬──────┘  └────┬─────┘  │
│       │            │              │               │         │
│       └────────────┴──────────────┴───────────────┘         │
│                            │                                 │
│              ┌─────────────▼─────────────┐                  │
│              │         utils 工具层        │                  │
│              │ scenes / detect / processor │                  │
│              │ quota                       │                  │
│              └─────────────┬─────────────┘                  │
│                            │                                 │
│              ┌─────────────▼─────────────┐                  │
│              │   Canvas 2D（本地图像引擎）  │                  │
│              │   微信文件系统 / 本地存储     │                  │
│              └───────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘

无后端 · 无云存储 · 无第三方图像 API
```

## 2. 分层设计

| 层级 | 职责 | 主要文件 |
|------|------|----------|
| **表现层（Pages）** | 页面交互、路由、状态展示 | `pages/*` |
| **组件层（Components）** | 可复用 UI 块 | `components/ad-banner` |
| **业务层（Utils）** | 场景配置、检测逻辑、图像流水线、额度控制 | `utils/*` |
| **配置层（Config）** | 广告位等运行时可改配置 | `config/ad-config.js` |
| **基础设施** | Canvas、微信 API、本地 Storage | 微信原生能力 |

## 3. 页面路由与数据流

### 3.1 路由关系

```
pages/index/index
    │
    ├─[点击预设场景]─→ pages/workspace/workspace?sceneId=cet|kaoyan|...
    │
    └─[自定义规格]───→ pages/custom/custom
                           │
                           └─→ pages/workspace/workspace?sceneId=custom&width=&height=&...

pages/workspace/workspace
    │
    └─[处理完成]─────→ pages/result/result
                           │
                           └─[返回首页]─→ pages/index/index (reLaunch)
```

### 3.2 跨页数据传递

| 传递方式 | 用途 | Key / 参数 |
|----------|------|------------|
| URL Query | 场景 ID、自定义宽高/KB/格式 | `sceneId`, `width`, `height`, `maxKB`, `format` |
| `wx.setStorageSync` | 处理结果会话（含原图/成品路径、检测报告） | `baotu_result_session` |
| `getApp().globalData` | 广告位 ID | `adUnitIds.banner`, `adUnitIds.rewarded` |
| 本地 Storage | 每日保存次数 | `baotu_daily_save` |

> 图片临时路径通过 Storage 传递，避免 URL 长度限制。

### 3.3 核心用户时序

```
用户          index        workspace       utils              result
 │              │              │              │                  │
 │─选场景───────→│              │              │                  │
 │              │─navigate────→│              │                  │
 │─选图/拍照──────────────────→│              │                  │
 │              │              │─runDetection→│ detect.js        │
 │              │              │←─report──────│                  │
 │─一键合规────────────────────→│              │                  │
 │              │              │─process────→│ image-processor  │
 │              │              │←─resultPath──│                  │
 │              │              │─setStorage───│                  │
 │              │              │─navigate────────────────────────→│
 │─保存相册─────────────────────────────────────────────────────→│
 │              │              │              │     quota.js     │
```

## 4. 模块详解

### 4.1 scenes.js — 场景配置中心

**职责**：定义各报名场景的合规目标参数，是所有检测与处理的「标准答案」。

```javascript
Scene {
  id, name, shortName,
  width, height,      // 目标像素
  format,             // jpg | png
  maxKB,              // 体积上限
  aspectRatio,        // 宽高比
  tips                // 展示文案
}
```

- `getSceneById(id)`：读取预设场景
- `buildCustomScene(params)`：构建自定义场景
- `getTargetKB(scene)`：输出目标体积（上限 × 0.9，留安全边距）

**扩展方式**：在 `SCENES` 对象中新增条目即可增加预设场景。

---

### 4.2 detect.js — 合规检测引擎

**职责**：对比原图与场景标准，输出结构化检测报告。

**检测项**：

| key | 检测内容 |
|-----|----------|
| format | 文件格式 |
| size | 文件体积 |
| dimension | 宽高像素 |
| ratio | 宽高比 |
| readable | 是否可解码 |

**输出结构**：

```javascript
{
  pass: boolean,
  checks: [{ key, label, pass, current, expected, message }],
  failCount, gapText, repairHint,
  imageInfo, fileSize, targetKB
}
```

**依赖 API**：`wx.getImageInfo`、`getFileSystemManager().getFileInfo`

---

### 4.3 image-processor.js — 图像处理引擎

**职责**：在 Canvas 2D 上执行合规流水线，输出临时文件路径。

**核心流程 `processCompliance`**：

```
加载原图
  → calcCropRect（按比例 + 偏移量裁剪区域）
  → 绘制白底
  → drawImage 缩放至目标 width×height
  → canvasToTempFilePath 导出 JPG/PNG
  → 循环降低 quality 直到 size ≤ targetKB
  → 仍超限则缩小画布内容区域再次压缩
```

**辅助函数**：

| 函数 | 说明 |
|------|------|
| `calcCropRect` | 计算居中/可调偏移的裁剪矩形 |
| `exportCanvas` | 导出临时图片 |
| `compressVolumeOnly` | 仅压体积（预留，自定义场景扩展） |

**设计约束**：

- 全程在用户设备内存中处理
- 隐藏 Canvas 位于 `workspace` 页，`id="processCanvas"`
- 使用 `pixelRatio` 保证导出清晰度

---

### 4.4 quota.js — 保存额度

**职责**：控制每日免费保存次数，支撑广告变现策略。

| 常量/方法 | 说明 |
|-----------|------|
| `FREE_SAVE_PER_DAY = 3` | 每日免费保存上限 |
| `canSaveFree()` | 是否还可免费保存 |
| `recordSave()` | 保存成功后计数 +1 |

存储格式：`{ "2026-6-12": 2 }`（按自然日）

---

### 4.5 ad-banner 组件

**职责**：封装 Banner 广告，无广告 ID 时不渲染。

读取 `getApp().globalData.adUnitIds.banner`，加载失败自动隐藏。

---

## 5. 页面职责

| 页面 | 文件 | 核心职责 |
|------|------|----------|
| 首页 | `pages/index` | 场景列表、隐私声明、跳转 |
| 自定义 | `pages/custom` | 表单收集自定义规格 |
| 工作台 | `pages/workspace` | 选图、检测展示、构图微调、触发处理 |
| 结果 | `pages/result` | 前后对比、复检、额度、保存、激励视频 |

## 6. 变现架构

```
                    ┌─────────────────┐
                    │   检测 / 预览    │  ← 永久免费（拉新）
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  每日免费保存×3  │
                    └────────┬────────┘
                             │ 超出
                    ┌────────▼────────┐
                    │  激励视频广告    │  ← rewarded（config）
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   保存到相册     │
                    └─────────────────┘

页面底部 Banner ← 全程展示（config/ad-config.js）
```

## 7. 安全与隐私

| 项 | 实现 |
|----|------|
| 图片不上云 | 无网络上传逻辑，仅本地 Canvas |
| 相册权限 | `scope.writePhotosAlbum`，保存时申请 |
| 会话数据 | 临时路径存 Storage，非持久云端 |
| 个人主体合规 | 无支付、无用户账号、无 UGC 社区 |

## 8. 扩展规划（架构预留）

| 扩展方向 | 建议改动位置 |
|----------|--------------|
| 新增考试场景 | `utils/scenes.js` |
| 批量处理 | 新增 `pages/batch` + processor 批处理循环 |
| 第二版深度检测 | `utils/detect.js` 增加检测项 |
| 矩阵小程序复制 | 抽 `utils` 为模板，仅改 `scenes.js` 与 branding |
| AI 抠图（需后端） | 新增 `cloud/` 或独立服务，**当前架构未包含** |

## 9. 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | 微信小程序原生（WXML + WXSS + JS） |
| 图像 | Canvas 2D + `wx.canvasToTempFilePath` |
| 存储 | `wx.setStorageSync` |
| 后端 | 无 |
| 构建 | 微信开发者工具原生编译 |

## 10. 已知限制

1. **Canvas 兼容性**：部分安卓机型压缩效果与 iOS 可能有差异
2. **PNG 体积**：PNG 无 quality 参数，超大 PNG 自定义场景可能难以压到极小 KB
3. **规格准确性**：考试官网要求可能年度调整，需人工更新 `scenes.js`
4. **HEIC**：苹果 HEIC 原图依赖微信底层转换，未单独处理
5. **广告**：未配置 `ad-config.js` 时，超额保存会弹窗确认后直接保存（开发期友好）
