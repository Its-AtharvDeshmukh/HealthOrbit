const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const FamilyMember = require('../models/FamilyMember');
const Medicine = require('../models/Medicine');
const SymptomEntry = require('../models/SymptomEntry');

// Lightweight Intent Extraction based on user question
const extractIntent = (question) => {
    const q = question.toLowerCase();
    return {
        wantsHeartRate: q.includes('heart rate') || q.includes('hr') || q.includes('pulse'),
        wantsBloodPressure: q.includes('blood pressure') || q.includes('bp'),
        wantsTrends: q.includes('trend') || q.includes('history') || q.includes('changed') || q.includes('compare') || q.includes('previous') || q.includes('last'),
        wantsCalculation: q.includes('average') || q.includes('avg') || q.includes('mean') || q.includes('max') || q.includes('min') || q.includes('highest') || q.includes('lowest') || q.includes('how many') || q.includes('count'),
        wantsFamily: q.includes('family') || q.includes('mother') || q.includes('father') || q.includes('sister') || q.includes('brother'),
        wantsMeds: q.includes('medicine') || q.includes('medication') || q.includes('pill'),
        wantsSymptoms: q.includes('symptom') || q.includes('feel') || q.includes('pain') || q.includes('fever'),
        wantsReports: q.includes('report') || q.includes('test') || q.includes('result') || q.includes('lab')
    };
};

/**
 * Builds a secure, longitudinal, and analytically-aware context for the AI.
 */
const buildUserAIContext = async (userId, frontendContext = {}, userQuestion = "") => {
    const { currentPage, selectedRecordId } = frontendContext;
    const intent = extractIntent(userQuestion);

    // 1. SECURITY: Scoped Base User Profile
    const user = await User.findById(userId).lean();
    if (!user) throw new Error("Context Retrieval Error: Authenticated user not found.");

    // 2. PRIVACY ENFORCEMENT: Load AI Access settings (Default to safe values if missing)
    const aiAccess = user.privacySettings?.aiAccess || { 
        profile: true, 
        medicalReports: true, 
        healthMeasurements: true, 
        medicines: true, 
        familyMetadata: false 
    };

    let contextData = {
        userProfile: aiAccess.profile ? {
            name: user.fullName,
            age: user.age || "Not specified",
            gender: user.gender || "Not specified",
            bloodGroup: user.bloodGroup || "Not specified",
            medicalConditions: user.medicalConditions?.length ? user.medicalConditions : ["None recorded"],
            allergies: user.allergies?.length ? user.allergies : ["None recorded"],
        } : { note: "Access Denied: User has disabled AI access to their personal health profile." },
        currentContext: {
            page: currentPage || "Unknown",
            data: {}
        },
        longitudinalHistory: {},
        databaseLimitations: []
    };

    // --- PAGE CONTEXT (Current State) ---
    if (selectedRecordId && (currentPage === '/ocr' || currentPage === '/reports')) {
        if (aiAccess.medicalReports) {
            const report = await MedicalReport.findOne({ _id: selectedRecordId, userId: userId }).lean();
            if (report) {
                contextData.currentContext.data.selectedReport = {
                    fileName: report.originalFileName,
                    date: report.createdAt,
                    extractedMetrics: report.extractedData?.parameters || [],
                };
            }
        } else {
            contextData.databaseLimitations.push("Access Denied: Cannot view current report because Medical Reports access is disabled in Privacy Settings.");
        }
    }

    // --- ENFORCED AI ACCESS: HEALTH MEASUREMENTS (Metrics, Trends & Analytics) ---
    if (intent.wantsHeartRate || intent.wantsBloodPressure || intent.wantsTrends || intent.wantsCalculation) {
        if (aiAccess.healthMeasurements) {
            let query = { userId: userId };
            
            // Metric Filtering
            if (intent.wantsHeartRate && !intent.wantsBloodPressure) {
                query.metricName = { $regex: /heart rate|hr|pulse/i };
            } else if (intent.wantsBloodPressure && !intent.wantsHeartRate) {
                query.metricName = { $regex: /blood pressure|bp/i };
            }

            // Date Range Logic
            const qLower = userQuestion.toLowerCase();
            let periodString = "All time";
            
            if (qLower.includes('6 months') || qLower.includes('six months')) {
                const dateLimit = new Date();
                dateLimit.setMonth(dateLimit.getMonth() - 6);
                query.createdAt = { $gte: dateLimit };
                periodString = "Last 6 months";
            } else if (qLower.includes('last month') || qLower.includes('30 days')) {
                const dateLimit = new Date();
                dateLimit.setMonth(dateLimit.getMonth() - 1);
                query.createdAt = { $gte: dateLimit };
                periodString = "Last 30 days";
            } else if (qLower.includes('this week') || qLower.includes('7 days')) {
                const dateLimit = new Date();
                dateLimit.setDate(dateLimit.getDate() - 7);
                query.createdAt = { $gte: dateLimit };
                periodString = "Last 7 days";
            }

            const allMeasurements = await HealthMeasurement.find(query).sort({ createdAt: 1 }).lean();
            
            if (allMeasurements.length > 0) {
                let sum = 0, validNumericCount = 0, min = Infinity, max = -Infinity;
                allMeasurements.forEach(m => {
                    const val = parseFloat(m.value);
                    if (!isNaN(val)) {
                        sum += val;
                        validNumericCount++;
                        if (val < min) min = val;
                        if (val > max) max = val;
                    }
                });

                contextData.longitudinalHistory.analytics = {
                    periodAnalyzed: periodString,
                    totalRecordsFound: allMeasurements.length,
                    backendCalculations: validNumericCount > 0 ? {
                        average: parseFloat((sum / validNumericCount).toFixed(2)),
                        minimum: min,
                        maximum: max,
                        recordsUsedInMath: validNumericCount
                    } : "Non-numeric data; mathematical calculations skipped."
                };
                contextData.longitudinalHistory.recentSample = allMeasurements.slice(-20).map(m => ({
                    metric: m.metricName, value: m.value, unit: m.unit, date: m.recordedAt || m.createdAt
                })).reverse();
            } else {
                contextData.longitudinalHistory.analytics = { note: `No records found for the requested period (${periodString}).` };
            }
        } else {
            // Enforcement: User disabled Measurement Access
            contextData.databaseLimitations.push("Access Denied: The user has disabled AI access to Health Measurements in their Privacy Settings. State that you cannot access this data.");
        }
    }

    // --- ENFORCED AI ACCESS: MEDICAL REPORTS ---
    if (intent.wantsReports || intent.wantsTrends) {
        if (aiAccess.medicalReports) {
            const previousReports = await MedicalReport.find({ userId: userId })
                .sort({ createdAt: -1 }).limit(5)
                .select('originalFileName createdAt extractedData.parameters status').lean();
            contextData.longitudinalHistory.previousReports = previousReports;
        } else {
            // Enforcement: User disabled Report Access
            contextData.databaseLimitations.push("Access Denied: The user has disabled AI access to Medical Reports. State that you cannot access their reports.");
        }
    }

    // --- ENFORCED AI ACCESS: FAMILY HISTORY ---
    if (intent.wantsFamily) {
        if (aiAccess.familyMetadata) {
            const family = await FamilyMember.find({ userId: userId }).select('name relationship permissions').lean();
            contextData.longitudinalHistory.familyNetwork = family;
            contextData.databaseLimitations.push("Family medical history (conditions, reports, metrics of family members) is NOT currently available in the HealthOrbit records. The database only stores their contact info and your sharing permissions. You cannot view their health data.");
        } else {
            // Enforcement: User disabled Family Metadata Access
            contextData.databaseLimitations.push("Access Denied: The user has disabled AI access to Family Information.");
        }
    }

    // --- ENFORCED AI ACCESS: MEDICINES & SYMPTOMS ---
    if (intent.wantsMeds || intent.wantsSymptoms || currentPage === '/medicines') {
        if (aiAccess.medicines) {
            // Fetch real structured models
            const activeMeds = await Medicine.find({ userId: userId, active: true })
                .select('name dosage times instructions').lean();
            contextData.longitudinalHistory.currentMedicines = activeMeds;

            const recentSymptoms = await SymptomEntry.find({ userId: userId })
                .sort({ recordedAt: -1 }).limit(10)
                .select('symptom severity notes recordedAt').lean();
            contextData.longitudinalHistory.recentSymptoms = recentSymptoms;
            
        } else {
            // Enforcement: User disabled Medicines Access
            contextData.databaseLimitations.push("Access Denied: The user has disabled AI access to their Medicines and Symptoms list.");
        }
    }

    return JSON.stringify(contextData);
};

module.exports = { buildUserAIContext };