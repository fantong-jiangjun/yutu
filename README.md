# 报图助手

考试 / 报名场景下的**照片上传合规**微信小程序。用户选择报名场景，上传照片，系统自动检测并一键处理到目标规格（尺寸、格式、体积），保存到相册后可直接用于官网上传。

## 产品定位

- **专攻**：各类考试报名系统的照片上传要求
- **不做**：AI 抠图、换背景、云端存储、付费下载
- **变现**：微信流量主广告（检测免费，保存限次 + 激励视频）

## 技术特点

- 纯前端处理，照片**不上传服务器**
- 基于 Canvas 2D 完成裁剪、缩放、格式转换、体积压缩
- 个人主体可上线，无需后端服务器

## 快速开始

### 环境要求

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（建议稳定版）
- 微信小程序 AppID（测试可用测试号，上线需注册并认证）

### 导入项目

1. 打开微信开发者工具 → **导入**
2. 目录选择本仓库根目录 `baotu-assistant`
3. `project.config.json` 中将 `appid` 改为你的小程序 AppID

### 本地预览

导入后点击「编译」，在模拟器或真机预览中测试完整流程：

```
首页选场景 → 选图/拍照 → 合规检测 → 一键合规 → 保存相册
```

### 广告配置（可选）

开通流量主后，编辑 `config/ad-config.js`：

```javascript
module.exports = {
  banner: 'Banner广告位ID',
  rewarded: '激励视频广告位ID'
}
```

留空不影响核心功能。

## 上线 checklist

| 步骤 | 说明 | 费用 |
|------|------|------|
| 注册小程序 | [微信公众平台](https://mp.weixin.qq.com/) 个人主体 | 30 元/年认证 |
| ICP 备案 | 小程序后台按指引提交 | 0 元 |
| 代码提审 | 开发者工具上传 → 后台提审 | 0 元 |
| 开通流量主 | 累计 UV > 500 | 0 元 |

## 目录结构

```
baotu-assistant/
├── app.js / app.json / app.wxss   # 小程序入口与全局样式
├── config/
│   └── ad-config.js               # 广告位 ID
├── docs/
│   ├── ARCHITECTURE.md            # 项目架构说明
│   └── FEATURES.md                # 功能清单与版本规划
├── pages/
│   ├── index/                     # 首页：场景选择
│   ├── custom/                    # 自定义规格
│   ├── workspace/                 # 选图、检测、处理
│   └── result/                    # 结果对比与保存
├── components/
│   └── ad-banner/                 # Banner 广告组件
├── utils/
│   ├── scenes.js                  # 场景规格配置
│   ├── detect.js                  # 合规检测引擎
│   ├── image-processor.js         # 图片处理引擎
│   └── quota.js                   # 每日免费保存额度
├── project.config.json
└── sitemap.json
```

## 内置报名场景

| 场景 ID | 名称 | 尺寸 | 格式 | 上限 |
|---------|------|------|------|------|
| cet | 四六级 | 144×192 | JPG | 200KB |
| kaoyan | 考研 | 295×413 | JPG | 100KB |
| jiaozi | 教师资格证 | 295×413 | JPG | 200KB |
| ncce | 计算机等级考试 | 390×567 | JPG | 200KB |
| custom | 自定义 | 用户填写 | JPG/PNG | 用户填写 |

> 规格以各官网当年最新要求为准，可在 `utils/scenes.js` 中修改。

## 相关文档

- [项目架构](./docs/ARCHITECTURE.md)
- [功能清单](./docs/FEATURES.md)

## 成本说明

| 项目 | 费用 |
|------|------|
| 微信个人认证 | 30 元/年 |
| 服务器 | 0（纯前端） |
| 第三方 API | 0 |
