"""Start an isolated ZIP window with a synthetic interrupted task."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mediaslimx.engine import Engine
from windows_window_acceptance import prepare, start


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--executable", required=True, type=Path)
    parser.add_argument("--fixture-video", required=True, type=Path)
    parser.add_argument("--closing-video", required=True, type=Path)
    parser.add_argument("--label", choices=("r8", "r9", "r10"), default="r10")
    args = parser.parse_args()
    state_path = prepare(args.executable.resolve(), args.fixture_video, args.closing_video, args.label)
    state = json.loads(state_path.read_text(encoding="utf-8"))
    engine = Engine(state["data"], [state["media"], state["large_directory"], state["closing_media"]])
    scan = engine.scan(state["media"])
    selected = [e["id"] for e in scan["entries"] if e["relative"] in {"picture.jpg", "picture.png"}]
    assert len(selected) == 2
    key = engine.create(scan["id"], selected, {"preset": "balanced", "max_width": None, "max_height": None},
                        "export", output=state["exports"])
    task = engine.wait(key)
    assert all(e["status"] == "success" for e in task["entries"]), task["entries"]
    last = task["entries"][-1]
    Path(last["destination"]).unlink()
    last.update(status="processing", destination=None, result_fp=None, result_size=last["size"])
    task.update(status="running", stop_reason=None)
    engine.save("task", task)
    state["resume_task_id"] = key
    state["kept_result_fp"] = task["entries"][0]["result_fp"]
    state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(start(state_path), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
