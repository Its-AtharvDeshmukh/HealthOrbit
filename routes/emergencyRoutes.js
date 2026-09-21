const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, emergencyController.getEmergencyWorkspace);
router.post('/sos', requireAuth, emergencyController.triggerSos);
router.post('/sos/resolve', requireAuth, emergencyController.resolveSos);
router.post('/donor-profile', requireAuth, emergencyController.updateDonorProfile);
router.post('/community/request', requireAuth, emergencyController.createCommunityRequest);
router.post('/community/:id/delete', requireAuth, emergencyController.deleteCommunityRequest);

module.exports = router;