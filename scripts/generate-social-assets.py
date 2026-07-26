#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps/web/brand/generated/social"
DESIGN_SOURCE = OUTPUT / "github-social-preview-design-source.png"
BACKGROUND_SOURCE = OUTPUT / "github-social-preview-background-source.png"
BACKGROUND = OUTPUT / "github-social-preview-background.png"
FINAL = OUTPUT / "github-social-preview.png"
FIDELITY_REPORT = OUTPUT / "github-social-preview.fidelity.json"

SIZE = (1280, 640)
RESAMPLING = Image.Resampling.LANCZOS


def require_image(path: Path) -> Image.Image:
    if not path.exists():
        raise FileNotFoundError(f"missing required ImageGen asset: {path}")
    return Image.open(path).convert("RGB")


def normalize(image: Image.Image) -> Image.Image:
    if image.width * SIZE[1] != image.height * SIZE[0]:
        raise ValueError(
            f"source aspect ratio {image.width}x{image.height} does not match "
            f"target {SIZE[0]}x{SIZE[1]}"
        )
    return image.resize(SIZE, RESAMPLING)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)

    approved_reference = normalize(require_image(DESIGN_SOURCE))
    normalized_background = normalize(require_image(BACKGROUND_SOURCE))

    normalized_background.save(BACKGROUND, format="PNG", optimize=True)
    approved_reference.save(FINAL, format="PNG", optimize=True)

    delivered = Image.open(FINAL).convert("RGB")
    difference = ImageChops.difference(approved_reference, delivered)
    changed_pixels = sum(
        pixel != (0, 0, 0) for pixel in difference.getdata()
    )
    if changed_pixels:
        raise RuntimeError(
            f"fidelity check failed: {changed_pixels} pixels differ from approved design"
        )

    report = {
        "approved_design": DESIGN_SOURCE.name,
        "approved_design_sha256": sha256(DESIGN_SOURCE),
        "final_asset": FINAL.name,
        "final_asset_sha256": sha256(FINAL),
        "normalized_size": f"{SIZE[0]}x{SIZE[1]}",
        "resampling": "LANCZOS",
        "changed_pixels": changed_pixels,
        "total_pixels": SIZE[0] * SIZE[1],
        "pixel_match": 1.0,
    }
    FIDELITY_REPORT.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
