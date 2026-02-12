#!/bin/bash

echo "=========================================="
echo "测试视频服务安全特性"
echo "=========================================="
echo ""

# 检查必要的文件
echo "1. 检查文件..."
files=("server.js" "config.json" "package.json" "public/player.html" "key.pem" "cert.pem")
all_exist=true

for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "✗ $file (缺失)"
        all_exist=false
    fi
done

echo ""

# 检查Node.js
echo "2. 检查Node.js..."
if command -v node &> /dev/null; then
    node_version=$(node --version)
    echo "✓ Node.js 版本: $node_version"
else
    echo "✗ Node.js 未安装"
    all_exist=false
fi

echo ""

# 检查npm
echo "3. 检查npm..."
if command -v npm &> /dev/null; then
    npm_version=$(npm --version)
    echo "✓ npm 版本: $npm_version"
else
    echo "✗ npm 未安装"
    all_exist=false
fi

echo ""

# 检查语法
echo "4. 检查代码语法..."
if node -c server.js 2>/dev/null; then
    echo "✓ server.js 语法正确"
else
    echo "✗ server.js 语法错误"
    all_exist=false
fi

echo ""

# 检查依赖
echo "5. 检查依赖包..."
if [ -d "node_modules" ]; then
    package_count=$(ls node_modules | wc -l)
    echo "✓ 已安装 $package_count 个依赖包"
else
    echo "✗ 依赖包未安装"
    echo "  运行: npm install"
    all_exist=false
fi

echo ""

# 检查配置文件
echo "6. 检查配置文件..."
if [ -f "config.json" ]; then
    port=$(grep -o '"port": [0-9]*' config.json | grep -o '[0-9]*')
    https_enabled=$(grep -o '"enabled": [a-z]*' config.json | grep -o '[a-z]*')
    echo "✓ 端口: $port"
    echo "✓ HTTPS: $https_enabled"
fi

echo ""
echo "=========================================="

if [ "$all_exist" = true ]; then
    echo "✓ 所有检查通过！"
    echo "=========================================="
    echo ""
    echo "启动命令: npm start"
    echo "访问地址: https://127.0.0.1:$port"
else
    echo "✗ 存在问题，请修复后再启动"
fi
echo "=========================================="
