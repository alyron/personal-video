package utils

import (
	"sync"

	"video-server/internal/config"
	"video-server/internal/model"
)

// 用户目录权限缓存
var (
	accessCache sync.Map // username -> map[string]bool (dirName -> hasAccess)
)

// HasAccess 检查用户是否有权限访问指定目录
func HasAccess(username, dirName string) bool {
	// 尝试从缓存获取
	if cache, ok := accessCache.Load(username); ok {
		dirs := cache.(map[string]bool)
		return dirs[dirName]
	}

	// 构建缓存
	dirs := buildUserAccessMap(username)
	accessCache.Store(username, dirs)
	return dirs[dirName]
}

// GetAccessibleDirs 获取用户有权限访问的目录名称列表
func GetAccessibleDirs(username string) []string {
	var dirs map[string]bool

	if cache, ok := accessCache.Load(username); ok {
		dirs = cache.(map[string]bool)
	} else {
		dirs = buildUserAccessMap(username)
		accessCache.Store(username, dirs)
	}

	result := make([]string, 0, len(dirs))
	for dir := range dirs {
		result = append(result, dir)
	}
	return result
}

// buildUserAccessMap 构建用户目录访问权限映射
func buildUserAccessMap(username string) map[string]bool {
	cfg := config.GetConfig()
	dirs := make(map[string]bool)

	for _, dir := range cfg.VideoDirs {
		if len(dir.AllowedUsers) == 0 {
			dirs[dir.Name] = true
		} else {
			for _, u := range dir.AllowedUsers {
				if u == username {
					dirs[dir.Name] = true
					break
				}
			}
		}
	}

	return dirs
}

// FilterVideosByPermission 过滤视频列表，只保留用户有权限访问的视频
func FilterVideosByPermission(videos []model.Video, username string) []model.Video {
	var dirs map[string]bool

	if cache, ok := accessCache.Load(username); ok {
		dirs = cache.(map[string]bool)
	} else {
		dirs = buildUserAccessMap(username)
		accessCache.Store(username, dirs)
	}

	// 预估结果大小
	result := make([]model.Video, 0, len(videos))
	for _, video := range videos {
		if dirs[video.DirName] {
			result = append(result, video)
		}
	}

	return result
}

// ClearAccessCache 清除权限缓存（配置变更时调用）
func ClearAccessCache() {
	accessCache = sync.Map{}
}
