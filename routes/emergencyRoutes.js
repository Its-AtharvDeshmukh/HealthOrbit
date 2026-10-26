const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergencyController');
const { requireAuth } = require('../middleware/authMiddleware');

const auth = (typeof requireAuth === 'function') 
    ? requireAuth 
    : (req, res, next) => next();

// Map all the missing endpoints so you don't get redirected to /dashboard
router.get('/', auth, emergencyController.getEmergencyCard);
router.post('/broadcast', auth, emergencyController.broadcastRequest);
router.post('/community/:id/delete', auth, emergencyController.deleteBroadcast);
router.post('/donor-profile', auth, emergencyController.saveDonorProfile);
router.post('/sos', auth, emergencyController.triggerSOS);
router.post('/sos/resolve', auth, emergencyController.resolveSOS);
router.get('/:shareToken', emergencyController.getSharedEmergencyCard);
router.post('/toggle', auth, emergencyController.toggleEmergencyAccess);

module.exports = router;