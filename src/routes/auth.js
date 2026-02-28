/**
 * 认证路由
 */
const express = require('express');
const router = express.Router();
const config = require('../config');
const sessionManager = require('../models/session');
const qrCodeSession = require('../models/qrCodeSession');
const pinCodeSession = require('../models/pinCodeSession');

/**
 * 登录页面 (重定向到静态页面)
 */
router.get('/login', (req, res) => {
  res.redirect('/login.html');
});

/**
 * API 登录接口
 */
router.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const cfg = config.getConfig();
  
  // 验证用户
  const user = cfg.users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  
  // 创建会话
  const sessionId = sessionManager.createSession(username);
  
  // 设置Cookie (7天有效期)
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    secure: cfg.https?.enabled || false,
    sameSite: 'strict'
  });
  
  res.json({ success: true, username });
});

/**
 * 获取当前用户信息
 */
router.get('/api/user', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: '未登录' });
  }
  
  res.json({ username: session.username });
});

/**
 * 退出登录
 */
router.get('/api/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    sessionManager.deleteSession(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.redirect('/login.html');
});

// ==================== 扫码登录 API ====================

/**
 * 生成二维码token
 */
router.post('/api/qrcode/create', (req, res) => {
  const result = qrCodeSession.createQRSession();
  res.json({ 
    success: true, 
    token: result.token,
    expiresAt: result.expiresAt
  });
});

/**
 * 查询二维码状态 (A客户端轮询)
 */
router.get('/api/qrcode/status/:token', (req, res) => {
  const { token } = req.params;
  const qrSession = qrCodeSession.getQRSession(token);
  
  if (!qrSession) {
    return res.json({ success: false, status: 'invalid' });
  }
  
  const response = {
    success: true,
    status: qrSession.status
  };
  
  // 如果已确认，返回sessionId
  if (qrSession.status === 'confirmed' && qrSession.sessionId) {
    response.sessionId = qrSession.sessionId;
    response.username = qrSession.username;
    // 确认后删除二维码会话
    qrCodeSession.deleteQRSession(token);
  }
  
  res.json(response);
});

/**
 * 扫描二维码 (B手机)
 */
router.get('/api/qrcode/scan/:token', (req, res) => {
  const { token } = req.params;
  const qrSession = qrCodeSession.getQRSession(token);
  
  if (!qrSession) {
    return res.json({ success: false, error: '二维码无效或已过期' });
  }
  
  if (qrSession.status === 'expired') {
    return res.json({ success: false, error: '二维码已过期' });
  }
  
  if (qrSession.status !== 'pending') {
    return res.json({ success: false, error: '二维码已被使用' });
  }
  
  // 标记为已扫描
  qrCodeSession.markScanned(token);
  
  res.json({ success: true, token });
});

/**
 * 确认扫码登录 (B手机提交密码)
 */
router.post('/api/qrcode/confirm', (req, res) => {
  const { token, username, password } = req.body;
  const cfg = config.getConfig();
  
  // 验证二维码状态
  const qrSession = qrCodeSession.getQRSession(token);
  if (!qrSession || qrSession.status !== 'scanned') {
    return res.status(400).json({ success: false, error: '二维码无效或已过期' });
  }
  
  // 验证用户
  const user = cfg.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }
  
  // 创建会话
  const sessionId = sessionManager.createSession(username);
  
  // 确认登录
  qrCodeSession.confirmLogin(token, sessionId, username);
  
  res.json({ success: true, username });
});

/**
 * 取消扫码登录 (B手机)
 */
router.post('/api/qrcode/cancel', (req, res) => {
  const { token } = req.body;
  qrCodeSession.cancelLogin(token);
  res.json({ success: true });
});

/**
 * 扫码确认页面 (移动端)
 */
router.get('/qr-confirm/:token', (req, res) => {
  const { token } = req.params;
  res.redirect(`/qr-confirm.html?token=${token}`);
});

// ==================== PIN码登录 API ====================

/**
 * 生成PIN码 (A设备，已登录用户)
 */
router.post('/api/pin/generate', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const session = sessionManager.getSession(sessionId);
  
  if (!session) {
    return res.status(401).json({ success: false, error: '未登录' });
  }
  
  const result = pinCodeSession.createPinSession(session.username);
  res.json({
    success: true,
    pin: result.pin,
    expiresAt: result.expiresAt
  });
});

/**
 * PIN码登录 (B设备)
 */
router.post('/api/pin/login', (req, res) => {
  const { pin } = req.body;
  const cfg = config.getConfig();
  
  if (!pin || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ success: false, error: '请输入4位数字PIN码' });
  }
  
  // 使用PIN码
  const result = pinCodeSession.usePinCode(pin);
  
  if (!result) {
    return res.status(401).json({ success: false, error: 'PIN码无效或已过期' });
  }
  
  // 创建会话
  const newSessionId = sessionManager.createSession(result.username);
  
  // 删除已使用的PIN码会话
  pinCodeSession.deletePinSession(pin);
  
  // 设置Cookie (7天有效期)
  res.cookie('sessionId', newSessionId, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    secure: cfg.https?.enabled || false,
    sameSite: 'strict'
  });
  
  res.json({ success: true, username: result.username });
});

/**
 * 查询PIN码状态 (A设备轮询)
 */
router.get('/api/pin/status/:pin', (req, res) => {
  const { pin } = req.params;
  const pinSession = pinCodeSession.getPinSession(pin);
  
  if (!pinSession) {
    return res.json({ success: false, status: 'invalid' });
  }
  
  res.json({
    success: true,
    status: pinSession.status,
    username: pinSession.username
  });
});

module.exports = router;
