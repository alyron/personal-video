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
router.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cfg = config.getConfig();
    
    // 验证用户
    const user = cfg.users.find(u => u.username === username && u.password === password);
    
    if (!user) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    
    // 创建会话
    const sessionId = await sessionManager.createSession(username);
    
    // 设置Cookie (7天有效期)
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
      secure: cfg.https?.enabled || false,
      sameSite: 'strict'
    });
    
    res.json({ success: true, username });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ success: false, error: '登录失败' });
  }
});

/**
 * 获取当前用户信息
 */
router.get('/api/user', async (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ error: '未登录' });
    }
    
    res.json({ username: session.username });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '获取用户信息失败' });
  }
});

/**
 * 退出登录
 */
router.get('/api/logout', async (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    if (sessionId) {
      await sessionManager.deleteSession(sessionId);
    }
    
    res.clearCookie('sessionId');
    res.redirect('/login.html');
  } catch (err) {
    console.error('退出登录失败:', err);
    res.clearCookie('sessionId');
    res.redirect('/login.html');
  }
});

// ==================== 扫码登录 API ====================

/**
 * 生成二维码token
 */
router.post('/api/qrcode/create', async (req, res) => {
  try {
    const result = await qrCodeSession.createQRSession();
    res.json({ 
      success: true, 
      token: result.token,
      expiresAt: result.expiresAt
    });
  } catch (err) {
    console.error('创建二维码失败:', err);
    res.status(500).json({ success: false, error: '创建二维码失败' });
  }
});

/**
 * 查询二维码状态 (A客户端轮询)
 */
router.get('/api/qrcode/status/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const qrSession = await qrCodeSession.getQRSession(token);
    
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
      await qrCodeSession.deleteQRSession(token);
    }
    
    res.json(response);
  } catch (err) {
    console.error('查询二维码状态失败:', err);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

/**
 * 扫描二维码 (B手机)
 */
router.get('/api/qrcode/scan/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const qrSession = await qrCodeSession.getQRSession(token);
    
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
    await qrCodeSession.markScanned(token);
    
    res.json({ success: true, token });
  } catch (err) {
    console.error('扫描二维码失败:', err);
    res.status(500).json({ success: false, error: '扫描失败' });
  }
});

/**
 * 确认扫码登录 (B手机提交密码)
 */
router.post('/api/qrcode/confirm', async (req, res) => {
  try {
    const { token, username, password } = req.body;
    const cfg = config.getConfig();
    
    // 验证二维码状态
    const qrSession = await qrCodeSession.getQRSession(token);
    if (!qrSession || qrSession.status !== 'scanned') {
      return res.status(400).json({ success: false, error: '二维码无效或已过期' });
    }
    
    // 验证用户
    const user = cfg.users.find(u => u.username === username && u.password === password);
    if (!user) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    
    // 创建会话
    const sessionId = await sessionManager.createSession(username);
    
    // 确认登录
    await qrCodeSession.confirmLogin(token, sessionId, username);
    
    res.json({ success: true, username });
  } catch (err) {
    console.error('确认登录失败:', err);
    res.status(500).json({ success: false, error: '确认登录失败' });
  }
});

/**
 * 取消扫码登录 (B手机)
 */
router.post('/api/qrcode/cancel', async (req, res) => {
  try {
    const { token } = req.body;
    await qrCodeSession.cancelLogin(token);
    res.json({ success: true });
  } catch (err) {
    console.error('取消登录失败:', err);
    res.status(500).json({ success: false, error: '取消失败' });
  }
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
router.post('/api/pin/generate', async (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    const session = await sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    
    const result = await pinCodeSession.createPinSession(session.username);
    res.json({
      success: true,
      pin: result.pin,
      expiresAt: result.expiresAt
    });
  } catch (err) {
    console.error('生成PIN码失败:', err);
    res.status(500).json({ success: false, error: '生成PIN码失败' });
  }
});

/**
 * PIN码登录 (B设备)
 */
router.post('/api/pin/login', async (req, res) => {
  try {
    const { pin } = req.body;
    const cfg = config.getConfig();
    
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ success: false, error: '请输入4位数字PIN码' });
    }
    
    // 使用PIN码
    const result = await pinCodeSession.usePinCode(pin);
    
    if (!result) {
      return res.status(401).json({ success: false, error: 'PIN码无效或已过期' });
    }
    
    // 创建会话
    const newSessionId = await sessionManager.createSession(result.username);
    
    // 删除已使用的PIN码会话
    await pinCodeSession.deletePinSession(pin);
    
    // 设置Cookie (7天有效期)
    res.cookie('sessionId', newSessionId, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
      secure: cfg.https?.enabled || false,
      sameSite: 'strict'
    });
    
    res.json({ success: true, username: result.username });
  } catch (err) {
    console.error('PIN码登录失败:', err);
    res.status(500).json({ success: false, error: 'PIN码登录失败' });
  }
});

/**
 * 查询PIN码状态 (A设备轮询)
 */
router.get('/api/pin/status/:pin', async (req, res) => {
  try {
    const { pin } = req.params;
    const pinSession = await pinCodeSession.getPinSession(pin);
    
    if (!pinSession) {
      return res.json({ success: false, status: 'invalid' });
    }
    
    res.json({
      success: true,
      status: pinSession.status,
      username: pinSession.username
    });
  } catch (err) {
    console.error('查询PIN码状态失败:', err);
    res.status(500).json({ success: false, error: '查询失败' });
  }
});

module.exports = router;
