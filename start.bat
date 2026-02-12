@echo off
chcp 65001 >nul
echo 正在启动视频服务...
echo.

REM 检查是否安装了依赖
if not exist "node_modules" (
    echo 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo 依赖安装失败，请检查网络连接
        pause
        exit /b 1
    )
    echo 依赖安装完成
    echo.
)

REM 启动服务
call npm start
pause
