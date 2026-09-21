const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');

const getDashboard = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user ? req.user._id : null);
        const reportCount = await MedicalReport.countDocuments({ userId: activeUserId });
        const recentMeasurements = await HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(5);

        res.render('dashboard/index', { reportCount, recentMeasurements });
    } catch (error) {
        console.error('[HealthOrbit] Dashboard Load Error:', error);
        res.render('dashboard/index', { reportCount: 0, recentMeasurements: [] });
    }
};

const getTimeline = (req, res) => {
    res.render('dashboard/timeline.ejs');
};

const getTrends = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user ? req.user._id : null);
        const measurements = await HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(30);
        res.render('dashboard/trends.ejs', { measurements });
    } catch (error) {
        res.redirect('/dashboard');
    }
};

const getWearables = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user ? req.user._id : null);
        const latestWearables = await HealthMeasurement.find({ 
            userId: activeUserId, source: { $regex: /Report|Device|Wearable/i } 
        }).sort({ recordedAt: -1 }).limit(10);
        res.render('dashboard/wearables.ejs', { wearables: latestWearables });
    } catch (error) {
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