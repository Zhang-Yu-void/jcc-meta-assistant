# 阿里云部署指南

## 1. 拉取代码

```bash
git clone https://github.com/Zhang-Yu-void/jcc-meta-assistant.git
cd jcc-meta-assistant
pnpm install
```

## 2. 环境变量（`/etc/jcc-meta.env`）

```bash
DATA_PATH=/opt/jcc-meta-assistant/data/live/bundle.json
ADMIN_TOKEN=your-strong-secret
PORT=8787

# 爬虫
TAPTAP_GROUP_ID=213275
NGA_FID=510461
NGA_COOKIE=          # 从浏览器复制，NGA 403 时必填
XHS_COOKIE=          # 从浏览器复制，启用小红书源
XHS_KEYWORD="金铲铲之战 阵容"
PUBLISHER_RELOAD_URL=http://127.0.0.1:8787/v1/admin/reload
CRAWLER_RATE_MS=1000
```

## 3. 启动发布服务（pm2）

```bash
export $(grep -v '^#' /etc/jcc-meta.env | xargs)
pm2 start "pnpm --filter @jcc/publisher start" --name jcc-publisher --cwd /opt/jcc-meta-assistant
pm2 save
```

Nginx 反代示例：

```nginx
location /v1/ {
  proxy_pass http://127.0.0.1:8787;
}
```

## 4. 定时爬虫（cron）

**推荐（本机 Mac）：** Playwright 登录后一键抓正文并推阿里云：

```bash
# 首次 / 收到过期邮件后：扫码登录 + 同步服务器 + 推送阵容
./scripts/xhs-login-sync.sh

# 随时查看登录是否有效（无效会发邮件，冷却默认 6 小时）
pnpm xhs:check

# 定时巡检（建议写入 Mac crontab，每小时）
# 0 * * * * cd /path/to/jcc-meta-assistant && ./scripts/xhs-watch.sh >>/tmp/xhs-watch.log 2>&1
```

会话：`data/xhs/storageState.json`；状态：`data/xhs/status.json`（会 scp 到服务器，纳入健康监测）。

可选：`XHS_DETAIL_LIMIT=10`、`XHS_HEADED=1`、`XHS_EMAIL_COOLDOWN_MIN=360`、`XHS_AUTO_PUSH=0`（登录后不自动推送）。

**服务器 cron（降级，仅 TapTap/签名头，无 Playwright 正文）：**

```cron
*/30 * * * * cd /opt/jcc-meta-assistant && set -a && . /etc/jcc-meta.env && set +a && ./scripts/crawl-and-publish.sh >> /var/log/jcc-crawl.log 2>&1
```

## 5. 客户端配置

平板 **设置** → Meta URL（当前服务器经 Nginx `:8084` 反代）：

```
http://8.141.20.44:8084/jcc/v1/meta
```

本机直连（仅服务器内）：`http://127.0.0.1:8787/v1/meta`

## 5.1 健康监测

已并入 `/opt/ruoyi/monitor/health-report.sh` 的 HTTP 探活：

- `http://127.0.0.1:8787/health` — JCC Meta Publisher
- `http://127.0.0.1:8084/jcc/health` — Nginx `/jcc/` 反代

## 6. 小红书 / NGA 凭证

**小红书（推荐 Playwright，见 §4）：** 无需手抄 `x-s`。

**小红书（降级 signed）：** Network → `search/notes` 复制 Cookie + `x-s` / `x-s-common` / `x-t` 等（签名易过期）。

**NGA：** 浏览器登录 bbs.nga.cn → 复制 `Cookie` → `NGA_COOKIE`

## 7. 数据源优先级

1. 小红书（本机 Playwright：搜索 + 笔记正文）
2. TapTap 论坛 feed
3. NGA 板块列表

合规提示：请遵守各平台服务条款，控制抓取频率（`CRAWLER_RATE_MS` ≥ 800）。