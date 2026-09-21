const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/add', requireAuth, familyController.addMember);
router.post('/:id/permissions', requireAuth, familyController.updatePermissions);
router.post('/:id/remove', requireAuth, familyController.removeMember);

module.exports = router;