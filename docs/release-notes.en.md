# MediaSlim X release notes draft (English)

**Maintainer status: source code public; binary Release not published.** This is a future GitHub Release body, not a download announcement. The planned portable version is a local Windows standalone window. The latest local `official-python313-r1` candidate is a 36.36 MiB ZIP and passed an isolated native WebView2 synthetic-media flow; it is not a public download. Clean-Windows acceptance awaits a user-controlled restart. Exact lxml/iconv wheel provenance and LGPL relinking materials remain open. The old Python 3.12 bundle's libffi blocker does not carry over to the new official-Python candidate. Complete the gates and fill in the actual version, assets, sizes, date and scope before using the body. No binary release tag exists.

---

Developer-host update: the extracted new candidate passed a 201-file directory export, five media types, CSV, previews, both languages/themes and idle exit in an isolated WebView2 run. Clean-environment and busy physical titlebar-close acceptance remain separate; DOM operations are not manual native-control clicks.

## MediaSlim X · VERSION

Batch compressor for images, MP4 and PDF

MediaSlim X is a free, open-source local batch compressor for images, MP4 videos and PDFs. Windows hosts its Chinese/English workbench in a standalone window. Choose a media folder or import files, review the scan, set the processing mode and inspect actual per-file results. It is useful for website assets and media being prepared for upload.

### Download and launch

- On Windows x64, download **`MediaSlimX-VERSION-windows-x64.zip`** from this Release, extract the entire folder and double-click `MediaSlimX.exe`. Download: **fill in measured MiB for this version**; extracted size: **fill in measured MiB**.
- Python, the image/PDF engines and minimal FFmpeg/ffprobe are bundled. No first-run environment download or online library updater is required. Keep the EXE and the full `_internal` folder together; do not run from the ZIP preview.
- An installed **Microsoft WebView2 Evergreen Runtime** is required and is not bundled. Missing support produces manual installation instructions, without an automatic download or silent external-browser fallback. Offline startup requires the Runtime to be installed beforehand.
- Double-click to open the tool's own window. Its service binds to `127.0.0.1` by default. Closing during a task requires confirmation. Save progress and quit waits for the current file to finish safely, preserves completed results and the remaining-file list, and lets the user explicitly resume next time. Other projects are not targeted by process name.
- **Code → Download ZIP / Source code (zip)** downloads source for developers and requires the README setup. It is not the portable application.
- The matching `third-party-materials.zip` contains sources, licenses and build materials; it is not needed to run the app. Checksums: `MediaSlimX-VERSION-SHA256SUMS.txt`.

### What this version does

1. Scan an explicitly allowed folder on the service device, or import files and whole folders while retaining their relative structure. Select pending files by JPG, PNG, WebP, MP4 or PDF type.
2. Choose quality, balanced or size priority. Dimensions are preserved by default. Optional maximum width/height proportionally reduce media without cropping, stretching or upscaling. Image quality and dimension controls do not apply to PDF.
3. **Export to a new folder by default**, preserving originals, names, actual formats and directory structure. Updating original paths requires explicitly choosing backup-and-replace; PDF never allows replacement without a backup. Browser imports are always export-only.
4. Follow actual progress, cancel remaining files, inspect per-file results, image/video previews, CSV reports and persistent history. No-gain files retain their originals; failures and unsupported files show reasons.
5. Restore one file or a batch from task backups, skipping files modified since optimization. Archive entries to organize history, and use separate import-storage management to release this instance's copies after reviewing the impact and confirming.

### Supported media and limits

- JPG/JPEG, PNG and static WebP. Ordinary MP4 is limited to H.264 8-bit SDR yuv420p with at most one AAC audio track. Animation, HDR, rotation and complex streams are conservatively skipped. This is not an all-format converter.
- Ordinary, unencrypted PDFs receive structure/stream recompression, without rasterization, image downsampling or page resizing. Encryption/permissions, signatures, forms, scripts/actions, annotations including links, attachments, complex or damaged PDFs are skipped with reasons. Maximum PDF size: 64 MiB.
- Browser imports are limited to 200 files and 2 GiB per batch; scan a folder on the service device for larger batches. Each image/video is limited to 1 GiB; the import area has an 8 GiB declared-capacity limit. Scanned media also have their own safety limits.
- JPG/WebP/MP4 processing may be lossy. Savings are measured, never guaranteed. Already optimized media or PDFs may show no gain. Before/after comparisons are available only when an original is retained.
- No batch renaming, online installer, auto-updater, PWA, Chrome extension or mobile client is included. Windows uses a WebView2 standalone window; website references are not automatically rewritten.

### Data and privacy

Processing runs on the device hosting MediaSlim X. There are no third-party media uploads, telemetry, accounts, advertising or external CDNs. Imports through the local browser entry transfer selected media copies to the local service. Images, videos and PDFs may contain sensitive information; see [privacy and security](privacy-security.md) for the boundaries of other connection methods.

Scanning skips hidden, dependency, output and backup folders by default and does not follow symlinks. Fingerprints, result verification and replacement checks protect processing, but cannot guarantee safety against every concurrent external write. Start with export mode, especially for important assets.

### First use and upgrades

Try a small batch through **scan → default export → inspect results**. Browser import and folder scanning are separate entry points: choose the original folder on the service device to back up and update original paths. Imported originals are never silently overwritten.

There is no automatic updater. Manually check the real GitHub Release, download it and verify its checksum. Before upgrading, finish tasks and safely close the old window/service, then extract the complete new version to a new folder and launch its EXE. Do not replace only the EXE or mix old `_internal` files. Portable history and import data live under `%LOCALAPPDATA%\MediaSlimX\portable`; exports and backups remain in user-selected locations. Removing the application folder does not remove those files. Unverified cross-version automatic migration is not promised; retain important reports and backups. See the [upgrade policy](updates.md).

For source use, `Start-MediaSlimX.vbs` opens the window without a console; use `Start-MediaSlimX.cmd` to inspect preparation errors. `Start-MediaSlimX-Browser.cmd` retains the local Windows browser entry. Window and browser modes keep separate task data and do not share a running instance.

### Verification and known issues (complete before publication)

- Tested Windows system / final window payload / clean environment / standard account / actual window, native folder selection and busy close / Runtime installed and missing: **fill in measured results for this exact payload**.
- Windows source regression, window protocol/close tests and bilingual viewport checks: see [platform status](platforms.md) and the [window records](windows-window.md). Protocol tests, the old browser payload and viewport simulation do not substitute for actual window or physical-phone acceptance.
- macOS, Safari, physical phones and other operating systems are outside the first release scope. Mobile features and additional formats are outside this iteration.
- Code signing and SmartScreen: **state the measured status**. If unsigned, say so. Do not ask users to disable system protections.
- Demonstrations use synthetic media. A real FIRANO case has not been conducted; no compression ratio or website performance improvement is invented.

### Feedback and license

Use the real repository's Issues with the version, OS, media type, reproduction steps and per-file reason. Remove usernames, absolute paths, access tokens and sensitive content. Original media or a complete private project are not required as the first step. Core functionality is free and open source. MediaSlimX code uses MIT; bundled dependencies keep their own terms. Matching sources and build materials accompany this release.

A sponsorship link appears only when a real destination exists. Existing core features will not require a subscription.
