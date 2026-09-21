const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/export', requireAuth, accountController.exportData);
router.post('/delete', requireAuth, accountController.deleteAccount);

module.exports = router;