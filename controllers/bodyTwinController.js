const bodyTwinService = require('../services/bodyTwinService');

exports.getBodyTwinView = async (req, res) => {
    try {
        res.render('dashboard/body-twin', {
            path: '/body-twin',
            userName: req.user ? req.user.fullName : 'User'
        });
    } catch (error) {
        console.error('[BodyTwin] View Error:', error);
        res.redirect('/dashboard');
    }
};

exports.getBodyTwinData = async (req, res) => {
    try {
        const payload = await bodyTwinService.getBodyTwinPayload(req.user._id);
        res.json(payload);
    } catch (error) {
        console.error('[BodyTwin] Data Fetch Error:', error);
        res.status(500).json({ error: 'Failed to load Body Twin data' });
    }
};