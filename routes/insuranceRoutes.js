const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, insuranceController.getInsuranceWorkspace);
router.post('/policies', requireAuth, insuranceController.addPolicy);
router.post('/claims', requireAuth, insuranceController.addClaim);
router.post('/claims/:id/delete', requireAuth, insuranceController.deleteClaim);
router.post('/digital-id', requireAuth, insuranceController.addDigitalId);
router.post('/digital-id/:id/delete', requireAuth, insuranceController.deleteDigitalId);

module.exports = router;