# 小红书本机 Playwright 抓取设计

日期：2026-08-31  
状态：已批准（方案 ① + 本机一键推送）

## 背景

手抄 `x-s` / Cookie 易过期；搜索列表只有标题，无法可靠抽英雄与阵容。决定在 **本机 Mac** 用真实浏览器完成登录保活与正文抓取，再一键推到阿里云 publisher。

## 目标

1. 一次扫码登录，会话持久化；日常爬取不再手抄签名。
2. 搜索后进入前 N 条笔记，拿到正文 `desc`（及标题），再解析阵容。
3. 产出 `data/live/bundle.json` 并 scp + reload 到阿里云。

## 非目标（本期）

- 不保存小红书明文密码、不做账密自动登录。
- 不在阿里云跑无头浏览器。
- 不做图片 OCR。
- 不改平板客户端。

## 架构

```
Mac:
  pnpm xhs:login     → Playwright 有头浏览器 → data/xhs/storageState.json
  pnpm xhs:crawl     → 复用 storageState
                     → 搜 keyword → 拦截 search/notes
                     → 打开 Top N 笔记 → 拦截 feed/note 详情 → body=desc
                     → 与 taptap/nga 合并 → data/live/bundle.json
  scripts/crawl-and-push-aliyun.sh
                     → scp bundle → ssh reload

Aliyun:
  jcc-publisher 读 live bundle（不变）
```

## 命令与配置

| 命令 | 作用 |
|------|------|
| `pnpm xhs:login` | 打开浏览器登录，保存 storageState |
| `pnpm xhs:crawl` | Playwright 拉搜索+正文并写入 live bundle |
| `./scripts/crawl-and-push-aliyun.sh` | crawl（含 XHS playwright）+ 推送阿里云 |

环境变量：

- `XHS_KEYWORD`（默认「金铲铲之战 阵容」）
- `XHS_MODE=playwright`（本机默认）| `signed`（旧签名头，可选保留）
- `XHS_DETAIL_LIMIT`（默认 10）
- `XHS_STORAGE_STATE`（默认 `data/xhs/storageState.json`）
- `XHS_HEADED=1`（登录默认有头；crawl 可 headless）
- 推送：`ALIYUN_HOST=aliyun`、`ALIYUN_DATA_PATH=/opt/jcc-meta-assistant/data/live/bundle.json`、现有 `ADMIN_TOKEN` / reload URL

`data/xhs/` 加入 `.gitignore`。

## 抓取流程（Playwright）

1. `chromium.launchPersistentContext` 或 `browser.newContext({ storageState })`。
2. 打开搜索 URL；`page.waitForResponse` 匹配 `search/notes`，解析 items。
3. 按 engagement 排序，取前 `XHS_DETAIL_LIMIT` 条。
4. 对每条：`goto explore/{id}?xsec_token=...`，等待含 `desc` 的 note/feed JSON（或 DOM `#detail-desc` 兜底），写入 `RawPostHint.body`。
5. 限速与现有 `CRAWLER_RATE_MS` 对齐；单条失败记 warning 继续。
6. 登录失效（跳转登录页 / API 未登录）：明确报错「请运行 pnpm xhs:login」。

## 解析

- 沿用 `parsePostHint`；正文进入后 `extractChampionNames` / `extractUnitsByTraits` 命中率提升。
- 可选：同一笔记内多段「【阵容名】」拆多条 hint（本期若实现成本低则做，否则单帖单 hint）。

## 推送

```bash
scp data/live/bundle.json aliyun:/opt/jcc-meta-assistant/data/live/bundle.json
ssh aliyun 'curl -sf -X POST .../v1/admin/reload -H "Authorization: Bearer $ADMIN_TOKEN"'
```

服务器侧 cron 的纯 HTTP 小红书抓取可保留为降级，但文档标明 **推荐本机 Playwright 推送**。

## 成功标准

- 登录一次后，`xhs:crawl` 无需手抄签名。
- live bundle 中至少若干 composition 的 `units` 来自正文英雄名（非仅羁绊猜测）。
- `crawl-and-push-aliyun.sh` 后 `http://8.141.20.44:8084/jcc/v1/meta` 版本更新。

## 风险

- 小红书改版导致选择器/API 路径变化 → 以 response URL 匹配为主、DOM 兜底。
- storageState 过期 → 提示重新 login。
- 过快打开详情触发风控 → 限速 + 限制 N。
