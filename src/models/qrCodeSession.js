/**
 * 扫码登录会话管理
 * 
 * 流程:
 * 1. A客户端请求生成二维码 -> 创建qrSession(token, status=pending)
 * 2. B手机扫描二维码 -> 更新status=scanned
 * 3. B手机确认登录(输入密码) -> 创建session, 更新status=confirmed, 关联sessionId
 * 4. A客户端轮询检测到confirmed -> 获取sessionId完成登录
 */
const crypto = require('crypto');

// 二维码有效期 (5分钟)
const QRCODE_EXPIRY = 5 * 60 * 1000;

// 扫码会话存储 (token -> 会话信息)
const qrSessions = new Map();

// 状态枚举
const QRStatus = {
  PENDING: 'pending',      // 等待扫码
  SCANNED: 'scanned',      // 已扫码,等待确认
  CONFIRMED: 'confirmed',  // 已确认
  CANCELLED: 'cancelled',  // 已取消
  EXPIRED: 'expired'       // 已过期
};

/**
 * 创建二维码会话
 * @returns {object} { token, expiresAt }
 */
function createQRSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const qrSession = {
    token,
    status: QRStatus.PENDING,
    createdAt: Date.now(),
    expiresAt: Date.now() + QRCODE_EXPIRY,
    sessionId: null,        // 确认后关联的会话ID
    username: null          // 确认后的用户名
  };
  
  qrSessions.set(token, qrSession);
  return { token, expiresAt: qrSession.expiresAt };
}

/**
 * 获取二维码会话
 * @param {string} token 
 * @returns {object|null}
 */
function getQRSession(token) {
  if (!token) return null;
  
  const qrSession = qrSessions.get(token);
  if (!qrSession) return null;
  
  // 检查是否过期
  if (Date.now() > qrSession.expiresAt) {
    qrSession.status = QRStatus.EXPIRED;
    return qrSession;
  }
  
  return qrSession;
}

/**
 * 标记为已扫描
 * @param {string} token 
 * @returns {boolean}
 */
function markScanned(token) {
  const qrSession = qrSessions.get(token);
  if (!qrSession || qrSession.status !== QRStatus.PENDING) {
    return false;
  }
  
  qrSession.status = QRStatus.SCANNED;
  return true;
}

/**
 * 确认登录
 * @param {string} token 
 * @param {string} sessionId 
 * @param {string} username 
 * @returns {boolean}
 */
function confirmLogin(token, sessionId, username) {
  const qrSession = qrSessions.get(token);
  if (!qrSession || qrSession.status !== QRStatus.SCANNED) {
    return false;
  }
  
  qrSession.status = QRStatus.CONFIRMED;
  qrSession.sessionId = sessionId;
  qrSession.username = username;
  return true;
}

/**
 * 取消登录
 * @param {string} token 
 */
function cancelLogin(token) {
  const qrSession = qrSessions.get(token);
  if (qrSession && qrSession.status === QRStatus.SCANNED) {
    qrSession.status = QRStatus.CANCELLED;
  }
}

/**
 * 删除二维码会话
 * @param {string} token 
 */
function deleteQRSession(token) {
  qrSessions.delete(token);
}

/**
 * 清理过期会话
 */
function cleanExpiredQRSessions() {
  const now = Date.now();
  for (const [token, session] of qrSessions.entries()) {
    if (now > session.expiresAt) {
      qrSessions.delete(token);
    }
  }
}

// 每5分钟清理过期会话
setInterval(cleanExpiredQRSessions, 5 * 60 * 1000);

module.exports = {
  createQRSession,
  getQRSession,
  markScanned,
  confirmLogin,
  cancelLogin,
  deleteQRSession,
  QRStatus
};
