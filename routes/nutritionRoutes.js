const express = require('express');
const router = express.Router();
const nutritionController = require('../controllers/nutritionController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/', requireAuth, nutritionController.getNutritionWorkspace);
router.post('/meals', requireAuth, nutritionController.addMeal);
router.post('/meals/:id/delete', requireAuth, nutritionController.deleteMeal);
router.post('/water', requireAuth, nutritionController.logWater);
router.post('/water/undo', requireAuth, nutritionController.undoWater);
router.post('/habits', requireAuth, nutritionController.toggleHabit);

module.exports = router;