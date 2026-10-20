"""Generate original, synthetic demo media in a NEW directory.

These fixtures demonstrate behavior, never real website savings. Pillow and
pikepdf belong to the existing development environment; FFmpeg is used only to
make the input video. No third-party photos, fonts or footage are downloaded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

from PIL import Image, ImageDraw, ImageFont
import pikepdf


def font(size: int, bold: bool = False):
    # This system font is rendered into fixtures, not copied into the product.
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(name, size)


def artwork(width: int, height: int, variant: int = 0) -> Image.Image:
    """A restrained editorial composition, all geometry generated here."""
    image = Image.new("RGB", (width, height), "#15181D")
    draw = ImageDraw.Draw(image)
    scale = width / 2400
    mint, pale, muted = "#B4EDC6", "#EDF1F5", "#A0AAB7"
    x = int(112 * scale)
    draw.text((x, int(95 * scale)), "MEDIA / SYNTHETIC STUDY", font=font(max(16, int(30 * scale))), fill=muted)
    for offset in range(6):
        left = int((1080 + offset * 120) * scale)
        top = int((180 + offset * 75) * scale)
        size = int((780 - offset * 65) * scale)
        draw.rounded_rectangle((left, top, left + size, top + size), radius=int(70 * scale), fill=mint if offset % 2 == 0 else "#273E34", outline=mint, width=max(1, int(3 * scale)))
    heading = ["Less weight.", "More space.", "Keep moving."][variant % 3]
    draw.text((x, int(height * .40)), heading, font=font(max(20, int(124 * scale)), True), fill=pale)
    draw.text((x, int(height * .59)), "MediaSlim X", font=font(max(18, int(52 * scale))), fill=mint)
    draw.line((x, height - int(170 * scale), width - x, height - int(170 * scale)), fill="#333C47", width=max(1, int(3 * scale)))
    draw.text((x, height - int(125 * scale)), "SELF-GENERATED DEMO / NOT A REAL WEBSITE", font=font(max(13, int(25 * scale))), fill=muted)
    draw.text((width - int(360 * scale), height - int(125 * scale)), "STUDY 0" + str(variant + 1), font=font(max(13, int(25 * scale))), fill=muted)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, required=True, help="A new absolute directory; never overwritten")
    parser.add_argument("--ffmpeg", default=shutil.which("ffmpeg"))
    args = parser.parse_args()
    root = args.dest
    if not root.is_absolute():
        parser.error("--dest must be absolute")
    if not args.ffmpeg:
        parser.error("FFmpeg is required to generate the synthetic input video")
    root.mkdir(parents=True, exist_ok=False)
    for directory in ("website", "galleries", "videos", "downloads"):
        (root / directory).mkdir()
    hero = artwork(2400, 1500)
    hero.save(root / "website" / "hero.jpg", quality=95, subsampling=0)
    artwork(1600, 1000, 1).save(root / "galleries" / "detail.jpg", quality=95, subsampling=0)
    artwork(1600, 1000, 2).save(root / "galleries" / "studio.webp", quality=95)
    card = Image.new("RGBA", (1440, 960), (21, 24, 29, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((70, 70, 1370, 890), radius=70, fill="#B4EDC6")
    draw.text((130, 155), "A little lighter", fill="#14271B", font=font(85, True))
    draw.text((130, 680), "SYNTHETIC DEMO / ALPHA PNG", fill="#246C48", font=font(34))
    draw.ellipse((820, 360, 1210, 750), outline="#246C48", width=20)
    card.save(root / "galleries" / "card.png", compress_level=6)
    # Animate our own artwork; no stock footage, user media or fake progress.
    subprocess.run([
        args.ffmpeg, "-nostdin", "-v", "error", "-loop", "1", "-i", str(root / "website" / "hero.jpg"),
        "-vf", "scale=1920:1200,zoompan=z='min(zoom+0.0007,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=200:s=1280x800:fps=25,format=yuv420p",
        "-t", "8", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-threads", "2",
        "-movflags", "+faststart", str(root / "videos" / "intro.mp4"),
    ], check=True)
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(720, 960))
    # A valid, ordinary vector PDF; do not inflate it to manufacture a ratio.
    page.Contents = pdf.make_stream(b"q 0.082 0.094 0.114 rg 0 0 720 960 re f 0.706 0.929 0.776 rg 70 100 580 760 re f 0.082 0.094 0.114 rg 130 180 460 600 re f Q\n")
    pdf.docinfo["/Title"] = "MediaSlim X - self-generated demo"
    pdf.save(root / "downloads" / "guide.pdf")
    pdf.close()
    entries = []
    for item in sorted(root.rglob("*")):
        if item.is_file():
            data = item.read_bytes()
            entries.append({"relative": item.relative_to(root).as_posix(), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    manifest = {"synthetic": True, "description": "Original, self-generated demo media; not a real website or a performance benchmark.", "files": entries}
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
