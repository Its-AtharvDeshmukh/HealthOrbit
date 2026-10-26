const HealthMeasurement = require('../models/HealthMeasurement');
const MedicalReport = require('../models/MedicalReport');
const { normalizeMetric } = require('./healthAnalysisService');

/**
 * Calculates start and end timestamps for the current and previous comparable windows
 */
const parseTimeRange = (range = '30d', customFrom = null, customTo = null) => {
    const now = new Date();
    let currentFrom = new Date();
    let currentTo = new Date();
    let periodDays = 30;

    if (range === 'custom' && customFrom && customTo) {
        const parsedFrom = new Date(customFrom);
        const parsedTo = new Date(customTo);
        if (!isNaN(parsedFrom.getTime()) && !isNaN(parsedTo.getTime()) && parsedFrom < parsedTo) {
            currentFrom = parsedFrom;
            currentTo = parsedTo;
            periodDays = Math.max(1, Math.round((currentTo - currentFrom) / (1000 * 60 * 60 * 24)));
        } else {
            currentFrom.setDate(now.getDate() - 30);
            periodDays = 30;
        }
    } else {
        switch (range) {
            case '7d':
                periodDays = 7;
                break;
            case '30d':
                periodDays = 30;
                break;
            case '3m':
                periodDays = 90;
                break;
            case '6m':
                periodDays = 180;
                break;
            case '1y':
                periodDays = 365;
                break;
            default:
                periodDays = 30;
        }
        currentFrom = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
        currentTo = now;
    }

    const previousFrom = new Date(currentFrom.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const previousTo = new Date(currentFrom.getTime());

    return {
        selectedRange: range,
        currentFrom,
        currentTo,
        previousFrom,
        previousTo,
        periodDays
    };
};

/**
 * Calculates Pearson correlation coefficient between two numeric series aligned by date
 */
const calculatePearsonCorrelation = (xValues, yValues) => {
    const n = xValues.length;
    if (n < 4) return null;

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;

    for (let i = 0; i < n; i++) {
        sumX += xValues[i];
        sumY += yValues[i];
        sumXY += xValues[i] * yValues[i];
        sumX2 += xValues[i] * xValues[i];
        sumY2 += yValues[i] * yValues[i];
    }

    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt(((n * sumX2) - (sumX * sumX)) * ((n * sumY2) - (sumY * sumY)));

    if (denominator === 0 || isNaN(denominator)) return 0;
    const r = numerator / denominator;
    return parseFloat(r.toFixed(2));
};

/**
 * Primary Analytics Engine for Health Trends
 */
const getHealthTrendsForUser = async ({ userId, range = '30d', metric = null, source = 'all', from = null, to = null }) => {
    if (!userId) {
        return { hasData: false, availableMetrics: [] };
    }

    const { selectedRange, currentFrom, currentTo, previousFrom, previousTo, periodDays } = parseTimeRange(range, from, to);

    // 1. Discover all real numeric metrics for this user
    const userNumericMetrics = await HealthMeasurement.aggregate([
        { $match: { userId, numericValue: { $ne: null } } },
        {
            $group: {
                _id: '$metricKey',
                label: { $first: '$metricName' },
                unit: { $first: '$unit' },
                sourceTypes: { $addToSet: '$sourceType' },
                count: { $sum: 1 }
            }
        },
        { $sort: { count: -1 } }
    ]);

    if (!userNumericMetrics || userNumericMetrics.length === 0) {
        return {
            hasData: false,
            selectedRange,
            selectedSource: source,
            selectedMetric: null,
            availableMetrics: [],
            primaryTrend: null,
            metricSummaries: [],
            deviations: [],
            stableMeasurements: [],
            historicalComparison: null,
            relationships: [],
            medicalReportTrends: [],
            aiSummary: null
        };
    }

    const availableMetrics = userNumericMetrics.map(m => {
        const norm = normalizeMetric(m.label || m._id);
        return {
            metricKey: m._id,
            label: norm.label || m.label,
            unit: m.unit || '',
            sourceTypes: m.sourceTypes.filter(Boolean),
            count: m.count
        };
    });

    // 2. Resolve target metric
    let selectedMetric = metric;
    const availableKeys = availableMetrics.map(m => m.metricKey);
    if (!selectedMetric || !availableKeys.includes(selectedMetric)) {
        selectedMetric = availableKeys.includes('heart_rate') ? 'heart_rate' : availableKeys[0];
    }

    const currentMetricMeta = availableMetrics.find(m => m.metricKey === selectedMetric) || availableMetrics[0];

    // 3. Build Source Match Constraints
    const baseSourceMatch = {};
    if (source && source !== 'all') {
        baseSourceMatch.sourceType = source;
    }

    // 4. Query current period and previous period records for selected metric
    const [currentRecords, previousRecords] = await Promise.all([
        HealthMeasurement.find({
            userId,
            metricKey: selectedMetric,
            numericValue: { $ne: null },
            recordedAt: { $gte: currentFrom, $lte: currentTo },
            ...baseSourceMatch
        }).sort({ recordedAt: 1 }).lean(),
        HealthMeasurement.find({
            userId,
            metricKey: selectedMetric,
            numericValue: { $ne: null },
            recordedAt: { $gte: previousFrom, $lt: currentFrom },
            ...baseSourceMatch
        }).sort({ recordedAt: 1 }).lean()
    ]);

    // 5. Aggregate and Bucket Time-Series Data
    const isCumulative = ['steps', 'distance', 'calories'].includes(selectedMetric.toLowerCase());
    const bucketsMap = new Map();

    for (const rec of currentRecords) {
        const rDate = new Date(rec.recordedAt || rec.createdAt);
        const dayKey = rDate.toISOString().split('T')[0];

        if (!bucketsMap.has(dayKey)) {
            bucketsMap.set(dayKey, {
                timestamp: rDate.toISOString(),
                dateFormatted: rDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                values: []
            });
        }
        bucketsMap.get(dayKey).values.push(rec.numericValue);
    }

    const points = [];
    const dailyValues = [];

    for (const [, bucket] of bucketsMap.entries()) {
        let dayVal = 0;
        if (isCumulative) {
            // Take the max or cumulative final reported value of the day
            dayVal = Math.max(...bucket.values);
        } else {
            // Mean for continuous vitals like heart rate, SpO2, blood pressure
            const sum = bucket.values.reduce((acc, v) => acc + v, 0);
            dayVal = parseFloat((sum / bucket.values.length).toFixed(1));
        }
        points.push({
            timestamp: bucket.timestamp,
            dateFormatted: bucket.dateFormatted,
            value: dayVal
        });
        dailyValues.push(dayVal);
    }

    // 6. Calculate Primary Trend Statistics
    let currentValue = null;
    let averageValue = null;
    let minValue = null;
    let maxValue = null;
    let direction = 'insufficient_data';
    let changeAbsolute = null;
    let changePercent = null;

    if (dailyValues.length > 0) {
        currentValue = dailyValues[dailyValues.length - 1];
        const sum = dailyValues.reduce((acc, v) => acc + v, 0);
        averageValue = parseFloat((sum / dailyValues.length).toFixed(1));
        minValue = Math.min(...dailyValues);
        maxValue = Math.max(...dailyValues);

        if (dailyValues.length >= 2) {
            const firstHalf = dailyValues.slice(0, Math.floor(dailyValues.length / 2));
            const secondHalf = dailyValues.slice(Math.floor(dailyValues.length / 2));
            const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
            const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
            const deltaPercent = avg1 !== 0 ? ((avg2 - avg1) / avg1) * 100 : 0;

            if (Math.abs(deltaPercent) < 2.5) {
                direction = 'stable';
            } else if (deltaPercent > 0) {
                direction = 'increasing';
            } else {
                direction = 'decreasing';
            }
        }
    }

    // 7. Calculate Historical Comparison (Current vs Preceding equal window)
    let historicalComparison = null;
    if (previousRecords.length > 0 && dailyValues.length > 0) {
        const prevValues = previousRecords.map(r => r.numericValue);
        const prevAvg = parseFloat((prevValues.reduce((a, b) => a + b, 0) / prevValues.length).toFixed(1));
        const diffAbs = parseFloat((averageValue - prevAvg).toFixed(1));
        const diffPct = prevAvg !== 0 ? parseFloat(((diffAbs / prevAvg) * 100).toFixed(1)) : 0;

        historicalComparison = {
            currentPeriodLabel: `Selected ${periodDays} Days`,
            previousPeriodLabel: `Previous ${periodDays} Days`,
            currentAverage: averageValue,
            previousAverage: prevAvg,
            changeAbsolute: diffAbs,
            changePercent: diffPct,
            unit: currentMetricMeta.unit
        };
    }

    // 8. Deterministic Deviation Detection
    const deviations = [];
    if (previousRecords.length >= 4 && currentValue !== null) {
        const pVals = previousRecords.map(r => r.numericValue);
        const pMin = Math.min(...pVals);
        const pMax = Math.max(...pVals);
        const pAvg = pVals.reduce((a, b) => a + b, 0) / pVals.length;

        // Deviation threshold: >15% higher than previous period maximum or >15% lower than minimum
        if (currentValue > pMax * 1.15) {
            const devPct = parseFloat((((currentValue - pAvg) / pAvg) * 100).toFixed(1));
            deviations.push({
                metricKey: selectedMetric,
                title: `${currentMetricMeta.label} Above Recent Baseline`,
                detectedAt: points.length > 0 ? points[points.length - 1].dateFormatted : 'Latest',
                currentValue,
                baselineMin: pMin,
                baselineMax: pMax,
                deviationPercent: devPct,
                severity: 'notice',
                unit: currentMetricMeta.unit
            });
        } else if (currentValue < pMin * 0.85) {
            const devPct = parseFloat((((pAvg - currentValue) / pAvg) * 100).toFixed(1));
            deviations.push({
                metricKey: selectedMetric,
                title: `${currentMetricMeta.label} Below Recent Baseline`,
                detectedAt: points.length > 0 ? points[points.length - 1].dateFormatted : 'Latest',
                currentValue,
                baselineMin: pMin,
                baselineMax: pMax,
                deviationPercent: devPct,
                severity: 'notice',
                unit: currentMetricMeta.unit
            });
        }
    }

    // 9. Stable Measurements Check
    const stableMeasurements = [];
    if (dailyValues.length >= 5 && minValue !== null && maxValue !== null && averageValue !== 0) {
        const spreadPct = ((maxValue - minValue) / averageValue) * 100;
        if (spreadPct <= 8.0) {
            stableMeasurements.push({
                metricKey: selectedMetric,
                label: currentMetricMeta.label,
                range: `${minValue}–${maxValue} ${currentMetricMeta.unit}`.trim(),
                sampleCount: dailyValues.length,
                status: 'stable'
            });
        }
    }

    // 10. Metric Relationships (Pearson Correlation across aligned day buckets)
    const relationships = [];
    const candidatePairs = [
        ['sleep_duration', 'resting_heart_rate', 'Sleep Duration', 'Resting Heart Rate'],
        ['steps', 'resting_heart_rate', 'Steps', 'Resting Heart Rate'],
        ['steps', 'heart_rate', 'Steps', 'Heart Rate']
    ];

    for (const [keyA, keyB, labelA, labelB] of candidatePairs) {
        const [recsA, recsB] = await Promise.all([
            HealthMeasurement.find({
                userId,
                metricKey: keyA,
                numericValue: { $ne: null },
                recordedAt: { $gte: currentFrom, $lte: currentTo }
            }).lean(),
            HealthMeasurement.find({
                userId,
                metricKey: keyB,
                numericValue: { $ne: null },
                recordedAt: { $gte: currentFrom, $lte: currentTo }
            }).lean()
        ]);

        const mapA = new Map();
        recsA.forEach(r => mapA.set(new Date(r.recordedAt).toISOString().split('T')[0], r.numericValue));

        const alignedA = [];
        const alignedB = [];

        recsB.forEach(r => {
            const day = new Date(r.recordedAt).toISOString().split('T')[0];
            if (mapA.has(day)) {
                alignedA.push(mapA.get(day));
                alignedB.push(r.numericValue);
            }
        });

        if (alignedA.length >= 4) {
            const r = calculatePearsonCorrelation(alignedA, alignedB);
            if (r !== null) {
                let relType = 'weak_or_none';
                let statement = `No clear directional relationship was observed between ${labelA} and ${labelB} during this recorded window.`;

                if (r >= 0.35) {
                    relType = 'positive';
                    statement = `Higher ${labelA} was associated with higher ${labelB} across ${alignedA.length} overlapping recorded days.`;
                } else if (r <= -0.35) {
                    relType = 'inverse';
                    statement = `Higher ${labelA} was associated with lower ${labelB} across ${alignedA.length} overlapping recorded days.`;
                }

                relationships.push({
                    metricA: labelA,
                    metricB: labelB,
                    sampleCount: alignedA.length,
                    correlation: r,
                    relationship: relType,
                    statement
                });
            }
        }
    }

    // 11. Medical Report Trends (Longitudinal deltas from verified OCR/Lab panels)
    const medicalReportTrends = [];
    const labMetricsGrouped = await HealthMeasurement.aggregate([
        {
            $match: {
                userId,
                sourceType: 'medical_report',
                numericValue: { $ne: null }
            }
        },
        { $sort: { recordedAt: -1 } },
        {
            $group: {
                _id: { metricKey: '$metricKey', unit: '$unit' },
                label: { $first: '$metricName' },
                unit: { $first: '$unit' },
                measurements: {
                    $push: {
                        numericValue: '$numericValue',
                        recordedAt: '$recordedAt',
                        sourceRecordId: '$sourceRecordId'
                    }
                }
            }
        },
        { $match: { 'measurements.1': { $exists: true } } },
        { $limit: 4 }
    ]);

    for (const group of labMetricsGrouped) {
        const latestRec = group.measurements[0];
        const prevRec = group.measurements[1];
        const diff = parseFloat((latestRec.numericValue - prevRec.numericValue).toFixed(2));
        const pct = prevRec.numericValue !== 0 ? parseFloat(((diff / prevRec.numericValue) * 100).toFixed(1)) : 0;

        medicalReportTrends.push({
            metricKey: group._id.metricKey,
            label: group.label,
            unit: group.unit || '',
            latest: latestRec.numericValue,
            latestDate: new Date(latestRec.recordedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            previous: prevRec.numericValue,
            previousDate: new Date(prevRec.recordedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            changeAbsolute: diff,
            changePercent: pct,
            direction: diff > 0 ? 'increasing' : (diff < 0 ? 'decreasing' : 'stable'),
            sourceRecordId: latestRec.sourceRecordId ? latestRec.sourceRecordId.toString() : null
        });
    }

    return {
        hasData: true,
        selectedRange,
        selectedSource: source,
        selectedMetric,
        availableMetrics,
        primaryTrend: {
            metricKey: selectedMetric,
            label: currentMetricMeta.label,
            unit: currentMetricMeta.unit,
            currentValue,
            averageValue,
            minValue,
            maxValue,
            direction,
            points
        },
        deviations,
        stableMeasurements,
        historicalComparison,
        relationships,
        medicalReportTrends
    };
};

module.exports = {
    getHealthTrendsForUser,
    parseTimeRange,
    calculatePearsonCorrelation
};