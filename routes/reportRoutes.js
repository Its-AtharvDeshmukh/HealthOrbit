const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { requireAuth } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig'); // Import your Multer config

router.get('/ocr', requireAuth, reportController.getOcrWorkspace);
router.post('/reports/upload', requireAuth, upload.single('reportFile'), reportController.uploadReport);
router.post('/reports/update/:id', requireAuth, reportController.updateReport);
router.post('/reports/delete/:id', requireAuth, reportController.deleteReport);
router.get('/reports/:id/file', requireAuth, reportController.serveSecureFile);

module.exports = router;