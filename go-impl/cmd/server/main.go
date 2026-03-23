// 视频服务器入口文件 - Go版本
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"video-server/internal/config"
	"video-server/internal/handler"
	"video-server/internal/model"
	"video-server/internal/service"
	"video-server/internal/utils"
)

func main() {
	// 加载配置
	cfg, err := config.LoadConfig()
	if err != nil {
		fmt.Printf("加载配置失败: %v\n", err)
		os.Exit(1)
	}

	// 加载视频缓存
	videoCache := model.GetVideoCache()
	cacheLoaded := videoCache.LoadCache()

	if cacheLoaded && len(videoCache.GetVideos()) > 0 {
		// 缓存存在，注册视频ID到管理器
		utils.GetVideoIDManager().RegisterVideos(videoCache.GetVideos())
	}

	// 创建路由
	r := mux.NewRouter()
	
	// 设置路由
	h := handler.NewHandler()
	h.SetupRoutes(r)

	// 创建服务器
	var addr string
	if cfg.Host == "::" {
		// IPv6 所有接口
		addr = fmt.Sprintf("[%s]:%d", cfg.Host, cfg.Port)
	} else if cfg.Host == "" || cfg.Host == "0.0.0.0" {
		// 所有接口
		addr = fmt.Sprintf(":%d", cfg.Port)
	} else {
		addr = fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	}
	
	// 创建静默的错误日志器，过滤 TLS handshake 错误
	quietLogger := log.New(io.Discard, "", 0)

	var server *http.Server
	protocol := "http"

	if cfg.HTTPS.Enabled {
		// HTTPS 服务器
		cert, err := tls.LoadX509KeyPair(cfg.HTTPS.Cert, cfg.HTTPS.Key)
		if err != nil {
			fmt.Printf("加载SSL证书失败: %v\n", err)
			fmt.Println("回退到 HTTP 模式")
			server = &http.Server{
				Addr:         addr,
				Handler:      r,
				WriteTimeout: 30 * time.Minute,
				ReadTimeout:  30 * time.Minute,
				ErrorLog:     quietLogger,
			}
		} else {
			server = &http.Server{
				Addr:         addr,
				Handler:      r,
				TLSConfig:    &tls.Config{Certificates: []tls.Certificate{cert}},
				WriteTimeout: 30 * time.Minute,
				ReadTimeout:  30 * time.Minute,
				ErrorLog:     quietLogger,
			}
			protocol = "https"
			fmt.Println("HTTPS 模式已启用")
		}
	} else {
		// HTTP 服务器
		server = &http.Server{
			Addr:         addr,
			Handler:      r,
			WriteTimeout: 30 * time.Minute,
			ReadTimeout:  30 * time.Minute,
			ErrorLog:     quietLogger,
		}
	}

	// 启动服务器（异步）
	go func() {
		fmt.Println("=================================================")
		fmt.Println("视频服务已启动！")
		fmt.Println("=================================================")
		fmt.Printf("协议: %s\n", protocol)
		fmt.Printf("访问地址 (IPv6): %s://[::1]:%d\n", protocol, cfg.Port)
		fmt.Printf("访问地址 (IPv4): %s://127.0.0.1:%d\n", protocol, cfg.Port)
		fmt.Printf("访问地址 (本地网络): %s://<本机IP>:%d\n", protocol, cfg.Port)
		fmt.Println("=================================================")
		fmt.Println("默认登录信息:")
		if len(cfg.Users) > 0 {
			fmt.Printf("用户名: %s\n", cfg.Users[0].Username)
			fmt.Printf("密码: %s\n", cfg.Users[0].Password)
		}
		fmt.Println("=================================================")
		fmt.Printf("提示: 修改 %s 文件可更改用户名、密码和其他设置\n", cfg.Source)
		if cfg.HTTPS.Enabled {
			fmt.Println("HTTPS 已启用，使用加密连接传输数据")
		}
		fmt.Println("=================================================")

		if cacheLoaded && len(videoCache.GetVideos()) > 0 {
			fmt.Printf("使用缓存数据 (%d 个视频)，如需更新请点击\"刷新扫描\"\n", len(videoCache.GetVideos()))
		} else {
			// 无缓存，启动后台扫描
			fmt.Println("正在扫描视频目录...")
			go func() {
				service.GetVideoScanner().ScanAllDirectories()
			}()
		}

		var err error
		if protocol == "https" {
			err = server.ListenAndServeTLS("", "")
		} else {
			err = server.ListenAndServe()
		}
		if err != nil && err != http.ErrServerClosed {
			fmt.Printf("服务器错误: %v\n", err)
		}
	}()

	// 优雅关闭
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("收到关闭信号，正在关闭服务器...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		fmt.Printf("服务器关闭错误: %v\n", err)
	}

	fmt.Println("服务器已关闭")
}
