"""Check the clean-guest kit's archive and mapping boundaries, not guest behavior."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location('clean_prepare', ROOT / 'scripts' / 'clean-windows-prepare.py')
PREPARE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PREPARE)


class KitArchiveBoundary(unittest.TestCase):
    def archive(self, members):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / 'candidate.zip'
        with zipfile.ZipFile(path, 'w') as archive:
            for member in members:
                archive.writestr(member, b'synthetic')
        return path

    def test_accepts_one_package_and_returns_its_folder(self):
        package = self.archive(['MediaSlimX/MediaSlimX.exe', 'MediaSlimX/_internal/runtime.dll'])
        self.assertEqual(PREPARE.safe_archive(package), 'MediaSlimX')

    def test_rejects_parent_absolute_and_drive_paths(self):
        for bad in ['../private.txt', '/private.txt', 'C:/private.txt', 'folder/../private.txt', '..\\private.txt']:
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                PREPARE.safe_archive(self.archive(['MediaSlimX/MediaSlimX.exe', bad]))

    def test_rejects_missing_or_ambiguous_exe(self):
        for members in [['MediaSlimX/readme.txt'], ['One/MediaSlimX.exe', 'Two/MediaSlimX.exe']]:
            with self.subTest(members=members), self.assertRaises(ValueError):
                PREPARE.safe_archive(self.archive(members))


if __name__ == '__main__':
    unittest.main()
