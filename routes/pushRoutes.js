const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');

let PushSubscription;
try {
    PushSubscription = require('../models/PushSubscription');
} catch (e) {
    PushSubscription = null;
}

// 1. Subscribe Endpoint
router.post('/subscribe', requireAuth, async (req, res) => {
    try {
        if (!PushSubscription) {
            return res.status(200).json({ success: false, message: 'Push schema unavailable' });
        }

        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const { endpoint, keys } = req.body;

        if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
            return res.status(400).json({ error: 'Invalid subscription payload' });
        }

        await PushSubscription.findOneAndUpdate(
            { endpoint },
            {
                userId: activeUserId,
                endpoint,
                keys,
                userAgent: req.headers['user-agent'] || null
            },
            { upsert: true, returnDocument: 'after' }
        );

        res.status(201).json({ success: true, message: 'Subscription saved' });
    } catch (error) {
        console.error('[Push Subscription Error]:', error.message);
        res.status(500).json({ error: 'Failed to save push subscription' });
    }
});

// 2. Unsubscribe Endpoint
router.post('/unsubscribe', requireAuth, async (req, res) => {
    try {
        if (!PushSubscription) {
            return res.status(200).json({ success: true });
        }
        const { endpoint } = req.body;
        if (endpoint) {
            await PushSubscription.findOneAndDelete({ endpoint });
        }
        res.status(200).json({ success: true, message: 'Unsubscribed' });
    } catch (error) {
        console.error('[Push Unsubscribe Error]:', error.message);
        res.status(500).json({ error: 'Failed to remove push subscription' });
    }
});

module.exports = router;