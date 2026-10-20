"""Bounded paths and no-follow file operations. POSIX uses anchored dirfds."""
import contextlib
import hashlib
import os
from pathlib import Path
import stat
import uuid


def inside(path, root):
    try:
        Path(path).relative_to(root)
        return True
    except ValueError:
        return False


def is_hidden(path):
    p = Path(path)
    if p.name.startswith("."):
        return True
    if os.name == "nt":
        return bool(getattr(p.lstat(), "st_file_attributes", 0) & 0x6)
    return False


def absolute(value):
    if not isinstance(value, (str, os.PathLike)):
        raise ValueError("请选择一个有效目录")
    raw = str(value)
    if os.name == "nt" and raw.startswith("/mnt/"):
        raise ValueError("当前是 Windows 本地服务，请使用 D:\\... 等 Windows 路径；不要使用 WSL /mnt 路径")
    if os.name != "nt" and len(raw) > 1 and raw[1] == ":":
        raise ValueError("当前是 Linux/WSL 服务，请使用 /mnt/d/... 等本机路径；不要混用 Windows 盘符")
    p = Path(value).expanduser()
    if os.name == "nt" and p.drive.startswith("\\\\"):
        raise ValueError("首版只支持本地磁盘，不使用 UNC 网络目录")
    if not p.is_absolute() or ".." in p.parts:
        raise ValueError("请使用不包含 .. 的绝对路径")
    # abspath normalizes separators without resolving symlinks.
    p = Path(os.path.abspath(p))
    for parent in reversed([p, *p.parents]):
        try:
            s = parent.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(s.st_mode) or getattr(s, "st_file_attributes", 0) & 0x400:
            raise ValueError("路径包含符号链接或 Windows 重解析点")
    return p


@contextlib.contextmanager
def parent_fd(path, create=False):
    p = absolute(path)
    if os.name != "posix":
        if create:
            p.parent.mkdir(parents=True, exist_ok=True)
        absolute(p)
        if os.name == "nt":
            from .winpaths import pin_directories
            with pin_directories(p.parent):
                absolute(p)
                yield None, p
        else:
            yield None, p
        return
    fd = os.open(p.anchor, os.O_RDONLY | os.O_DIRECTORY)
    try:
        for part in p.parts[1:-1]:
            if create:
                try:
                    os.mkdir(part, mode=0o700, dir_fd=fd)
                except FileExistsError:
                    pass
            nxt = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = nxt
        yield fd, p
    finally:
        os.close(fd)


def ensure_dir(value):
    p = absolute(value)
    with parent_fd(p / ".directory-anchor", create=True):
        pass
    return p


def open_read(value):
    with parent_fd(value) as (fd, p):
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        if os.name == "nt":
            from .winpaths import open_no_follow
            n = open_no_follow(p)
        else:
            n = os.open(p.name if fd is not None else p, flags, dir_fd=fd)
        if not stat.S_ISREG(os.fstat(n).st_mode):
            os.close(n)
            raise ValueError("仅允许读取普通文件")
        return os.fdopen(n, "rb")


def fingerprint(value):
    with open_read(value) as f:
        before = os.fstat(f.fileno())
        digest = hashlib.file_digest(f, "sha256").hexdigest() if hasattr(hashlib, "file_digest") else _hash(f)
        after = os.fstat(f.fileno())
    if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
        raise ValueError("读取时文件发生变化，请重新扫描")
    return {"sha256": digest, "size": after.st_size, "mtime_ns": after.st_mtime_ns}


def _hash(f):
    h = hashlib.sha256()
    for chunk in iter(lambda: f.read(1024 * 1024), b""):
        h.update(chunk)
    return h.hexdigest()


def same_content(a, b):
    return a and b and a["sha256"] == b["sha256"] and a["size"] == b["size"]


def require_fingerprint(path, expected):
    if fingerprint(path) != expected:
        raise ValueError("源文件或结果已修改，操作已跳过")


def commit_file(source, destination, before=None, exclusive=False, mode=0o644):
    """Copy into the target filesystem, fsync, then publish at a safe boundary."""
    with parent_fd(destination, create=True) as (fd, p):
        tmp = ".mediaslimx-" + uuid.uuid4().hex + ".tmp"
        name = tmp if fd is not None else str(p.parent / tmp)
        target = p.name if fd is not None else str(p)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        n = os.open(name, flags, 0o600, dir_fd=fd)
        try:
            with os.fdopen(n, "wb") as out, open_read(source) as src:
                import shutil
                shutil.copyfileobj(src, out, 1024 * 1024)
                os.fchmod(out.fileno(), mode) if os.name == "posix" else None
                out.flush()
                os.fsync(out.fileno())
            if before:
                before()
            # Reject newly introduced symlinks/reparse points before publication.
            absolute(p)
            if exclusive:
                if os.name == "nt":
                    # Windows rename fails if the destination exists; no hardlink requirement.
                    os.rename(name, target)
                else:
                    os.link(name, target, src_dir_fd=fd, dst_dir_fd=fd, follow_symlinks=False)
                    os.unlink(name, dir_fd=fd)
            else:
                os.replace(name, target, src_dir_fd=fd, dst_dir_fd=fd)
            if fd is not None:
                os.fsync(fd)
        finally:
            try:
                os.unlink(name, dir_fd=fd)
            except FileNotFoundError:
                pass
    return fingerprint(p)
