const HealthMeasurement = require('../models/HealthMeasurement');
const MedicalReport = require('../models/MedicalReport');
const Medicine = require('../models/Medicine');
const MedicineLog = require('../models/MedicineLog');
const healthTimelineService = require('./healthTimelineService');
const User = require('../models/User');

async function getDashboardData(userId) {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const startOfDay = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    startOfDay.setHours(0, 0, 0, 0);

    const user = await User.findById(userId).lean();

    const [
        measurements,
        recentActivity,
        recentReports,
        medicines,
        pendingLogs
    ] = await Promise.all([
        HealthMeasurement.find({ userId }).sort({ recordedAt: -1 }).limit(150).lean(),
        healthTimelineService.getTimelineForUser(userId, 5),
        MedicalReport.find({ userId }).sort({ reportDate: -1, createdAt: -1 }).limit(3).lean(),
        Medicine.find({ userId, active: true }).lean(),
        MedicineLog.find({ userId, date: todayStr, status: 'pending' }).sort({ scheduledTime: 1 }).lean()
    ]);

    const metricsSummary = {};
    let lastSyncedAt = null;

    for (const m of measurements) {
        if (['wearable', 'Health Connect'].includes(m.sourceType)) {
            if (!lastSyncedAt || new Date(m.recordedAt) > new Date(lastSyncedAt)) {
                lastSyncedAt = m.recordedAt;
            }
        }

        const key = m.metricKey;
        if (!key) continue;

        if (['steps', 'distance', 'calories'].includes(key)) {
            const recDate = new Date(m.recordedAt || m.createdAt);
            if (recDate >= startOfDay) {
                if (!metricsSummary[key] || m.numericValue > metricsSummary[key].value) {
                    metricsSummary[key] = {
                        value: m.numericValue,
                        unit: m.unit,
                        timestamp: m.recordedAt
                    };
                }
            }
        } else {
            if (!metricsSummary[key]) {
                metricsSummary[key] = {
                    value: m.value || m.numericValue,
                    unit: m.unit,
                    timestamp: m.recordedAt
                };
            }
        }
    }

    let nextMedication = null;
    if (pendingLogs.length > 0) {
        const nextLog = pendingLogs[0];
        const med = medicines.find(m => m._id.toString() === nextLog.medicineId.toString());
        if (med) {
            nextMedication = {
                id: nextLog._id.toString(),
                name: med.name,
                dosage: med.dosage,
                instructions: med.instructions,
                scheduledTime: nextLog.scheduledTime
            };
        }
    }

    return {
        user: {
            firstName: user && user.fullName ? user.fullName.split(' ')[0] : 'User',
            fullName: user ? user.fullName : 'User'
        },
        metricsSummary,
        wearableStatus: {
            hasData: !!lastSyncedAt,
            lastSyncedAt
        },
        recentActivity: recentActivity || [],
        recentReports: recentReports || [],
        nextMedication,
        hasHealthData: measurements.length > 0 || recentReports.length > 0 || (recentActivity && recentActivity.length > 0)
    };
}

module.exports = { getDashboardData };