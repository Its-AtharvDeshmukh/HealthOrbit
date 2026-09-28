const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { requireAuth } = require('../middleware/authMiddleware');
const upload = require('../config/uploadConfig');

router.get('/', requireAuth, profileController.getProfile);
router.post('/', requireAuth, profileController.updatePersonal);
router.post('/health', requireAuth, profileController.updateHealth);
router.post('/emergency', requireAuth, profileController.updateEmergency);
router.post('/privacy', requireAuth, profileController.updatePrivacy);
router.post('/password', requireAuth, profileController.updatePassword);
router.post('/image', requireAuth, upload.single('profileImage'), profileController.uploadProfileImage);

module.exports = router;