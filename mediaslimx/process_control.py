"""Cancel only child processes launched by the current media worker.

There is deliberately no process-name lookup or global child registry. A scan,
another Engine, or another application has no access to this thread's scope.
File publication stays outside this helper and is never interrupted here.
"""
from contextlib import contextmanager
import os
from pathlib import Path
import subprocess
import threading
import time


_local = threading.local()


def _stop_owned_process(process):
    """Stop the live child and, on Windows, its venv-redirector descendants.

    Windows venv python.exe can forward work to a base interpreter with another
    PID. Killing only the redirector leaves that worker alive. Keep Popen's
    process handle open while targeting its exact PID tree; never enumerate or
    terminate processes by executable name. A failed tree stop still reaps the
    owned root, and the launcher's private Job remains the crash safety net.
    """
    if process.poll() is not None:
        return
    if os.name == "nt":
        taskkill = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "taskkill.exe"
        try:
            subprocess.run([str(taskkill), "/PID", str(process.pid), "/T", "/F"],
                           stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=5, check=False, creationflags=subprocess.CREATE_NO_WINDOW)
        except (OSError, subprocess.TimeoutExpired):
            pass
    if process.poll() is None:
        process.kill()


@contextmanager
def cancel_scope(event):
    previous = getattr(_local, "event", None)
    _local.event = event
    try:
        yield
    finally:
        _local.event = previous


def run(args, *, timeout=None, input=None, check=False, **kwargs):
    """Match subprocess.run, polling only inside an opted-in media task.

    communicate() continues draining both pipes across timeouts, including on
    Windows. Cancelling kills and reaps this exact Popen object, never a PID
    found by name. The caller's temporary directory then cleans partial output.
    """
    event = getattr(_local, "event", None)
    if event is None:
        return subprocess.run(args, timeout=timeout, input=input, check=check, **kwargs)
    if event.is_set():
        raise InterruptedError("已取消，未开始的文件将保留原样")
    if input is not None:
        if kwargs.get("stdin") is not None:
            raise ValueError("stdin and input arguments may not both be used")
        kwargs["stdin"] = subprocess.PIPE
    deadline = None if timeout is None else time.monotonic() + timeout
    with subprocess.Popen(args, **kwargs) as process:
        try:
            pending_input = input
            while True:
                if event.is_set():
                    raise InterruptedError("已取消，未开始的文件将保留原样")
                remaining = None if deadline is None else deadline - time.monotonic()
                if remaining is not None and remaining <= 0:
                    _stop_owned_process(process)
                    stdout, stderr = process.communicate()
                    raise subprocess.TimeoutExpired(args, timeout, output=stdout, stderr=stderr)
                try:
                    stdout, stderr = process.communicate(
                        input=pending_input, timeout=.1 if remaining is None else min(.1, remaining))
                    break
                except subprocess.TimeoutExpired:
                    # Popen retained any unfinished input and captured output.
                    # Sending the JSON request twice would corrupt PDF workers.
                    pending_input = None
            if event.is_set():
                raise InterruptedError("已取消，未开始的文件将保留原样")
            result = subprocess.CompletedProcess(args, process.returncode, stdout, stderr)
            if check:
                result.check_returncode()
            return result
        finally:
            if process.poll() is None:
                _stop_owned_process(process)
            # Reap the owned child on cancellation and unexpected exceptions;
            # leaving only the Windows Job to do this would skip task cleanup.
            process.communicate()
