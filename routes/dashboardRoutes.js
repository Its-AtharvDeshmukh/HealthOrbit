const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');
const bodyTwinController = require('../controllers/bodyTwinController');


router.get('/dashboard', requireAuth, dashboardController.getDashboard);
router.get('/trends', requireAuth, dashboardController.getTrends);
router.get('/timeline', requireAuth, dashboardController.getTimeline);
router.get('/wearables', requireAuth, dashboardController.getWearables);
router.get('/medicines', requireAuth, dashboardController.getMedicines);
router.get('/error', dashboardController.getErrorPage);




// Living Body Twin Routes
router.get('/body-twin', requireAuth, bodyTwinController.getBodyTwinView);
router.get('/api/body-twin/data', requireAuth, bodyTwinController.getBodyTwinData);

module.exports = router;