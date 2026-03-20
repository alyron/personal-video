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
	sessions sync.Map // token -> *QRSession
	expiry   time.Duration
	dirty    chan struct{}
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
			expiry:   5 * time.Minute,
			dirty:    make(chan struct{}, 1),
		}
		qrCodeManager.load()
		go qrCodeManager.startCleanup()
		go qrCodeManager.autoSave()
	})
	return qrCodeManager
}

func (qm *QRCodeManager) load() {
	data, err := os.ReadFile(qm.filePath)
	if err != nil {
		return
	}
	var sessions map[string]*QRSession
	if json.Unmarshal(data, &sessions) == nil {
		for token, s := range sessions {
			qm.sessions.Store(token, s)
		}
	}
}

func (qm *QRCodeManager) save() {
	sessions := make(map[string]*QRSession)
	qm.sessions.Range(func(key, value interface{}) bool {
		sessions[key.(string)] = value.(*QRSession)
		return true
	})

	os.MkdirAll(filepath.Dir(qm.filePath), 0755)
	data, _ := json.MarshalIndent(sessions, "", "  ")
	os.WriteFile(qm.filePath, data, 0644)
}

func (qm *QRCodeManager) autoSave() {
	for range qm.dirty {
		qm.save()
	}
}

func (qm *QRCodeManager) markDirty() {
	select {
	case qm.dirty <- struct{}{}:
	default:
	}
}

// CreateQRSession 创建二维码会话
func (qm *QRCodeManager) CreateQRSession() (string, int64) {
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

	qm.sessions.Store(token, session)
	qm.markDirty()

	return token, session.ExpiresAt
}

// GetQRSession 获取二维码会话
func (qm *QRCodeManager) GetQRSession(token string) *QRSession {
	value, ok := qm.sessions.Load(token)
	if !ok {
		return nil
	}

	session := value.(*QRSession)
	if time.Now().UnixMilli() > session.ExpiresAt {
		session.Status = QRStatusExpired
	}

	return session
}

// MarkScanned 标记为已扫描
func (qm *QRCodeManager) MarkScanned(token string) bool {
	value, ok := qm.sessions.Load(token)
	if !ok {
		return false
	}

	session := value.(*QRSession)
	if session.Status != QRStatusPending {
		return false
	}

	session.Status = QRStatusScanned
	qm.markDirty()
	return true
}

// ConfirmLogin 确认登录
func (qm *QRCodeManager) ConfirmLogin(token, sessionID, username string) bool {
	value, ok := qm.sessions.Load(token)
	if !ok {
		return false
	}

	session := value.(*QRSession)
	if session.Status != QRStatusScanned {
		return false
	}

	session.Status = QRStatusConfirmed
	session.SessionID = sessionID
	session.Username = username
	qm.markDirty()
	return true
}

// CancelLogin 取消登录
func (qm *QRCodeManager) CancelLogin(token string) {
	value, ok := qm.sessions.Load(token)
	if !ok {
		return
	}

	session := value.(*QRSession)
	if session.Status == QRStatusScanned {
		session.Status = QRStatusCancelled
		qm.markDirty()
	}
}

// DeleteQRSession 删除二维码会话
func (qm *QRCodeManager) DeleteQRSession(token string) {
	qm.sessions.Delete(token)
	qm.markDirty()
}

func (qm *QRCodeManager) startCleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		qm.cleanup()
	}
}

func (qm *QRCodeManager) cleanup() {
	now := time.Now().UnixMilli()
	qm.sessions.Range(func(key, value interface{}) bool {
		session := value.(*QRSession)
		if now > session.ExpiresAt {
			qm.sessions.Delete(key)
		}
		return true
	})
	qm.markDirty()
}
