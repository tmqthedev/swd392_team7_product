# Tài liệu Yêu cầu Sửa lỗi (Bugfix Requirements)

## Introduction

Trên máy Windows của người dùng (win32, PowerShell, `C:\Users\Lenovo`), WSL 2 và/hoặc Docker Desktop không khởi động được. Do đó dự án AIVES (backend Node.js build từ `backend/Dockerfile`, cơ sở dữ liệu Postgres dùng image `pgvector/pgvector:pg16`) không thể build image hay chạy container. Tài liệu dự án quy định môi trường local chạy bằng Docker, nên lỗi này chặn toàn bộ việc phát triển và kiểm thử local. Thông báo lỗi cụ thể chưa được ghi nhận; chẩn đoán là bước đầu tiên của quá trình sửa.

Đây là sửa lỗi môi trường hệ thống, không thay đổi mã nguồn. Người dùng đã chọn mức khắc phục "triệt để": được phép gỡ hoàn toàn và cài lại Docker Desktop và WSL; image/container/volume Docker local có thể bị mất. Mọi WSL distro khác (ví dụ Ubuntu) BẮT BUỘC phải được export ra `D:\wsl-backup\` trước khi gỡ và import lại sau đó. Mọi bước phá hủy vẫn cần người dùng xác nhận rõ ràng tại thời điểm thực hiện. Agent không tự nâng quyền; người dùng chạy Kiro với quyền Administrator và tự thực hiện khởi động lại máy cũng như thay đổi BIOS (VT-x/AMD-V) nếu cần. Phiên bản Docker Desktop được cố định qua winget (`--exact --version`).

Kế hoạch 8 bước đã được người dùng phê duyệt: (1) chẩn đoán và ghi lại trạng thái, (2) sao lưu, (3) gỡ cài đặt hoàn toàn, (4) bật lại nền tảng ảo hóa, (5) cài mới WSL, (6) cài Docker Desktop phiên bản cố định, (7) khôi phục distro, (8) kiểm chứng với dự án.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN người dùng khởi động Docker Desktop trên máy Windows hiện tại THEN hệ thống không khởi động được Docker engine (Docker Desktop báo lỗi, treo ở trạng thái "starting" hoặc tự dừng)

1.2 WHEN người dùng chạy các lệnh `wsl` (ví dụ `wsl --status`, `wsl -l -v`) hoặc khởi động một WSL distro THEN hệ thống không khởi động được WSL 2 hoặc báo lỗi nền tảng ảo hóa / dịch vụ WSL

1.3 WHEN người dùng chạy `docker version` hoặc `docker run --rm hello-world` THEN hệ thống không kết nối được tới Docker daemon (phần Server không có hoặc báo lỗi kết nối)

1.4 WHEN người dùng chạy `docker build -t aives-backend ./backend` THEN hệ thống không build được image backend AIVES do Docker engine không chạy

1.5 WHEN người dùng chạy container `pgvector/pgvector:pg16` trên cổng 5432 THEN hệ thống không tạo được container Postgres cho dự án

1.6 WHEN lỗi xảy ra THEN hệ thống không cung cấp thông tin chẩn đoán đã được ghi lại (phiên bản Windows, trạng thái ảo hóa firmware, các Windows feature, `hypervisorlaunchtype`, dịch vụ `vmcompute`/`WslService`/`LxssManager`, dung lượng trống ổ C:, `.wslconfig`, log Docker, Event Viewer Hyper-V-Compute, phần mềm xung đột), khiến nguyên nhân gốc chưa được xác định

### Expected Behavior (Correct)

2.1 WHEN người dùng khởi động Docker Desktop sau khi sửa THEN hệ thống SHALL khởi động Docker engine thành công với backend WSL 2 và ổn định, kể cả sau `wsl --shutdown` hoặc sau khi khởi động lại máy

2.2 WHEN người dùng chạy `wsl --status`, `wsl --version` và `wsl -l -v` sau khi sửa THEN hệ thống SHALL chạy không lỗi, phiên bản mặc định là 2 và mọi distro (bao gồm `docker-desktop` và các distro được khôi phục) hiển thị VERSION 2

2.3 WHEN người dùng chạy `docker version` và `docker run --rm hello-world` sau khi sửa THEN hệ thống SHALL hiển thị đủ cả Client và Server, và container hello-world SHALL chạy thành công rồi tự xóa

2.4 WHEN người dùng chạy `docker build -t aives-backend ./backend` sau khi sửa THEN hệ thống SHALL build thành công image `aives-backend` từ `backend/Dockerfile`

2.5 WHEN người dùng chạy container `pgvector/pgvector:pg16` trên cổng 5432 sau khi sửa THEN hệ thống SHALL khởi động container Postgres và `pg_isready` SHALL báo trạng thái sẵn sàng nhận kết nối

2.6 WHEN quá trình sửa bắt đầu THEN hệ thống SHALL thu thập và lưu trạng thái chẩn đoán đầy đủ vào một file tạm trước mọi thay đổi, và WHEN ảo hóa bị tắt trong firmware THEN quy trình SHALL dừng lại và hướng dẫn người dùng bật VT-x/AMD-V trong BIOS trước khi tiếp tục

2.7 WHEN một bước phá hủy sắp được thực hiện (gỡ Docker Desktop, `wsl --unregister`, `wsl --uninstall`, xóa thư mục dữ liệu Docker, `netsh winsock reset`, tắt/bật Windows feature) THEN quy trình SHALL dừng lại và chỉ tiếp tục khi người dùng xác nhận rõ ràng

2.8 WHEN Docker Desktop được cài lại THEN hệ thống SHALL dùng đúng phiên bản đã cố định qua `winget install --exact --version`, bật backend WSL 2 và người dùng hiện tại SHALL thuộc nhóm `docker-users`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN máy có các WSL distro khác ngoài `docker-desktop`/`docker-desktop-data` (ví dụ Ubuntu) THEN hệ thống SHALL CONTINUE TO giữ nguyên các distro đó cùng dữ liệu bên trong, thông qua `wsl --export` ra `D:\wsl-backup\` (đã kiểm tra file `.tar` hợp lệ) trước khi gỡ và `wsl --import --version 2` sau khi cài lại, với user mặc định như trước

3.2 WHEN các distro được khôi phục và WSL integration được bật THEN hệ thống SHALL CONTINUE TO cho phép người dùng làm việc trong distro như trước, và `docker ps` chạy được từ bên trong distro

3.3 WHEN người dùng có cấu hình `.wslconfig` và `%USERPROFILE%\.docker\config.json` trước khi sửa THEN hệ thống SHALL CONTINUE TO giữ bản sao lưu của các file này và khôi phục lại (hoặc dùng `.wslconfig` tối thiểu `memory=4GB`, `processors=2` nếu người dùng chọn)

3.4 WHEN quá trình sửa diễn ra THEN hệ thống SHALL CONTINUE TO giữ nguyên toàn bộ mã nguồn và file của dự án AIVES trong `d:\Workspace\swd392_team7_product` (bao gồm `backend/Dockerfile`, `.worktrees` và tài liệu), không chỉnh sửa hay xóa

3.5 WHEN máy có các Windows feature, máy ảo hoặc phần mềm không liên quan đến WSL/Docker THEN hệ thống SHALL CONTINUE TO giữ nguyên chúng, trừ khi người dùng xác nhận gỡ một phần mềm xung đột cụ thể đã được chẩn đoán

3.6 WHEN quá trình sửa hoàn tất THEN hệ thống SHALL CONTINUE TO giữ các bản sao lưu trong `D:\wsl-backup\` cho tới khi người dùng đồng ý xóa, trong khi các file tạm chẩn đoán và container/image kiểm thử (hello-world, container Postgres thử nghiệm) SHALL được dọn dẹp
