package service

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"video-server/internal/config"
	"video-server/internal/utils"
)

// 内容类型映射
var contentTypeMap = map[string]string{
	".mp4":  "video/mp4",
	".mkv":  "video/x-matroska",
	".avi":  "video/x-msvideo",
	".mov":  "video/quicktime",
	".webm": "video/webm",
}

// statEntry 文件状态缓存条目
type statEntry struct {
	info     os.FileInfo
	cachedAt time.Time
}

// StatCache 文件状态缓存
type StatCache struct {
	cache sync.Map // path -> *statEntry
	ttl   time.Duration
}

var (
	statCache     *StatCache
	statCacheOnce sync.Once
)

// GetStatCache 获取文件状态缓存
func GetStatCache() *StatCache {
	statCacheOnce.Do(func() {
		statCache = &StatCache{
			ttl: 30 * time.Second,
		}
	})
	return statCache
}

// Get 获取文件状态
func (sc *StatCache) Get(path string) os.FileInfo {
	if value, ok := sc.cache.Load(path); ok {
		entry := value.(*statEntry)
		if time.Since(entry.cachedAt) < sc.ttl {
			return entry.info
		}
		sc.cache.Delete(path)
	}
	return nil
}

// Set 设置文件状态
func (sc *StatCache) Set(path string, info os.FileInfo) {
	sc.cache.Store(path, &statEntry{
		info:     info,
		cachedAt: time.Now(),
	})
}

// VideoStreamService 视频流服务
type VideoStreamService struct {
	statCache *StatCache
}

var (
	videoStreamService *VideoStreamService
	streamOnce         sync.Once
)

// GetVideoStreamService 获取视频流服务单例
func GetVideoStreamService() *VideoStreamService {
	streamOnce.Do(func() {
		videoStreamService = &VideoStreamService{
			statCache: GetStatCache(),
		}
	})
	return videoStreamService
}

// GetVideoPath 获取视频文件路径
func (vss *VideoStreamService) GetVideoPath(videoID string) (string, string, string) {
	videoInfo := utils.GetVideoIDManager().GetVideoByID(videoID)
	if videoInfo == nil {
		return "", "", ""
	}

	cfg := config.GetConfig()

	for _, dir := range cfg.VideoDirs {
		if dir.Name == videoInfo.DirName {
			videoDir, _ := filepath.Abs(dir.Path)
			filePath := filepath.Join(videoDir, videoInfo.RelativePath)
			filename := filepath.Base(videoInfo.RelativePath)
			ext := strings.ToLower(filepath.Ext(filename))
			contentType := contentTypeMap[ext]
			if contentType == "" {
				contentType = "video/mp4"
			}
			return filePath, filename, contentType
		}
	}

	return "", "", ""
}

// GetVideoInfo 获取视频信息
func (vss *VideoStreamService) GetVideoInfo(videoID string) map[string]interface{} {
	videoInfo := utils.GetVideoIDManager().GetVideoByID(videoID)
	if videoInfo == nil {
		return nil
	}

	filePath, filename, contentType := vss.GetVideoPath(videoID)
	if filePath == "" {
		return nil
	}

	return map[string]interface{}{
		"dirName":      videoInfo.DirName,
		"relativePath": videoInfo.RelativePath,
		"filename":     filename,
		"contentType":  contentType,
	}
}

// getFileStat 获取文件状态（带缓存）
func (vss *VideoStreamService) getFileStat(path string) (os.FileInfo, error) {
	if info := vss.statCache.Get(path); info != nil {
		return info, nil
	}

	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	vss.statCache.Set(path, info)
	return info, nil
}

// StreamVideo 流式传输视频
func (vss *VideoStreamService) StreamVideo(w http.ResponseWriter, r *http.Request, videoID, username string) {
	videoInfo := utils.GetVideoIDManager().GetVideoByID(videoID)
	if videoInfo == nil {
		http.Error(w, `{"error":"视频不存在或已过期"}`, http.StatusNotFound)
		return
	}

	if !utils.HasAccess(username, videoInfo.DirName) {
		http.Error(w, `{"error":"无权访问该视频"}`, http.StatusForbidden)
		return
	}

	filePath, _, contentType := vss.GetVideoPath(videoID)
	if filePath == "" {
		http.Error(w, `{"error":"视频不存在或已过期"}`, http.StatusNotFound)
		return
	}

	stat, err := vss.getFileStat(filePath)
	if err != nil {
		http.Error(w, `{"error":"视频文件不存在"}`, http.StatusNotFound)
		return
	}

	fileSize := stat.Size()

	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" {
		vss.streamRange(w, r, filePath, contentType, fileSize, rangeHeader)
		return
	}

	vss.streamFull(w, r, filePath, contentType, fileSize)
}

func (vss *VideoStreamService) streamRange(w http.ResponseWriter, r *http.Request, filePath, contentType string, fileSize int64, rangeHeader string) {
	rangeStr := strings.TrimPrefix(rangeHeader, "bytes=")
	parts := strings.Split(rangeStr, "-")

	start, _ := strconv.ParseInt(parts[0], 10, 64)
	var end int64
	if parts[1] != "" {
		end, _ = strconv.ParseInt(parts[1], 10, 64)
	} else {
		end = fileSize - 1
	}

	chunkSize := end - start + 1

	if start >= fileSize || end >= fileSize || start > end {
		w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, `{"error":"无法打开文件"}`, http.StatusInternalServerError)
		return
	}
	defer file.Close()

	file.Seek(start, io.SeekStart)

	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileSize))
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Content-Length", strconv.FormatInt(chunkSize, 10))
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusPartialContent)

	io.CopyN(w, file, chunkSize)
}

func (vss *VideoStreamService) streamFull(w http.ResponseWriter, r *http.Request, filePath, contentType string, fileSize int64) {
	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, `{"error":"无法打开文件"}`, http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Length", strconv.FormatInt(fileSize, 10))
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)

	io.Copy(w, file)
}

// DownloadVideo 下载视频
func (vss *VideoStreamService) DownloadVideo(w http.ResponseWriter, videoID, username string) {
	videoInfo := utils.GetVideoIDManager().GetVideoByID(videoID)
	if videoInfo == nil {
		http.Error(w, `{"error":"视频不存在或已过期"}`, http.StatusNotFound)
		return
	}

	if !utils.HasAccess(username, videoInfo.DirName) {
		http.Error(w, `{"error":"无权访问该视频"}`, http.StatusForbidden)
		return
	}

	filePath, filename, contentType := vss.GetVideoPath(videoID)
	if filePath == "" {
		http.Error(w, `{"error":"视频不存在或已过期"}`, http.StatusNotFound)
		return
	}

	stat, err := vss.getFileStat(filePath)
	if err != nil {
		http.Error(w, `{"error":"视频文件不存在"}`, http.StatusNotFound)
		return
	}

	file, err := os.Open(filePath)
	if err != nil {
		http.Error(w, `{"error":"无法打开文件"}`, http.StatusInternalServerError)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.PathEscape(filename)))
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(http.StatusOK)

	io.Copy(w, file)
}
