@echo off
chcp 65001 >nul

echo 正在生成自签名SSL证书...
echo.

REM 检查是否已存在证书文件
if exist key.pem (
    if exist cert.pem (
        set /p overwrite="SSL证书文件已存在，是否覆盖？(y/n): "
        if /i not "%overwrite%"=="y" (
            echo 取消操作，保留现有证书
            exit /b 0
        )
    )
)

REM 生成自签名证书
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=VideoServer/OU=IT/CN=localhost"

if %errorlevel% equ 0 (
    echo.
    echo =================================================
    echo SSL证书生成成功！
    echo =================================================
    echo 证书文件: cert.pem
    echo 私钥文件: key.pem
    echo 有效期: 365天
    echo.
    echo 注意: 这是一个自签名证书，浏览器会显示安全警告。
    echo 在生产环境中，建议使用正式的SSL证书。
    echo =================================================
) else (
    echo.
    echo 错误: SSL证书生成失败
    exit /b 1
)

pause
