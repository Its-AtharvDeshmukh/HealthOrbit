const fs = require('fs');
const path = require('path');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const { analyzeMedicalTextWithAI } = require('./aiService');
const { extractTextFromFile } = require('./ocrService');
const { uploadToCloudinary } = require('./cloudinaryService');
const { normalizeMetric } = require('./healthAnalysisService');

/**
 * Strict regex line parser for laboratory test outputs
 * Fallback when AI fails or returns empty parameters on valid text.
 */
const extractParametersViaRegex = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return [];

    const lines = rawText.split(/\r?\n/);
    const findings = [];

    // Match patterns such as: "Hemoglobin 14.2 g/dL 13.0 - 17.0" or "SGOT 55.59 U/L 10-50"
    const labLinePattern = /^([A-Za-z][A-Za-z0-9\s\-_\/()]{2,45}?)\s{2,}[:\t-]?\s*([><=]?\s*\d+(?:\.\d+)?|[A-Za-z]+)\s*([a-zA-Z/%μuL]+)?\s*(?:[\[(]?\s*(\d+(?:\.\d+)?\s*[-–to]\s*\d+(?:\.\d+)?)?\s*[\])]?)?$/;

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length < 6 || trimmed.length > 100) continue;

        // Skip non-data header/footer rows
        if (/^(patient|doctor|date|page|hospital|laboratory|specimen|sample|ref|test\s*name|investigation|result|units|biological|method|sr\.|s\.no)/i.test(trimmed)) {
            continue;
        }

        const match = trimmed.match(labLinePattern);
        if (match) {
            const rawName = match[1].trim();
            const rawVal = match[2].trim();
            const rawUnit = match[3] ? match[3].trim() : '';
            const rawRange = match[4] ? match[4].trim() : 'N/A';

            if (rawName.length >= 3 && rawVal.length >= 1 && !/^(the|and|for|with|from|test|report|normal|result)$/i.test(rawName)) {
                findings.push({
                    name: rawName,
                    category: 'General',
                    value: rawVal,
                    unit: rawUnit,
                    referenceRange: rawRange,
                    status: 'Standard',
                    statusClass: 'good'
                });
            }
        }
    }

    return findings.slice(0, 35);
};

/**
 * Executes the complete Document Intelligence pipeline
 */
const processMedicalDocument = async (reportId, tempFilePath, mimeType) => {
    let report = await MedicalReport.findById(reportId);
    if (!report) throw new Error('Report not found');

    let rawText = '';

    try {
        // Step 1: Raw Text Extraction Pass (PDF Parse or Tesseract OCR)
        try {
            rawText = await extractTextFromFile(tempFilePath, mimeType);
            report.rawText = rawText || '';
        } catch (ocrErr) {
            console.warn('[DocIntel] OCR/Text pass warning:', ocrErr.message);
        }

        // Step 2: Structured AI Extraction Pass with Failover
        let extractionResult = null;
        try {
            extractionResult = await analyzeMedicalTextWithAI(tempFilePath, mimeType, rawText);
        } catch (aiErr) {
            console.error('[DocIntel] Structured AI extraction error:', aiErr.message);
            report.status = rawText ? 'needs_review' : 'failed';
            report.failureStage = rawText ? 'ai_extraction' : 'text_extraction';
            report.failureMessage = aiErr.message;
            await report.save();
            return report;
        }

        // Step 3: Populate & Defensively Normalize Structured Parameters
        let parameters = [];
        if (extractionResult && Array.isArray(extractionResult.parameters)) {
            parameters = extractionResult.parameters
                .map(item => {
                    if (!item || typeof item !== 'object') return null;

                    const name = String(item.name || item.testName || item.test || item.parameter || '').trim();
                    const value = String(item.value !== undefined ? item.value : (item.result || item.val || item.observation || '')).trim();
                    const unit = String(item.unit || item.units || '').trim();
                    const referenceRange = String(item.referenceRange || item.refRange || item.reference || 'N/A').trim();
                    const status = String(item.status || 'Standard').trim();
                    const statusClass = item.statusClass || (status.toLowerCase().includes('high') || status.toLowerCase().includes('low') ? 'warn' : 'good');

                    if (name.length > 1 && value.length > 0 && !name.toLowerCase().includes('scan result') && !name.toLowerCase().includes('large document')) {
                        return {
                            name,
                            category: item.category || 'General',
                            value,
                            unit,
                            referenceRange,
                            status,
                            statusClass
                        };
                    }
                    return null;
                })
                .filter(Boolean);
        }

        // Fallback: If AI returned 0 parameters but raw text exists, run deterministic regex
        if (parameters.length === 0 && rawText && rawText.trim().length > 30) {
            console.log('[DocIntel] AI returned 0 parameters. Running local deterministic OCR line extractor...');
            const fallbackFindings = extractParametersViaRegex(rawText);
            if (fallbackFindings.length > 0) {
                parameters = fallbackFindings;
            }
        }

        report.extractedData = {
            documentType: extractionResult?.documentType || 'lab_report',
            documentTitle: extractionResult?.documentTitle || report.originalFileName,
            parameters: parameters
        };
        report.aiExplanation = extractionResult?.aiExplanation || '';

        // Extract and assign clinical observation date if identified
        if (extractionResult?.recordedAt) {
            const parsedDate = new Date(extractionResult.recordedAt);
            if (!isNaN(parsedDate.getTime())) {
                report.recordedAt = parsedDate;
            }
        }

        // Status Determination
        if (parameters.length > 0) {
            report.status = 'completed';
            report.failureStage = 'none';
            report.failureMessage = null;
        } else if (rawText && rawText.trim().length > 0) {
            report.status = 'needs_review';
            report.failureStage = 'none';
            report.failureMessage = 'Text extracted successfully, but structured findings require manual verification or retry.';
        } else {
            report.status = 'failed';
            report.failureStage = 'text_extraction';
            report.failureMessage = 'Unable to extract readable text or findings from this document.';
        }

        // Step 4: Synchronize to HealthMeasurement (Idempotent via sourceRecordId + metricKey)
        if (parameters.length > 0) {
            for (const param of parameters) {
                if (!param.name || !param.value) continue;

                const norm = normalizeMetric(param.name);
                const rawNum = parseFloat(String(param.value).replace(/,/g, '').trim());
                const cleanNumeric = isNaN(rawNum) ? null : rawNum;

                await HealthMeasurement.findOneAndUpdate(
                    {
                        userId: report.userId,
                        sourceRecordId: report._id,
                        metricKey: norm.key
                    },
                    {
                        metricName: norm.label,
                        metricKey: norm.key,
                        category: param.category || 'General',
                        value: param.value,
                        numericValue: cleanNumeric,
                        unit: param.unit || '',
                        referenceRange: param.referenceRange || 'N/A',
                        status: param.status || 'Standard',
                        source: `Report: ${report.originalFileName}`,
                        sourceType: 'medical_report',
                        sourceRecordId: report._id,
                        recordedAt: report.recordedAt || report.createdAt
                    },
                    { upsert: true, returnDocument: 'after' } // Mongoose v9 compliant
                );
            }
        }

        // Step 5: Hybrid Storage Allocation (Cloudinary <= 9.5MB, Local Storage > 9.5MB)
        const stats = fs.existsSync(tempFilePath) ? fs.statSync(tempFilePath) : null;
        const fileSizeInBytes = stats ? stats.size : (report.fileSize || 0);

        // Free-tier boundary: Cloudinary enforces a 10MB limit (10,485,760 bytes)
        if (fileSizeInBytes <= 9900000) {
            try {
                const isPdf = (mimeType === 'application/pdf' || report.originalFileName.toLowerCase().endsWith('.pdf'));
                const resourceType = isPdf ? 'raw' : 'auto';
                const cloudRes = await uploadToCloudinary(tempFilePath, 'healthorbit_medical_vault', resourceType);

                if (cloudRes && cloudRes.url) {
                    report.storageProvider = 'cloudinary';
                    report.cloudPublicId = cloudRes.publicId;
                    report.cloudSecureUrl = cloudRes.url;
                    report.cloudResourceType = resourceType;
                } else {
                    report.storageProvider = 'local';
                }
            } catch (cloudErr) {
                console.warn('[DocIntel] Cloudinary upload skipped/failed. Keeping local file:', cloudErr.message);
                report.storageProvider = 'local';
            }
        } else {
            console.log(`[DocIntel] File size (${(fileSizeInBytes / (1024 * 1024)).toFixed(1)}MB) exceeds Cloudinary 10MB free tier. Preserving in local storage.`);
            report.storageProvider = 'local';
        }

        // Step 6: Safe Cleanup of Local Temp File ONLY if Cloud Upload Succeeded
        if (report.storageProvider === 'cloudinary' && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                report.storedFileName = null;
            } catch (delErr) {
                console.warn('[DocIntel] Temp cleanup warning:', delErr.message);
            }
        }

        await report.save();
        return report;

    } catch (criticalErr) {
        console.error('[DocIntel] Critical Pipeline Failure:', criticalErr);
        report.status = rawText ? 'needs_review' : 'failed';
        report.failureStage = 'none';
        report.failureMessage = criticalErr.message;
        await report.save();
        return report;
    }
};

module.exports = { processMedicalDocument };