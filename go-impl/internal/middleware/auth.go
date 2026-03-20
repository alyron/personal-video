// Package middleware 中间件
package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"video-server/internal/model"
)

// AuthMiddleware 认证中间件
type AuthMiddleware struct {
	sessionManager *model.SessionManager
}

// NewAuthMiddleware 创建认证中间件
func NewAuthMiddleware() *AuthMiddleware {
	return &AuthMiddleware{
		sessionManager: model.GetSessionManager(),
	}
}

// RequireAuthFunc 要求认证（返回 HandlerFunc）
func (am *AuthMiddleware) RequireAuthFunc(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 获取 sessionId cookie
		cookie, err := r.Cookie("sessionId")
		if err != nil {
			am.handleUnauthorized(w, r)
			return
		}
		
		session := am.sessionManager.GetSession(cookie.Value)
		if session == nil {
			am.handleUnauthorized(w, r)
			return
		}
		
		// 将用户信息存入 context
		ctx := context.WithValue(r.Context(), "username", session.Username)
		ctx = context.WithValue(ctx, "session", session)
		next(w, r.WithContext(ctx))
	}
}

// RequireAuth 要求认证（返回 Handler，用于中间件链）
func (am *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 获取 sessionId cookie
		cookie, err := r.Cookie("sessionId")
		if err != nil {
			am.handleUnauthorized(w, r)
			return
		}
		
		session := am.sessionManager.GetSession(cookie.Value)
		if session == nil {
			am.handleUnauthorized(w, r)
			return
		}
		
		// 将用户信息存入 context
		ctx := context.WithValue(r.Context(), "username", session.Username)
		ctx = context.WithValue(ctx, "session", session)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (am *AuthMiddleware) handleUnauthorized(w http.ResponseWriter, r *http.Request) {
	// API 请求返回 JSON，页面请求重定向到登录页
	if strings.HasPrefix(r.URL.Path, "/api") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":     "未授权",
			"needLogin": true,
		})
		return
	}
	
	// 页面请求重定向到登录页
	http.Redirect(w, r, "/login", http.StatusFound)
}
