#!/bin/bash

# 编译脚本

cd "$(dirname "$0")"

VERSION="1.0.0"

echo "编译 Linux AMD64..."
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o "bin/video-server-linux-amd64" ./cmd/server

echo "编译 Linux ARM64..."
GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o "bin/video-server-linux-arm64" ./cmd/server

echo "编译 Darwin AMD64..."
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -o "bin/video-server-darwin-amd64" ./cmd/server

echo "编译 Darwin ARM64..."
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -o "bin/video-server-darwin-arm64" ./cmd/server

echo "编译 Windows AMD64..."
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o "bin/video-server-windows-amd64.exe" ./cmd/server

echo "编译完成！"
echo "二进制文件位于 bin/ 目录"
