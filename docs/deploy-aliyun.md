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
XHS_KEYWORD=金铲铲之战 阵容
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

每 30 分钟抓取并热更新：

```cron
*/30 * * * * cd /opt/jcc-meta-assistant && set -a && . /etc/jcc-meta.env && set +a && ./scripts/crawl-and-publish.sh >> /var/log/jcc-crawl.log 2>&1
```

## 5. 客户端配置

平板 **设置** → Meta URL：

```
https://你的域名/v1/meta
```

## 6. Cookie 获取

**NGA：** 浏览器登录 bbs.nga.cn → 开发者工具 → Network → 任意请求 → 复制 `Cookie` 头到 `NGA_COOKIE`

**小红书：** 登录 xiaohongshu.com → 同样复制 Cookie 到 `XHS_COOKIE`（会过期，需定期更新）

## 7. 数据源优先级

1. TapTap 论坛 feed（公开 API，默认可用）
2. 小红书搜索（需 Cookie）
3. NGA 板块列表（需 Cookie 或访客通过）

合规提示：请遵守各平台服务条款，控制抓取频率（`CRAWLER_RATE_MS` ≥ 800）。
