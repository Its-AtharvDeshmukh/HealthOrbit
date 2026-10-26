const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const Medicine = require('../models/Medicine');
const MedicineLog = require('../models/MedicineLog');
const SymptomEntry = require('../models/SymptomEntry');

/**
 * Format a Date object into human-readable date and time strings.
 */
const formatDateTime = (dateObj) => {
    const d = new Date(dateObj);
    if (isNaN(d.getTime())) {
        return { dateFormatted: 'Unknown Date', timeFormatted: '' };
    }
    const dateFormatted = d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
    const timeFormatted = d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
    return { dateFormatted, timeFormatted };
};

/**
 * Assigns a human-readable date group relative to Asia/Kolkata current time.
 */
const resolveDateGroup = (dateObj) => {
    const target = new Date(dateObj);
    if (isNaN(target.getTime())) return 'Earlier Records';

    const now = new Date();
    
    // Normalize to midnight for calendar-day comparison
    const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffDays = Math.round((nowMidnight - targetMidnight) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays > 1 && diffDays <= 7) return 'This Week';
    if (diffDays > 7 && target.getMonth() === now.getMonth() && target.getFullYear() === now.getFullYear()) {
        return 'Earlier This Month';
    }

    return target.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/**
 * Primary Normalization Service for Health Timeline
 */
const getTimelineForUser = async (userId, limit = 50) => {
    if (!userId) return [];

    // 1. Fetch real source collections in parallel
    const [
        reports,
        measurements,
        medicines,
        medicineLogs,
        symptoms
    ] = await Promise.all([
        MedicalReport.find({ userId }).sort({ createdAt: -1 }).lean(),
        HealthMeasurement.find({ userId }).sort({ recordedAt: -1, createdAt: -1 }).lean(),
        Medicine.find({ userId }).sort({ createdAt: -1 }).lean(),
        MedicineLog.find({ userId }).populate('medicineId', 'name dosage').sort({ date: -1, scheduledTime: -1 }).lean(),
        SymptomEntry.find({ userId }).sort({ recordedAt: -1, createdAt: -1 }).lean()
    ]);

    const normalizedEvents = [];

    // Index existing reports by ID for deduplication
    const reportIdsSet = new Set(reports.map(r => r._id.toString()));

    // 2. Normalize Medical Reports & Fold in Structured Measurements
    for (const rep of reports) {
        const eventDate = rep.recordedAt || rep.createdAt || new Date();
        const { dateFormatted, timeFormatted } = formatDateTime(eventDate);

        // Deduplicate and aggregate measurements belonging to this report
        const repMeasurementsMap = new Map();

        // Pass A: Extract parameters stored directly inside report document
        if (rep.extractedData && Array.isArray(rep.extractedData.parameters)) {
            for (const p of rep.extractedData.parameters) {
                if (!p || !p.name) continue;
                const metricKey = (p.metricKey || p.name).toLowerCase().replace(/[^a-z0-9]/g, '_');
                if (!repMeasurementsMap.has(metricKey)) {
                    repMeasurementsMap.set(metricKey, {
                        metricKey: metricKey,
                        name: p.name,
                        value: p.value !== undefined ? p.value : '',
                        unit: p.unit || null,
                        referenceRange: p.referenceRange || null,
                        status: p.status || null
                    });
                }
            }
        }

        // Pass B: Enrich with measurements synchronized to HealthMeasurement collection
        const linkedMeasurements = measurements.filter(m => 
            m.sourceRecordId && m.sourceRecordId.toString() === rep._id.toString()
        );
        for (const m of linkedMeasurements) {
            const metricKey = m.metricKey || m.metricName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (!repMeasurementsMap.has(metricKey)) {
                repMeasurementsMap.set(metricKey, {
                    metricKey: metricKey,
                    name: m.metricName,
                    value: m.value,
                    unit: m.unit || null,
                    referenceRange: m.referenceRange || null,
                    status: m.status || null
                });
            }
        }

        normalizedEvents.push({
            id: `rep_${rep._id}`,
            eventType: 'medical_report',
            title: rep.extractedData?.documentTitle || rep.originalFileName || 'Medical Report',
            date: new Date(eventDate).toISOString(),
            dateFormatted,
            timeFormatted,
            dateGroup: resolveDateGroup(eventDate),
            sourceType: 'medical_report',
            sourceLabel: 'Uploaded Lab Report',
            sourceRecordId: rep._id.toString(),
            category: rep.extractedData?.documentType || 'Clinical Report',
            summary: rep.aiExplanation || null,
            measurements: Array.from(repMeasurementsMap.values()),
            metadata: {
                provider: rep.originalFileName ? rep.originalFileName : undefined
            },
            links: {
                detailUrl: `/ocr?reportId=${rep._id}`,
                originalFileUrl: rep.cloudSecureUrl || (rep.storedFileName ? `/reports/${rep._id}/file` : undefined)
            },
            aiEligible: true
        });
    }

    // 3. Process HealthMeasurement (Filter out report-derived records to prevent duplication)
    const independentMeasurements = measurements.filter(m => {
        // Exclude if linked to an existing report
        if (m.sourceRecordId && reportIdsSet.has(m.sourceRecordId.toString())) {
            return false;
        }
        if (m.sourceType === 'medical_report') {
            return false;
        }
        return true;
    });

    // 4. Aggregate Wearable Readings by Calendar Date
    const wearableByDate = new Map();
    const manualMeasurements = [];

    for (const m of independentMeasurements) {
        const isWearable = m.sourceType === 'wearable' || 
                           (m.source && String(m.source).toLowerCase().includes('wearable')) ||
                           (m.source && String(m.source).toLowerCase().includes('health connect'));

        if (isWearable) {
            const rawDate = m.recordedAt || m.createdAt || new Date();
            const dateKey = new Date(rawDate).toISOString().split('T')[0]; // YYYY-MM-DD

            if (!wearableByDate.has(dateKey)) {
                wearableByDate.set(dateKey, {
                    dateObj: rawDate,
                    measurementsMap: new Map()
                });
            }
            const dayEntry = wearableByDate.get(dateKey);
            const metricKey = m.metricKey || m.metricName.toLowerCase().replace(/[^a-z0-9]/g, '_');
            
            // Keep the latest sample of each metric for the day
            if (!dayEntry.measurementsMap.has(metricKey)) {
                dayEntry.measurementsMap.set(metricKey, {
                    metricKey: metricKey,
                    name: m.metricName,
                    value: m.value,
                    unit: m.unit || null,
                    referenceRange: m.referenceRange || null,
                    status: m.status || null
                });
            }
        } else {
            manualMeasurements.push(m);
        }
    }

    // Convert Wearable day buckets to timeline events
    for (const [dateKey, dayData] of wearableByDate.entries()) {
        const { dateFormatted, timeFormatted } = formatDateTime(dayData.dateObj);
        normalizedEvents.push({
            id: `wearable_${dateKey}`,
            eventType: 'wearable_summary',
            title: 'Daily Wearable Summary',
            date: new Date(dayData.dateObj).toISOString(),
            dateFormatted,
            timeFormatted,
            dateGroup: resolveDateGroup(dayData.dateObj),
            sourceType: 'wearable',
            sourceLabel: 'Health Connect / Wearable',
            sourceRecordId: dateKey,
            category: 'Activity & Vitals',
            summary: null,
            measurements: Array.from(dayData.measurementsMap.values()),
            metadata: {},
            links: {
                detailUrl: '/wearables'
            },
            aiEligible: true
        });
    }

    // 5. Normalize Manual Measurements
    for (const m of manualMeasurements) {
        const eventDate = m.recordedAt || m.createdAt || new Date();
        const { dateFormatted, timeFormatted } = formatDateTime(eventDate);
        normalizedEvents.push({
            id: `meas_${m._id}`,
            eventType: 'manual_measurement',
            title: m.metricName || 'Health Measurement',
            date: new Date(eventDate).toISOString(),
            dateFormatted,
            timeFormatted,
            dateGroup: resolveDateGroup(eventDate),
            sourceType: 'manual',
            sourceLabel: m.source || 'Manual Entry',
            sourceRecordId: m._id.toString(),
            category: m.category || 'General',
            summary: null,
            measurements: [
                {
                    metricKey: m.metricKey || null,
                    name: m.metricName,
                    value: m.value,
                    unit: m.unit || null,
                    referenceRange: m.referenceRange || null,
                    status: m.status || null
                }
            ],
            metadata: {},
            links: {
                detailUrl: '/trends'
            },
            aiEligible: true
        });
    }

    // 6. Normalize Prescriptions (Medicine)
    for (const med of medicines) {
        const eventDate = med.createdAt || new Date();
        const { dateFormatted, timeFormatted } = formatDateTime(eventDate);
        normalizedEvents.push({
            id: `med_${med._id}`,
            eventType: 'medication',
            title: `Medication Added: ${med.name}`,
            date: new Date(eventDate).toISOString(),
            dateFormatted,
            timeFormatted,
            dateGroup: resolveDateGroup(eventDate),
            sourceType: 'prescription',
            sourceLabel: 'Prescription Schedule',
            sourceRecordId: med._id.toString(),
            category: 'Medication',
            summary: med.instructions ? `Instructions: ${med.instructions}` : null,
            measurements: [],
            metadata: {
                medicineName: med.name,
                dosage: med.dosage,
                instructions: med.instructions || undefined,
                medicineStatus: med.active ? 'Active' : 'Inactive'
            },
            links: {
                detailUrl: '/medicines'
            },
            aiEligible: false
        });
    }

    // 7. Normalize Dose Logs (MedicineLog)
    for (const log of medicineLogs) {
        const rawDateStr = log.date || (log.createdAt ? new Date(log.createdAt).toISOString().split('T')[0] : null);
        const eventDate = rawDateStr ? new Date(`${rawDateStr}T${log.scheduledTime || '12:00'}:00`) : (log.createdAt || new Date());
        const { dateFormatted, timeFormatted } = formatDateTime(eventDate);
        const medName = log.medicineId?.name || 'Scheduled Medicine';

        normalizedEvents.push({
            id: `log_${log._id}`,
            eventType: 'medicine_log',
            title: `Dose Log: ${medName}`,
            date: new Date(eventDate).toISOString(),
            dateFormatted,
            timeFormatted: log.scheduledTime || timeFormatted,
            dateGroup: resolveDateGroup(eventDate),
            sourceType: 'prescription',
            sourceLabel: 'Medication Log',
            sourceRecordId: log._id.toString(),
            category: 'Medication Compliance',
            summary: `Scheduled for ${log.scheduledTime || 'specified time'}. Status: ${log.status || 'recorded'}.`,
            measurements: [],
            metadata: {
                medicineName: medName,
                dosage: log.medicineId?.dosage || undefined,
                scheduledTime: log.scheduledTime,
                logStatus: log.status
            },
            links: {
                detailUrl: '/medicines'
            },
            aiEligible: false
        });
    }

    // 8. Normalize Symptoms (SymptomEntry)
    for (const sym of symptoms) {
        const eventDate = sym.recordedAt || sym.createdAt || new Date();
        const { dateFormatted, timeFormatted } = formatDateTime(eventDate);
        normalizedEvents.push({
            id: `sym_${sym._id}`,
            eventType: 'symptom',
            title: `Symptom: ${sym.symptom}`,
            date: new Date(eventDate).toISOString(),
            dateFormatted,
            timeFormatted,
            dateGroup: resolveDateGroup(eventDate),
            sourceType: 'self_report',
            sourceLabel: 'Patient Log',
            sourceRecordId: sym._id.toString(),
            category: 'Symptom',
            summary: sym.notes ? `Note: ${sym.notes}` : null,
            measurements: [],
            metadata: {
                severity: sym.severity ? String(sym.severity) : undefined,
                instructions: sym.notes || undefined
            },
            links: {
                detailUrl: '/medicines'
            },
            aiEligible: true
        });
    }

    // 9. Chronological Sorting: Newest First
    normalizedEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 10. Bounded Retrieval: 50 events max
    return normalizedEvents.slice(0, limit);
};

module.exports = {
    getTimelineForUser,
    resolveDateGroup,
    formatDateTime
};