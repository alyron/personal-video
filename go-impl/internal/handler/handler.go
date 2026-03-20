// Package handler HTTP处理器
package handler

import (
	"encoding/json"
	"net/http"
	"path/filepath"

	"github.com/gorilla/mux"

	"video-server/internal/config"
	"video-server/internal/middleware"
	"video-server/internal/model"
	"video-server/internal/service"
	"video-server/internal/utils"
)

// Handler HTTP处理器
type Handler struct {
	authMiddleware  *middleware.AuthMiddleware
	sessionManager  *model.SessionManager
	videoCache      *model.VideoCache
	videoScanner    *service.VideoScanner
	videoStream     *service.VideoStreamService
	favoriteManager *model.FavoriteManager
	qrCodeManager   *model.QRCodeManager
	pinCodeManager  *model.PINCodeManager
}

// NewHandler 创建处理器
func NewHandler() *Handler {
	return &Handler{
		authMiddleware:  middleware.NewAuthMiddleware(),
		sessionManager:  model.GetSessionManager(),
		videoCache:      model.GetVideoCache(),
		videoScanner:    service.GetVideoScanner(),
		videoStream:     service.GetVideoStreamService(),
		favoriteManager: model.GetFavoriteManager(),
		qrCodeManager:   model.GetQRCodeManager(),
		pinCodeManager:  model.GetPINCodeManager(),
	}
}

// SetupRoutes 设置路由
func (h *Handler) SetupRoutes(r *mux.Router) {
	// ==================== 公开路由 ====================
	
	// 登录页面
	r.HandleFunc("/login", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/login.html")
	}).Methods("GET")
	
	// 认证API
	r.HandleFunc("/api/login", h.loginAPI).Methods("POST")
	r.HandleFunc("/api/user", h.userAPI).Methods("GET")
	r.HandleFunc("/api/logout", h.logoutAPI).Methods("GET")
	
	// 二维码登录
	r.HandleFunc("/api/qrcode/create", h.qrcodeCreate).Methods("POST")
	r.HandleFunc("/api/qrcode/status/{token}", h.qrcodeStatus).Methods("GET")
	r.HandleFunc("/api/qrcode/scan/{token}", h.qrcodeScan).Methods("GET")
	r.HandleFunc("/api/qrcode/confirm", h.qrcodeConfirm).Methods("POST")
	r.HandleFunc("/api/qrcode/cancel", h.qrcodeCancel).Methods("POST")
	r.HandleFunc("/qr-confirm/{token}", h.qrConfirmPage).Methods("GET")
	
	// PIN码登录
	r.HandleFunc("/api/pin/generate", h.pinGenerate).Methods("POST")
	r.HandleFunc("/api/pin/login", h.pinLogin).Methods("POST")
	r.HandleFunc("/api/pin/status/{pin}", h.pinStatus).Methods("GET")
	
	// ==================== 需要认证的路由 ====================
	
	// 主页
	r.HandleFunc("/", h.authMiddleware.RequireAuthFunc(func(w http.ResponseWriter, r *http.Request) {
		// 如果缓存为空，启动后台扫描
		if len(h.videoCache.GetVideos()) == 0 && !h.videoCache.IsScanning() {
			go h.videoScanner.ScanAllDirectories()
		}
		http.ServeFile(w, r, "./public/index.html")
	})).Methods("GET")
	
	// 受保护的API
	r.HandleFunc("/api/videos", h.authMiddleware.RequireAuthFunc(h.getVideos)).Methods("GET")
	r.HandleFunc("/api/scan", h.authMiddleware.RequireAuthFunc(h.scanVideos)).Methods("POST")
	r.HandleFunc("/api/scan-status", h.authMiddleware.RequireAuthFunc(h.scanStatus)).Methods("GET")
	r.HandleFunc("/api/video-info", h.authMiddleware.RequireAuthFunc(h.videoInfo)).Methods("GET")
	r.HandleFunc("/api/stream/{videoId}", h.authMiddleware.RequireAuthFunc(h.streamVideo)).Methods("GET")
	r.HandleFunc("/api/download/{videoId}", h.authMiddleware.RequireAuthFunc(h.downloadVideo)).Methods("GET")
	r.HandleFunc("/api/favorites", h.authMiddleware.RequireAuthFunc(h.getFavorites)).Methods("GET")
	r.HandleFunc("/api/favorite", h.authMiddleware.RequireAuthFunc(h.addFavorite)).Methods("POST")
	r.HandleFunc("/api/favorite/{videoId}", h.authMiddleware.RequireAuthFunc(h.removeFavorite)).Methods("DELETE")
	r.HandleFunc("/api/favorite/check/{videoId}", h.authMiddleware.RequireAuthFunc(h.checkFavorite)).Methods("GET")
	r.HandleFunc("/api/sibling-videos", h.authMiddleware.RequireAuthFunc(h.siblingVideos)).Methods("GET")
	
	// 受保护的页面
	r.HandleFunc("/index.html", h.authMiddleware.RequireAuthFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/index.html")
	})).Methods("GET")
	
	r.HandleFunc("/player.html", h.authMiddleware.RequireAuthFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/player.html")
	})).Methods("GET")
	
	// ==================== 静态文件 ====================
	
	// CSS/JS等静态资源
	r.PathPrefix("/css/").Handler(http.StripPrefix("/css/", http.FileServer(http.Dir("./public/css"))))
	r.PathPrefix("/js/").Handler(http.StripPrefix("/js/", http.FileServer(http.Dir("./public/js"))))
	
	// 其他静态HTML文件（公开）
	r.HandleFunc("/login.html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/login.html")
	}).Methods("GET")
	
	r.HandleFunc("/qr-confirm.html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./public/qr-confirm.html")
	}).Methods("GET")
}

// ==================== 认证API ====================

func (h *Handler) loginAPI(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"success":false,"error":"无效请求"}`, http.StatusBadRequest)
		return
	}
	
	cfg := config.GetConfig()
	
	// 验证用户
	var validUser bool
	for _, user := range cfg.Users {
		if user.Username == req.Username && user.Password == req.Password {
			validUser = true
			break
		}
	}
	
	if !validUser {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "用户名或密码错误",
		})
		return
	}
	
	// 创建会话
	sessionID, _ := h.sessionManager.CreateSession(req.Username)
	
	// 设置Cookie (7天有效期)
	http.SetCookie(w, &http.Cookie{
		Name:     "sessionId",
		Value:    sessionID,
		Path:     "/",
		MaxAge:   7 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   cfg.HTTPS.Enabled,
		SameSite: http.SameSiteStrictMode,
	})
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": req.Username,
	})
}

func (h *Handler) userAPI(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("sessionId")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "未登录"})
		return
	}
	
	session := h.sessionManager.GetSession(cookie.Value)
	if session == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "未登录"})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"username": session.Username})
}

func (h *Handler) logoutAPI(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("sessionId")
	if err == nil {
		h.sessionManager.DeleteSession(cookie.Value)
	}
	
	http.SetCookie(w, &http.Cookie{
		Name:   "sessionId",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
	
	http.Redirect(w, r, "/login.html", http.StatusFound)
}

// ==================== 二维码登录API ====================

func (h *Handler) qrcodeCreate(w http.ResponseWriter, r *http.Request) {
	token, expiresAt := h.qrCodeManager.CreateQRSession()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"token":     token,
		"expiresAt": expiresAt,
	})
}

func (h *Handler) qrcodeStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	token := vars["token"]
	
	qrSession := h.qrCodeManager.GetQRSession(token)
	
	if qrSession == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"status":  "invalid",
		})
		return
	}
	
	response := map[string]interface{}{
		"success": true,
		"status":  qrSession.Status,
	}
	
	if qrSession.Status == model.QRStatusConfirmed && qrSession.SessionID != "" {
		response["sessionId"] = qrSession.SessionID
		response["username"] = qrSession.Username
		h.qrCodeManager.DeleteQRSession(token)
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *Handler) qrcodeScan(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	token := vars["token"]
	
	qrSession := h.qrCodeManager.GetQRSession(token)
	
	if qrSession == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "二维码无效或已过期",
		})
		return
	}
	
	if qrSession.Status == model.QRStatusExpired {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "二维码已过期",
		})
		return
	}
	
	if qrSession.Status != model.QRStatusPending {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "二维码已被使用",
		})
		return
	}
	
	h.qrCodeManager.MarkScanned(token)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"token":   token,
	})
}

func (h *Handler) qrcodeConfirm(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"success":false,"error":"无效请求"}`, http.StatusBadRequest)
		return
	}
	
	cfg := config.GetConfig()
	
	// 验证二维码状态
	qrSession := h.qrCodeManager.GetQRSession(req.Token)
	if qrSession == nil || qrSession.Status != model.QRStatusScanned {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "二维码无效或已过期",
		})
		return
	}
	
	// 验证用户
	var validUser bool
	for _, user := range cfg.Users {
		if user.Username == req.Username && user.Password == req.Password {
			validUser = true
			break
		}
	}
	
	if !validUser {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "用户名或密码错误",
		})
		return
	}
	
	// 创建会话
	sessionID, _ := h.sessionManager.CreateSession(req.Username)
	
	// 确认登录
	h.qrCodeManager.ConfirmLogin(req.Token, sessionID, req.Username)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": req.Username,
	})
}

func (h *Handler) qrcodeCancel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"success":false,"error":"无效请求"}`, http.StatusBadRequest)
		return
	}
	
	h.qrCodeManager.CancelLogin(req.Token)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (h *Handler) qrConfirmPage(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	token := vars["token"]
	http.Redirect(w, r, "/qr-confirm.html?token="+token, http.StatusFound)
}

// ==================== PIN码登录API ====================

func (h *Handler) pinGenerate(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("sessionId")
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "未登录",
		})
		return
	}
	
	session := h.sessionManager.GetSession(cookie.Value)
	if session == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "未登录",
		})
		return
	}
	
	pin, expiresAt := h.pinCodeManager.CreatePINSession(session.Username)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":   true,
		"pin":       pin,
		"expiresAt": expiresAt,
	})
}

func (h *Handler) pinLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PIN string `json:"pin"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"success":false,"error":"无效请求"}`, http.StatusBadRequest)
		return
	}
	
	if req.PIN == "" || !isNumeric(req.PIN) || len(req.PIN) != 4 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "请输入4位数字PIN码",
		})
		return
	}
	
	result := h.pinCodeManager.UsePINCode(req.PIN)
	if result == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   "PIN码无效或已过期",
		})
		return
	}
	
	// 创建会话
	newSessionID, _ := h.sessionManager.CreateSession(*result)
	
	// 删除已使用的PIN码会话
	h.pinCodeManager.DeletePINSession(req.PIN)
	
	cfg := config.GetConfig()
	
	// 设置Cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "sessionId",
		Value:    newSessionID,
		Path:     "/",
		MaxAge:   7 * 24 * 60 * 60,
		HttpOnly: true,
		Secure:   cfg.HTTPS.Enabled,
		SameSite: http.SameSiteStrictMode,
	})
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": *result,
	})
}

func (h *Handler) pinStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	pin := vars["pin"]
	
	pinSession := h.pinCodeManager.GetPINSession(pin)
	
	if pinSession == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"status":  "invalid",
		})
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"status":   pinSession.Status,
		"username": pinSession.Username,
	})
}

// ==================== 视频API ====================

func (h *Handler) getVideos(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)
	
	allVideos := h.videoCache.GetVideos()
	videos := utils.FilterVideosByPermission(allVideos, username)
	
	// 添加ID
	videosWithID := make([]map[string]interface{}, len(videos))
	for i, video := range videos {
		videoID := utils.GetVideoIDManager().GetVideoID(video.DirName, video.RelativePath)
		videosWithID[i] = map[string]interface{}{
			"name":         video.Name,
			"relativePath": video.RelativePath,
			"fullPath":     video.FullPath,
			"dirName":      video.DirName,
			"size":         video.Size,
			"sizeBytes":    video.SizeBytes,
			"modified":     video.Modified,
			"modifiedTime": video.ModifiedTime,
			"id":           videoID,
		}
	}
	
	// 统计目录数
	dirSet := make(map[string]bool)
	for _, v := range videos {
		dirSet[v.DirName] = true
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"videos":     videosWithID,
		"videoCount": len(videos),
		"dirCount":   len(dirSet),
	})
}

func (h *Handler) scanVideos(w http.ResponseWriter, r *http.Request) {
	// 检查是否已在扫描
	if h.videoCache.IsScanning() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"message": "扫描已在进行中",
		})
		return
	}

	// 异步启动扫描
	go h.videoScanner.ScanAllDirectories()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "扫描已启动",
	})
}

func (h *Handler) scanStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.videoCache.GetStatus())
}

func (h *Handler) videoInfo(w http.ResponseWriter, r *http.Request) {
	videoID := r.URL.Query().Get("id")
	username := r.Context().Value("username").(string)
	
	if videoID == "" {
		http.Error(w, `{"error":"缺少 id 参数"}`, http.StatusBadRequest)
		return
	}
	
	info := h.videoStream.GetVideoInfo(videoID)
	if info == nil {
		http.Error(w, `{"error":"视频不存在或已过期"}`, http.StatusNotFound)
		return
	}
	
	// 权限验证
	if !utils.HasAccess(username, info["dirName"].(string)) {
		http.Error(w, `{"error":"无权访问该视频"}`, http.StatusForbidden)
		return
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(info)
}

func (h *Handler) streamVideo(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	videoID := vars["videoId"]
	username := r.Context().Value("username").(string)
	
	h.videoStream.StreamVideo(w, r, videoID, username)
}

func (h *Handler) downloadVideo(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	videoID := vars["videoId"]
	username := r.Context().Value("username").(string)
	
	h.videoStream.DownloadVideo(w, videoID, username)
}

// ==================== 收藏API ====================

func (h *Handler) getFavorites(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)
	favorites := h.favoriteManager.GetFavorites(username)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"favorites": favorites,
	})
}

func (h *Handler) addFavorite(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)
	
	var req struct {
		VideoID  string `json:"videoId"`
		DirName  string `json:"dirName"`
		Filename string `json:"filename"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"无效请求"}`, http.StatusBadRequest)
		return
	}
	
	if req.VideoID == "" {
		http.Error(w, `{"error":"缺少 videoId"}`, http.StatusBadRequest)
		return
	}
	
	success := h.favoriteManager.AddFavorite(username, model.Favorite{
		VideoID:  req.VideoID,
		DirName:  req.DirName,
		Filename: req.Filename,
	})
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": success})
}

func (h *Handler) removeFavorite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	videoID := vars["videoId"]
	username := r.Context().Value("username").(string)
	
	success := h.favoriteManager.RemoveFavorite(username, videoID)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": success})
}

func (h *Handler) checkFavorite(w http.ResponseWriter, r *http.Request) {
	username := r.Context().Value("username").(string)
	vars := mux.Vars(r)
	videoID := vars["videoId"]
	
	isFav := h.favoriteManager.IsFavorite(username, videoID)
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"isFavorite": isFav})
}

func (h *Handler) siblingVideos(w http.ResponseWriter, r *http.Request) {
	videoID := r.URL.Query().Get("id")
	username := r.Context().Value("username").(string)
	
	if videoID == "" {
		http.Error(w, `{"error":"缺少 id 参数"}`, http.StatusBadRequest)
		return
	}
	
	currentVideoInfo := utils.GetVideoIDManager().GetVideoByID(videoID)
	if currentVideoInfo == nil {
		http.Error(w, `{"error":"视频不存在"}`, http.StatusNotFound)
		return
	}
	
	// 权限验证
	if !utils.HasAccess(username, currentVideoInfo.DirName) {
		http.Error(w, `{"error":"无权访问"}`, http.StatusForbidden)
		return
	}
	
	// 获取当前视频所在目录
	currentDir := filepath.Dir(currentVideoInfo.RelativePath)
	currentFilename := filepath.Base(currentVideoInfo.RelativePath)
	
	// 从缓存中获取同目录下的其他视频
	allVideos := h.videoCache.GetVideos()
	var siblingVideos []map[string]interface{}
	
	for _, video := range allVideos {
		videoDir := filepath.Dir(video.RelativePath)
		if video.DirName == currentVideoInfo.DirName && 
		   videoDir == currentDir && 
		   filepath.Base(video.RelativePath) != currentFilename {
			siblingVideos = append(siblingVideos, map[string]interface{}{
				"id":           utils.GetVideoIDManager().GetVideoID(video.DirName, video.RelativePath),
				"filename":     filepath.Base(video.RelativePath),
				"relativePath": video.RelativePath,
			})
		}
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"videos":     siblingVideos,
		"currentDir": currentDir,
	})
}

// ==================== 工具函数 ====================

func isNumeric(s string) bool {
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
