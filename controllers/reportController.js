const path = require('path');
const fs = require('fs');
const https = require('https');
const MedicalReport = require('../models/MedicalReport');
const HealthMeasurement = require('../models/HealthMeasurement');
const FamilyMember = require('../models/FamilyMember');
const { processMedicalDocument } = require('../services/documentIntelligenceService');
const { deleteFromCloudinary } = require('../services/cloudinaryService');

const getOcrWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const reports = await MedicalReport.find({ userId: activeUserId }).sort({ createdAt: -1 });

        let latestReport = null;
        if (req.query.reportId) {
            latestReport = reports.find(r => r._id.toString() === req.query.reportId);
        }
        if (!latestReport && reports.length > 0) {
            latestReport = reports[0];
        }

        res.render('dashboard/ocr', {
            reports: reports || [],
            latestReport: latestReport || null,
            userName: req.user ? req.user.fullName : (req.session.userName || 'User'),
            csrfToken: req.csrfToken ? req.csrfToken() : (res.locals.csrfToken || '')
        });
    } catch (error) {
        console.error('[HealthOrbit] OCR Workspace Error:', error);
        res.redirect('/dashboard');
    }
};

const uploadReport = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        if (!req.file) {
            return res.redirect('/ocr?error=No+file+uploaded');
        }

        // Free-tier boundary: Cloudinary free accounts enforce a 10MB limit
        if (req.file.size > 10485760) {
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.redirect('/ocr?error=File+exceeds+free-tier+limit+(Max+10MB).+Please+upload+a+standard+1-3+page+report.');
        }

        const newReport = await MedicalReport.create({
            userId: activeUserId,
            originalFileName: req.file.originalname,
            storedFileName: req.file.filename,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            status: 'processing'
        });

        // Execute extraction pipeline
        await processMedicalDocument(newReport._id, req.file.path, req.file.mimetype);

        res.redirect(`/ocr?reportId=${newReport._id}&success=Report+processed+successfully`);
    } catch (error) {
        console.error('[HealthOrbit] Upload Error:', error);
        res.redirect('/ocr?error=Failed+to+process+document');
    }
};

const reprocessReport = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });

        if (!report) {
            return res.status(404).json({ error: 'Report not found or unauthorized' });
        }

        report.status = 'processing';
        await report.save();

        let workingFilePath = null;
        if (report.storedFileName && fs.existsSync(path.join(__dirname, '../uploads', report.storedFileName))) {
            workingFilePath = path.join(__dirname, '../uploads', report.storedFileName);
        } else if (report.cloudSecureUrl) {
            workingFilePath = path.join(__dirname, '../uploads', `reprocess-${Date.now()}-${report.originalFileName}`);
            const fileStream = fs.createWriteStream(workingFilePath);
            await new Promise((resolve, reject) => {
                https.get(report.cloudSecureUrl, (response) => {
                    response.pipe(fileStream);
                    fileStream.on('finish', () => { fileStream.close(); resolve(); });
                }).on('error', (err) => { fs.unlink(workingFilePath, () => {}); reject(err); });
            });
        } else {
            return res.status(400).json({ error: 'Original source document file is unavailable for reprocessing' });
        }

        await processMedicalDocument(report._id, workingFilePath, report.mimeType);

        const updatedReport = await MedicalReport.findById(report._id);

        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.status(200).json({ 
                success: true, 
                reportId: updatedReport._id, 
                status: updatedReport.status,
                findingsCount: updatedReport.extractedData?.parameters?.length || 0
            });
        }
        res.redirect(`/ocr?reportId=${updatedReport._id}&success=Report+reprocessed`);
    } catch (error) {
        console.error('[HealthOrbit] Reprocess Error:', error);
        res.status(500).json({ error: 'Reprocessing failed: ' + error.message });
    }
};

const updateReport = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        if (!report) return res.redirect('/ocr?error=Unauthorized');

        const params = req.body.params || [];
        report.extractedData.parameters = params;
        await report.save();

        for (const param of params) {
            const rawNum = parseFloat(String(param.value).replace(/,/g, '').trim());
            const cleanNumeric = isNaN(rawNum) ? null : rawNum;
            const normKey = String(param.name).toLowerCase().replace(/[^a-z0-9]/g, '_');

            await HealthMeasurement.findOneAndUpdate(
                {
                    userId: activeUserId,
                    sourceRecordId: report._id,
                    metricKey: normKey
                },
                {
                    metricName: param.name,
                    metricKey: normKey,
                    value: param.value,
                    numericValue: cleanNumeric,
                    unit: param.unit || '',
                    referenceRange: param.referenceRange || 'N/A',
                    recordedAt: report.recordedAt || report.createdAt,
                    category: param.category || 'General'
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        res.redirect(`/ocr?reportId=${report._id}&success=Corrections+saved`);
    } catch (error) {
        console.error('[HealthOrbit] Update Report Error:', error);
        res.redirect('/ocr?error=Failed+to+update');
    }
};

const deleteReport = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        if (!report) return res.redirect('/ocr?error=Report+not+found');

        if (report.cloudPublicId) {
            await deleteFromCloudinary(report.cloudPublicId, report.cloudResourceType || 'auto')
                .catch(err => console.warn('[Cloudinary Delete Fail]:', err.message));
        }

        if (report.storedFileName) {
            const localPath = path.join(__dirname, '../uploads', report.storedFileName);
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
        }

        await HealthMeasurement.deleteMany({ sourceRecordId: report._id });
        await MedicalReport.findByIdAndDelete(report._id);

        res.redirect('/ocr?success=Report+deleted');
    } catch (error) {
        console.error('[HealthOrbit] Delete Error:', error);
        res.redirect('/ocr?error=Failed+to+delete');
    }
};


const serveSecureFile = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user && req.user._id);
        const report = await MedicalReport.findById(req.params.id);
        if (!report) return res.status(404).send('Document not found');

        let isAuthorized = report.userId.toString() === activeUserId.toString();
        if (!isAuthorized) {
            const familyAccess = await FamilyMember.findOne({
                ownerUserId: report.userId,
                viewerUserId: activeUserId,
                status: 'active',
                'permissions.medicalReports': true
            });
            if (familyAccess) isAuthorized = true;
        }

        if (!isAuthorized) return res.status(403).send('Unauthorized access to medical record');

        // 1. If stored locally (files between 10MB and 25MB)
        if (report.storedFileName) {
            const filePath = path.join(__dirname, '../uploads', report.storedFileName);
            if (fs.existsSync(filePath)) {
                res.setHeader('Content-Type', report.mimeType);
                res.setHeader('Content-Disposition', `inline; filename="${report.originalFileName}"`);
                return res.sendFile(filePath);
            }
        }

        // 2. If stored in Cloudinary (files under 10MB)
        if (report.cloudSecureUrl) {
            res.setHeader('Content-Type', report.mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${report.originalFileName}"`);
            return https.get(report.cloudSecureUrl, stream => stream.pipe(res));
        }

        res.status(404).send('Source file is no longer available');
    } catch (error) {
        console.error('[HealthOrbit] Serve File Error:', error);
        res.status(500).send('Error serving file');
    }
};



module.exports = {
    getOcrWorkspace,
    uploadReport,
    reprocessReport,
    updateReport,
    deleteReport,
    serveSecureFile
};