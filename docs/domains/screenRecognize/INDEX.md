# screenRecognize

实时识别、头像指纹匹配、本地阵容推荐。

## 代码结构

- `packages/meta-schema` — bundle 契约（fingerprint 默认空）
- `packages/screen-match` — 裁剪、24×24 NCC、HSV、费用先验、帧投票
- `apps/crawler/src/fingerprints.ts` — 肖像 PNG 重算指纹
- `apps/mobile/modules/jcc-screen-recognize` — MediaProjection + MatchEngine

## 需求分析与修复日志

| 日期 | 需求编号 | 需求名称 | 类型 | 修复人 | 简要说明 | 方案文档 |
|------|----------|----------|------|--------|----------|----------|
| 2026-09-04 | REQ-META-001 | 精准快速识别 | 需求 | zhangyu10 | 24×24 NCC + 费用先验 + 两帧投票 | [实时识别与AI推荐.md](实时识别与AI推荐.md) |

最后更新：2026-09-04
