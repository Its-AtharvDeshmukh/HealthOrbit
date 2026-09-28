const express = require('express');
const router = express.Router();
const familyController = require('../controllers/familyController');
const { requireAuth } = require('../middleware/authMiddleware');

// Overview data feed for frontend Profile & Privacy page
router.get('/overview', requireAuth, familyController.getFamilyOverview);

// Get specific authorized family member's health data (governed by permissions)
router.get('/member/:targetId/health', requireAuth, familyController.getFamilyMemberHealth);

// Invitation workflow
router.post('/invite', requireAuth, familyController.inviteFamilyMember);
router.post('/add', requireAuth, familyController.inviteFamilyMember); // Backward-compatibility alias
router.post('/respond', requireAuth, familyController.respondToInvitation);

// Accept/Reject button helpers for direct EJS form POSTs
router.post('/accept/:id', requireAuth, (req, res, next) => {
    req.body.invitationId = req.params.id;
    req.body.action = 'accept';
    return familyController.respondToInvitation(req, res, next);
});

router.post('/reject/:id', requireAuth, (req, res, next) => {
    req.body.invitationId = req.params.id;
    req.body.action = 'reject';
    return familyController.respondToInvitation(req, res, next);
});

// Permission management
router.post('/permissions', requireAuth, familyController.updatePermissions);
router.post('/:id/permissions', requireAuth, familyController.updatePermissions);

// Revocation/removal
router.post('/:id/revoke', requireAuth, familyController.revokeAccess);
router.post('/:id/remove', requireAuth, familyController.revokeAccess);

module.exports = router;