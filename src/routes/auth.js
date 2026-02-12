/**
 * 认证路由
 */
const express = require('express');
const router = express.Router();
const config = require('../config');
const sessionManager = require('../models/session');

/**
 * 登录页面
 */
router.get('/login', (req, res) => {
  const error = req.query.error;
  res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登录 - 视频服务器</title>
    <link rel="stylesheet" href="/css/style.css">
</head>
<body class="login-page">
    <div class="login-container">
        <h1>视频服务器</h1>
        <form method="POST" action="/login">
            <div class="form-group">
                <label for="username">用户名</label>
                <input type="text" id="username" name="username" required autofocus>
            </div>
            <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" required>
            </div>
            ${error ? '<p class="error-message">用户名或密码错误</p>' : ''}
            <button type="submit" class="login-btn">登录</button>
        </form>
    </div>
</body>
</html>
  `);
});

/**
 * 处理登录请求
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const cfg = config.getConfig();
  
  // 验证用户
  const user = cfg.users.find(u => u.username === username && u.password === password);
  
  if (!user) {
    return res.redirect('/login?error=1');
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
  
  res.redirect('/');
});

/**
 * 退出登录
 */
router.get('/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    sessionManager.deleteSession(sessionId);
  }
  
  res.clearCookie('sessionId');
  res.redirect('/login');
});

module.exports = router;
