"""Check JSON pipes in a real windowed EXE without opening a GUI or service."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if os.name != "nt":
        raise SystemExit("Use native Windows Python; this executes the Windows GUI-subsystem EXE.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--executable", required=True, type=Path)
    args = parser.parse_args()
    executable = args.executable.resolve(strict=True)
    project = Path(__file__).resolve().parents[1]
    run = project / ".mediaslimx" / "packaging" / ("window-workers-" + uuid.uuid4().hex)
    run.mkdir(parents=True)
    import pikepdf
    source, result = run / "ordinary.pdf", run / "optimized.pdf"
    with pikepdf.Pdf.new() as document:
        page = document.add_blank_page(page_size=(500, 700))
        page.Contents = document.make_stream(b"q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\n" * 1200)
        document.save(source, compress_streams=False)
    original_sha = sha(source)
    env = os.environ.copy()
    env["PATH"] = str(Path(env.get("SystemRoot", r"C:\Windows")) / "System32")
    checks = []

    def call(name, request):
        value = subprocess.run([str(executable), "--mediaslimx-pdf-worker"],
                               input=request if isinstance(request, str) else json.dumps(request),
                               capture_output=True, text=True, encoding="utf-8", timeout=45,
                               creationflags=subprocess.CREATE_NO_WINDOW, cwd=run, env=env)
        if value.returncode:
            raise AssertionError(f"{name}: worker exited {value.returncode}; stderr={value.stderr[:300]!r}")
        parsed = json.loads(value.stdout)
        if not isinstance(parsed, dict) or not ({"result", "error"} & parsed.keys()):
            raise AssertionError(f"{name}: no structured JSON response")
        return parsed

    try:
        info = call("inspect", {"operation": "inspect", "source": str(source)})
        assert info["result"]["pages"] == 1
        checks.append({"name": "windowed_pdf_inspect_json_pipe", "status": "passed"})
        optimized = call("optimize", {"operation": "optimize", "source": str(source), "destination": str(result)})
        assert optimized["result"]["encoder"] == "pikepdf/qpdf" and result.is_file()
        after = call("inspect-result", {"operation": "inspect", "source": str(result)})
        for key in ("pages", "page_digest", "stream_digest"):
            assert after["result"][key] == info["result"][key], key
        assert result.stat().st_size < source.stat().st_size
        checks.append({"name": "windowed_pdf_optimize_validate", "status": "passed"})
        invalid = call("invalid-operation", {"operation": "unexpected", "source": str(source)})
        assert "error" in invalid and "result" not in invalid
        malformed = call("malformed-json", "{invalid")
        assert "error" in malformed and "result" not in malformed
        checks.append({"name": "invalid_worker_requests_rejected_with_json", "status": "passed"})
        assert sha(source) == original_sha
        checks.append({"name": "original_unchanged", "status": "passed"})
        success, error = True, None
    except Exception as failure:
        success, error = False, str(failure)
    report = {"version": 1, "success": success, "executable_sha256": sha(executable),
              "checks": checks, "error": error, "scope": "Native host worker pipes only; no GUI or clean-Windows acceptance"}
    destination = run / "report.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"success": success, "checks": len(checks), "report": str(destination), "error": error}, ensure_ascii=False))
    raise SystemExit(0 if success else 1)


if __name__ == "__main__":
    main()
