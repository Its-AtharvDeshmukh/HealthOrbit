const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.get('/', authController.redirectHome);
router.get('/auth', authController.getAuthPage);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/logout', authController.logout);

router.get('/auth/google', authController.googleAuth);
router.get('/auth/google/callback', authController.googleCallback);

module.exports = router;