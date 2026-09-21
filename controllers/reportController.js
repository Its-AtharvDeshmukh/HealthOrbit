const fs = require('fs');
const path = require('path');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const { extractTextFromFile } = require('../services/ocrService');
const { analyzeMedicalTextWithAI } = require('../services/aiService');

const getOcrWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const selectedReportId = req.query.reportId;
        const reports = await MedicalReport.find({ userId: activeUserId }).sort({ createdAt: -1 });

        let latestReport = null;
        if (selectedReportId) {
            latestReport = reports.find(r => r._id.toString() === selectedReportId) || null;
        }
        if (!latestReport && reports.length > 0) {
            latestReport = reports[0];
        }

        res.render('dashboard/ocr.ejs', { reports, latestReport });
    } catch (error) {
        res.render('dashboard/ocr.ejs', { reports: [], latestReport: null });
    }
};

const uploadReport = async (req, res) => {
    try {
        if (!req.file) return res.redirect('/ocr');
        const activeUserId = req.userContextId || req.session.userId || req.user._id;

        // 1. Run OCR and AI Analysis using the local file
        const rawFallbackText = await extractTextFromFile(req.file.path, req.file.mimetype);
        const { parameters, aiExplanation, rawText } = await analyzeMedicalTextWithAI(req.file.path, req.file.mimetype, rawFallbackText);

        // 2. Save MedicalReport record securely using the local file
        const newReport = new MedicalReport({
            userId: activeUserId,
            originalFileName: req.file.originalname,
            storedFileName: req.file.filename,
            filePath: req.file.path,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
            status: 'extracted',
            aiExplanation: aiExplanation,
            extractedData: {
                rawText: rawText,
                parameters: parameters
            }
        });
        await newReport.save();

        return res.redirect(`/ocr?reportId=${newReport._id}`);
    } catch (error) {
        console.error('[Upload & Processing Pipeline Error]:', error);
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
        }
        return res.redirect('/ocr');
    }
};

const updateReport = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        if (!report) return res.redirect('/ocr');

        const { params } = req.body;
        const updatedParameters = params ? Object.values(params) : [];
        report.extractedData.parameters = updatedParameters;

        // Invalidate stale AI data so it regenerates correctly
        report.analysisData = {
            documentTitle: report.analysisData?.documentTitle || report.originalFileName,
            plainEnglishExplanation: '',
            doctorQuestions: [],
            generatedAt: null,
            dataHash: '',
            status: 'stale'
        };
        report.aiExplanation = 'Report parameters updated by user. Fresh analysis ready.';
        await report.save();

        // Synchronize updated metrics to HealthMeasurements
        await HealthMeasurement.deleteMany({ userId: activeUserId, source: `Report:${report._id}` });
        for (const param of updatedParameters) {
            await HealthMeasurement.create({
                userId: activeUserId,
                metricName: param.name,
                category: param.category || 'Clinical Metric',
                value: param.value,
                unit: param.unit || '',
                status: param.status || 'Optimal',
                source: `Report:${report._id}`,
                recordedAt: report.createdAt
            });
        }

        return res.redirect(`/ocr?reportId=${report._id}`);
    } catch (error) {
        console.error('[HealthOrbit] Report Update Error:', error);
        return res.redirect('/ocr');
    }
};

const deleteReport = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        
        if (report) {
            // Permanently delete the file from the local uploads folder
            const filePath = path.join(__dirname, '..', 'uploads', report.storedFileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            await MedicalReport.findByIdAndDelete(report._id);
            await HealthMeasurement.deleteMany({ source: `Report:${report._id}`, userId: activeUserId });
        }
        return res.redirect('/ocr');
    } catch (error) {
        console.error('[Report Delete Error]:', error);
        return res.redirect('/ocr');
    }
};

const serveSecureFile = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user ? req.user._id : null);
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        if (!report) return res.status(404).send('Document not found or unauthorized.');

        const filePath = path.join(__dirname, '..', 'uploads', report.storedFileName);
        if (!fs.existsSync(filePath)) return res.status(404).send('Local file missing.');
        
        res.setHeader('Content-Type', report.mimeType || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${report.originalFileName}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('[HealthOrbit] Secure File Delivery Error:', error);
        res.status(500).send('Internal Server Error');
    }
};

module.exports = {
    getOcrWorkspace,
    uploadReport,
    updateReport,
    deleteReport,
    serveSecureFile
};