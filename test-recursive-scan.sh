#!/bin/bash

echo "=========================================="
echo "测试递归扫描功能"
echo "=========================================="
echo ""

# 创建测试目录结构
echo "1. 创建测试目录结构..."
mkdir -p test_videos/电影/动作片
mkdir -p test_videos/电影/喜剧片
mkdir -p test_videos/电视剧/国产剧
mkdir -p test_videos/动画

echo "✓ 目录结构创建完成"

# 创建测试视频文件（空文件）
echo ""
echo "2. 创建测试视频文件..."
touch test_videos/movie1.mp4
touch test_videos/电影/动作片/复仇者联盟.mp4
touch test_videos/电影/喜剧片/功夫.mp4
touch test_videos/电视剧/国产剧/琅琊榜.mp4
touch test_videos/动画/千与千寻.mp4

echo "✓ 创建 5 个测试视频文件"

# 显示目录结构
echo ""
echo "3. 目录结构："
find test_videos -type f -name "*.mp4" | sort

echo ""
echo "=========================================="
echo "测试完成！"
echo "=========================================="
echo ""
echo "请在 config.json 中配置："
echo '  { "name": "测试视频", "path": "./test_videos" }'
echo ""
echo "然后启动服务，应该能看到 5 个视频文件"
echo "=========================================="
