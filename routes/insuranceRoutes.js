const express = require('express');
const router = express.Router();
const insuranceController = require('../controllers/insuranceController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, insuranceController.getInsuranceWorkspace);

// Policy Routes
router.post('/policies', requireAuth, insuranceController.addPolicy);
router.post('/policies/:id/delete', requireAuth, insuranceController.deletePolicy);

// Claim Routes
router.post('/claims', requireAuth, insuranceController.addClaim);
router.post('/claims/:id/delete', requireAuth, insuranceController.deleteClaim);

// Digital ID Routes
router.post('/digital-id', requireAuth, insuranceController.addDigitalId);
router.get('/digital-id/:id', requireAuth, insuranceController.getDigitalIdDetails);
router.post('/digital-id/:id/delete', requireAuth, insuranceController.deleteDigitalId);

module.exports = router;