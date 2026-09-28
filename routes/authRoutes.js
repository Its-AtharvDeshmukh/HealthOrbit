const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authController = require('../controllers/authController');
const User = require('../models/User');

// ==========================================
// 1. EXISTING WEB APPLICATION ROUTES (INTACT)
// ==========================================
router.get('/', authController.redirectHome);
router.get('/auth', authController.getAuthPage);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.get('/auth/google', authController.googleAuth);
router.get('/auth/google/callback', authController.googleCallback);

// ==========================================
// 2. STANDALONE MOBILE JWT MIDDLEWARE
// ==========================================
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
            return res.status(500).json({
                success: false,
                message: 'Server authentication secret is not configured'
            });
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

        const user = await User.findById(decoded.sub).select('-passwordHash');
        if (!user) {
            return res.status(401).json({ success: false, message: 'Account no longer exists' });
        }

        req.mobileUser = user;
        next();
    } catch (err) {
        console.error('[requireMobileAuth Error]:', err);
        return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
};

// ==========================================
// 3. MOBILE COMPANION API ENDPOINTS
// ==========================================

/**
 * POST /api/auth/mobile-login
 */
router.post('/api/auth/mobile-login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

        if (!user || !user.passwordHash) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const secret = process.env.MOBILE_JWT_SECRET || process.env.SESSION_SECRET;
        const payload = {
            sub: user._id.toString(),
            email: user.email
        };

        const token = jwt.sign(payload, secret, { expiresIn: '7d' });

        return res.status(200).json({
            success: true,
            message: 'Authentication successful',
            token,
            user: {
                _id: user._id.toString(),
                fullName: user.fullName || '',
                email: user.email,
                profileImage: user.profileImage || null
            }
        });
    } catch (error) {
        console.error('[HealthOrbit Mobile Auth Error]:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server authentication error'
        });
    }
});

/**
 * GET /api/mobile/me
 */
router.get('/api/mobile/me', requireMobileAuth, (req, res) => {
    const user = req.mobileUser;
    return res.status(200).json({
        success: true,
        user: {
            _id: user._id.toString(),
            fullName: user.fullName || '',
            email: user.email,
            profileImage: user.profileImage || null
        }
    });
});



const HealthMeasurement = require('../models/HealthMeasurement');

router.post('/api/wearables/sync', requireMobileAuth, async (req, res) => {
    try {
        const { provider = 'health_connect', records } = req.body;
        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({ success: false, message: 'Records array is required' });
        }

        const userId = req.mobileUser._id;
        let insertedCount = 0;
        let skippedCount = 0;

        for (const item of records) {
            if (!item.metric || item.value === undefined || item.value === null) continue;

            const metricKey = item.metric.toLowerCase().trim();
            const numericVal = Number(item.value);
            const recordedAt = item.recordedAt ? new Date(item.recordedAt) : new Date();
            const externalRecordId = item.externalRecordId;

      // Inside router.post('/api/wearables/sync', ...) loop:
let metricName = 'Heart Rate';
let category = 'Cardiovascular';
let unit = item.unit || '';

if (metricKey === 'heart_rate') {
    metricName = 'Heart Rate';
    category = 'Cardiovascular';
    unit = 'bpm';
} else if (metricKey === 'steps') {
    metricName = 'Steps';
    category = 'Physical Activity';
    unit = 'steps';
} else if (metricKey === 'blood_pressure_systolic') {
    metricName = 'Blood Pressure (Systolic)';
    category = 'Cardiovascular';
    unit = 'mmHg';
} else if (metricKey === 'blood_pressure_diastolic') {
    metricName = 'Blood Pressure (Diastolic)';
    category = 'Cardiovascular';
    unit = 'mmHg';
} else if (metricKey === 'spo2') {
    metricName = 'Blood Oxygen Saturation';
    category = 'Respiratory';
    unit = '%';
} else if (metricKey === 'sleep_duration') {
    metricName = 'Total Sleep';
    category = 'Recovery';
    unit = 'hours';
} else if (metricKey === 'deep_sleep') {
    metricName = 'Deep Sleep';
    category = 'Recovery';
    unit = 'hours';
} else if (metricKey === 'body_temperature') {
    metricName = 'Body Temperature';
    category = 'General Vitals';
    unit = '°C';
} else if (metricKey === 'calories') {
    metricName = 'Active Energy Burned';
    category = 'Physical Activity';
    unit = 'kcal';
} else if (metricKey === 'distance') {
    metricName = 'Distance Traveled';
    category = 'Physical Activity';
    unit = 'km';
} else if (metricKey === 'stress_hrv') {
    metricName = 'Heart Rate Variability (Stress)';
    category = 'Cardiovascular';
    unit = 'ms';
}
            const result = await HealthMeasurement.updateOne(
                { userId, provider, externalRecordId, metricKey },
                {
                    $setOnInsert: {
                        userId,
                        metricName,
                        metricKey,
                        category,
                        value: String(item.value),
                        numericValue: isNaN(numericVal) ? null : numericVal,
                        unit,
                        status: 'Standard',
                        source: 'wearable',
                        sourceType: 'wearable',
                        provider,
                        externalRecordId,
                        recordedAt
                    }
                },
                { upsert: true }
            );

            if (result.upsertedCount > 0) insertedCount++;
            else skippedCount++;
        }

        return res.status(200).json({
            success: true,
            message: 'Wearable data ingested successfully',
            inserted: insertedCount,
            skipped: skippedCount
        });
    } catch (err) {
        console.error('[Wearables Ingestion Error]:', err);
        return res.status(500).json({ success: false, message: 'Server ingestion error' });
    }
});


// GET /api/wearables/history/:metricKey
// Owner-scoped historical telemetry feed for mobile charts
router.get('/api/wearables/history/:metricKey', requireMobileAuth, async (req, res) => {
    try {
        const rawMetricKey = req.params.metricKey.toLowerCase().trim();
        const userId = req.mobileUser._id;
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);

        // Normalize compound metrics like blood pressure
        let queryMetricKeys = [rawMetricKey];
        if (rawMetricKey === 'blood_pressure') {
            queryMetricKeys = ['blood_pressure_systolic', 'blood_pressure_diastolic'];
        }

        const measurements = await HealthMeasurement.find({
            userId,
            metricKey: { $in: queryMetricKeys }
        })
        .sort({ recordedAt: 1 }) // Chronological order for direct graphing
        .limit(limit)
        .lean();

        if (!measurements || measurements.length === 0) {
            return res.status(200).json({
                success: true,
                metricKey: rawMetricKey,
                unit: '',
                records: []
            });
        }

        const primaryUnit = measurements[measurements.length - 1].unit || '';
        const records = measurements.map(m => ({
            id: m._id,
            metricKey: m.metricKey,
            value: m.numericValue !== null && !isNaN(m.numericValue) ? m.numericValue : m.value,
            unit: m.unit,
            recordedAt: m.recordedAt
        }));

        return res.status(200).json({
            success: true,
            metricKey: rawMetricKey,
            unit: primaryUnit,
            records
        });
    } catch (err) {
        console.error('[Wearable History Error]:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error retrieving metric history'
        });
    }
});


module.exports = router;