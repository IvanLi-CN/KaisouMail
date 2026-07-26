#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/brand/generated/social"
SOCIAL_DESIGN_SOURCE = OUTPUT / "github-social-preview-design-source.png"
SOCIAL_BACKGROUND_SOURCE = OUTPUT / "github-social-preview-background-source.png"
SOCIAL_BACKGROUND = OUTPUT / "github-social-preview-background.png"
SOCIAL_FINAL = OUTPUT / "github-social-preview.png"
SOCIAL_FIDELITY_REPORT = OUTPUT / "github-social-preview.fidelity.json"
POSTER_DESIGN_SOURCE = OUTPUT / "poster-4x5-design-source.png"
POSTER_FINAL = OUTPUT / "poster-4x5.png"
POSTER_FIDELITY_REPORT = OUTPUT / "poster-4x5.fidelity.json"

SOCIAL_SIZE = (1280, 640)
POSTER_SIZE = (2160, 2700)
RESAMPLING = Image.Resampling.LANCZOS


def require_image(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"missing required ImageGen asset: {path}")
    return Image.open(path).convert("RGB")


def normalize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    if image.width * size[1] != image.height * size[0]:
        raise ValueError(
            f"source aspect ratio {image.width}x{image.height} does not match "
            f"target {size[0]}x{size[1]}"
        )
    return image.resize(size, RESAMPLING)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, report: dict[str, object]) -> None:
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


def generate_social_preview() -> dict[str, object]:
    approved_reference = normalize(
        require_image(SOCIAL_DESIGN_SOURCE), SOCIAL_SIZE
    )
    normalized_background = normalize(
        require_image(SOCIAL_BACKGROUND_SOURCE), SOCIAL_SIZE
    )

    normalized_background.save(SOCIAL_BACKGROUND, format="PNG", optimize=True)
    approved_reference.save(SOCIAL_FINAL, format="PNG", optimize=True)

    delivered = Image.open(SOCIAL_FINAL).convert("RGB")
    difference = ImageChops.difference(approved_reference, delivered)
    changed_pixels = sum(
        pixel != (0, 0, 0) for pixel in difference.getdata()
    )
    if changed_pixels:
        raise RuntimeError(
            f"fidelity check failed: {changed_pixels} pixels differ from approved design"
        )

    report = {
        "approved_design": SOCIAL_DESIGN_SOURCE.name,
        "approved_design_sha256": sha256(SOCIAL_DESIGN_SOURCE),
        "final_asset": SOCIAL_FINAL.name,
        "final_asset_sha256": sha256(SOCIAL_FINAL),
        "normalized_size": f"{SOCIAL_SIZE[0]}x{SOCIAL_SIZE[1]}",
        "resampling": "LANCZOS",
        "changed_pixels": changed_pixels,
        "total_pixels": SOCIAL_SIZE[0] * SOCIAL_SIZE[1],
        "pixel_match": 1.0,
    }
    write_json(SOCIAL_FIDELITY_REPORT, report)
    return report


def cover_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)), RESAMPLING
    )
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def generate_poster() -> dict[str, object]:
    source = require_image(POSTER_DESIGN_SOURCE)
    background = cover_resize(source, POSTER_SIZE).filter(
        ImageFilter.GaussianBlur(radius=48)
    )
    poster = Image.blend(
        background, Image.new("RGB", POSTER_SIZE, (3, 7, 14)), 0.34
    )

    foreground_height = POSTER_SIZE[1]
    foreground_width = round(source.width * foreground_height / source.height)
    foreground = source.resize(
        (foreground_width, foreground_height), RESAMPLING
    )
    foreground_box = (
        (POSTER_SIZE[0] - foreground_width) // 2,
        0,
        foreground_width,
        foreground_height,
    )
    poster.paste(foreground, foreground_box[:2])
    poster.save(POSTER_FINAL, format="PNG", optimize=True)

    delivered = Image.open(POSTER_FINAL).convert("RGB")
    preserved_region = delivered.crop(
        (
            foreground_box[0],
            foreground_box[1],
            foreground_box[0] + foreground_box[2],
            foreground_box[1] + foreground_box[3],
        )
    )
    difference = ImageChops.difference(foreground, preserved_region)
    changed_pixels = sum(
        pixel != (0, 0, 0) for pixel in difference.getdata()
    )
    if changed_pixels:
        raise RuntimeError(
            f"poster fidelity check failed: {changed_pixels} foreground pixels differ"
        )

    report = {
        "approved_design": POSTER_DESIGN_SOURCE.name,
        "approved_design_sha256": sha256(POSTER_DESIGN_SOURCE),
        "final_asset": POSTER_FINAL.name,
        "final_asset_sha256": sha256(POSTER_FINAL),
        "source_size": f"{source.width}x{source.height}",
        "final_size": f"{POSTER_SIZE[0]}x{POSTER_SIZE[1]}",
        "foreground_box": (
            f"{foreground_box[0]},{foreground_box[1]},"
            f"{foreground_box[2]}x{foreground_box[3]}"
        ),
        "resampling": "LANCZOS",
        "foreground_changed_pixels": changed_pixels,
        "foreground_total_pixels": foreground_width * foreground_height,
        "foreground_pixel_match": 1.0,
        "background_fill": "same-source blurred extension",
    }
    write_json(POSTER_FIDELITY_REPORT, report)
    return report


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    reports = {
        "github_social_preview": generate_social_preview(),
        "poster_4x5": generate_poster(),
    }
    print(json.dumps(reports, indent=2))


if __name__ == "__main__":
    main()
