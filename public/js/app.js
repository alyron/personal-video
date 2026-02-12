/**
 * 前端应用脚本 - 通用工具函数
 */

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN');
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
        setTimeout(pollScanStatus, 2000);
      } else if (status.videoCount > 0) {
        statusText.textContent = `上次扫描: ${formatTimestamp(status.lastScanTime)}`;
      } else {
        statusText.textContent = '尚未扫描';
      }
    }
  } catch (err) {
    console.error('获取扫描状态失败:', err);
  }
}
