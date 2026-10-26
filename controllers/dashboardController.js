const healthTrendsService = require('../services/healthTrendsService');
const healthTimelineService = require('../services/healthTimelineService');
const { chatWithMeshAPI } = require('../services/aiService');

const dashboardService = require('../services/dashboardService');

// 1. Overview Dashboard
const getDashboard = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');

        let dashboardData = { hasHealthData: false, user: { firstName: 'User' } };
        let dashboardError = false;

        try {
            dashboardData = await dashboardService.getDashboardData(activeUserId);
        } catch (err) {
            console.error('[Dashboard Data Error]:', err.message);
            dashboardError = true;
        }

        res.render('dashboard/index', {
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
            dashboardData,
            dashboardError
        });
    } catch (err) {
        console.error('[HealthOrbit] getDashboard fatal error:', err.message);
        res.redirect('/auth');
    }
};


// 2. Health Trends
const getTrends = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');

        const { range, metric, source, from, to } = req.query;

        let trendData = { hasData: false, availableMetrics: [] };
        if (healthTrendsService && typeof healthTrendsService.getHealthTrendsForUser === 'function') {
            trendData = await healthTrendsService.getHealthTrendsForUser({
                userId: activeUserId,
                range: range || '30d',
                metric: metric || null,
                source: source || 'all',
                from: from || null,
                to: to || null
            });
        }

        let aiSummary = null;
        if (trendData && trendData.hasData && trendData.primaryTrend && trendData.primaryTrend.points && trendData.primaryTrend.points.length >= 2) {
            try {
                const compactFacts = {
                    period: trendData.selectedRange,
                    metric: trendData.primaryTrend.label,
                    current: `${trendData.primaryTrend.currentValue} ${trendData.primaryTrend.unit}`.trim(),
                    average: `${trendData.primaryTrend.averageValue} ${trendData.primaryTrend.unit}`.trim(),
                    trendDirection: trendData.primaryTrend.direction,
                    deviationsCount: (trendData.deviations || []).length
                };

                const prompt = `You are HealthOrbit's clinical analytics assistant. Synthesize these deterministic facts into a brief 40-60 word trend observation. Do NOT diagnose or prescribe.\nFACTS: ${JSON.stringify(compactFacts)}`;
                aiSummary = await chatWithMeshAPI("Summarize my trends.", prompt);
            } catch (aiErr) {
                console.warn('[HealthTrends AI Warning]:', aiErr.message);
                aiSummary = null;
            }
        }
        trendData.aiSummary = aiSummary;

        res.render('dashboard/trends', {
            trendData,
            trendError: false,
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || '')
        });
    } catch (error) {
        console.error('[HealthOrbit] getTrends error:', error.message);
        res.render('dashboard/trends', {
            trendData: { hasData: false, availableMetrics: [] },
            trendError: true,
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || '')
        });
    }
};

// 3. Health Timeline
const getTimeline = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');

        let timelineEvents = [];
        if (healthTimelineService && typeof healthTimelineService.getTimelineForUser === 'function') {
            timelineEvents = await healthTimelineService.getTimelineForUser(activeUserId, 50);
        }

        res.render('dashboard/timeline', {
            timelineEvents: timelineEvents || [],
            timelineError: false,
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || '')
        });
    } catch (error) {
        console.error('[HealthOrbit] getTimeline error:', error.message);
        res.render('dashboard/timeline', {
            timelineEvents: [],
            timelineError: true,
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || '')
        });
    }
};

// 4. Wearables View (CRASH FIXED)
const getWearables = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');

        let latestMetrics = {};
        let wearables = []; // <--- FIXED: Renamed to strictly match the GitHub wearables.ejs variable expectation

        try {
            const HealthMeasurement = require('../models/HealthMeasurement');
            const records = await HealthMeasurement.find({ 
                userId: activeUserId, 
                sourceType: { $in: ['wearable', 'Health Connect'] } 
            }).sort({ recordedAt: -1 }).limit(50).lean();
            
            wearables = records;
            
            records.forEach(r => {
                const key = r.metricKey || (r.metricName ? r.metricName.toLowerCase().replace(/ /g, '_') : null);
                if (key && !latestMetrics[key]) {
                    latestMetrics[key] = r;
                }
            });
        } catch (e) {
            console.warn('[Wearables] DB fetch error:', e.message);
        }

        res.render('dashboard/wearables', {
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
            latestMetrics,
            wearables,          // Exposes the array using the exact name EJS requires
            wearableRecords: wearables // Fallback duplicate just in case
        });
    } catch (err) {
        console.error('[HealthOrbit] getWearables error:', err.message);
        res.render('dashboard/module-soon');
    }
};

// 5. Medicines View
const getMedicines = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session?.userId || (req.user && req.user._id);
        if (!activeUserId) return res.redirect('/auth');

        let medicines = [];
        let logs = [];

        try {
            const Medicine = require('../models/Medicine');
            const MedicineLog = require('../models/MedicineLog');
            medicines = await Medicine.find({ userId: activeUserId }).lean();
            logs = await MedicineLog.find({ userId: activeUserId }).sort({ date: -1, scheduledTime: -1 }).limit(30).lean();
        } catch (e) {
            console.warn('[Medicines] DB fetch error:', e.message);
        }

        res.render('dashboard/medicines', {
            userName: req.user ? req.user.fullName : (req.session?.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || ''),
            medicines,
            logs
        });
    } catch (err) {
        console.error('[HealthOrbit] getMedicines error:', err.message);
        res.render('dashboard/module-soon');
    }
};

// 6. Generic Error Page
const getErrorPage = async (req, res) => {
    try {
        res.render('dashboard/error', {
            message: 'An unexpected application state occurred.'
        });
    } catch (err) {
        res.status(500).send('Application Error');
    }
};


const getBodyTwin = async (req, res) => {
    try {
        // Minimum viable render context. No backend data queries yet.
        res.render('dashboard/body-twin', {
            path: '/body-twin',
            userName: req.user ? req.user.fullName : 'User'
        });
    } catch (error) {
        console.error('Error loading Body Twin:', error);
        res.redirect('/dashboard');
    }
};


module.exports = {
    getDashboard,
    getTrends,
    getTimeline,
    getWearables,
    getMedicines,
    getErrorPage,
    getBodyTwin
};