const jwt = require('jsonwebtoken');
const User = require('../models/User');

// --- 1. Existing Web Session Middleware ---
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated && req.isAuthenticated()) {
        return next();
    }
    if (req.session && req.session.userId) {
        return next();
    }
    return res.redirect('/auth');
};

// --- 2. Mobile API JWT Middleware ---
const requireMobileAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Authorization header with Bearer token is required'
            });
        }

        const token = authHeader.split(' ')[1];
        const secret = process.env.MOBILE_JWT_SECRET || process.env.SESSION_SECRET;

        if (!secret) {
            console.error('[HealthOrbit Auth] FATAL: MOBILE_JWT_SECRET and SESSION_SECRET are missing');
            return res.status(500).json({ success: false, message: 'Server authentication misconfigured' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, secret);
        } catch (jwtErr) {
            const message = jwtErr.name === 'TokenExpiredError'
                ? 'Session expired. Please log in again.'
                : 'Invalid authentication token';
            return res.status(401).json({ success: false, message });
        }

        if (!decoded || !decoded.sub) {
            return res.status(401).json({ success: false, message: 'Invalid token claims' });
        }

        const user = await User.findById(decoded.sub).select('-password');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Account no longer exists' });
        }

        req.mobileUser = user;
        if (!req.user) {
            req.user = user;
        }

        next();
    } catch (err) {
        console.error('[requireMobileAuth Error]:', err);
        return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
};

module.exports = {
    requireAuth,
    ensureAuthenticated: requireAuth, // Alias in case dashboardRoutes used ensureAuthenticated
    isAuthenticated: requireAuth,       // Alias in case dashboardRoutes used isAuthenticated
    requireMobileAuth
};