#!/bin/bash

# 视频服务启动脚本

echo "正在启动视频服务..."
echo ""

# 检查是否安装了依赖
if [ ! -d "node_modules" ]; then
    echo "首次运行，正在安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "依赖安装失败，请检查网络连接"
        exit 1
    fi
    echo "依赖安装完成"
    echo ""
fi

# 启动服务
npm start
