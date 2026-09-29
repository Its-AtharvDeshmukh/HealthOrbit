const mongoose = require('mongoose');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');

// Helper to extract the logged-in User ID across all session styles
const getActiveUserId = (req) => {
    if (req.user && req.user._id) return req.user._id;
    if (req.session && req.session.passport && req.session.passport.user) return req.session.passport.user;
    if (req.session && req.session.userId) return req.session.userId;
    if (req.userContextId) return req.userContextId;
    return null;
};

// Builds a safe query that matches both ObjectId and String forms of the userId
const buildUserQuery = (userId, extraQuery = {}) => {
    const rawId = userId.toString();
    const idVariants = [rawId];
    if (mongoose.Types.ObjectId.isValid(rawId)) {
        idVariants.push(new mongoose.Types.ObjectId(rawId));
    }
    return {
        userId: { $in: idVariants },
        ...extraQuery
    };
};

// Helper: Extracts clean metric maps with today's dynamic steps/distance/calories
const processWearableMetrics = (rawWearables) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const latestMetrics = {};
    for (const record of rawWearables) {
        if (!latestMetrics[record.metricKey]) {
            latestMetrics[record.metricKey] = record;
        }
    }

    // Filter today's records for active metrics
    const todayRecords = rawWearables.filter(r => new Date(r.recordedAt) >= startOfDay);

    // 1. STEPS: Take the highest/latest reported reading for today
    const stepRecords = todayRecords.filter(r => r.metricKey === 'steps');
    if (stepRecords.length > 0) {
        // If the companion app updates via $set, pick the maximum or most recent record
        const maxSteps = Math.max(...stepRecords.map(r => Number(r.numericValue || r.value) || 0));
        latestMetrics['steps'] = {
            metricName: 'Steps',
            metricKey: 'steps',
            value: maxSteps.toLocaleString(),
            numericValue: maxSteps,
            unit: 'steps',
            recordedAt: stepRecords[0].recordedAt
        };
    }

    // 2. DISTANCE (km): Take the latest/maximum distance reported today
    const distRecords = todayRecords.filter(r => r.metricKey === 'distance');
    if (distRecords.length > 0) {
        const maxDistance = Math.max(...distRecords.map(r => Number(r.numericValue || r.value) || 0));
        latestMetrics['distance'] = {
            metricName: 'Distance Traveled',
            metricKey: 'distance',
            value: maxDistance.toFixed(2),
            numericValue: Number(maxDistance.toFixed(2)),
            unit: 'km',
            recordedAt: distRecords[0].recordedAt
        };
    }

    // 3. CALORIES (kcal): Take the latest/maximum burned calories for today
    const calRecords = todayRecords.filter(r => r.metricKey === 'calories');
    if (calRecords.length > 0) {
        const maxCalories = Math.max(...calRecords.map(r => Number(r.numericValue || r.value) || 0));
        latestMetrics['calories'] = {
            metricName: 'Active Energy Burned',
            metricKey: 'calories',
            value: Math.round(maxCalories),
            numericValue: Math.round(maxCalories),
            unit: 'kcal',
            recordedAt: calRecords[0].recordedAt
        };
    }

    return latestMetrics;
};

// 1. Main Dashboard Index Page
const getDashboard = async (req, res) => {
    try {
        const rawUserId = getActiveUserId(req);
        if (!rawUserId) return res.redirect('/login');

        const [reportCount, recentMeasurements, rawWearables] = await Promise.all([
            MedicalReport.countDocuments(buildUserQuery(rawUserId)),
            HealthMeasurement.find(buildUserQuery(rawUserId))
                .sort({ recordedAt: -1 })
                .limit(6)
                .lean(),
            HealthMeasurement.find(
                buildUserQuery(rawUserId, {
                    $or: [
                        { sourceType: 'wearable' },
                        { provider: 'health_connect' },
                        { source: { $regex: /wearable|device/i } }
                    ]
                })
            )
                .sort({ recordedAt: -1 })
                .limit(100)
                .lean()
        ]);

        // Unified extraction ensures the main dashboard displays true live synced data
        const latestWearables = processWearableMetrics(rawWearables);

        res.render('dashboard/index', {
            reportCount,
            recentMeasurements,
            recentWearables: rawWearables.slice(0, 4),
            latestWearables,
            user: req.user || req.session.user
        });
    } catch (error) {
        console.error('[HealthOrbit] Dashboard Load Error:', error);
        res.render('dashboard/index', {
            reportCount: 0,
            recentMeasurements: [],
            recentWearables: [],
            latestWearables: {},
            user: req.user || req.session.user
        });
    }
};

// 2. Timeline
const getTimeline = async (req, res) => {
    try {
        const rawUserId = getActiveUserId(req);
        if (!rawUserId) return res.redirect('/login');

        const [reports, measurements] = await Promise.all([
            MedicalReport.find(buildUserQuery(rawUserId)).sort({ date: -1, createdAt: -1 }).lean(),
            HealthMeasurement.find(buildUserQuery(rawUserId)).sort({ recordedAt: -1 }).limit(100).lean()
        ]);

        const timelineEvents = [
            ...reports.map(r => ({
                type: 'report',
                title: r.reportType || 'Medical Report',
                date: r.date || r.createdAt,
                details: r.summary || r.notes || '',
                id: r._id
            })),
            ...measurements.map(m => ({
                type: m.sourceType === 'wearable' ? 'wearable' : 'clinical_lab',
                title: m.metricName,
                value: `${m.value} ${m.unit || ''}`.trim(),
                date: m.recordedAt,
                provider: m.provider || 'Health Connect',
                id: m._id
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        res.render('dashboard/timeline.ejs', {
            timelineEvents,
            user: req.user || req.session.user
        });
    } catch (error) {
        console.error('[HealthOrbit] Timeline Load Error:', error);
        res.redirect('/dashboard');
    }
};

// 3. Trends
const getTrends = async (req, res) => {
    try {
        const rawUserId = getActiveUserId(req);
        if (!rawUserId) return res.redirect('/login');

        const measurements = await HealthMeasurement.find(
            buildUserQuery(rawUserId, { numericValue: { $ne: null } })
        )
            .sort({ recordedAt: 1 })
            .limit(100)
            .lean();

        res.render('dashboard/trends.ejs', {
            measurements,
            user: req.user || req.session.user
        });
    } catch (error) {
        console.error('[HealthOrbit] Trends Load Error:', error);
        res.redirect('/dashboard');
    }
};

// 4. Wearables & Telemetry Integration Page
const getWearables = async (req, res) => {
    try {
        const rawUserId = getActiveUserId(req);
        if (!rawUserId) return res.redirect('/login');

        const rawWearables = await HealthMeasurement.find(
            buildUserQuery(rawUserId, {
                $or: [
                    { sourceType: 'wearable' },
                    { provider: 'health_connect' },
                    { source: { $regex: /wearable|device/i } }
                ]
            })
        )
            .sort({ recordedAt: -1 })
            .limit(100)
            .lean();

        const latestMetrics = processWearableMetrics(rawWearables);

        res.render('dashboard/wearables.ejs', {
            wearables: rawWearables,
            latestMetrics,
            user: req.user || req.session.user
        });
    } catch (error) {
        console.error('[HealthOrbit] Wearables Load Error:', error);
        res.redirect('/dashboard');
    }
};

const getErrorPage = (req, res) => {
    res.render('errors/not-found.ejs');
};

module.exports = {
    getDashboard,
    getTimeline,
    getTrends,
    getWearables,
    getErrorPage
};