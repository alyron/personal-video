package model

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// QRStatus 二维码状态
type QRStatus string

const (
	QRStatusPending   QRStatus = "pending"
	QRStatusScanned   QRStatus = "scanned"
	QRStatusConfirmed QRStatus = "confirmed"
	QRStatusCancelled QRStatus = "cancelled"
	QRStatusExpired   QRStatus = "expired"
)

// QRSession 二维码会话
type QRSession struct {
	Token     string   `json:"token"`
	Status    QRStatus `json:"status"`
	CreatedAt int64    `json:"createdAt"`
	ExpiresAt int64    `json:"expiresAt"`
	SessionID string   `json:"sessionId"`
	Username  string   `json:"username"`
}

// QRCodeManager 二维码会话管理器
type QRCodeManager struct {
	filePath string
	sessions map[string]*QRSession
	mu       sync.RWMutex
	expiry   time.Duration
}

var (
	qrCodeManager *QRCodeManager
	qrOnce        sync.Once
)

// GetQRCodeManager 获取二维码管理器单例
func GetQRCodeManager() *QRCodeManager {
	qrOnce.Do(func() {
		execPath, _ := os.Executable()
		baseDir := filepath.Dir(execPath)
		qrCodeManager = &QRCodeManager{
			filePath: filepath.Join(baseDir, "data", "qrSessions.json"),
			sessions: make(map[string]*QRSession),
			expiry:   5 * time.Minute,
		}
		qrCodeManager.load()
		go qrCodeManager.startCleanup()
	})
	return qrCodeManager
}

func (qm *QRCodeManager) load() {
	data, err := os.ReadFile(qm.filePath)
	if err != nil {
		return
	}
	json.Unmarshal(data, &qm.sessions)
}

func (qm *QRCodeManager) save() {
	os.MkdirAll(filepath.Dir(qm.filePath), 0755)
	data, _ := json.MarshalIndent(qm.sessions, "", "  ")
	os.WriteFile(qm.filePath, data, 0644)
}

// CreateQRSession 创建二维码会话
func (qm *QRCodeManager) CreateQRSession() (string, int64) {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	
	bytes := make([]byte, 32)
	rand.Read(bytes)
	token := hex.EncodeToString(bytes)
	
	now := time.Now()
	session := &QRSession{
		Token:     token,
		Status:    QRStatusPending,
		CreatedAt: now.UnixMilli(),
		ExpiresAt: now.Add(qm.expiry).UnixMilli(),
	}
	
	qm.sessions[token] = session
	qm.save()
	
	return token, session.ExpiresAt
}

// GetQRSession 获取二维码会话
func (qm *QRCodeManager) GetQRSession(token string) *QRSession {
	qm.mu.RLock()
	defer qm.mu.RUnlock()
	
	session, ok := qm.sessions[token]
	if !ok {
		return nil
	}
	
	// 检查过期
	if time.Now().UnixMilli() > session.ExpiresAt {
		session.Status = QRStatusExpired
	}
	
	return session
}

// MarkScanned 标记为已扫描
func (qm *QRCodeManager) MarkScanned(token string) bool {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	
	session, ok := qm.sessions[token]
	if !ok || session.Status != QRStatusPending {
		return false
	}
	
	session.Status = QRStatusScanned
	qm.save()
	return true
}

// ConfirmLogin 确认登录
func (qm *QRCodeManager) ConfirmLogin(token, sessionID, username string) bool {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	
	session, ok := qm.sessions[token]
	if !ok || session.Status != QRStatusScanned {
		return false
	}
	
	session.Status = QRStatusConfirmed
	session.SessionID = sessionID
	session.Username = username
	qm.save()
	return true
}

// CancelLogin 取消登录
func (qm *QRCodeManager) CancelLogin(token string) {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	
	session, ok := qm.sessions[token]
	if ok && session.Status == QRStatusScanned {
		session.Status = QRStatusCancelled
		qm.save()
	}
}

// DeleteQRSession 删除二维码会话
func (qm *QRCodeManager) DeleteQRSession(token string) {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	
	delete(qm.sessions, token)
	qm.save()
}

func (qm *QRCodeManager) startCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		qm.cleanup()
	}
}

func (qm *QRCodeManager) cleanup() {
	qm.mu.Lock()
	defer qm.mu.Unlock()
	
	now := time.Now().UnixMilli()
	for token, session := range qm.sessions {
		if now > session.ExpiresAt {
			delete(qm.sessions, token)
		}
	}
	qm.save()
}
