const Notification = require('../models/Notification');
const { sendTelegramAlert } = require('../services/schedulerService');

const checkUnread = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || req.user?._id;
        if (!activeUserId) return res.status(401).json({ error: 'Not authenticated' });
        
        const unread = await Notification.find({ userId: activeUserId, read: false });
        
        if (unread.length > 0) {
            await Notification.updateMany({ userId: activeUserId, read: false }, { read: true });
            return res.json({ newNotifications: unread });
        }
        
        res.json({ newNotifications: [] });
    } catch (err) {
        console.error('[Notification Check Error]:', err.message);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
};

const testTelegram = async (req, res) => {
    const success = await sendTelegramAlert('🚨 *Live Test from HealthOrbit Web Server!* Notification engine is working.');
    if (success) {
        return res.send('Telegram test message sent successfully! Check your phone.');
    }
    return res.status(500).send('Failed to send Telegram message. Check Render logs and environment variables.');
};

module.exports = { checkUnread, testTelegram };