/**
 * 扫码登录会话管理 - 异步 I/O 版本
 */
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// 二维码有效期 (5分钟)
const QRCODE_EXPIRY = 5 * 60 * 1000;

// 数据文件路径
const QR_FILE = path.join(__dirname, '../../data/qrSessions.json');

// 状态枚举
const QRStatus = {
  PENDING: 'pending',
  SCANNED: 'scanned',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired'
};

// 内存缓存
let qrCache = null;
let cacheTime = 0;
const CACHE_TTL = 2000; // 2秒缓存

/**
 * 确保数据目录存在
 */
async function ensureDataDir() {
  const dataDir = path.dirname(QR_FILE);
  await fs.mkdir(dataDir, { recursive: true }).catch(err => {
    if (err.code !== 'EEXIST') throw err;
  });
}

/**
 * 读取所有二维码会话（带缓存）
 */
async function readQRSessions() {
  // 缓存命中
  if (qrCache !== null && (Date.now() - cacheTime) < CACHE_TTL) {
    return qrCache;
  }
  
  try {
    const data = await fs.readFile(QR_FILE, 'utf8');
    qrCache = JSON.parse(data);
    cacheTime = Date.now();
    return qrCache;
  } catch (err) {
    if (err.code === 'ENOENT') {
      qrCache = {};
      cacheTime = Date.now();
      return qrCache;
    }
    throw err;
  }
}

/**
 * 保存所有二维码会话
 */
async function writeQRSessions(sessions) {
  await ensureDataDir();
  await fs.writeFile(QR_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  // 更新缓存
  qrCache = sessions;
  cacheTime = Date.now();
}

/**
 * 创建二维码会话
 * @returns {Promise<object>} { token, expiresAt }
 */
async function createQRSession() {
  const sessions = await readQRSessions();
  const token = crypto.randomBytes(32).toString('hex');
  
  const qrSession = {
    token,
    status: QRStatus.PENDING,
    createdAt: Date.now(),
    expiresAt: Date.now() + QRCODE_EXPIRY,
    sessionId: null,
    username: null
  };
  
  sessions[token] = qrSession;
  await writeQRSessions(sessions);
  
  return { token, expiresAt: qrSession.expiresAt };
}

/**
 * 获取二维码会话
 * @param {string} token 
 * @returns {Promise<object|null>}
 */
async function getQRSession(token) {
  if (!token) return null;
  
  const sessions = await readQRSessions();
  const qrSession = sessions[token];
  
  if (!qrSession) return null;
  
  // 检查是否过期
  if (Date.now() > qrSession.expiresAt) {
    qrSession.status = QRStatus.EXPIRED;
    sessions[token] = qrSession;
    await writeQRSessions(sessions);
  }
  
  return qrSession;
}

/**
 * 标记为已扫描
 * @param {string} token 
 * @returns {Promise<boolean>}
 */
async function markScanned(token) {
  const sessions = await readQRSessions();
  const qrSession = sessions[token];
  
  if (!qrSession || qrSession.status !== QRStatus.PENDING) {
    return false;
  }
  
  qrSession.status = QRStatus.SCANNED;
  sessions[token] = qrSession;
  await writeQRSessions(sessions);
  
  return true;
}

/**
 * 确认登录
 * @param {string} token 
 * @param {string} sessionId 
 * @param {string} username 
 * @returns {Promise<boolean>}
 */
async function confirmLogin(token, sessionId, username) {
  const sessions = await readQRSessions();
  const qrSession = sessions[token];
  
  if (!qrSession || qrSession.status !== QRStatus.SCANNED) {
    return false;
  }
  
  qrSession.status = QRStatus.CONFIRMED;
  qrSession.sessionId = sessionId;
  qrSession.username = username;
  sessions[token] = qrSession;
  await writeQRSessions(sessions);
  
  return true;
}

/**
 * 取消登录
 * @param {string} token 
 */
async function cancelLogin(token) {
  const sessions = await readQRSessions();
  const qrSession = sessions[token];
  
  if (qrSession && qrSession.status === QRStatus.SCANNED) {
    qrSession.status = QRStatus.CANCELLED;
    sessions[token] = qrSession;
    await writeQRSessions(sessions);
  }
}

/**
 * 删除二维码会话
 * @param {string} token 
 */
async function deleteQRSession(token) {
  const sessions = await readQRSessions();
  if (sessions[token]) {
    delete sessions[token];
    await writeQRSessions(sessions);
  }
}

/**
 * 清理过期会话
 */
async function cleanExpiredQRSessions() {
  const sessions = await readQRSessions();
  const now = Date.now();
  let changed = false;
  
  for (const [token, session] of Object.entries(sessions)) {
    if (now > session.expiresAt) {
      delete sessions[token];
      changed = true;
    }
  }
  
  if (changed) {
    await writeQRSessions(sessions);
  }
}

/**
 * 清除缓存
 */
function clearCache() {
  qrCache = null;
  cacheTime = 0;
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
  cleanExpiredQRSessions,
  clearCache,
  QRStatus
};
