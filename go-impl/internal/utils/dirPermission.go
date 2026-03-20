package utils

import (
	"video-server/internal/config"
	"video-server/internal/model"
)

// HasAccess 检查用户是否有权限访问指定目录
func HasAccess(username, dirName string) bool {
	cfg := config.GetConfig()
	
	for _, dir := range cfg.VideoDirs {
		if dir.Name == dirName {
			// 如果没有配置 allowedUsers，则对所有用户开放
			if len(dir.AllowedUsers) == 0 {
				return true
			}
			// 检查用户是否在列表中
			for _, u := range dir.AllowedUsers {
				if u == username {
					return true
				}
			}
			return false
		}
	}
	
	// 目录不存在配置中，拒绝访问
	return false
}

// GetAccessibleDirs 获取用户有权限访问的目录名称列表
func GetAccessibleDirs(username string) []string {
	cfg := config.GetConfig()
	var dirs []string
	
	for _, dir := range cfg.VideoDirs {
		if len(dir.AllowedUsers) == 0 {
			dirs = append(dirs, dir.Name)
		} else {
			for _, u := range dir.AllowedUsers {
				if u == username {
					dirs = append(dirs, dir.Name)
					break
				}
			}
		}
	}
	
	return dirs
}

// FilterVideosByPermission 过滤视频列表，只保留用户有权限访问的视频
func FilterVideosByPermission(videos []model.Video, username string) []model.Video {
	accessibleDirs := GetAccessibleDirs(username)
	var result []model.Video
	
	for _, video := range videos {
		for _, dir := range accessibleDirs {
			if video.DirName == dir {
				result = append(result, video)
				break
			}
		}
	}
	
	return result
}
