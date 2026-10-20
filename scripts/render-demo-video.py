#!/usr/bin/env python3
"""Render the approved Chinese demo from existing, synthetic-only recordings.

Development tooling only: Python stdlib, Node/Playwright/Chrome, FFmpeg/ffprobe.
The product itself needs no Node runtime. No service is started and no upload is
performed. Run in WSL/Linux using that platform's own tools and paths.

    python3 scripts/render-demo-video.py --raw /absolute/path/to/raw-demo.webm

An optional --output must name a new directory inside .mediaslimx/showcase.
Existing screenshots, approved keyframes and product/user data are read-only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import uuid


ROOT = Path(__file__).resolve().parents[1]
# Cut points were checked against the recording itself, not capture wall-clock
# events. All moving clips run at 1x speed. Holds occur only on plan/results.
SCENES = [
    {"number": 1, "start": 0, "duration": 4, "parts": []},
    {"number": 2, "start": 4, "duration": 7, "parts": [
        {"raw_start": 0.0, "duration": 4.6, "hold": 0.0},
        {"raw_start": 6.0, "duration": 2.4, "hold": 0.0}]},
    {"number": 3, "start": 11, "duration": 7, "parts": [
        {"raw_start": 8.4, "duration": 4.2, "hold": 1.2},
        {"raw_start": 12.6, "duration": 1.6, "hold": 0.0}]},
    {"number": 4, "start": 18, "duration": 7, "parts": [
        {"raw_start": 14.2, "duration": 5.8, "hold": 1.2}]},
    {"number": 5, "start": 25, "duration": 8, "parts": [
        {"raw_start": 20.0, "duration": 8.0, "hold": 0.0}]},
    {"number": 6, "start": 33, "duration": 7, "parts": []},
]


def digest(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def run(arguments: list[str], log: Path | None = None) -> str:
    result = subprocess.run(arguments, text=True, capture_output=True)
    if log:
        log.write_text(result.stdout + result.stderr, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"{Path(arguments[0]).name} failed ({result.returncode}): {result.stderr[-2500:]}")
    return result.stdout


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    if sys.platform != "linux":
        raise SystemExit("This development recipe is verified only on WSL/Linux; do not mix Windows paths/tools.")
    raw = options.raw.resolve(strict=True)
    allowed = (ROOT / ".mediaslimx/showcase").resolve()
    if not raw.is_relative_to(allowed):
        raise SystemExit("Input must be an existing synthetic capture beneath this project's .mediaslimx/showcase.")
    output = (options.output or allowed / f"demo-first-cut-{uuid.uuid4()}").resolve()
    if output == allowed or not output.is_relative_to(allowed) or output.exists():
        raise SystemExit("Output must be a new directory beneath this project's .mediaslimx/showcase.")
    preview = json.loads((ROOT / "assets/launch/preview-frames/manifest.json").read_text(encoding="utf-8"))
    expected_raw_hash = preview.get("raw_source", {}).get("sha256")
    if not expected_raw_hash or digest(raw) != expected_raw_hash:
        raise SystemExit("Recording SHA-256 differs from the reviewed storyboard source. Re-review the new recording and calibrate cut points before rendering.")
    for command in ("ffmpeg", "ffprobe", "node"):
        if not shutil.which(command):
            raise SystemExit(f"Missing development tool: {command}")
    source_manifest = json.loads((ROOT / "assets/showcase/manifest.json").read_text(encoding="utf-8"))
    if source_manifest.get("synthetic") is not True:
        raise SystemExit("Only the existing self-generated synthetic showcase is authorized for this recipe.")
    probe = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(raw)]))
    video = next(item for item in probe["streams"] if item["codec_type"] == "video")
    if (video["width"], video["height"]) != (1600, 1000) or float(probe["format"]["duration"]) < 28:
        raise SystemExit("The reviewed cut points require the complete 1600×1000 showcase recording.")
    output.mkdir(parents=True)
    # Copy the source as evidence, retaining its exact bytes; never rewrite it.
    source_copy = output / "raw-source.webm"
    shutil.copyfile(raw, source_copy)
    renderer = output / "render-frames.cjs"
    renderer.write_text(r'''const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const [root,out,phase]=process.argv.slice(2);
  const {chromium}=require(process.env.MSX_PLAYWRIGHT||path.join(root,'.mediaslimx/browser-tools/node_modules/playwright'));
  const browser=await chromium.launch({executablePath:process.env.MSX_CHROME||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const requests=[],errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))requests.push(r.url());});
    page.on('pageerror',e=>errors.push(e.message));
    if(phase==='backgrounds'){
      const layouts=[];
      for(let number=1;number<=6;number++){
        const id=String(number).padStart(2,'0');
        await page.goto(pathToFileURL(path.join(root,'assets/launch/preview-frames',`frame-${id}.html`)).href);
        await page.evaluate(async number=>{
          await document.fonts.ready;
          await Promise.all([...document.images].map(image=>image.decode()));
          document.querySelector('.footer span').textContent='合成演示素材 · WSL 实际界面 · 本地演示尚未发布';
          if(number>=2&&number<=5){
            const screen=document.querySelector('.screen');
            screen.replaceChildren();
            Object.assign(screen.style,{height:'744px',background:'#191E25',border:'1px solid #333C47',borderRadius:'12px'});
          }
        },number);
        const layout=await page.evaluate(()=>{
          const box=selector=>{const el=document.querySelector(selector);if(!el)return null;const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
          return {intro:box('.intro'),screen:box('.screen'),footer:box('.footer')};
        });
        if(layout.screen&&(layout.intro.right>layout.screen.left-10||layout.screen.bottom>layout.footer.top-12))throw Error('Reviewed composition no longer fits');
        await page.screenshot({path:path.join(out,`background-${id}.png`)});
        layouts.push({scene:number,...layout});
      }
      await fs.writeFile(path.join(out,'background-checks.json'),JSON.stringify({layouts,external_requests:requests,page_errors:errors},null,2));
    }else{
      await page.goto(pathToFileURL(path.join(out,'player.html')).href);
      const meta=await page.evaluate(async()=>{
        const video=document.querySelector('video');
        if(video.readyState<1)await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(Error('MP4 metadata failed')),{once:true});});
        return {duration:video.duration,width:video.videoWidth,height:video.videoHeight,readyState:video.readyState};
      });
      await page.evaluate(async()=>{const v=document.querySelector('video');v.currentTime=21;await new Promise(r=>v.addEventListener('seeked',r,{once:true}));await v.play();});
      await page.waitForTimeout(400);
      const playback=await page.evaluate(()=>{const v=document.querySelector('video');v.pause();return {currentTime:v.currentTime,readyState:v.readyState,error:v.error?.message||null,paused:v.paused,decodedFrames:v.getVideoPlaybackQuality().totalVideoFrames};});
      await page.locator('video').screenshot({path:path.join(out,'browser-playback.png')});
      if(Math.abs(meta.duration-40)>0.05||playback.error||playback.currentTime<21.15||playback.decodedFrames<2)throw Error('Browser video playback failed');
      await fs.writeFile(path.join(out,'browser-checks.json'),JSON.stringify({metadata:meta,playback,external_requests:requests,page_errors:errors},null,2));
    }
    if(requests.length||errors.length)throw Error('Unexpected browser requests/errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
''', encoding="utf-8")
    run(["node", str(renderer), str(ROOT), str(output), "backgrounds"], output / "backgrounds.log")
    encoding = ["-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "2"]
    for scene in SCENES:
        number, duration = scene["number"], scene["duration"]
        arguments = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-filter_complex_threads", "2", "-loop", "1", "-framerate", "30", "-i", str(output / f"background-{number:02d}.png")]
        parts = scene["parts"]
        filters = []
        if parts:
            arguments += ["-threads", "2", "-i", str(source_copy)]
            if len(parts) > 1:
                filters.append(f"[1:v]split={len(parts)}" + "".join(f"[r{i}]" for i in range(len(parts))))
            for index, part in enumerate(parts):
                source = f"r{index}" if len(parts) > 1 else "1:v"
                target_duration = part["duration"] + part["hold"]
                chain = f"[{source}]trim=start={part['raw_start']}:duration={part['duration']},setpts=PTS-STARTPTS,fps=30,scale=1184:740:flags=lanczos,setsar=1"
                if part["hold"]:
                    chain += f",tpad=stop_mode=clone:stop_duration={part['hold']}"
                filters.append(chain + f",trim=duration={target_duration}[p{index}]")
            if len(parts) > 1:
                filters.append("".join(f"[p{i}]" for i in range(len(parts))) + f"concat=n={len(parts)}:v=1:a=0[screen]")
            else:
                filters.append("[p0]null[screen]")
            filters.append(f"[0:v]trim=duration={duration},setpts=PTS-STARTPTS[base]")
            filters.append("[base][screen]overlay=x=653:y=177:shortest=1,format=yuv420p[final]")
        else:
            fade = "fade=t=in:st=0:d=0.45:color=0x15181D" if number == 1 else "fade=t=out:st=6.55:d=0.45:color=0x15181D"
            filters.append(f"[0:v]trim=duration={duration},setpts=PTS-STARTPTS,{fade},format=yuv420p[final]")
        arguments += ["-filter_complex", ";".join(filters), "-map", "[final]", "-frames:v", str(duration * 30), *encoding, str(output / f"scene-{number:02d}.mp4")]
        run(arguments, output / f"scene-{number:02d}.log")
        print(f"Scene {number}/6 rendered", flush=True)
    concat_file = output / "concat.txt"
    concat_file.write_text("".join(f"file 'scene-{i:02d}.mp4'\n" for i in range(1, 7)), encoding="utf-8")
    final = output / "demo.zh-CN.mp4"
    run(["ffmpeg", "-hide_banner", "-loglevel", "warning", "-f", "concat", "-safe", "1", "-i", str(concat_file), "-map", "0:v:0", "-c", "copy", "-an", "-movflags", "+faststart", str(final)], output / "concat.log")
    final_probe = json.loads(run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", str(final)]))
    streams = final_probe["streams"]
    stream = streams[0]
    if len(streams) != 1 or stream["codec_name"] != "h264" or stream["pix_fmt"] != "yuv420p" or (stream["width"], stream["height"]) != (1920, 1080) or stream["avg_frame_rate"] != "30/1" or int(stream["nb_read_frames"]) != 1200 or abs(float(final_probe["format"]["duration"]) - 40) > 0.001:
        raise RuntimeError("Final MP4 format/frame-count validation failed")
    samples = [2, 7.5, 14.5, 21.0, 28.5, 36.5]
    for index, moment in enumerate(samples, 1):
        run(["ffmpeg", "-v", "error", "-threads", "2", "-ss", str(moment), "-i", str(final), "-frames:v", "1", "-threads", "2", str(output / f"check-{index:02d}.png")])
    (output / "player.html").write_text('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>MediaSlim X 演示初剪</title><style>html,body{margin:0;background:#15181D}video{display:block;width:1920px;height:1080px}</style><video src="demo.zh-CN.mp4" controls muted preload="auto"></video></html>', encoding="utf-8")
    run(["node", str(renderer), str(ROOT), str(output), "verify"], output / "browser.log")
    manifest = {
        "kind": "MediaSlim X Chinese demo first cut", "status": "local review; not published",
        "synthetic_only": True, "user_media_used": False, "voice_music_audio_tracks": 0,
        "platform": "WSL/Linux; Chrome + FFmpeg", "source": {"file": str(raw.relative_to(ROOT)), "sha256": digest(raw), "duration": float(probe["format"]["duration"])},
        "output": {"file": final.name, "bytes": final.stat().st_size, "sha256": digest(final)},
        "scenes": SCENES, "all_motion_speed": "1x; no processing loop or slowdown",
        "holds": "Scene 03 freezes only the real preflight plan for 1.2s; scene 04 freezes only completed results for 1.2s.",
        "placement": {"x": 653, "y": 177, "width": 1184, "height": 740, "source_ratio": "8:5; full viewport retained"},
        "scene_backgrounds": [{"scene": i, "source": f"assets/launch/preview-frames/frame-{i:02d}.html", "source_sha256": digest(ROOT / f"assets/launch/preview-frames/frame-{i:02d}.html"), "rendered_sha256": digest(output / f"background-{i:02d}.png")} for i in range(1, 7)],
        "ffprobe": final_probe, "browser": json.loads((output / "browser-checks.json").read_text(encoding="utf-8")),
        "sample_times_seconds": samples, "reproduce": f"python3 scripts/render-demo-video.py --raw {raw.relative_to(ROOT)}",
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(final), "bytes": final.stat().st_size, "sha256": digest(final), "duration": 40, "frames": 1200, "audio_tracks": 0}, ensure_ascii=False))


if __name__ == "__main__":
    main()
