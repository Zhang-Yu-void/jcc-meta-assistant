# 金铲铲 Meta 助手 — 设计文档

**日期：** 2026-08-31  
**状态：** 已评审（对话确认 §1–§3）  
**产品定位：** Android 平板客户端 + 阿里云轻量发布服务；手动点选阵容，本地匹配高胜阵并推荐补强。学习/复盘工具，不挂接游戏进程、不截屏识图、不涉及反作弊规避。

---

## 1. 目标与非目标

### 1.1 目标

- 在 Android 平板上以 APK 形式运行（Expo / React Native）。
- 用户手动点选当前棋子，本地快速计算（目标 &lt; 50ms）最贴近的高胜阵与下一步建议。
- 胜率/阵容数据来自发布服务上的规范化 JSON；首版内置可替换示例数据。
- 数据更新自动化：客户端拉取稳定 API；爬取在服务器侧完成，写入同一 schema 后发布。
- 后续数据源优先级（爬虫后补）：TapTap 金铲铲论坛 → 小红书 → NGA 金铲铲板块。

### 1.2 非目标（首版明确不做）

- 游戏内叠加层、截屏 OCR、读内存/读进程。
- 反检测 /「不能被识别为外挂」类能力。
- TapTap / 小红书 / NGA 的真实爬虫实现（仅预留适配器目录与写入约定）。
- iOS / 桌面端首版交付。

### 1.3 合规说明

三站多数禁止未授权抓取，且反爬严格。正式接入须采用各站允许的方式（开放接口、合作授权，或运营者自行合规采集后写入发布目录）。本仓库首版不提供绕过登录墙或反爬的实现。

---

## 2. 架构

### 2.1 仓库结构（monorepo）

```
jcc-meta-assistant/
  apps/mobile/           # Expo React Native → Android APK
  apps/publisher/        # Node 轻量发布服务（部署阿里云）
  packages/meta-schema/  # 共享 JSON Schema / TypeScript 类型
  data/sample/           # 首版示例阵容 bundle
  data/live/             # 爬虫输出目录（后续）
  apps/publisher/adapters/  # taptap / xhs / nga 空壳（后续）
  docs/                  # 设计与使用说明
```

### 2.2 数据流

1. 示例或爬虫产物写入规范化 bundle（`compositions` + `champions` + `traits`）。
2. `publisher` 从 `DATA_PATH` 加载，对外提供 `GET /v1/meta`。
3. 平板客户端配置 Meta URL → 拉取并本地缓存 → 点选棋子 → 本地算匹配与推荐。
4. 后续爬虫只覆盖同 schema 文件；热加载或重启后客户端靠 `version` 感知更新。

```
[adapters / 人工] → data/*.json → publisher (/v1/meta)
                                         ↓
                              Expo 客户端（缓存 + 本地匹配）
```

---

## 3. 数据格式

### 3.1 `GET /v1/meta` 响应

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | string | 单调可比较版本，如 `2026.08.31.1` |
| `updatedAt` | string (ISO8601) | 发布时间 |
| `setId` / `setName` | string | 赛季标识（示例可为 `sample-set`） |
| `champions` | array | `{ id, name, cost, traits[] }` |
| `traits` | array | `{ id, name, breakpoints[] }` |
| `compositions` | array | 见下表 |

**composition 对象：**

| 字段 | 说明 |
|------|------|
| `id` / `name` | 阵容 ID 与展示名 |
| `tier` | `S` / `A` / `B` |
| `winRateHint` / `pickRateHint` | 0–1，来自公开帖归纳的提示值，非官方战绩 API |
| `sources` | `{ platform, title, url }[]`，platform 如 `sample` / `taptap` / `xhs` / `nga` |
| `core` | 核心棋子 id 列表 |
| `units` | 完整阵容棋子 id 列表 |
| `priority` | 检索/拉高优先级 |
| `notes` | 运营向备注 |

共享类型放在 `packages/meta-schema`，publisher 与 mobile 共用。

---

## 4. 匹配算法（全本地）

对每个候选阵容计算匹配分，再排序输出 Top 3。

| 因子 | 规则 |
|------|------|
| 单位重合 | `owned ∩ units` 加权；`core` 命中额外加权 |
| 缺失成本 | 未拥有的 `priority` / `core` 按费用惩罚 |
| 强度档 | `tier`（S/A/B）小幅加成 |
| 胜率提示 | `winRateHint` 小幅加成 |

**输出：**

1. 最贴近阵容 Top 3（匹配分、已有/缺失列表）。
2. 下一步建议：优先拿的棋子；可考虑卖掉的偏离子棋。
3. 羁绊进度：按当前点选与 `traits.breakpoints` 粗算。

约束：计算不依赖网络；仅 meta 同步走网络。目标延迟 &lt; 50ms（常见阵容数量级）。

---

## 5. 客户端交互

| 页面 | 行为 |
|------|------|
| 点选台 | 按费用分栏；点选加入/取消；显示已选数量 |
| 推荐面板 | 点选变化即时重算 Top3、缺失、下一步 |
| 阵容库 | 浏览全部阵容；详情含 core、完整名单、来源、备注 |
| 设置 | Meta URL、「立即更新」、上次同步时间与 version；失败沿用缓存并提示 |

- 无网首次：包内 sample 兜底。
- 有缓存：启动先读本地，后台静默拉取；`version` 变化再替换。
- UI 文案标明：学习/复盘，手动点选，非游戏内挂接。

---

## 6. 发布服务

| 接口 | 作用 |
|------|------|
| `GET /health` | 存活检查 |
| `GET /v1/meta` | 完整 meta；`ETag`、`Cache-Control`；支持 `If-None-Match` → 304 |
| `POST /v1/admin/reload` | Bearer token 校验后热加载磁盘 JSON |

- 环境变量：`DATA_PATH`、`ADMIN_TOKEN`、`PORT`。
- 部署建议：阿里云 + pm2/systemd + Nginx HTTPS。
- 日志：拉取次数与版本；不收集用户阵容。

---

## 7. 后续爬虫约定（非首版实现）

- 目录：`apps/publisher/adapters/` 下 `taptap` / `xhs` / `nga` 空壳。
- 输出：`data/live/bundle.json`（或与 `DATA_PATH` 一致），调用 reload。
- 优先级：TapTap → 小红书 → NGA。
- 各适配器须独立遵守平台条款；本设计不包含反爬绕过。

---

## 8. 技术选型

| 层 | 选型 |
|----|------|
| 移动端 | Expo（React Native），Android APK |
| 发布服务 | Node.js（建议 TypeScript） |
| 共享类型 | `packages/meta-schema` |
| 包管理 | pnpm workspace |

---

## 9. 成功标准（首版）

1. 可在 Android 平板安装 APK，完成点选 → 推荐全流程。
2. 发布服务可用示例数据提供 `/v1/meta`；客户端可配置 URL 并更新缓存。
3. 本地匹配在点选后可感知即时（&lt; 50ms 量级）。
4. Schema 稳定，后续爬虫只需写文件即可接入。
5. 文档说明使用方式、数据字段、部署与「非游戏挂接」边界。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 示例数据与真赛季不符 | Schema 可替换；`setId` 标明 sample |
| 爬虫源不稳定 / 违规 | 首版不实现；正式接入前合规评估 |
| 平板无网 | 包内 sample + 本地缓存 |
| Meta URL 配错 | 设置页校验 `/health` 与 JSON 结构 |

---

## 11. 已确认决策摘要

- 平台：Android 平板 APK。
- 数据：先示例跑通；自动化拉取公开稳定 JSON/API。
- 范围：客户端 + 轻量发布服务；爬虫后补。
- 技术：Expo + Node publisher（方案 1）。
- 规划源：TapTap → 小红书 → NGA（仅约定）。
