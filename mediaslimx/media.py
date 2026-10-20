"""Media inspection and conservative same-format optimization."""
import json
import math
import os
import shutil
import subprocess
from pathlib import Path

from PIL import Image

from . import pdf
from .process_control import run as run_process

IMAGE_EXT = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
CANDIDATES = set(IMAGE_EXT) | {".pdf", ".mp4", ".gif", ".avif", ".heic", ".heif", ".mov", ".mkv", ".webm", ".svg", ".tif", ".tiff", ".bmp"}
QUALITY = {"quality": 90, "balanced": 82, "small": 70}
CRF = {"quality": 20, "balanced": 23, "small": 28}


def run(args, timeout):
    try:
        p = run_process(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                        timeout=timeout, check=False,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    except FileNotFoundError:
        raise ValueError("缺少 FFmpeg/ffprobe：请安装 FFmpeg 并加入 PATH，然后重启")
    except subprocess.TimeoutExpired:
        raise ValueError("媒体处理超时，文件已跳过")
    if p.returncode:
        raise ValueError("媒体解码/编码失败：" + p.stderr.decode("utf-8", "replace")[-600:])
    return p.stdout


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
                           "-show_streams", "-show_format", "-show_chapters", "-of", "json", str(path)], 30))


def inspect(path, suffix):
    suffix = suffix.lower()
    if suffix == ".pdf":
        return pdf.inspect(path)
    if suffix in IMAGE_EXT:
        # PNG verify must run immediately after open, before getexif/load.
        with Image.open(path) as im:
            if im.format != IMAGE_EXT[suffix]:
                raise ValueError("扩展名与真实图片格式不一致")
            if im.width * im.height > 50_000_000:
                raise ValueError("图片超过 5000 万像素的首版内存限制")
            if getattr(im, "n_frames", 1) != 1:
                raise ValueError("暂不支持动图或多页图片")
            im.verify()
        with Image.open(path) as im:
            if im.mode not in {"RGB", "RGBA", "L", "LA", "P"}:
                raise ValueError("暂不支持该图片色彩模式（含 CMYK/高位深）")
            if im.getexif().get(274, 1) != 1:
                raise ValueError("含 EXIF 旋转，暂跳过以避免方向变化")
            info = {"kind": "image", "format": im.format, "width": im.width, "height": im.height,
                    "mode": im.mode}
            im.load()
        return info
    if suffix != ".mp4":
        raise ValueError("第一版不支持该格式（仅 JPG、PNG、静态 WebP、普通 MP4 和可选普通 PDF）")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise ValueError("MP4 需要 FFmpeg/ffprobe，请安装并加入 PATH")
    data = probe(path)
    streams = data.get("streams", [])
    v = [s for s in streams if s["codec_type"] == "video"]
    a = [s for s in streams if s["codec_type"] == "audio"]
    if len(v) != 1 or len(a) > 1 or len(streams) != len(v) + len(a) or data.get("chapters"):
        raise ValueError("暂不支持多视频/多音轨/字幕/附件/章节等复杂流")
    s = v[0]
    if s.get("codec_name") != "h264" or s.get("pix_fmt") != "yuv420p":
        raise ValueError("MP4 仅支持 H.264 8 位 yuv420p SDR 视频（不支持透明/HDR）")
    if s.get("color_transfer") in {"smpte2084", "arib-std-b67"} or s.get("color_primaries") == "bt2020" or s.get("color_space") in {"bt2020nc", "bt2020c"}:
        raise ValueError("暂不支持 HDR/BT.2020 视频")
    for side in s.get("side_data_list", []):
        if side.get("rotation", 0) or any(k in side.get("side_data_type", "").lower() for k in ("mastering", "content light", "dovi", "hdr", "encryption")):
            raise ValueError("暂不支持旋转或 HDR side data")
    if int(s.get("tags", {}).get("rotate", 0)) or s.get("disposition", {}).get("attached_pic"):
        raise ValueError("暂不支持旋转/封面视频流")
    if a and a[0].get("codec_name") != "aac":
        raise ValueError("MP4 音轨仅支持 AAC，避免静默转换音频")
    w, h = s.get("width", 0), s.get("height", 0)
    duration = float(data.get("format", {}).get("duration", 0))
    try:
        num, den = s.get("avg_frame_rate", "0/1").split("/")
        fps = float(num) / float(den)
    except (ValueError, ZeroDivisionError):
        fps = 0
    if not w or not h or w % 2 or h % 2 or not math.isfinite(duration) or duration <= 0 or not 0 < fps <= 240:
        raise ValueError("MP4 尺寸需为正偶数，时长/帧率必须有效且帧率不超过 240")
    if "mp4" not in data.get("format", {}).get("format_name", ""):
        raise ValueError("真实容器不是 MP4")
    return {"kind": "video", "format": "MP4", "width": w, "height": h, "duration": duration,
            "codec": "h264", "pixel_format": "yuv420p", "audio": "aac" if a else "无",
            "audio_channels": a[0].get("channels") if a else 0, "fps": fps}


def dimensions(info, params):
    w, h = info["width"], info["height"]
    ratio = min(1, (params.get("max_width") or w) / w, (params.get("max_height") or h) / h)
    nw, nh = max(1, int(w * ratio)), max(1, int(h * ratio))
    if info["kind"] == "video":
        nw, nh = max(2, nw // 2 * 2), max(2, nh // 2 * 2)
    return nw, nh


def optimize(source, dest, info, params):
    if info["kind"] == "document":
        return pdf.optimize(source, dest, info, params)
    size = dimensions(info, params)
    preset = params["preset"]
    if info["kind"] == "image":
        with Image.open(source) as im:
            extras = {k: im.info[k] for k in ("icc_profile", "exif", "dpi") if im.info.get(k)}
            if im.info.get("xmp") and im.format == "WEBP":
                extras["xmp"] = im.info["xmp"]
            png_text = dict(getattr(im, "text", {}))
            if im.format == "PNG" and "transparency" in im.info:
                extras["transparency"] = im.info["transparency"]
            if size != im.size:
                if im.mode == "P":
                    im = im.convert("RGBA" if "transparency" in im.info else "RGB")
                    extras.pop("transparency", None)
                im = im.resize(size, Image.Resampling.LANCZOS)
            opts = dict(extras)
            if info["format"] == "JPEG":
                opts.update(quality=QUALITY[preset], optimize=True, progressive=True, subsampling=0 if preset == "quality" else 2)
            elif info["format"] == "WEBP":
                opts.pop("dpi", None)
                opts.update(quality=QUALITY[preset], method=6)
            else:
                from PIL.PngImagePlugin import PngInfo
                pnginfo = PngInfo()
                for key, value in png_text.items():
                    pnginfo.add_text(key, value)
                opts.update(optimize=True, compress_level=9, pnginfo=pnginfo)
            im.save(dest, format=info["format"], **opts)
        return {"encoder": "Pillow", "quality": QUALITY[preset] if info["format"] != "PNG" else "lossless",
                "size": list(size), "preset": preset}
    args = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", str(source),
            "-map", "0:v:0", "-map", "0:a:0?", "-map_metadata", "0",
            "-c:v", "libx264", "-crf", str(CRF[preset]), "-preset", "medium", "-pix_fmt", "yuv420p",
            "-threads", "2", "-c:a", "copy", "-movflags", "+faststart"]
    if size != (info["width"], info["height"]):
        args += ["-vf", f"scale={size[0]}:{size[1]}"]
    args.append(str(dest))
    run(args, 1800)
    # Full decoding validates packets, rather than only trusting an MP4 header.
    run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-protocol_whitelist", "file,pipe",
         "-i", str(dest), "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"], 1800)
    return {"encoder": "libx264", "crf": CRF[preset], "encoder_preset": "medium", "audio": "copy",
            "size": list(size), "preset": preset}


def validate_result(path, suffix, source_info, params):
    if source_info["kind"] == "document":
        return pdf.validate_result(path, source_info, params)
    result = inspect(path, suffix)
    if (result["width"], result["height"]) != dimensions(source_info, params):
        raise ValueError("输出尺寸验证不通过")
    if result["kind"] == "video":
        if abs(result["duration"] - source_info["duration"]) > max(0.25, 2 / source_info["fps"]):
            raise ValueError("输出视频时长变化超出容差")
        if result["audio"] != source_info["audio"] or result["audio_channels"] != source_info["audio_channels"]:
            raise ValueError("输出音轨验证不通过")
    return result
