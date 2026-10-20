"""Windows-only launch test: Chinese + spaces, unrelated CWD, real .cmd.
Uses a new ignored fixture and cleans only that fixture/process tree.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from mediaslimx.launch import _verify


def main():
    if os.name!="nt":
        raise SystemExit("Run with .venv-win\\Scripts\\python.exe on Windows.")
    project=Path(__file__).resolve().parent.parent
    (project/".mediaslimx").mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="启动器 space ",dir=project/".mediaslimx") as value:
        fixture=Path(value)
        (fixture/"scripts").mkdir()
        shutil.copyfile(project/"Start-MediaSlimX.cmd",fixture/"Start-MediaSlimX.cmd")
        shutil.copyfile(project/"scripts"/"start-windows.ps1",fixture/"scripts"/"start-windows.ps1")
        shutil.copyfile(project/"requirements-lock.txt",fixture/"requirements-lock.txt")
        for name in [".venv-win","mediaslimx"]:
            subprocess.run(["cmd.exe","/d","/c","mklink","/J",str(fixture/name),str(project/name)],check=True,capture_output=True)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0));port=sock.getsockname()[1]
        command='cmd.exe /d /s /c ""'+str(fixture/"Start-MediaSlimX.cmd")+'" -NoBrowser -Port '+str(port)+'"'
        log=open(fixture/"launch.log","wb")
        proc=subprocess.Popen(command,cwd=os.environ.get("SystemRoot",r"C:\Windows"),stdout=log,stderr=subprocess.STDOUT)
        server_pid = None
        try:
            descriptor=fixture/".mediaslimx"/"windows"/"server.json"
            for _ in range(150):
                if descriptor.exists():
                    record=json.loads(descriptor.read_text(encoding="utf-8"))
                    env=_verify(record["url"],descriptor.parent)
                    assert Path(env["cwd"])==fixture
                    server_pid = env["pid"]
                    assert env["native_picker"] is True
                    assert env["runtime"]=="Windows 本地"
                    break
                if proc.poll() is not None:
                    log.flush()
                    raise RuntimeError((fixture/"launch.log").read_text(encoding="utf-8",errors="replace"))
                time.sleep(.1)
            else:
                raise TimeoutError("launcher was not ready")
            # A second launch must reuse, not spawn or touch WSL data.
            again=subprocess.run(command,cwd=os.environ.get("SystemRoot",r"C:\Windows"),capture_output=True,timeout=15)
            assert again.returncode==0,again.stdout.decode("utf-8","replace")
            assert "已在运行" in again.stdout.decode("utf-8","replace")
            print(json.dumps({"windowsLauncher":"passed","chineseAndSpaces":True,"unrelatedCwd":True,
                              "instanceReuse":True,"runtime":env["runtime"],"port":port},ensure_ascii=False))
        finally:
            if server_pid:
                import signal
                try: os.kill(server_pid, signal.SIGTERM)
                except OSError: pass
                time.sleep(.2)
            subprocess.run(["taskkill.exe","/PID",str(proc.pid),"/T","/F"],capture_output=True)
            proc.wait(timeout=10)
            log.close()


if __name__=="__main__":
    main()
