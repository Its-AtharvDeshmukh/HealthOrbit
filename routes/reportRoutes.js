const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');

// OCR / Document Intelligence Workspace
router.get('/ocr', requireAuth, reportController.getOcrWorkspace);
router.get('/xyz', requireAuth, reportController.getOcrWorkspace); // Legacy alias

// Upload & Extraction
router.post('/reports/upload', requireAuth, upload.single('reportFile'), reportController.uploadReport);

// Reprocessing
router.post('/reports/:id/reprocess', requireAuth, reportController.reprocessReport);

// Inline Correction & Synchronization
router.post('/reports/update/:id', requireAuth, reportController.updateReport);

// Cascade Deletion
router.post('/reports/delete/:id', requireAuth, reportController.deleteReport);

// Privacy-Preserving File Streaming
router.get('/reports/:id/file', requireAuth, reportController.serveSecureFile);

module.exports = router;