# AI 网页实时翻译插件

一个基于 AI 的 Chrome 浏览器扩展，可以实时翻译网页内容，支持原文和译文对照显示。

## 功能特点

- 实时翻译网页内容，无需复制粘贴
- 原文和译文对照显示（原文在上，译文在下）
- 支持多种语言互译
- 兼容 OpenAI 及兼容格式的 API

## 安装步骤

### 1. 加载插件到 Chrome

1. 打开 Chrome 浏览器
2. 在地址栏输入 `chrome://extensions/` 并回车
3. 打开右上角的 **"开发者模式"** 开关
4. 点击 **"加载已解压的扩展程序"**
5. 选择本项目的文件夹（`d:\大二下\翻译Test`）
6. 插件安装完成！

### 2. 配置 API Key

1. 点击浏览器工具栏中的插件图标
2. 在弹出窗口中输入你的 API Key
3. 配置 API 地址（默认是 OpenAI，可以改为其他兼容的 API）
4. 选择源语言和目标语言
5. 设置会自动保存

### 3. 使用翻译

1. 打开任意网页
2. 点击插件图标
3. 点击 **"开始翻译"** 按钮
4. 等待翻译完成，页面上会直接显示原文和译文对照

## 项目结构

```
翻译Test/
├── manifest.json      # 插件配置文件
├── popup.html         # 弹出窗口界面
├── popup.css          # 弹出窗口样式
├── popup.js           # 弹出窗口逻辑
├── content.js         # 网页内容翻译脚本
├── content.css        # 翻译显示样式
├── background.js      # 后台服务
├── icons/             # 插件图标
│   ├── icon16.png
│   ├── icon48.png
│   ── icon128.png
└── generate-icons.js  # 图标生成脚本
```

## API 配置

支持任何兼容 OpenAI 格式的 API：

- **OpenAI**: `https://api.openai.com/v1`
- **智谱 AI**: `https://open.bigmodel.cn/api/paas/v4`
- **DeepSeek**: `https://api.deepseek.com/v1`
- **其他兼容 API**: 填写对应的 API 地址即可

## 注意事项

- 请妥善保管你的 API Key
- 翻译大量内容可能会消耗较多 API 调用次数
- 某些网站可能有 CSP 限制，影响翻译功能

## 开发说明

如需修改或扩展功能，主要关注以下文件：

- `content.js` - 核心翻译逻辑
- `popup.js` - 用户界面交互
- `manifest.json` - 插件配置
