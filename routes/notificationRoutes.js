const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Using /api/notifications as base
router.get('/check', notificationController.checkUnread);
router.get('/test-telegram', notificationController.testTelegram);

module.exports = router;