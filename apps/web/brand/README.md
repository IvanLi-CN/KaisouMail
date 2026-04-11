# KaisouMail 品牌资产

## 颜色

- Navy: `#242547`
- Cloudflare Orange: `#F48120`
- Deep Background: `#0B1020`

## 目录

- `source/kaisoumail-symbol-source.png`：当前品牌图形源图
- `vendor/Inter-SemiBold.ttf`：用于 wordmark / lockup 的字体
- `generated/`：生成后的完整品牌资产包
- `../public/`：Web 运行时实际使用的站点图标与 manifest

## 重新生成

```bash
bun run brand:generate
```

## 说明

- Symbol 主母版以透明底为准，并已做去白底、去白边与纯平配色清理。
- favicon 使用单独的更紧凑方形母版，以提高 16×16 / 32×32 下的可读性。
- 当前正式交付以 PNG / ICO 为准；symbol 的独立 SVG 仍保留为后续可选优化项。
