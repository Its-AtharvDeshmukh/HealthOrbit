const crypto = require('crypto');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const Medicine = require('../models/Medicine');
const SymptomEntry = require('../models/SymptomEntry');
const { chatWithMeshAPI } = require('./aiService');

/**
 * Strict metric name normalization using word boundaries.
 */
const normalizeMetric = (name) => {
    if (!name) return { key: 'unknown', label: 'Unknown Metric' };
    const clean = String(name).trim();
    const lower = clean.toLowerCase();

    if (/\b(heart\s*rate|pulse|pulse\s*rate|bpm)\b/i.test(lower) || lower === 'hr') {
        return { key: 'heart_rate', label: 'Heart Rate' };
    }
    if (/\b(blood\s*pressure|arterial\s*pressure)\b/i.test(lower) || lower === 'bp') {
        return { key: 'blood_pressure', label: 'Blood Pressure' };
    }
    if (/\b(vitamin\s*d|vit\s*d|25-hydroxy|25-oh-vit-d|calcidiol)\b/i.test(lower)) {
        return { key: 'vitamin_d', label: 'Vitamin D (25-OH)' };
    }
    if (/\b(total\s*cholesterol|t-chol)\b/i.test(lower) || lower === 'cholesterol') {
        return { key: 'cholesterol_total', label: 'Total Cholesterol' };
    }
    if (/\b(glucose|blood\s*sugar|fbs|fasting\s*glucose|rbs)\b/i.test(lower)) {
        return { key: 'glucose', label: 'Blood Glucose' };
    }
    if (/\b(hemoglobin|hgb)\b/i.test(lower) || lower === 'hb') {
        return { key: 'hemoglobin', label: 'Hemoglobin' };
    }
    if (/\b(platelets|platelet\s*count)\b/i.test(lower) || lower === 'plt') {
        return { key: 'platelets', label: 'Platelets' };
    }
    if (/\b(body\s*weight|weight|wt)\b/i.test(lower) && !/\b(loss|gain|overweight)\b/i.test(lower)) {
        return { key: 'weight', label: 'Body Weight' };
    }
    if (/\b(spo2|oxygen\s*saturation|o2\s*sat)\b/i.test(lower)) {
        return { key: 'spo2', label: 'Blood Oxygen (SpO2)' };
    }

    return { 
        key: lower.replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, ''), 
        label: clean 
    };
};

/**
 * Parses blood pressure readings (e.g., "120/80") into components.
 */
const parseBP = (val) => {
    const match = String(val).match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
    if (match) {
        return { 
            systolic: parseInt(match[1], 10), 
            diastolic: parseInt(match[2], 10) 
        };
    }
    return null;
};

/**
 * Deterministically evaluates whether a value falls within a printed reference range.
 */
const compareReferenceRange = (valueStr, refRangeStr) => {
    if (!refRangeStr || !refRangeStr.trim()) {
        return { status: 'unknown', label: 'Not provided in report', cssClass: 'neutral' };
    }

    const cleanRange = refRangeStr.replace(/,/g, '').trim();
    const cleanVal = parseFloat(String(valueStr).replace(/,/g, '').trim());

    if (isNaN(cleanVal)) {
        return { status: 'unknown', label: 'Non-numeric Result', cssClass: 'neutral' };
    }

    const dashRange = cleanRange.match(/([\d.]+)\s*(?:-|to)\s*([\d.]+)/i);
    if (dashRange) {
        const low = parseFloat(dashRange[1]);
        const high = parseFloat(dashRange[2]);
        if (!isNaN(low) && !isNaN(high)) {
            if (cleanVal < low) {
                return { status: 'below_range', label: 'Below Range', cssClass: 'warn', low, high };
            }
            if (cleanVal > high) {
                return { status: 'above_range', label: 'Above Range', cssClass: 'warn', low, high };
            }
            return { status: 'within_range', label: 'Within Range', cssClass: 'good', low, high };
        }
    }

    const ltMatch = cleanRange.match(/(?:<|<=|less\s+than)\s*([\d.]+)/i);
    if (ltMatch) {
        const ceiling = parseFloat(ltMatch[1]);
        if (!isNaN(ceiling)) {
            if (cleanVal > ceiling) {
                return { status: 'above_range', label: 'Above Range', cssClass: 'warn', high: ceiling };
            }
            return { status: 'within_range', label: 'Within Range', cssClass: 'good', high: ceiling };
        }
    }

    const gtMatch = cleanRange.match(/(?:>|>=|greater\s+than)\s*([\d.]+)/i);
    if (gtMatch) {
        const floor = parseFloat(gtMatch[1]);
        if (!isNaN(floor)) {
            if (cleanVal < floor) {
                return { status: 'below_range', label: 'Below Range', cssClass: 'warn', low: floor };
            }
            return { status: 'within_range', label: 'Within Range', cssClass: 'good', low: floor };
        }
    }

    return { status: 'unknown', label: 'Reference Provided', cssClass: 'neutral' };
};

/**
 * Calculates distance to range boundary for numeric values.
 */
const calculateDistanceToRange = (val, low, high) => {
    if (val < low) return low - val;
    if (val > high) return val - high;
    return 0;
};

/**
 * Builds deterministic Important Findings from report parameters.
 */
const buildImportantFindings = (parameters = []) => {
    if (!parameters || parameters.length === 0) return [];

    const evaluated = parameters.map(p => {
        const check = compareReferenceRange(p.value, p.referenceRange);
        return {
            name: p.name,
            value: p.value,
            unit: p.unit || '',
            referenceRange: p.referenceRange || 'Not provided in report',
            eval: check,
            category: p.category || 'General',
            status: check.label,
            statusClass: check.cssClass
        };
    });

    const abnormal = evaluated.filter(e => e.eval.status === 'below_range' || e.eval.status === 'above_range');
    const standard = evaluated.filter(e => e.eval.status !== 'below_range' && e.eval.status !== 'above_range');

    return [...abnormal, ...standard].slice(0, 5);
};

/**
 * Relative longitudinal comparisons with distance-from-range trajectory analysis.
 */
const buildRelativeLongitudinal = async (userId, selectedReport, selectedParams = []) => {
    if (!selectedParams || selectedParams.length === 0) return [];

    const reportDate = selectedReport.createdAt || new Date();
    const comparisons = [];

    for (const param of selectedParams) {
        const { key, label } = normalizeMetric(param.name);
        const unit = String(param.unit || '').trim().toLowerCase();

        const currentBP = parseBP(param.value);
        const isBP = key === 'blood_pressure' || !!currentBP;

        const earlierRecord = await HealthMeasurement.findOne({
            userId,
            metricName: { $regex: new RegExp(`^${param.name}$`, 'i') },
            unit: param.unit ? String(param.unit).trim() : '',
            recordedAt: { $lt: reportDate }
        }).sort({ recordedAt: -1 }).lean();

        if (earlierRecord) {
            let comparisonItem = {
                metric: label,
                unit: param.unit || '',
                currentValue: param.value,
                previousValue: earlierRecord.value,
                previousDate: earlierRecord.recordedAt || earlierRecord.createdAt,
                hasComparison: true,
                changeStr: '',
                trend: 'flat',
                trajectoryNote: ''
            };

            if (isBP) {
                const prevBP = parseBP(earlierRecord.value);
                if (currentBP && prevBP) {
                    const diffSys = currentBP.systolic - prevBP.systolic;
                    const diffDia = currentBP.diastolic - prevBP.diastolic;
                    comparisonItem.changeStr = `Sys: ${diffSys >= 0 ? '+' : ''}${diffSys}, Dia: ${diffDia >= 0 ? '+' : ''}${diffDia}`;
                    comparisonItem.trend = diffSys > 0 ? 'up' : (diffSys < 0 ? 'down' : 'flat');
                    comparisonItem.trajectoryNote = 'Blood pressure shifted';
                    comparisons.push(comparisonItem);
                }
            } else {
                const currVal = parseFloat(param.value);
                const prevVal = parseFloat(earlierRecord.value);
                if (!isNaN(currVal) && !isNaN(prevVal)) {
                    const diff = currVal - prevVal;
                    comparisonItem.changeVal = diff;
                    comparisonItem.changeStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(2).replace(/\.00$/, '')} ${param.unit || ''}`.trim();
                    comparisonItem.trend = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat');

                    // Evaluate distance to reference range if range is defined
                    const rangeCheck = compareReferenceRange(param.value, param.referenceRange);
                    if (rangeCheck.low !== undefined && rangeCheck.high !== undefined) {
                        const prevDist = calculateDistanceToRange(prevVal, rangeCheck.low, rangeCheck.high);
                        const currDist = calculateDistanceToRange(currVal, rangeCheck.low, rangeCheck.high);

                        if (prevDist > 0 && currDist === 0) {
                            comparisonItem.trajectoryNote = 'Now within reference range';
                        } else if (prevDist > 0 && currDist < prevDist) {
                            const shift = (prevDist - currDist).toFixed(1).replace(/\.0$/, '');
                            comparisonItem.trajectoryNote = `Moved ${shift} ${param.unit || ''} closer to reference range`;
                        } else if (currDist > prevDist && prevDist > 0) {
                            comparisonItem.trajectoryNote = 'Moved farther from reference range';
                        } else {
                            comparisonItem.trajectoryNote = diff > 0 ? 'Increased' : (diff < 0 ? 'Decreased' : 'Stable');
                        }
                    } else {
                        comparisonItem.trajectoryNote = diff > 0 ? 'Increased' : (diff < 0 ? 'Decreased' : 'Stable');
                    }

                    comparisons.push(comparisonItem);
                }
            }
        }
    }

    return comparisons;
};

/**
 * Computes a hash of report parameters to verify cache freshness.
 */
const computeReportHash = (report) => {
    const raw = JSON.stringify(report.extractedData?.parameters || []) + String(report.status);
    return crypto.createHash('md5').update(raw).digest('hex');
};

/**
 * Builds the selected report analysis view, caching AI explanations when fresh.
 */
const buildReportSpecificAnalysis = async (userId, reportId = null, aiAccess = { medicalReports: true }) => {
    let report = null;

    if (reportId) {
        report = await MedicalReport.findOne({ _id: reportId, userId }).lean();
    }
    if (!report) {
        report = await MedicalReport.findOne({ userId, status: 'extracted' })
            .sort({ createdAt: -1 })
            .lean();
    }
    if (!report) {
        report = await MedicalReport.findOne({ userId })
            .sort({ createdAt: -1 })
            .lean();
    }

    if (!report) {
        return { selectedReport: null };
    }

    const statusMap = {
        'extracted': 'Processed',
        'processing': 'Processing',
        'uploaded': 'Uploaded',
        'failed': 'Partial Extraction'
    };
    const displayStatus = statusMap[report.status] || 'Processed';

    const parameters = (report.extractedData?.parameters || []).map(p => {
        const check = compareReferenceRange(p.value, p.referenceRange);
        return {
            name: p.name,
            value: p.value,
            unit: p.unit || '',
            referenceRange: p.referenceRange && p.referenceRange.trim() ? p.referenceRange : 'Not provided in report',
            category: p.category || 'General',
            status: check.label,
            statusClass: check.cssClass
        };
    });

    const importantFindings = buildImportantFindings(report.extractedData?.parameters || []);
    const longitudinalComparisons = await buildRelativeLongitudinal(userId, report, report.extractedData?.parameters || []);

    const currentHash = computeReportHash(report);
    const cached = report.analysisData;
    let narrative = {
        documentTitle: cached?.documentTitle || report.originalFileName || 'Medical Report',
        plainEnglishExplanation: cached?.plainEnglishExplanation || report.aiExplanation || '',
        doctorQuestions: cached?.doctorQuestions || [],
        synthesisSummary: ''
    };

    const isCacheValid = cached && 
                         cached.dataHash === currentHash && 
                         cached.status === 'ready' && 
                         cached.plainEnglishExplanation;

    if (!isCacheValid && aiAccess.medicalReports) {
        const contextPayload = {
            fileName: report.originalFileName,
            findings: importantFindings.map(f => ({
                test: f.name,
                result: `${f.value} ${f.unit}`.trim(),
                reference: f.referenceRange,
                status: f.status
            })),
            trends: longitudinalComparisons.map(c => ({
                metric: c.metric,
                current: `${c.currentValue} ${c.unit}`.trim(),
                previous: `${c.previousValue} ${c.unit}`.trim(),
                change: c.changeStr,
                trajectory: c.trajectoryNote
            }))
        };

        const prompt = `
Generate a structured patient explanation for this verified report data.
RULES:
1. DO NOT DIAGNOSE, CONFIRM DISEASES, OR PRESCRIBE MEDICATION CHANGES.
2. Formulate 2-3 safe discussion questions for their doctor.
3. Write a plain-English explanation (60-100 words) explaining what these specific tests observe.
4. Provide a clinical title (e.g. "Complete Blood Count", "Lipid Profile") based on the tests.

VERIFIED REPORT DATA:
${JSON.stringify(contextPayload)}

Return ONLY a JSON object:
{
  "documentTitle": "Clinical Title",
  "plainEnglishExplanation": "Explanation...",
  "doctorQuestions": ["Question 1", "Question 2", "Question 3"]
}`;

        try {
            const rawAI = await chatWithMeshAPI("Explain my clinical report data.", prompt);
            if (rawAI) {
                const clean = rawAI.replace(/```json/gi, '').replace(/```/g, '').trim();
                const parsed = JSON.parse(clean);
                narrative.documentTitle = parsed.documentTitle || narrative.documentTitle;
                narrative.plainEnglishExplanation = parsed.plainEnglishExplanation || narrative.plainEnglishExplanation;
                narrative.doctorQuestions = Array.isArray(parsed.doctorQuestions) ? parsed.doctorQuestions : [];

                await MedicalReport.findByIdAndUpdate(report._id, {
                    aiExplanation: narrative.plainEnglishExplanation,
                    analysisData: {
                        documentTitle: narrative.documentTitle,
                        plainEnglishExplanation: narrative.plainEnglishExplanation,
                        doctorQuestions: narrative.doctorQuestions,
                        generatedAt: new Date(),
                        dataHash: currentHash,
                        status: 'ready'
                    }
                });
            }
        } catch (e) {
            console.warn('[HealthAnalysis] Narrative Generation Fallback:', e.message);
            if (!narrative.plainEnglishExplanation) {
                narrative.plainEnglishExplanation = report.aiExplanation || "HealthOrbit extracted your data, but plain-language generation is temporarily unavailable.";
            }
        }
    }

    // Deterministic factual synthesis
    const outsideCount = parameters.filter(p => p.status === 'Below Range' || p.status === 'Above Range').length;
    if (longitudinalComparisons.length > 0) {
        const topTrend = longitudinalComparisons[0];
        narrative.synthesisSummary = `This report contains ${parameters.length} extracted measurements. Compared with your earlier HealthOrbit records, ${topTrend.metric} ${topTrend.trajectoryNote.toLowerCase()} (${topTrend.changeStr}). ${outsideCount > 0 ? `${outsideCount} extracted results fall outside the report's printed reference range.` : 'All results with printed ranges are within expected limits.'}`;
    } else if (parameters.length > 0) {
        narrative.synthesisSummary = `This report contains ${parameters.length} extracted measurements. ${outsideCount > 0 ? `${outsideCount} results are outside the printed reference range.` : 'Measurements with readable reference ranges fall within expected limits.'} No earlier records were available for longitudinal comparison.`;
    } else {
        narrative.synthesisSummary = 'Report processed. No discrete parameters could be extracted.';
    }

    return {
        selectedReport: {
            id: report._id.toString(),
            title: narrative.documentTitle,
            fileName: report.originalFileName,
            uploadedAt: report.createdAt,
            reportDate: report.createdAt,
            status: displayStatus,
            rawStatus: report.status,
            parameterCount: parameters.length
        },
        reportSummary: report.aiExplanation || narrative.plainEnglishExplanation,
        extractedParameters: parameters,
        importantFindings,
        plainEnglishExplanation: narrative.plainEnglishExplanation,
        referenceMatrix: parameters.slice(0, 6),
        longitudinalComparisons,
        synthesisSummary: narrative.synthesisSummary,
        doctorQuestions: narrative.doctorQuestions.length > 0 ? narrative.doctorQuestions : [
            "What do these results indicate regarding my overall health status?",
            "Are follow-up tests or routine re-evaluations recommended?",
            "Do any of my current medications interact with or influence these parameters?"
        ]
    };
};

/**
 * Global longitudinal analytics (Preserved for contextual support).
 */
const getHealthAnalytics = async (userId, aiAccess) => {
    let analytics = {
        reports: [],
        snapshots: [],
        medicines: [],
        symptoms: [],
        counts: { reports: 0, measurements: 0, medicines: 0, symptoms: 0 }
    };

    if (aiAccess.medicalReports) {
        analytics.reports = await MedicalReport.find({ userId })
            .select('_id originalFileName createdAt status aiExplanation extractedData.parameters')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        analytics.counts.reports = await MedicalReport.countDocuments({ userId });
    }

    if (aiAccess.medicines) {
        analytics.medicines = await Medicine.find({ userId, active: true }).lean();
        analytics.counts.medicines = analytics.medicines.length;

        analytics.symptoms = await SymptomEntry.find({ userId })
            .sort({ recordedAt: -1 })
            .limit(5)
            .lean();
        analytics.counts.symptoms = await SymptomEntry.countDocuments({ userId });
    }

    if (aiAccess.healthMeasurements) {
        analytics.counts.measurements = await HealthMeasurement.countDocuments({ userId });
    }

    return analytics;
};

module.exports = {
    normalizeMetric,
    parseBP,
    compareReferenceRange,
    buildImportantFindings,
    buildRelativeLongitudinal,
    buildReportSpecificAnalysis,
    getHealthAnalytics
};