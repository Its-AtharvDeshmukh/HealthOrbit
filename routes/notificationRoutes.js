const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const notifications = await Notification.find({ userId: activeUserId })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        res.json({ success: true, notifications: notifications || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/mark-read', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        await Notification.updateMany({ userId: activeUserId, read: false }, { read: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// CRITICAL: Must export router
module.exports = router;