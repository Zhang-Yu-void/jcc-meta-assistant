# 实时识别与 AI 推荐 — 表与三方接口

> 模块域：screenRecognize | API 前缀：`/v1` | 日期：2026-09-04  
> 关联 PRD：[实时识别与AI推荐.md](../PRD/实时识别与AI推荐.md)  
> 关联架构：[实时识别与AI推荐.md](../domains/screenRecognize/实时识别与AI推荐.md)

本仓库无 SQL。主数据为 JSON `MetaBundle`。

## Champion（相对旧包）

| 列名 | 说明 | 类型 |
|------|------|------|
| id | slug | string |
| name | 中文名 | string |
| cost | 1–5，识别费用先验 | int |
| traits | 羁绊中文名 | string[] |
| apiName | 可选 | string，默认 `""` |
| portrait | 可选路径 | string，默认 `""` |
| fingerprint | 24×24 RGB（1728 个数），无头像则为 `[]` | number[] |

旧 bundle 缺 `fingerprint` / `portrait` / `apiName` 时按空默认解析，仍可手动点选。

## 下游

| 下游 | 用途 |
|------|------|
| Community Dragon / 本地 `data/portraits/{id}.png` | crawler `applyPortraitFingerprints` 重算指纹 |
| GET /v1/meta | 下发带指纹的 bundle |
| MediaProjection | 本机抓帧，不上云 |
