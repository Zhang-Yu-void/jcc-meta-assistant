# Crawler adapters

Production crawlers live in **`apps/crawler`**. Run:

```bash
pnpm crawl
# or on server:
./scripts/crawl-and-publish.sh
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `TAPTAP_GROUP_ID` | `213275` | 金铲铲 TapTap 论坛 group id |
| `TAPTAP_PAGES` | `3` | Feed pages to fetch |
| `NGA_FID` | `510461` | NGA 金铲铲板块 fid |
| `NGA_COOKIE` | — | Logged-in cookie if guest blocked |
| `XHS_COOKIE` | — | Required for 小红书 search |
| `XHS_KEYWORD` | `金铲铲之战 阵容` | Search keyword |
| `CRAWLER_RATE_MS` | `800` | Min ms between HTTP requests |
| `PUBLISHER_RELOAD_URL` | — | POST reload after crawl |
| `ADMIN_TOKEN` | — | Bearer token for reload |

## Priority

1. TapTap forum feed API  
2. 小红书 search (cookie)  
3. NGA thread list (guest or cookie)

Output: `data/live/bundle.json` → publisher `DATA_PATH`.
