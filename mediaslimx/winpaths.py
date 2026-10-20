"""Windows handle guards: reject reparse files and pin directory ancestry."""
import contextlib
import ctypes
from ctypes import wintypes
import msvcrt
import os

kernel = ctypes.WinDLL("kernel32", use_last_error=True)
kernel.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
                               wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
kernel.CreateFileW.restype = wintypes.HANDLE
kernel.CloseHandle.argtypes = [wintypes.HANDLE]
kernel.CloseHandle.restype = wintypes.BOOL
kernel.GetFileInformationByHandle.argtypes = [wintypes.HANDLE, wintypes.LPVOID]
kernel.GetFileInformationByHandle.restype = wintypes.BOOL
INVALID = ctypes.c_void_p(-1).value
REPARSE = 0x400


class FileInfo(ctypes.Structure):
    _fields_ = [("attributes", wintypes.DWORD), ("creation", wintypes.FILETIME),
                ("access", wintypes.FILETIME), ("write", wintypes.FILETIME),
                ("volume", wintypes.DWORD), ("size_high", wintypes.DWORD),
                ("size_low", wintypes.DWORD), ("links", wintypes.DWORD),
                ("index_high", wintypes.DWORD), ("index_low", wintypes.DWORD)]


def _open(path, access, sharing, flags):
    handle = kernel.CreateFileW(str(path), access, sharing, None, 3, flags, None)
    if handle == INVALID:
        raise ctypes.WinError(ctypes.get_last_error())
    info = FileInfo()
    if not kernel.GetFileInformationByHandle(handle, ctypes.byref(info)):
        error = ctypes.get_last_error()
        kernel.CloseHandle(handle)
        raise ctypes.WinError(error)
    if info.attributes & REPARSE:
        kernel.CloseHandle(handle)
        raise ValueError("拒绝 Windows 符号链接或重解析点")
    return handle


@contextlib.contextmanager
def pin_directories(path):
    handles = []
    try:
        for directory in reversed([path, *path.parents]):
            # Share read/write, but omit FILE_SHARE_DELETE to prevent rename races.
            handles.append(_open(directory, 0x1 | 0x80, 0x1 | 0x2, 0x02000000 | 0x00200000))
        yield
    finally:
        for handle in reversed(handles):
            kernel.CloseHandle(handle)


def open_no_follow(path):
    handle = _open(path, 0x80000000, 0x1, 0x00200000)
    try:
        return msvcrt.open_osfhandle(handle, os.O_RDONLY | os.O_BINARY)
    except Exception:
        kernel.CloseHandle(handle)
        raise
