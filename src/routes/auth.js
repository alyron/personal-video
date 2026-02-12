/**
 * 认证路由
 */
const express = require('express');
const router = express.Router();
const config = require('../config');
const sessionManager = require('../models/session');

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
  
  // 设置Cookie
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24小时
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

module.exports = router;
