# Crawler Adapters (v1 stubs)

Future adapters will crawl third-party platforms and produce a validated `MetaBundle` JSON file.

## Priority order

1. **TapTap** (`taptap.ts`) — primary source
2. **小红书 / XHS** (`xhs.ts`) — secondary
3. **NGA** (`nga.ts`) — tertiary

## Output path

Adapters write merged results to:

```
data/live/bundle.json
```

After updating the bundle on disk, trigger a hot reload:

```bash
curl -X POST http://localhost:8787/v1/admin/reload \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

## Compliance

Crawlers must respect each platform's Terms of Service, robots.txt, and rate limits. Do not scrape authenticated or paywalled content without explicit permission. This project is for personal/educational use; production deployments need legal review.
