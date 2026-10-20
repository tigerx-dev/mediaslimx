# 干净 Windows 验收 / Clean Windows acceptance

便携包应当完整解压即用，不要求用户安装 Python、FFmpeg 或 PDF 运行环境。开发机运行成功、清空 PATH、临时修改 LocalAppData 都不能代替干净系统验证。本流程不上传包、不访问第三方测试服务，不接触现有 `8766` 实例或用户素材。

## 当前真实状态 / Actual status

2026-10-17 宿主为 Windows 11 Pro、build 22631、x64。最初只读检查发现 Sandbox 禁用；用户随后明确授权启用且禁止自动重启。10:58（Asia/Shanghai）管理员 `-NoRestart` 操作已完成，`Containers-DisposableClientVM` 从 Disabled 变为 Enabled，系统返回 **`RestartNeeded=true`**，`WindowsSandbox.exe` 仍不存在。当前必须等待用户自行保存工作并重启，不能启动客体，也不能把功能已启用写成干净环境已验收。操作证据位于私有 `.mediaslimx/clean-windows/enable-sandbox-20261017-105555/result.json`，没有自动重启。

Hyper-V 与 VirtualMachinePlatform 原已启用、管理服务运行；普通会话 `Get-VM` 仍返回权限不足，不能宣称现有 VM 可用。常见安装位置没有 VirtualBox、VMware、QEMU 或 Docker。初查 C、D 盘可用空间分别约 572 GiB、137 GiB，空间足够。没有创建虚拟机或测试账户，没有修改固件。

**干净 Windows 实机/虚拟机验收仍未完成。** 已准备离线验收工具，但只有实际在新建 Sandbox/干净 VM 中执行并留存证据，才可以改变这个状态。`HostHarnessSelfTest` 是脚本自身在开发机的回归，报告明确标注 `host_self_test_passed`，`environment.clean_windows=false`，不能用于通过干净系统发行门槛。

Windows Sandbox was enabled with explicit approval and `-NoRestart`; Windows reports `RestartNeeded=true`, and its executable is not present yet. No restart or clean Windows guest execution has occurred. Host self-tests remain separate from clean-OS results.

2026-10-19 最新待验对象是官方 Python 3.13.16 独立窗口候选 `official-python313-r1`，运行 ZIP 为 38,123,090 字节（36.36 MiB）、SHA-256 `3433bb9ff6c9281bb748e87b19a194fe1a33efbadf004ddf743b0717443ab3f3`。其开发机 Windows WebView2 合成素材流程和 PDF worker 已验证，仍有 lxml 分发材料阻塞；**尚未为这个 ZIP 执行干净 Windows 客体验收**。下面的 r3 套件只是旧候选的历史自测，不能沿用其报告或哈希。用户未安排重启前不运行 Sandbox；待材料门槛解除并确定最终 payload，再按本页重新生成与该 ZIP 指纹绑定的离线套件。

The latest standalone candidate uses official Python 3.13.16 and passed local synthetic-media checks, but its lxml distribution-material gate and clean-Windows guest test remain open. The r3 kit below is historical; bind a fresh offline kit to the final archive after the user-controlled restart, without reusing its evidence.

2026-10-17，当时的精简内部候选为 `MediaSlimX-windows-x64-validation-candidate-packaging-r3.zip`（37,469,902 bytes，约 35.73 MiB）。已为该 ZIP 生成支持 JSON 观察握手的最终套件，并在独立开发机自测中通过本流程的 8 组检查；报告明确 `status=host_self_test_passed`、`environment.clean_windows=false`。ZIP SHA-256 为 `c631fdbc5fdba90576005ec1b653e85ddd428d60b9610f16aadef1fcc99395b9`，最终私有套件与开发机报告位于 `.mediaslimx/clean-windows/1e87942f0bb64a1f9213c543721ccb68/`。真正 Sandbox 输出目录保留 `NOT-RUN.json`，没有启动客体或填写任何实际观察答案，旧套件与证据也保留。该候选已包含受跟踪选择器的退出保护与正常 SIGINT 返回处理；本流程的 8 组检查仍不能代替独立的 Ctrl+Break 实测。

同日另以真实 WSL 命令行 `python -m mediaslimx` 启动独立服务完成 JPEG 扫描、导出、相对路径 CSV、原件指纹核对、同数据与同端口复启；两次真实 SIGINT 均约 0.27 秒返回 exit 0，无 traceback，端口关闭且实例锁可重新独占。私有证据位于 `.mediaslimx/validation-wsl/real-cli-r3-204ad2ec188948028d336a7b034f4be7/`。这是当前 WSL 开发环境验证，不是干净 Windows 验收。

可用 `powershell -NoProfile -File scripts\clean-windows-probe.ps1` 重复只读检查；脚本不提权、不修改可选功能，也不会把存在 Hyper-V 服务解释成可以管理虚拟机。

## 如需启用 Sandbox / Optional system setup

启用 Windows 可选功能需要管理员权限，可能要求重启。本机已经完成获准的启用步骤并等待用户重启，不应重复执行。其他机器只有用户明确批准后，才手动打开管理员 Windows PowerShell 执行：

```powershell
powershell -NoProfile -File scripts\clean-windows-enable-sandbox.ps1 -WhatIf
powershell -NoProfile -File scripts\clean-windows-enable-sandbox.ps1
```

脚本只启用 `Containers-DisposableClientVM`，不会自动提权、下载镜像或重启。交互式确认后返回 `RestartNeeded`；如果为 true，由用户保存工作后选择重启时间。不要为测试关闭安全防护。也可以在用户已经准备好的独立 Windows VM/第二台电脑按下述流程执行，不需要启用 Sandbox。

Enabling Sandbox is a separate, explicit system change. The reviewed helper never launches UAC or restarts Windows by itself. Inspect `-WhatIf`, approve the operation, then inspect `RestartNeeded`.

## 准备待测包 / Prepare an offline kit

在 Windows 原生开发环境运行，使用安装了 Pillow、pikepdf 的 Python 3.11+。`fixture-ffmpeg` 仅在宿主生成合成素材，应支持 lavfi/testsrc2 与 libx264；不会复制此编码器到客体。客体只能使用待测 ZIP 内的引擎。

```powershell
.venv-win\Scripts\python.exe -X utf8 scripts\clean-windows-prepare.py `
  --package .mediaslimx\packaging\YOUR-FINAL-CANDIDATE.zip `
  --fixture-ffmpeg "C:\path\to\fixture-encoder\ffmpeg.exe"
```

每次生成新的 `.mediaslimx\clean-windows\<run-id>\`，不覆盖旧证据：

- `inputs\`：待测 ZIP、无第三方依赖的 PowerShell 验收脚本、六份合成媒体、SHA-256 清单。
- `results\NOT-RUN.json`：明确标记尚未执行，不能当作验收结果。
- `MediaSlimX-offline.wsb`：只映射 `inputs` 为只读、`results` 为可写；不映射源码、整个 D 盘、用户目录或其他项目。

WSB 禁用外部网络、音视频输入、打印机和剪贴板重定向，使用 6 GiB 内存。ZIP 在客体复制解压到其自身 `%LOCALAPPDATA%\MediaSlimX clean test\中文 路径 <run-id>\`，不会在宿主包目录写入数据。只允许导入到该目录的合成媒体；程序、任务和备份保持独立。

The host prepares synthetic fixtures once. The guest receives no development interpreter, source checkout, virtual environment, browser automation framework or host encoder. The exact tested archive is bound by SHA-256. A changed ZIP requires a new kit and another test run.

## 实际执行 / Run in a real guest

Sandbox 可用后双击生成的 `.wsb`，自动调用 PowerShell 验收。全过程离线，程序仍只监听客体回环地址。自动验证包括：

1. ZIP 和全部素材指纹一致；中文和空格路径解压，从无关工作目录启动 EXE。
2. 解压后的程序文件夹实际拒绝当前账户写入，并在该只读条件下完成后续流程。
3. 自带图片/PDF/FFmpeg/ffprobe/原生目录选择器能力可用；不借用开发环境命令；不复用源代码实例的端口或数据。能力标志不等于已经点选过目录窗口。
4. JPG、PNG、静态 WebP、MP4、PDF 真实扫描和导出；原件指纹不变；实际 CSV 与预览匹配结果。
5. 备份后覆盖、逐文件精确恢复、修改后的结果冲突保护。
6. 文件导入 API、真实导出、安全释放副本；原件、导出和报告保留。
7. 调用取消 API 并等待任务结束，保留合成原件、清理处理临时文件。
8. **任务结束、目录选择器未打开时**，用 `Stop-Process -Force` 强制结束独立服务后重新启动；只检查已完成任务的报告与备份信息持久化。

客体解压后的程序文件夹会仅针对当前测试账户添加写入拒绝 ACL，实际创建探针必须失败；整个验证在这个只读程序目录条件下运行，结束后恢复原 ACL。只改变客体新解压的包，不修改宿主待测包或其他目录。运行数据和素材位于客体独立可写目录。

第 8 组在客体模式重启后会重新自动打开当前认证会话，避免第一次打开的旧令牌页面失效；开发机自测始终不打开浏览器。随后需要实际观察**当前默认浏览器工作台**，并在原生目录窗口选择指定合成目录。脚本不输出访问令牌，保存的服务日志会移除令牌。完成后不要把原始客体运行日志手动提交到 Git。

### 无终端输入的观察握手

默认客体流程不调用 `Read-Host`。自动 8 组完成后，客体向映射的报告目录写入 `guest-stage.json`，状态为 `awaiting_browser_observation`，包含本次 `run_id`、ZIP 指纹、一次性 `stage_id` 与预期合成目录，不包含访问令牌。观察者可以从宿主读取该阶段文件，实际查看 Sandbox 中的浏览器后，通过普通文件工具写入同目录 `guest-observations.json`；不要自动化终端输入，也不要未经观察预填肯定答案。

下面只是格式示例，两个观察值默认均为 false，不是一份实际验收答案：

```json
{
  "schema": 1,
  "run_id": "copy the current guest-stage run_id",
  "archive_sha256": "copy the current guest-stage archive_sha256",
  "stage_id": "copy the current guest-stage stage_id",
  "default_browser": false,
  "clean_environment": false,
  "screenshot_names": []
}
```

只有真实观察到当前浏览器成功显示工作台，才将 `default_browser` 写为布尔 true；只有确认当前确实是新建 Sandbox/干净 VM，才将 `clean_environment` 写为布尔 true。字符串 `"true"`、错误 run/指纹/阶段、其他额外字段均不接受。可选截图名只允许报告目录内的简单 PNG/JPG 文件名，实际文件存在才记录。

有效观察文件到达后，阶段变为 `awaiting_native_directory_selection`，程序自动打开目录窗口；观察者在该窗口中选择 `guest-stage.json` 所示合成路径。选择结果由真实 API 返回值核对，不由观察 JSON 声称成功。窗口关闭后，脚本强制结束空闲服务并检查浏览器进程仍存活。每阶段默认最多等待 180 秒，可通过 `-ObservationTimeoutSeconds` 在 10–600 秒之间调整。

缺少、损坏或不匹配的观察文件不会被当作成功：超时后保留 `partial`、`clean_windows=false` 与 `pending_manual_observation`，停止自己的服务，结束当前执行。需要继续时重新准备一个新 kit。标准用户、真实中文 profile、SmartScreen 缺项依旧据实记录；默认管理员 Sandbox 不会因此通过标准用户验收。

需要人亲自在客体终端回答时，可显式使用 `-InteractiveObservations` 保留原 `Read-Host` 方式；它不用于 computer-use 自动化。`HostHarnessSelfTest` 禁止该选项，并始终拒绝观察文件将开发机结果升级为干净环境。

本脚本**不发送 Ctrl+C/Ctrl+Break**，不覆盖目录选择器仍打开、FFmpeg 仍在处理时的有序退出，也不覆盖正在处理/提交中的异常断电恢复。相关信号退出与子进程保护由独立 `tests/windows_portable_smoke.py` 实测，必须单独报告结果，不能用本流程的 8 组通过代替。

**Sandbox 默认账户可能是管理员。** 脚本记录实际令牌权限，管理员会话不能通过非管理员验收。中文工作目录也不等于中文用户名。真实中文用户名、非管理员账户、下载标记/SmartScreen 的实际行为，需要相应客体条件与单独证据；不可以通过清空 PATH 或篡改报告字段代替。要测试非管理员，在干净 VM 的标准账户中执行同一脚本，不能在宿主创建测试账户。

另一个干净 VM/第二台电脑可复制 `inputs` 到客体后运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File C:\MediaSlimX-input\clean-windows-harness.ps1 `
  -InputDir C:\MediaSlimX-input -ReportDir C:\MediaSlimX-evidence -SandboxRun -GuestKind Hyper-V
```

此开关声明预期隔离范围，本身不能证明环境干净；第二台独立电脑使用 `-GuestKind fresh-machine`。报告保留 OS/build/用户/实际管理员权限/外部命令，执行者最后需要确认实际观察的环境。无下载标记的离线映射不能验证 SmartScreen；本轮不会指导关闭或绕过防护。

## 报告判定 / Reading the report

`report.json` 绑定 `archive_sha256`，并从待测包清单读取 `bundle_payload_sha256`；包含每一步状态及耗时、环境和人工项目。自动步骤全过仅表示 `success=true`。`status=passed` 还要求实际干净环境确认、非管理员运行、真实默认浏览器、实际目录点选及浏览器退出保护；缺项保持 `partial`。`release_gate_complete` 刻意保持 false，因为本脚本不覆盖全部分发许可、签名、SmartScreen 或其他 Windows 版本验收。不能把 `status=passed` 独立解释成完整发行许可。

报告的 `coverage` 明确记录“空闲服务强制结束后重启”及未覆盖的信号退出/处理中崩溃场景，避免与独立便携包退出回归混淆。

宿主自测仅供维护验收脚本：使用一个新生成 kit、独立输出目录和 `-HostHarnessSelfTest`，不打开用户浏览器，不弹选择器，不改变系统环境。该结果不能用于发行门槛。

观察协议另有 `tests/windows_clean_observations.ps1` 的 8 组纯风险检查通过：正确绑定、明确否定、宿主拒绝、陈旧 run/指纹/阶段、严格布尔、截图/JSON 边界、缺观察文件、当前端口且不泄露令牌。`tests/windows_clean_kit_smoke.py` 的 3 项 ZIP 路径边界检查也通过。它们只验证协议与准备工具，不生成客体通过答案。

微软参考：[Sandbox 配置字段](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)、[配置示例](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-sample-configuration)。

## 标准用户与中文 profile 的待审方案

此段只是准备方案，没有创建账户，也不提供可在宿主误执行的账户创建脚本。Sandbox 可用后，可考虑由客体管理员建立一次性中文名称的标准账户，只加入内置 Users 组，不加入 Administrators。密码仅在客体内存中生成并保留。采用凭据与 profile 加载启动验收，检查实际 SID、权限令牌、`ProfileList\<SID>` 对应的真实中文 profile 目录；不能把修改环境变量当作创建真实用户。当前 harness 同时记录注册表 profile 与环境变量，不混为一谈。

任何后续 bootstrap 默认必须拒绝宿主：固定 guest 输入路径、WDAGUtilityAccount 的真实身份与 profile、客体不同于 kit 中记录的宿主机器名、虚拟机模型、一次性只读 kit 标记全部匹配才考虑继续，不提供强制跳过参数。该防误操作检查不是密码学证明，仍需操作员确认当前显示的确为新建 Sandbox。

仍需实际验证次级登录是否具备显示浏览器、目录选择器的交互桌面权限。[Microsoft CreateProcessWithLogonW](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createprocesswithlogonw) 明确要求相应窗口站与桌面权限。如果受限，不为测试修改广泛桌面 ACL、不更改宿主账户；改用干净 VM 的真实标准账户登录。Sandbox 管理员结果与标准用户结果分别记录，未完成项保持待验证。
