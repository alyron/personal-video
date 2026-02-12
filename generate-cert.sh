#!/bin/bash

# SSL证书生成脚本 - 生成到 data 目录

echo "正在生成自签名SSL证书..."
echo ""

# 确保 data 目录存在
if [ ! -d "data" ]; then
    mkdir -p data
    echo "已创建 data 目录"
fi

# 检查是否已存在证书文件
if [ -f "data/key.pem" ] && [ -f "data/cert.pem" ]; then
    read -p "SSL证书文件已存在，是否覆盖？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "取消操作，保留现有证书"
        exit 0
    fi
fi

# 生成自签名证书到 data 目录
openssl req -x509 -newkey rsa:2048 -keyout data/key.pem -out data/cert.pem -days 365 -nodes -subj "/C=CN/ST=Beijing/L=Beijing/O=VideoServer/OU=IT/CN=localhost"

if [ $? -eq 0 ]; then
    echo ""
    echo "================================================="
    echo "SSL证书生成成功！"
    echo "================================================="
    echo "证书文件: data/cert.pem"
    echo "私钥文件: data/key.pem"
    echo "有效期: 365天"
    echo ""
    echo "注意: 这是一个自签名证书，浏览器会显示安全警告。"
    echo "在生产环境中，建议使用正式的SSL证书。"
    echo "================================================="
else
    echo ""
    echo "错误: SSL证书生成失败"
    exit 1
fi
