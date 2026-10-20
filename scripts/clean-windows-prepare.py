"""Prepare a narrowly mapped, offline Windows Sandbox acceptance kit.

The developer interpreter makes synthetic fixtures here. The guest receives no
Python interpreter, virtual environment, source tree, user media or browser tools.
Preparing a kit is not a clean-OS test result and does not enable system features.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import uuid
import xml.etree.ElementTree as ET
import zipfile


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def safe_archive(package):
    with zipfile.ZipFile(package) as archive:
        names = [entry.filename.replace('\\', '/') for entry in archive.infolist()]
        for name in names:
            parts = PurePosixPath(name).parts
            if not parts or name.startswith('/') or '..' in parts or ':' in name:
                raise ValueError('Unsafe archive member; do not open this ZIP.')
        exes = [name for name in names if name.count('/') == 1 and name.endswith('/MediaSlimX.exe')]
        if len(exes) != 1:
            raise ValueError('Expected exactly one top-level package folder containing MediaSlimX.exe.')
        return exes[0].split('/')[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--fixture-ffmpeg', type=Path, required=True,
                        help='Host fixture encoder with lavfi/testsrc2 and libx264; not copied into the guest.')
    args = parser.parse_args()
    if os.name != 'nt' or sys.version_info < (3, 11):
        parser.error('Use Windows Python 3.11+, never WSL Python.')
    from PIL import Image
    import pikepdf

    project = Path(__file__).resolve().parent.parent
    package = args.package.resolve(strict=True)
    top_folder = safe_archive(package)
    run_id = uuid.uuid4().hex
    run = project / '.mediaslimx' / 'clean-windows' / run_id
    inputs, results = run / 'inputs', run / 'results'
    fixtures = inputs / 'fixtures'
    fixtures.mkdir(parents=True)
    results.mkdir()
    shutil.copy2(package, inputs / 'package.zip')
    shutil.copy2(project / 'scripts' / 'clean-windows-harness.ps1', inputs / 'clean-windows-harness.ps1')
    image = Image.effect_noise((960, 640), 65).convert('RGB')
    image.save(fixtures / 'picture.jpg', quality=100)
    image.save(fixtures / 'picture.webp', quality=100)
    Image.new('RGBA', (120, 80), (10, 150, 220, 170)).save(fixtures / 'picture.png')
    pdf = pikepdf.Pdf.new()
    page = pdf.add_blank_page(page_size=(500, 700))
    page.Contents = pdf.make_stream(b'q 0.2 0.5 0.8 rg 20 20 300 500 re f Q\n' * 1200)
    pdf.save(fixtures / 'document.pdf', compress_streams=False)
    pdf.close()
    for name, size, seconds, preset in [('video.mp4', '320x240', '1', 'ultrafast'),
                                        ('cancel.mp4', '1280x720', '15', 'ultrafast')]:
        subprocess.run([str(args.fixture_ffmpeg.resolve(strict=True)), '-v', 'error', '-f', 'lavfi', '-i',
                        f'testsrc2=size={size}:rate=24', '-t', seconds, '-c:v', 'libx264', '-preset', preset,
                        '-crf', '12', '-pix_fmt', 'yuv420p', str(fixtures / name)], check=True, timeout=120)
    config = {'schema': 1, 'run_id': run_id, 'package_file': 'package.zip',
              'host_computer_name': os.environ.get('COMPUTERNAME', ''),
              'guest_observation_protocol': {'stage_file': 'guest-stage.json',
                                             'observation_file': 'guest-observations.json',
                                             'default': 'pending; never prefilled'},
              'package_folder': top_folder, 'package_sha256': digest(inputs / 'package.zip'),
              'fixtures': {path.name: digest(path) for path in sorted(fixtures.iterdir())},
              'prepared_only_not_clean_os_verified': True,
              'expected_formats': ['JPEG', 'PNG', 'WebP', 'MP4', 'PDF']}
    (inputs / 'kit.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
    configuration = ET.Element('Configuration')
    for tag, value in [('VGpu', 'Disable'), ('Networking', 'Disable'), ('AudioInput', 'Disable'),
                       ('VideoInput', 'Disable'), ('PrinterRedirection', 'Disable'),
                       ('ClipboardRedirection', 'Disable'), ('MemoryInMB', '6144')]:
        ET.SubElement(configuration, tag).text = value
    mapped = ET.SubElement(configuration, 'MappedFolders')
    for host, guest, read_only in [(inputs, r'C:\MediaSlimX-input', 'true'),
                                    (results, r'C:\MediaSlimX-evidence', 'false')]:
        item = ET.SubElement(mapped, 'MappedFolder')
        ET.SubElement(item, 'HostFolder').text = str(host)
        ET.SubElement(item, 'SandboxFolder').text = guest
        ET.SubElement(item, 'ReadOnly').text = read_only
    command = ET.SubElement(configuration, 'LogonCommand')
    ET.SubElement(command, 'Command').text = (
        'powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File '
        r'C:\MediaSlimX-input\clean-windows-harness.ps1 -InputDir C:\MediaSlimX-input '
        r'-ReportDir C:\MediaSlimX-evidence -SandboxRun')
    ET.indent(configuration)
    ET.ElementTree(configuration).write(run / 'MediaSlimX-offline.wsb', encoding='utf-8', xml_declaration=True)
    (results / 'NOT-RUN.json').write_text(json.dumps({'status': 'not_run',
        'clean_windows_os': False, 'reason': 'Kit prepared; Windows Sandbox/VM has not executed it.',
        'package_sha256': config['package_sha256']}, indent=2), encoding='utf-8')
    print(json.dumps({'kit': str(run), 'wsb': str(run / 'MediaSlimX-offline.wsb'),
        'package_sha256': config['package_sha256'], 'clean_os_verified': False}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
