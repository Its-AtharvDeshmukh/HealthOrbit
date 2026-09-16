const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const FamilyMember = require('../models/FamilyMember');

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

    let contextData = {
        userProfile: {
            name: user.fullName,
            age: user.age || "Not specified",
            gender: user.gender || "Not specified",
            bloodGroup: user.bloodGroup || "Not specified",
            medicalConditions: user.medicalConditions?.length ? user.medicalConditions : ["None recorded"],
            allergies: user.allergies?.length ? user.allergies : ["None recorded"],
        },
        currentContext: {
            page: currentPage || "Unknown",
            data: {}
        },
        longitudinalHistory: {},
        databaseLimitations: []
    };

    // --- PAGE CONTEXT (Current State) ---
    if (selectedRecordId && (currentPage === '/ocr' || currentPage === '/reports')) {
        const report = await MedicalReport.findOne({ _id: selectedRecordId, userId: userId }).lean();
        if (report) {
            contextData.currentContext.data.selectedReport = {
                fileName: report.originalFileName,
                date: report.createdAt,
                extractedMetrics: report.extractedData?.parameters || [],
            };
        }
    }

    // --- LONGITUDINAL CONTEXT & BACKEND CALCULATIONS ---

    // A. Health Measurements (Metrics, Trends & Analytics)
    if (intent.wantsHeartRate || intent.wantsBloodPressure || intent.wantsTrends || intent.wantsCalculation) {
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

        // FETCH ALL MATCHING RECORDS (Do not limit at the DB level for analytics)
        const allMeasurements = await HealthMeasurement.find(query).sort({ createdAt: 1 }).lean();
        
        if (allMeasurements.length > 0) {
            // PERFORM DETERMINISTIC BACKEND CALCULATIONS
            let sum = 0;
            let validNumericCount = 0;
            let min = Infinity;
            let max = -Infinity;

            allMeasurements.forEach(m => {
                // Basic parsing (works well for Heart Rate, Weight, Steps, SpO2)
                // Note: Complex strings like BP "120/80" will parse to 120 (Systolic) with parseFloat
                const val = parseFloat(m.value);
                if (!isNaN(val)) {
                    sum += val;
                    validNumericCount++;
                    if (val < min) min = val;
                    if (val > max) max = val;
                }
            });

            // Append Verified Analytics
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

            // Provide a sampled time-series (latest 20) for the LLM to explain recent trends naturally
            contextData.longitudinalHistory.recentSample = allMeasurements.slice(-20).map(m => ({
                metric: m.metricName,
                value: m.value,
                unit: m.unit,
                date: m.recordedAt || m.createdAt
            })).reverse();
            
        } else {
            contextData.longitudinalHistory.analytics = { 
                note: `No records found for the requested period (${periodString}).` 
            };
        }
    }

    // B. Medical Reports Comparison
    if (intent.wantsReports || intent.wantsTrends) {
        const previousReports = await MedicalReport.find({ userId: userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('originalFileName createdAt extractedData.parameters status').lean();
        contextData.longitudinalHistory.previousReports = previousReports;
    }

    // C. Family History Enforcement
    if (intent.wantsFamily) {
        const family = await FamilyMember.find({ userId: userId })
            .select('name relationship permissions').lean();
        contextData.longitudinalHistory.familyNetwork = family;
        
        contextData.databaseLimitations.push("Family medical history (conditions, reports, metrics of family members) is NOT currently available in the HealthOrbit records. The database only stores their contact info and your sharing permissions. You cannot view their health data.");
    }

    // D. Medicines & Symptoms Enforcement
    if (intent.wantsMeds || intent.wantsSymptoms || currentPage === '/medicines') {
        contextData.longitudinalHistory.currentMedicines = user.currentMedicines?.length ? user.currentMedicines : ["None recorded"];
        
        contextData.databaseLimitations.push("Historical medicine timelines, pill schedules, and symptom logs are NOT currently stored in the backend database. Only the flat 'currentMedicines' list on the user profile is factual. State that historical symptom/medication data is unavailable.");
    }

    return JSON.stringify(contextData);
};

module.exports = { buildUserAIContext };