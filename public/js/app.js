/**
 * 前端应用脚本
 */

// ===== 工具函数 =====

/**
 * 显示加载状态
 */
function showLoading(element) {
    element.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <p>加载中...</p>
        </div>
    `;
}

/**
 * 格式化日期
 */
function formatTimestamp(timestamp) {
    return new Date(timestamp).toLocaleString('zh-CN');
}

// ===== 主页功能 =====

/**
 * 刷新视频列表
 */
async function refreshVideos() {
    const btn = document.getElementById('refreshBtn');
    const statusText = document.getElementById('scanStatus');
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = '扫描中...';
    }
    
    if (statusText) {
        statusText.textContent = '正在扫描...';
    }
    
    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();
        
        if (result.success) {
            // 刷新页面显示新数据
            window.location.reload();
        } else {
            alert('扫描失败: ' + result.error);
        }
    } catch (err) {
        alert('请求失败: ' + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '刷新扫描';
        }
    }
}

/**
 * 轮询扫描状态
 */
async function pollScanStatus() {
    try {
        const response = await fetch('/api/scan-status');
        const status = await response.json();
        
        const statusText = document.getElementById('scanStatus');
        if (statusText) {
            if (status.isScanning) {
                statusText.textContent = '正在扫描...';
            } else if (status.videoCount > 0) {
                statusText.textContent = `上次扫描: ${formatTimestamp(status.lastScanTime)}`;
            } else {
                statusText.textContent = '尚未扫描';
            }
        }
        
        // 如果正在扫描，继续轮询
        if (status.isScanning) {
            setTimeout(pollScanStatus, 2000);
        }
    } catch (err) {
        console.error('获取扫描状态失败:', err);
    }
}

// ===== 播放器功能 =====

/**
 * 初始化播放器
 */
async function initPlayer() {
    const pathParts = window.location.pathname.split('/');
    const videoId = pathParts[pathParts.length - 1];
    
    const dirBadge = document.getElementById('dirBadge');
    const videoTitle = document.getElementById('videoTitle');
    const videoPlayer = document.getElementById('videoPlayer');
    
    if (!videoId) {
        videoTitle.textContent = '视频ID无效';
        return;
    }
    
    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId })
        });
        
        if (!response.ok) {
            throw new Error('获取视频信息失败');
        }
        
        const info = await response.json();
        
        dirBadge.textContent = `📁 ${info.dirName}`;
        videoTitle.textContent = info.filename;
        videoPlayer.src = `/api/stream/${videoId}`;
        
    } catch (err) {
        console.error('加载视频信息失败:', err);
        videoTitle.textContent = '加载失败';
        dirBadge.textContent = '❌ 错误';
    }
}

// ===== 页面初始化 =====

document.addEventListener('DOMContentLoaded', () => {
    // 根据页面类型初始化
    if (document.getElementById('videoPlayer')) {
        initPlayer();
    }
    
    if (document.getElementById('refreshBtn')) {
        // 初始检查扫描状态
        pollScanStatus();
    }
});
