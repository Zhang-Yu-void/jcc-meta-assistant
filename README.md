# 金铲铲 Meta 助手

Android 平板客户端 + 阿里云轻量发布服务。手动点选当前棋子，本地匹配高胜阵容并给出补强建议。

> **产品边界：** 学习/复盘工具，需手动点选棋子，**非游戏内挂接**，不读取游戏进程、不截屏识图。

## 仓库结构

```
apps/mobile/           # Expo React Native（Android APK）
apps/publisher/        # Node 发布服务（部署阿里云）
packages/meta-schema/  # 共享 Zod Schema / 类型
packages/meta-match/   # 本地阵容匹配引擎
data/sample/           # 示例阵容数据
data/live/             # 爬虫输出目录（后续）
```

设计文档：`docs/superpowers/specs/2026-08-31-jcc-meta-assistant-design.md`

## 本地开发

```bash
pnpm install

# 启动发布服务（示例数据）
pnpm --filter @jcc/publisher start
# 默认 http://127.0.0.1:8787/v1/meta

# 启动 Android 客户端
pnpm --filter mobile start
# 或 pnpm --filter mobile android
```

运行测试：

```bash
pnpm test
```

## 客户端使用

1. 安装 APK 或在 Expo Go / 模拟器中运行
2. **点选** 页：按费用点选当前已有棋子，右侧即时显示 Top3 推荐阵容、缺失棋子、下一步优先拿、羁绊进度
3. **阵容库** 页：浏览全部高胜阵，查看核心、完整名单、来源与备注
4. **设置** 页：填写发布服务地址（如 `http://192.168.x.x:8787/v1/meta`），点「立即更新」同步数据

无网络时使用本地缓存；首次无缓存时使用内置示例数据。

## 数据格式

`GET /v1/meta` 返回 JSON，包含：

- `version` / `updatedAt` / `setId` / `setName`
- `champions[]` — `{ id, name, cost, traits[] }`
- `traits[]` — `{ id, name, breakpoints[] }`
- `compositions[]` — 阵容名、tier、winRateHint、core、units、priority、sources、notes

`winRateHint` / `pickRateHint` 为公开帖归纳的**提示值**（0–1），非官方战绩 API。

## 阿里云部署

```bash
# 环境变量
export DATA_PATH=/path/to/data/sample/bundle.json   # 或 data/live/bundle.json
export ADMIN_TOKEN=your-secret-token
export PORT=8787

pnpm --filter @jcc/publisher start
```

建议配合 Nginx 反代 HTTPS + pm2/systemd 守护。

热更新数据（爬虫写入新文件后）：

```bash
curl -X POST https://your-domain/v1/admin/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 后续爬虫（规划中）

适配器目录：`apps/publisher/adapters/`

优先级：**TapTap 论坛 → 小红书 → NGA 金铲铲板块**

输出路径：`data/live/bundle.json`，然后调用 reload 接口。

> 正式接入须遵守各平台服务条款；本仓库首版仅提供 stub 适配器与写入约定。

## 打 Android APK

```bash
cd apps/mobile
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

或使用 [EAS Build](https://docs.expo.dev/build/introduction/) 云端打包。

## 匹配算法

本地计算，目标延迟 < 50ms。根据已选棋子与候选阵容的重合度、核心缺失、tier、胜率提示综合打分，输出 Top3 与下一步建议。
