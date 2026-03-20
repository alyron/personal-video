@echo off
REM 视频服务器启动脚本 (Go版本)

cd /d "%~dp0"

REM 检查是否已编译
if not exist "video-server.exe" (
    echo 正在编译...
    go build -o video-server.exe ./cmd/server
)

REM 启动服务器
video-server.exe
pause
