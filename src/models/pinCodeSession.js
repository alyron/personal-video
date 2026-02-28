/**
 * PIN码登录会话管理
 * 
 * 流程:
 * 1. A设备(已登录用户)请求生成PIN码 -> 创建pinSession(pin, status=pending)
 * 2. B设备输入PIN码登录 -> 验证PIN码，创建session，更新status=used
 */
const crypto = require('crypto');

// PIN码有效期 (5分钟)
const PIN_EXPIRY = 5 * 60 * 1000;

// PIN码会话存储 (pin -> 会话信息)
const pinSessions = new Map();

// 状态枚举
const PINStatus = {
  PENDING: 'pending',  // 等待使用
  USED: 'used',        // 已使用
  EXPIRED: 'expired'   // 已过期
};

/**
 * 生成4位数字PIN码
 * @returns {string}
 */
function generatePinCode() {
  // 生成4位随机数字 (1000-9999)
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * 创建PIN码会话
 * @param {string} username 用户名
 * @returns {object} { pin, expiresAt }
 */
function createPinSession(username) {
  // 先删除该用户之前所有未使用的PIN码（每用户只能有一个有效PIN码）
  for (const [pin, session] of pinSessions.entries()) {
    if (session.username === username && session.status === PINStatus.PENDING) {
      pinSessions.delete(pin);
    }
  }
  
  let pin = generatePinCode();
  
  // 确保PIN码唯一
  while (pinSessions.has(pin)) {
    pin = generatePinCode();
  }
  
  const pinSession = {
    pin,
    username,
    status: PINStatus.PENDING,
    createdAt: Date.now(),
    expiresAt: Date.now() + PIN_EXPIRY
  };
  
  pinSessions.set(pin, pinSession);
  return { pin, expiresAt: pinSession.expiresAt };
}

/**
 * 获取PIN码会话
 * @param {string} pin 
 * @returns {object|null}
 */
function getPinSession(pin) {
  if (!pin) return null;
  
  const pinSession = pinSessions.get(pin);
  if (!pinSession) return null;
  
  // 检查是否过期
  if (Date.now() > pinSession.expiresAt) {
    pinSession.status = PINStatus.EXPIRED;
    return pinSession;
  }
  
  return pinSession;
}

/**
 * 使用PIN码登录
 * @param {string} pin 
 * @returns {object|null} { username } 或 null(无效/已使用)
 */
function usePinCode(pin) {
  const pinSession = pinSessions.get(pin);
  
  // PIN码不存在、已使用或已过期
  if (!pinSession) return null;
  if (pinSession.status !== PINStatus.PENDING) return null;
  if (Date.now() > pinSession.expiresAt) {
    pinSession.status = PINStatus.EXPIRED;
    return null;
  }
  
  // 标记为已使用
  pinSession.status = PINStatus.USED;
  return { username: pinSession.username };
}

/**
 * 删除PIN码会话
 * @param {string} pin 
 */
function deletePinSession(pin) {
  pinSessions.delete(pin);
}

/**
 * 清理过期会话
 */
function cleanExpiredPinSessions() {
  const now = Date.now();
  for (const [pin, session] of pinSessions.entries()) {
    if (now > session.expiresAt) {
      pinSessions.delete(pin);
    }
  }
}

// 每5分钟清理过期会话
setInterval(cleanExpiredPinSessions, 5 * 60 * 1000);

module.exports = {
  createPinSession,
  getPinSession,
  usePinCode,
  deletePinSession,
  PINStatus
};
