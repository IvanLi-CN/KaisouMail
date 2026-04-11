#!/usr/bin/env python3

from __future__ import annotations

import base64
import html
import io
import json
import math
import shutil
import urllib.request
import zipfile
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/brand/source/kaisoumail-symbol-source.png"
BRAND_ROOT = ROOT / "apps/web/brand"
GENERATED = BRAND_ROOT / "generated"
PUBLIC = ROOT / "apps/web/public"
SRC_ASSETS = ROOT / "apps/web/src/assets"
VENDOR = BRAND_ROOT / "vendor"

NAVY = (0x24, 0x25, 0x47)
ORANGE = (0xF4, 0x81, 0x20)
DARK_BG = (0x0B, 0x10, 0x20)
WHITE = (255, 255, 255)

INTER_RELEASE_ZIP = "https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip"
INTER_TTF = VENDOR / "Inter-SemiBold.ttf"
INTER_LICENSE = VENDOR / "Inter-LICENSE.txt"


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def fit_alpha(observed: tuple[int, int, int], foreground: tuple[int, int, int]) -> tuple[float, float]:
    numerator = 0.0
    denominator = 0.0
    for observed_channel, foreground_channel in zip(observed, foreground):
        delta = foreground_channel - 255
        numerator += (observed_channel - 255) * delta
        denominator += delta * delta
    alpha = 0.0 if denominator == 0 else numerator / denominator
    alpha = max(0.0, min(1.0, alpha))
    predicted = tuple(255 + alpha * (channel - 255) for channel in foreground)
    error = sum(abs(channel - predicted_channel) for channel, predicted_channel in zip(observed, predicted))
    return alpha, error


def recover_symbol_rgba(source_image: Image.Image) -> Image.Image:
    source = source_image.convert("RGB")
    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    source_pixels = source.load()
    output_pixels = output.load()

    for y in range(source.height):
        for x in range(source.width):
            rgb = source_pixels[x, y]
            background_error = sum(abs(channel - 255) for channel in rgb)
            candidates: list[tuple[float, float, tuple[int, int, int]]] = []
            for foreground in (NAVY, ORANGE):
                alpha, error = fit_alpha(rgb, foreground)
                candidates.append((error, alpha, foreground))

            error, alpha, foreground = min(candidates, key=lambda item: item[0])
            if (alpha < 0.035 and background_error < 18) or alpha < 0.015:
                output_pixels[x, y] = (0, 0, 0, 0)
                continue

            opacity = int(round(alpha * 255))
            if opacity < 4:
                output_pixels[x, y] = (0, 0, 0, 0)
                continue

            output_pixels[x, y] = (*foreground, opacity)

    return output


def pad_crop_by_alpha(image: Image.Image, padding: int) -> Image.Image:
    alpha_bbox = image.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise RuntimeError("symbol alpha bbox is empty")
    left, top, right, bottom = alpha_bbox
    cropped = image.crop((left, top, right, bottom))
    padded = Image.new("RGBA", (cropped.width + padding * 2, cropped.height + padding * 2), (0, 0, 0, 0))
    padded.alpha_composite(cropped, (padding, padding))
    return padded


def crop_to_alpha(image: Image.Image, padding: int = 0) -> Image.Image:
    alpha_bbox = image.getchannel("A").getbbox()
    if alpha_bbox is None:
        raise RuntimeError("image alpha bbox is empty")
    left, top, right, bottom = alpha_bbox
    cropped = image.crop((left, top, right, bottom))
    if padding <= 0:
        return cropped
    padded = Image.new(
        "RGBA",
        (cropped.width + padding * 2, cropped.height + padding * 2),
        (0, 0, 0, 0),
    )
    padded.alpha_composite(cropped, (padding, padding))
    return padded


def extract_color_mask(image: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    rgba = image.convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    mask_pixels = mask.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = rgba.getpixel((x, y))
            if a and (r, g, b) == color:
                mask_pixels[x, y] = a
    return mask


def recolor_brand_image(
    image: Image.Image,
    primary_color: tuple[int, int, int],
    accent_color: tuple[int, int, int] = ORANGE,
) -> Image.Image:
    rgba = image.convert("RGBA")
    output = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    output_pixels = output.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, alpha = rgba.getpixel((x, y))
            if alpha == 0:
                continue
            color = accent_color if (r, g, b) == ORANGE else primary_color
            output_pixels[x, y] = (*color, alpha)
    return output


def resize_brand_image(
    image: Image.Image,
    size: tuple[int, int],
    primary_color: tuple[int, int, int] = NAVY,
    accent_color: tuple[int, int, int] = ORANGE,
) -> Image.Image:
    navy_mask = extract_color_mask(image, NAVY).resize(size, Image.Resampling.LANCZOS)
    orange_mask = extract_color_mask(image, ORANGE).resize(size, Image.Resampling.LANCZOS)
    output = Image.new("RGBA", size, (0, 0, 0, 0))
    output_pixels = output.load()
    navy_pixels = navy_mask.load()
    orange_pixels = orange_mask.load()
    for y in range(size[1]):
        for x in range(size[0]):
            navy_alpha = navy_pixels[x, y]
            orange_alpha = orange_pixels[x, y]
            alpha = max(navy_alpha, orange_alpha)
            if alpha == 0:
                continue
            color = accent_color if orange_alpha > navy_alpha else primary_color
            output_pixels[x, y] = (*color, alpha)
    return output


def fit_into_canvas(
    image: Image.Image,
    canvas_size: tuple[int, int],
    width_ratio: float,
    primary_color: tuple[int, int, int] = NAVY,
    accent_color: tuple[int, int, int] = ORANGE,
) -> Image.Image:
    canvas_width, canvas_height = canvas_size
    scale = (canvas_width * width_ratio) / image.width
    target_size = (int(round(image.width * scale)), int(round(image.height * scale)))
    resized = resize_brand_image(image, target_size, primary_color, accent_color)
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    offset = ((canvas_width - target_size[0]) // 2, (canvas_height - target_size[1]) // 2)
    canvas.alpha_composite(resized, offset)
    return canvas


def composite_preview(image: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    preview = Image.new("RGBA", image.size, (*background, 255))
    preview.alpha_composite(image)
    return preview


def write_png(image: Image.Image, path: Path) -> None:
    ensure_dir(path.parent)
    image.save(path, optimize=True)


def write_multi_icon_ico(source: Image.Image, path: Path, sizes: Iterable[int]) -> None:
    ensure_dir(path.parent)
    source.save(path, format="ICO", sizes=[(size, size) for size in sizes])


def download_inter_if_needed() -> Path:
    ensure_dir(VENDOR)
    if INTER_TTF.exists() and INTER_LICENSE.exists():
        return INTER_TTF

    with urllib.request.urlopen(INTER_RELEASE_ZIP) as response:
        archive_data = response.read()

    archive = zipfile.ZipFile(io.BytesIO(archive_data))
    with archive.open("extras/ttf/Inter-SemiBold.ttf") as font_file:
        INTER_TTF.write_bytes(font_file.read())
    with archive.open("LICENSE.txt") as license_file:
        INTER_LICENSE.write_bytes(license_file.read())

    return INTER_TTF


def render_text_png(text: str, font_path: Path, font_size: int, fill: tuple[int, int, int]) -> Image.Image:
    font = ImageFont.truetype(str(font_path), font_size)
    probe = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    draw = ImageDraw.Draw(probe)
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    padding_x = max(48, font_size // 4)
    padding_y = max(40, font_size // 4)
    image = Image.new("RGBA", (width + padding_x * 2, height + padding_y * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.text((padding_x - bbox[0], padding_y - bbox[1]), text, font=font, fill=(*fill, 255))
    return image


def render_lockup_png(
    symbol_image: Image.Image,
    text: str,
    font_path: Path,
    font_size: int,
    text_fill: tuple[int, int, int],
    symbol_primary_color: tuple[int, int, int] = NAVY,
    symbol_accent_color: tuple[int, int, int] = ORANGE,
) -> Image.Image:
    font = ImageFont.truetype(str(font_path), font_size)
    probe = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    draw = ImageDraw.Draw(probe)
    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]

    symbol_target_height = max(int(round(text_height * 1.28)), 180)
    scale = symbol_target_height / symbol_image.height
    symbol_resized = resize_brand_image(
        symbol_image,
        (int(round(symbol_image.width * scale)), symbol_target_height),
        primary_color=symbol_primary_color,
        accent_color=symbol_accent_color,
    )

    gap = max(56, font_size // 3)
    padding_x = 72
    padding_y = 56
    canvas_height = max(symbol_resized.height, text_height) + padding_y * 2
    canvas_width = symbol_resized.width + gap + text_width + padding_x * 2
    canvas = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))

    symbol_y = (canvas_height - symbol_resized.height) // 2
    canvas.alpha_composite(symbol_resized, (padding_x, symbol_y))

    text_x = padding_x + symbol_resized.width + gap
    text_y = (canvas_height - text_height) // 2 - text_bbox[1]
    draw = ImageDraw.Draw(canvas)
    draw.text((text_x, text_y), text, font=font, fill=(*text_fill, 255))
    return canvas


def svg_font_face(font_path: Path) -> str:
    font_bytes = font_path.read_bytes()
    encoded = base64.b64encode(font_bytes).decode("ascii")
    return (
        "@font-face {"
        "font-family: 'InterEmbedded';"
        "src: url(data:font/ttf;base64,"
        f"{encoded}"
        ") format('truetype');"
        "font-weight: 600;"
        "font-style: normal;"
        "}"
    )


def render_text_svg(text: str, font_path: Path, font_size: int, fill: tuple[int, int, int], output_path: Path) -> None:
    font = ImageFont.truetype(str(font_path), font_size)
    probe = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    draw = ImageDraw.Draw(probe)
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    padding_x = max(48, font_size // 4)
    padding_y = max(40, font_size // 4)
    svg_width = width + padding_x * 2
    svg_height = height + padding_y * 2
    baseline_y = padding_y - bbox[1]
    color = f"rgb({fill[0]} {fill[1]} {fill[2]})"
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" viewBox="0 0 {svg_width} {svg_height}" fill="none">
  <style>
    {svg_font_face(font_path)}
    .word {{
      font-family: 'InterEmbedded', Inter, system-ui, sans-serif;
      font-size: {font_size}px;
      font-weight: 600;
      fill: {color};
    }}
  </style>
  <text class="word" x="{padding_x}" y="{baseline_y}">{html.escape(text)}</text>
</svg>
"""
    ensure_dir(output_path.parent)
    output_path.write_text(svg, encoding="utf-8")


def render_lockup_svg(
    symbol_image: Image.Image,
    text: str,
    font_path: Path,
    font_size: int,
    text_fill: tuple[int, int, int],
    output_path: Path,
    symbol_primary_color: tuple[int, int, int] = NAVY,
    symbol_accent_color: tuple[int, int, int] = ORANGE,
) -> None:
    font = ImageFont.truetype(str(font_path), font_size)
    probe = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
    draw = ImageDraw.Draw(probe)
    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    symbol_target_height = max(int(round(text_height * 1.28)), 180)
    scale = symbol_target_height / symbol_image.height
    symbol_width = int(round(symbol_image.width * scale))
    gap = max(56, font_size // 3)
    padding_x = 72
    padding_y = 56
    svg_height = max(symbol_target_height, text_height) + padding_y * 2
    svg_width = symbol_width + gap + text_width + padding_x * 2
    symbol_y = (svg_height - symbol_target_height) // 2
    baseline_y = (svg_height - text_height) // 2 - text_bbox[1]

    symbol_resized = resize_brand_image(
        symbol_image,
        (symbol_width, symbol_target_height),
        primary_color=symbol_primary_color,
        accent_color=symbol_accent_color,
    )
    buffer = io.BytesIO()
    symbol_resized.save(buffer, format="PNG", optimize=True)
    encoded_symbol = base64.b64encode(buffer.getvalue()).decode("ascii")
    color = f"rgb({text_fill[0]} {text_fill[1]} {text_fill[2]})"

    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{svg_width}" height="{svg_height}" viewBox="0 0 {svg_width} {svg_height}" fill="none">
  <style>
    {svg_font_face(font_path)}
    .word {{
      font-family: 'InterEmbedded', Inter, system-ui, sans-serif;
      font-size: {font_size}px;
      font-weight: 600;
      fill: {color};
    }}
  </style>
  <image href="data:image/png;base64,{encoded_symbol}" x="{padding_x}" y="{symbol_y}" width="{symbol_width}" height="{symbol_target_height}" />
  <text class="word" x="{padding_x + symbol_width + gap}" y="{baseline_y}">{html.escape(text)}</text>
</svg>
"""
    ensure_dir(output_path.parent)
    output_path.write_text(svg, encoding="utf-8")


def create_non_maskable_app_icon(symbol_square: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    radius = int(round(size * 0.22))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=(*DARK_BG, 255))
    symbol_width = int(round(size * 0.72))
    scaled = resize_brand_image(symbol_square, (symbol_width, symbol_width))
    x = (size - symbol_width) // 2
    y = (size - symbol_width) // 2
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def create_maskable_app_icon(symbol_square: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (*DARK_BG, 255))
    symbol_width = int(round(size * 0.65))
    scaled = resize_brand_image(symbol_square, (symbol_width, symbol_width))
    x = (size - symbol_width) // 2
    y = (size - symbol_width) // 2
    canvas.alpha_composite(scaled, (x, y))
    return canvas


def write_manifest(path: Path) -> None:
    manifest = {
        "name": "KaisouMail",
        "short_name": "KaisouMail",
        "start_url": "/",
        "scope": "/",
        "display": "standalone",
        "background_color": "#0B1020",
        "theme_color": "#0B1020",
        "icons": [
            {
                "src": "/android-chrome-192x192.png",
                "sizes": "192x192",
                "type": "image/png",
            },
            {
                "src": "/android-chrome-512x512.png",
                "sizes": "512x512",
                "type": "image/png",
            },
            {
                "src": "/android-chrome-maskable-192x192.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "maskable",
            },
            {
                "src": "/android-chrome-maskable-512x512.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            },
        ],
    }
    ensure_dir(path.parent)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    if not SOURCE.exists():
        raise FileNotFoundError(f"missing source image: {SOURCE}")

    ensure_dir(BRAND_ROOT / "source")
    ensure_dir(GENERATED)
    ensure_dir(PUBLIC)
    ensure_dir(SRC_ASSETS)
    font_path = download_inter_if_needed()

    symbol_dir = GENERATED / "symbol"
    lockup_dir = GENERATED / "lockup"
    web_dir = GENERATED / "web"
    app_dir = GENERATED / "app"
    for directory in (symbol_dir, lockup_dir, web_dir, app_dir):
        ensure_dir(directory)

    source_image = Image.open(SOURCE)
    recovered = recover_symbol_rgba(source_image)
    symbol_master_transparent = pad_crop_by_alpha(recovered, padding=28)
    symbol_master_transparent_on_dark = recolor_brand_image(symbol_master_transparent, WHITE)
    symbol_square = fit_into_canvas(symbol_master_transparent, (1024, 1024), width_ratio=0.86)
    symbol_square_favicon = fit_into_canvas(symbol_master_transparent, (1024, 1024), width_ratio=0.90)
    symbol_square_on_dark = fit_into_canvas(
        symbol_master_transparent,
        (1024, 1024),
        width_ratio=0.86,
        primary_color=WHITE,
    )
    light_preview = composite_preview(symbol_square, WHITE)
    dark_preview = composite_preview(symbol_square, DARK_BG)
    dark_preview_on_dark = composite_preview(symbol_square_on_dark, DARK_BG)

    write_png(symbol_master_transparent, symbol_dir / "kaisoumail-symbol-master-transparent.png")
    write_png(symbol_master_transparent_on_dark, symbol_dir / "kaisoumail-symbol-master-transparent-on-dark.png")
    write_png(symbol_square, symbol_dir / "kaisoumail-symbol-master-square-1024.png")
    write_png(symbol_square_favicon, symbol_dir / "kaisoumail-symbol-favicon-square-1024.png")
    write_png(symbol_square_on_dark, symbol_dir / "kaisoumail-symbol-master-square-on-dark-1024.png")
    write_png(light_preview, symbol_dir / "kaisoumail-symbol-preview-light-1024.png")
    write_png(dark_preview, symbol_dir / "kaisoumail-symbol-preview-dark-1024.png")
    write_png(dark_preview_on_dark, symbol_dir / "kaisoumail-symbol-preview-dark-on-dark-1024.png")

    for size in (16, 32, 48, 64, 128, 180, 192, 512, 1024):
        source_square = symbol_square_favicon if size in (16, 32, 48) else symbol_square
        resized = resize_brand_image(source_square, (size, size))
        write_png(resized, web_dir / f"kaisoumail-icon-transparent-{size}.png")

    favicon_16 = resize_brand_image(symbol_square_favicon, (16, 16))
    favicon_32 = resize_brand_image(symbol_square_favicon, (32, 32))
    write_png(favicon_16, PUBLIC / "favicon-16x16.png")
    write_png(favicon_32, PUBLIC / "favicon-32x32.png")
    write_multi_icon_ico(symbol_square_favicon, web_dir / "favicon.ico", sizes=(16, 32, 48))
    shutil.copy2(web_dir / "favicon.ico", PUBLIC / "favicon.ico")

    non_maskable_1024 = create_non_maskable_app_icon(symbol_square, 1024)
    non_maskable_512 = create_non_maskable_app_icon(symbol_square, 512)
    maskable_1024 = create_maskable_app_icon(symbol_square, 1024)
    maskable_512 = create_maskable_app_icon(symbol_square, 512)
    non_maskable_192 = create_non_maskable_app_icon(symbol_square, 192)
    apple_180 = create_non_maskable_app_icon(symbol_square, 180)
    maskable_192 = create_maskable_app_icon(symbol_square, 192)

    write_png(non_maskable_1024, app_dir / "kaisoumail-app-icon-1024.png")
    write_png(non_maskable_512, app_dir / "kaisoumail-app-icon-512.png")
    write_png(maskable_1024, app_dir / "kaisoumail-app-icon-maskable-1024.png")
    write_png(maskable_512, app_dir / "kaisoumail-app-icon-maskable-512.png")

    write_png(non_maskable_192, PUBLIC / "android-chrome-192x192.png")
    write_png(non_maskable_512, PUBLIC / "android-chrome-512x512.png")
    write_png(maskable_192, PUBLIC / "android-chrome-maskable-192x192.png")
    write_png(maskable_512, PUBLIC / "android-chrome-maskable-512x512.png")
    write_png(apple_180, PUBLIC / "apple-touch-icon.png")
    write_png(symbol_square, PUBLIC / "brand-symbol.png")
    write_png(symbol_square_on_dark, PUBLIC / "brand-symbol-on-dark.png")
    write_png(symbol_square, SRC_ASSETS / "brand-symbol.png")
    write_png(symbol_square_on_dark, SRC_ASSETS / "brand-symbol-on-dark.png")

    render_text_svg("KaisouMail", font_path, 196, NAVY, lockup_dir / "kaisoumail-wordmark-on-light.svg")
    render_text_svg("KaisouMail", font_path, 196, WHITE, lockup_dir / "kaisoumail-wordmark-on-dark.svg")
    write_png(render_text_png("KaisouMail", font_path, 196, NAVY), lockup_dir / "kaisoumail-wordmark-on-light.png")
    write_png(render_text_png("KaisouMail", font_path, 196, WHITE), lockup_dir / "kaisoumail-wordmark-on-dark.png")

    render_lockup_svg(symbol_master_transparent, "KaisouMail", font_path, 176, NAVY, lockup_dir / "kaisoumail-lockup-horizontal-on-light.svg")
    render_lockup_svg(
        symbol_master_transparent,
        "KaisouMail",
        font_path,
        176,
        WHITE,
        lockup_dir / "kaisoumail-lockup-horizontal-on-dark.svg",
        symbol_primary_color=WHITE,
    )
    lockup_light_png = render_lockup_png(
        symbol_master_transparent,
        "KaisouMail",
        font_path,
        176,
        NAVY,
    )
    lockup_dark_png = render_lockup_png(
        symbol_master_transparent,
        "KaisouMail",
        font_path,
        176,
        WHITE,
        symbol_primary_color=WHITE,
    )
    write_png(lockup_light_png, lockup_dir / "kaisoumail-lockup-horizontal-on-light.png")
    write_png(lockup_dark_png, lockup_dir / "kaisoumail-lockup-horizontal-on-dark.png")
    write_png(crop_to_alpha(lockup_light_png), SRC_ASSETS / "brand-lockup-on-light.png")
    write_png(crop_to_alpha(lockup_dark_png), SRC_ASSETS / "brand-lockup-on-dark.png")

    write_manifest(PUBLIC / "site.webmanifest")


if __name__ == "__main__":
    main()
