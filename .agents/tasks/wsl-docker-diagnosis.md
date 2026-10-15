# Báo cáo chẩn đoán WSL 2 / Docker Desktop (Task 1, chỉ đọc)

Thời điểm thu thập: 2026-10-15 ~20:57 (giờ máy, UTC+7). Phiên chạy quyền Administrator. Không có thay đổi nào được thực hiện.

## Tóm tắt

- Nguyên nhân gốc của lỗi ban đầu (13:23–13:25 hôm nay): **gói WSL (ứng dụng "Windows Subsystem for Linux") chưa được cài**. Docker Desktop 4.95.0 (bản cài per-user ở `%LOCALAPPDATA%\Programs\DockerDesktop`) gọi `c:\windows\system32\wsl.exe --version` và nhận `exit status 1 (stderr: The system cannot find the file specified.)` → `engine linux/wsl failed to start: checking preconditions: checking WSL version` → backend thoát. Đây là triệu chứng điển hình khi chỉ có stub `wsl.exe` inbox mà không có gói WSL.
- Trạng thái hiện tại **đã khác hẳn lúc lỗi**: trong khoảng 20:28–20:39 hôm nay đã có người/agent cài thủ công WSL 3.0.3.0 (MSI từ `D:\Workspace\wsl-installer\`, cài thành công) và cài lại Docker Desktop 4.95.0 vào `D:\Docker\DockerDesktop` với `--backend=wsl-2 --wsl-default-data-root=D:\DockerData --always-run-service`. Hiện `wsl --version`/`wsl --status` chạy OK (Default Version: 2), hypervisor đang chạy, các feature cần thiết đã bật, `com.docker.service` và `WslService` đang Running.
- **Docker Desktop chưa được khởi động lần nào kể từ lần cài lại** (log `Docker Desktop.exe.log` dừng ở 13:25; không có `settings-store.json`; chưa có distro `docker-desktop`; `D:\DockerData` chưa tồn tại). Vì vậy `docker version` hiện chỉ có Client, lỗi `open //./pipe/docker_engine: The system cannot find the file specified.`
- Rủi ro lớn nhất còn lại: **ổ C: chỉ còn 5,36 GB trống** (WSL kernel/cập nhật, temp của installer và các file vhdx mặc định đều cần C:). Installer Docker vừa rồi đã sát ngưỡng ("5574 MiB free (above 5120 MiB threshold)").

Trả lời các câu hỏi bắt buộc:

- (a) Ảo hóa firmware: **ĐÃ BẬT**. WMI báo `VirtualizationFirmwareEnabled : False` nhưng đó là do hypervisor đã chạy (systeminfo: "A hypervisor has been detected", `HypervisorPresent=True`, VBS Running, Hyper-V-Hypervisor khởi động mỗi lần boot). Không cần vào BIOS.
- (b) Feature cần thiết: `Microsoft-Windows-Subsystem-Linux` Enabled, `VirtualMachinePlatform` Enabled, `hypervisorlaunchtype Auto`. `Microsoft-Hyper-V-All` và `Containers` không có trên bản Home (không cần cho WSL 2). `HypervisorPlatform` Disabled (không cần).
- (c) Distro non-docker cần export: **không có**. `wsl -l -v` báo "no installed distributions", HKCU `...\Lxss` không có subkey nào. Không có `ext4.vhdx` nào trong `%LOCALAPPDATA%\Packages\*\LocalState` hay `%LOCALAPPDATA%\Docker\wsl`. Bước sao lưu distro/khôi phục distro (bước 2 phần distro, bước 7) trở thành no-op. D: còn 87,11 GB trống, dư sức.
- (d) Docker Desktop mới nhất qua winget: **4.95.0** (Release Date 2026-10-09, build 242831) — trùng bản đang cài. Ghim `winget install --id Docker.DockerDesktop --exact --version 4.95.0`.
- (e) Điều chỉnh kế hoạch 8 bước: xem mục "Kết luận và khuyến nghị".

## Bằng chứng

### 1. Windows

```
WindowsProductName : Windows 10 Home Single Language   (chuỗi registry cũ; bcdedit description = "Windows 11")
OsVersion          : 10.0.26200
OsBuildNumber      : 26200
OSDisplayVersion   : 25H2
wsl --version → Windows version: 10.0.26200.9711
```
→ Windows 11 25H2 Home, đạt yêu cầu. RAM vật lý ~7,9 GB.

### 2. CPU / ảo hóa

```
Name : Intel(R) Core(TM) i5-10300H CPU @ 2.50GHz
VirtualizationFirmwareEnabled / SLAT / VMMonitorModeExtensions : False (do hypervisor đang chạy che thông tin)
systeminfo: Virtualization-based security: Status: Running
            Hyper-V Requirements: A hypervisor has been detected. Features required for Hyper-V will not be displayed.
Win32_ComputerSystem.HypervisorPresent : True
```

### 3. Optional features

```
Microsoft-Windows-Subsystem-Linux : Enabled
VirtualMachinePlatform            : Enabled
Microsoft-Hyper-V-All             : <không có trên edition Home>
HypervisorPlatform                : Disabled
Containers                        : <không có trên edition Home>
```

### 4. bcdedit {current}

```
description          Windows 11
hypervisorlaunchtype Auto
```

### 5. WSL

```
wsl --version : WSL version 3.0.3.0; Kernel 6.18.54.1-1; WSLg 1.0.79; Windows 10.0.26200.9711  (EXIT=0)
wsl --status  : Default Version: 2  (EXIT=0)
wsl -l -v     : Windows Subsystem for Linux has no installed distributions.  (EXIT=-1, bình thường khi không có distro)
Get-AppxPackage : MicrosoftCorporationII.WindowsSubsystemForLinux 3.0.3.0, Status Ok, SignatureKind Developer
MSI uninstall key {2D92E6AF-35B2-4109-893F-59E4A4F2D550} "Windows Subsystem for Linux" 3.0.3.0,
  InstallDate 20261015, InstallSource D:\Workspace\wsl-installer\
HKLM\...\Lxss\MSI : InstallLocation C:\Program Files\WSL\, Version 3.0.3.0
D:\Workspace\wsl-installer\install.log : "Installation completed successfully ... status: 0" (20:33:20)
System32\wsl.exe : 10.0.26100.8737 (stub inbox)
```
Lưu ý: `SignatureKind Developer` là bình thường với gói WSL cài qua MSI (sideload). WSL 3.0.3.0 là bản cài thủ công từ file MSI trong `D:\Workspace\wsl-installer\` (có 2 bản trùng: `wsl-3.0.3-x64.msi`, `wsl.3.0.3.0.x64.msi`, mỗi file ~350 MB).

### 6. Services

```
com.docker.service Running Automatic   (D:\Docker\DockerDesktop\com.docker.service, 4.95.0.242831)
WslService         Running Automatic
vmcompute          Running Manual
hns                Running Manual
HvHost             Running Manual
LxssManager, vmms  : không tồn tại (bình thường: Win11 + WSL MSI dùng WslService; Home không có vmms)
vmic*              Stopped Manual (bình thường)
```

### 7. Docker Desktop

```
Uninstall key "Docker Desktop" 4.95.0, InstallLocation D:\Docker\DockerDesktop
C:\Program Files\Docker\Docker\  : không tồn tại (chỉ có C:\Program Files\Docker\cli-plugins, 20:39)
docker (PATH) : D:\Docker\DockerDesktop\resources\bin\docker.exe
docker --version : Docker version 29.8.2, build 7fc2dff
docker version   : Client 29.8.2 OK; Server: failed to connect to the docker API at npipe:////./pipe/docker_engine ... The system cannot find the file specified.
docker context ls: default * (npipe:////./pipe/docker_engine), desktop-linux
docker-users     : LAPTOP-6SECBS99\Lenovo (Local) — người dùng hiện tại ĐÃ thuộc nhóm
%APPDATA%\Docker\settings-store.json / settings.json : KHÔNG tồn tại (Docker Desktop chưa chạy lần đầu sau cài lại)
Process: chỉ có com.docker.service (20:39) và wslservice (20:33); không có "Docker Desktop" / com.docker.backend
```

Lệnh cài lại (từ `%LOCALAPPDATA%\Docker\log\host\DockerDesktopInstaller.exe.log`, 13:38 UTC = 20:38 local):
```
install --quiet --accept-license --backend=wsl-2 --installation-dir=D:\Docker\DockerDesktop
        --wsl-default-data-root=D:\DockerData --always-run-service
disk space check for install skipped: 5574 MiB free (above 5120 MiB threshold)
```

### 8. Log Docker (lần chạy lỗi, 06:23–06:25 UTC = 13:23–13:25 local, bản per-user cũ)

`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log` / `monitor.log`:
```
listing WSL distros: ... c:\windows\system32\wsl.exe -l -v --all: exit status 1 (stderr: The system cannot find the file specified.
neither WSL2 data distro nor disk exist. Looking at WSL2MonoDistro flag
overwriting desktop state error: engine linux/wsl failed to start: checking preconditions: checking WSL version:
  getting WSL version: executing wsl --version: ... exit status 1 (stderr: The system cannot find th…
sending desktop state:ExitHealthyState
kill frontend processes: Access is denied.
```
`com.docker.build.log`: `failed to listen to docker events: Error response from daemon: Docker Desktop is unable to start`
`com.docker.diagnose.exe.log`: `unable to query WSL distros: exit status 1`; `open \\.\pipe\dockerVirtualization: The system cannot find the file specified.`
`log\vm\init.log`: rỗng (VM chưa từng khởi động).
`%LOCALAPPDATA%\Docker\install-log.txt` (06:34 UTC): bản per-user cũ đã được gỡ; vài file bị khóa (`Access ... denied`) được dời vào `%LOCALAPPDATA%\Programs\DockerDesktop\tmp-delete` — rác còn sót, nên dọn ở bước gỡ.

### 9. Event log (7 ngày)

- Hyper-V-Compute-Admin / Operational, Hyper-V-Hypervisor-Admin: không có lỗi/cảnh báo.
- Hyper-V-VmSwitch-Operational: chỉ cảnh báo vô hại ID 148/285 cho vNIC "WSL (Hyper-V firewall)" từ 20:34 (WSL tạo switch sau khi cài).
- System: chỉ Hyper-V-Hypervisor 167 (không bật mitigation vì HyperThreading) — vô hại, xác nhận hypervisor khởi động mỗi lần boot.
- Không có lỗi Lxss/Wsl/vmcompute/MsiInstaller liên quan.

### 10. Ổ đĩa / vhdx

```
C: Used 169,26 GB  Free 5,36 GB   ← nguy cơ cao
D: Used 212,89 GB  Free 87,11 GB
```
Không có file `.vhdx` nào của WSL/Docker (`%LOCALAPPDATA%\Docker\wsl` không tồn tại, `D:\DockerData` chưa tạo, không có `ext4.vhdx` trong Packages).

### 11. Cấu hình người dùng

- `%USERPROFILE%\.wslconfig`: không tồn tại.
- `%USERPROFILE%\.docker\config.json`: không tồn tại (thư mục `.docker` có `buildx, cli-plugins, cloud, contexts, desktop-build, models, .token_seed`).

### 12. Phần mềm xung đột

- Antivirus: chỉ Windows Defender. Không có firewall bên thứ ba.
- Winsock: 28 entry, tất cả provider là `%SystemRoot%\system32\mswsock.dll`, không có LSP bên thứ ba → **không cần `netsh winsock reset`**.
- SoftEther VPN Client 4.34 (dịch vụ `SEVPNCLIENT` Running, driver `Neo_VPN` Running, adapter "VPN - VPN Client" Disconnected). Rủi ro thấp; chỉ ảnh hưởng mạng WSL khi VPN đang kết nối.
- Driver `aehd` (Android Emulator Hypervisor Driver) Stopped; .NET Android SDK manifests — không xung đột.
- Không có VirtualBox, VMware, BlueStacks, Nox, LDPlayer, HAXM.
- vEthernet "WSL (Hyper-V firewall)" Up.

### 13. Distro non-docker

Không có. HKCU `Software\Microsoft\Windows\CurrentVersion\Lxss` không có subkey, không có DefaultDistribution.

## Kết luận và khuyến nghị

Xếp hạng nguyên nhân:

1. **(Đã xác nhận, nguyên nhân lỗi ban đầu)** Thiếu gói WSL → `wsl.exe --version` lỗi "file not found" → Docker Desktop dừng ở precondition check. Hiện đã được khắc phục bằng WSL MSI 3.0.3.0 (cài thành công 20:33).
2. **(Hiện tại)** Docker Desktop bản cài lại chưa được khởi động/khởi tạo, nên chưa có distro `docker-desktop`, chưa có pipe `docker_engine`. Chưa có bằng chứng lỗi cho bản cài mới.
3. **(Rủi ro)** C: còn 5,36 GB. Docker Desktop đã đặt data-root ở `D:\DockerData` nên vhdx sẽ nằm trên D:, nhưng WSL/temp/update vẫn dùng C:. Nên giải phóng ≥10–15 GB trên C: trước khi tiếp tục.
4. **(Rủi ro thấp)** SoftEther VPN có thể gây lỗi mạng trong WSL khi đang kết nối; không phải nguyên nhân khởi động.

Điều chỉnh đề xuất cho kế hoạch 8 bước trong `bugfix.md`:

- Bước 1: hoàn thành bằng báo cáo này.
- Bước 2 (sao lưu): không có distro, không có `.wslconfig`, không có `.docker\config.json` → chỉ cần tạo `D:\wsl-backup\` và ghi chú "không có gì để sao lưu". Có thể lưu kèm bản sao thư mục `%USERPROFILE%\.docker\contexts` cho chắc.
- Bước 3 (gỡ hoàn toàn): **khuyến nghị thử khởi động Docker Desktop hiện tại TRƯỚC** (một bước kiểm tra: mở `D:\Docker\DockerDesktop\Docker Desktop.exe`, chờ engine running, `docker version`, `docker run --rm hello-world`). Nếu chạy được thì bỏ qua bước 3–6 (gỡ/cài lại), đi thẳng tới bước 8. Nếu người dùng vẫn muốn "triệt để", khi gỡ cần dọn thêm `%LOCALAPPDATA%\Programs\DockerDesktop` (rác `tmp-delete` từ bản per-user cũ) và các thư mục `%APPDATA%\Docker`, `%LOCALAPPDATA%\Docker`, `C:\ProgramData\DockerDesktop`, `D:\DockerData` (nếu được tạo).
- Bước 4 (nền tảng ảo hóa): không cần tắt/bật feature hay bcdedit — tất cả đã đúng. Bỏ qua, chỉ kiểm tra lại.
- Bước 5 (WSL): WSL 3.0.3.0 đã cài thành công. Nếu gỡ lại, cài lại cùng MSI có sẵn ở `D:\Workspace\wsl-installer\wsl.3.0.3.0.x64.msi` (hoặc `wsl --update`). Không cần `netsh winsock reset`.
- Bước 6 (Docker Desktop): ghim `--exact --version 4.95.0`. Giữ `--installation-dir=D:\Docker\DockerDesktop` và `--wsl-default-data-root=D:\DockerData` vì C: thiếu chỗ. Người dùng đã ở `docker-users`.
- Bước 7 (khôi phục distro): no-op. Có thể tạo `.wslconfig` tối thiểu (`memory=4GB`, `processors=2`) nếu người dùng muốn — máy chỉ có ~7,9 GB RAM nên giới hạn này hợp lý.
- Bước 8: giữ nguyên. Sau đó có thể dọn `D:\Workspace\wsl-installer\` (~1,3 GB, có file MSI trùng) nếu người dùng đồng ý.
- Phần mềm xung đột: không cần gỡ gì. Khuyên ngắt SoftEther VPN khi kiểm thử.

Những điểm chưa xác minh được (do chỉ đọc): chưa thử khởi động Docker Desktop hay boot một WSL VM thật (không có distro nào để chạy), nên chưa khẳng định bản cài mới chạy ổn.
