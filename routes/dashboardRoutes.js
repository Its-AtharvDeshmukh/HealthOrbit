const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/dashboard', requireAuth, dashboardController.getDashboard);
router.get('/timeline', requireAuth, dashboardController.getTimeline);
router.get('/trends', requireAuth, dashboardController.getTrends);
router.get('/wearables', requireAuth, dashboardController.getWearables);
router.get('/error', requireAuth, dashboardController.getErrorPage);

module.exports = router;