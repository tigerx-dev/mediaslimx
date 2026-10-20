"""Windows maintainer acceptance for the narrow FFmpeg/ffprobe build.

The fixture generator is a separate full FFmpeg, never a runtime dependency.
No existing task, media directory, local service or user profile is touched.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time


def run(command, environment):
    result = subprocess.run(command, env=environment, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=180, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", "replace")[-1600:])
    return result.stdout.decode("utf-8", "replace")


def main():
    if os.name != "nt":
        raise SystemExit("Run with native Windows Python; WSL is not Windows execution evidence.")
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine-dir", type=Path, required=True)
    parser.add_argument("--fixture-generator", type=Path, required=True)
    parser.add_argument("--work-dir", type=Path, required=True)
    args = parser.parse_args()
    project = Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(project))
    from mediaslimx import media
    engine = args.engine_dir.resolve()
    work = args.work_dir.resolve()
    work.mkdir(parents=True, exist_ok=False)
    generator = args.fixture_generator.resolve()
    system32 = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    environment = os.environ.copy()
    environment["PATH"] = str(engine) + os.pathsep + str(system32)
    os.environ["PATH"] = environment["PATH"]
    report = {"platform": platform.platform(), "scope": "native Windows; isolated engine and System32 PATH; not clean OS",
              "binaries": {}, "checks": []}
    for filename in ("ffmpeg.exe", "ffprobe.exe"):
        binary = engine / filename
        report["binaries"][filename] = {"sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
                                        "bytes": binary.stat().st_size}
        (work / (filename + "-version.txt")).write_text(run([str(binary), "-version"], environment), encoding="utf-8")
    protocols = run([str(engine / "ffmpeg.exe"), "-hide_banner", "-protocols"], environment)
    assert "http" not in protocols.lower() and "https" not in protocols.lower() and "tcp" not in protocols.lower()
    assert "file" in protocols and "pipe" in protocols
    report["checks"].append({"name": "local protocols only", "passed": True})

    def audio_packets(path):
        output = run([str(engine / "ffprobe.exe"), "-v", "error", "-select_streams", "a:0",
                      "-show_packets", "-show_data_hash", "sha256", "-of", "json", str(path)], environment)
        return [(p["data_hash"], p["size"], p.get("duration")) for p in json.loads(output).get("packets", [])]

    for audio in (False, True):
        source = work / ("视频 source AAC.mp4" if audio else "视频 source silent.mp4")
        command = [str(generator), "-nostdin", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=512x288:rate=24"]
        if audio:
            command += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-ac", "2", "-c:a", "aac", "-b:a", "96k"]
        command += ["-t", "2", "-c:v", "libx264", "-crf", "12", "-preset", "ultrafast", "-pix_fmt", "yuv420p", str(source)]
        run(command, environment)
        info = media.inspect(source, ".mp4")
        assert info["width"] == 512 and info["height"] == 288
        if audio:
            assert info["audio"] == "aac" and info["audio_channels"] == 2
        for preset in ("quality", "balanced", "small"):
            for resize in (False, True):
                params = {"preset": preset, "max_width": 160 if resize else None, "max_height": None}
                destination = work / f"result-{'aac' if audio else 'silent'}-{preset}-{'resize' if resize else 'original'}.mp4"
                started = time.monotonic()
                actual = media.optimize(source, destination, info, params)
                validated = media.validate_result(destination, ".mp4", info, params)
                assert actual["audio"] == "copy" and validated["codec"] == "h264"
                assert (validated["width"], validated["height"]) == ((160, 90) if resize else (512, 288))
                assert audio_packets(source) == audio_packets(destination), "AAC packets must be copied unchanged"
                report["checks"].append({"name": f"{'AAC' if audio else 'silent'} / {preset} / {'resize' if resize else 'original size'}",
                                          "passed": True, "source_bytes": source.stat().st_size,
                                          "result_bytes": destination.stat().st_size, "seconds": round(time.monotonic() - started, 3)})
    damaged = work / "damaged.mp4"
    damaged.write_bytes(b"not an mp4\x00\x01" * 50)
    try:
        media.inspect(damaged, ".mp4")
    except ValueError:
        report["checks"].append({"name": "damaged MP4 rejected", "passed": True})
    else:
        raise AssertionError("Damaged MP4 accepted")
    report["passed"] = all(item["passed"] for item in report["checks"])
    (work / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "checks": len(report["checks"]), "work_dir": str(work)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
