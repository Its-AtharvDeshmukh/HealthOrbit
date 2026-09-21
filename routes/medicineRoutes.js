const express = require('express');
const router = express.Router();
const medicineController = require('../controllers/medicineController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/medicines', requireAuth, medicineController.getMedicinesWorkspace);

// Medicines
router.post('/medicines/add', requireAuth, medicineController.addMedicine);
router.post('/medicines/log/:medId', requireAuth, medicineController.logDose);
router.post('/medicines/delete/:id', requireAuth, medicineController.deleteMedicine);

// Symptoms
router.post('/symptoms/add', requireAuth, medicineController.addSymptom);
router.post('/symptoms/quick', requireAuth, medicineController.quickLogSymptom);
router.post('/symptoms/delete/:id', requireAuth, medicineController.deleteSymptom);

module.exports = router;