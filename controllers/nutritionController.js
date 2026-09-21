const Meal = require('../models/Meal');
const HydrationLog = require('../models/HydrationLog');
const LifestyleHabit = require('../models/LifestyleHabit');
const WellnessGoal = require('../models/WellnessGoal');
const HealthMeasurement = require('../models/HealthMeasurement');

const getNutritionWorkspace = async (req, res) => {
    try {
        const userId = req.userContextId || req.session.userId || req.user._id;
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        let goals = await WellnessGoal.findOne({ userId });
        if (!goals) {
            goals = await WellnessGoal.create({ userId });
        }

        const todayMeals = await Meal.find({ userId, dateStr: todayStr }).sort({ createdAt: 1 });
        let nutritionTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        todayMeals.forEach(m => {
            nutritionTotals.calories += (m.calories || 0);
            nutritionTotals.protein += (m.proteinGrams || 0);
            nutritionTotals.carbs += (m.carbsGrams || 0);
            nutritionTotals.fat += (m.fatGrams || 0);
        });

        const waterLogs = await HydrationLog.find({ userId, dateStr: todayStr });
        const totalWaterMl = waterLogs.reduce((sum, log) => sum + log.amountMl, 0);

        const todayHabits = await LifestyleHabit.find({ userId, dateStr: todayStr });

        const latestSteps = await HealthMeasurement.findOne({ userId, metricName: { $regex: /steps/i } }).sort({ recordedAt: -1 });
        const latestSleep = await HealthMeasurement.findOne({ userId, metricName: { $regex: /sleep/i } }).sort({ recordedAt: -1 });

        let scoreComponents = [];
        if (goals.calorieTarget > 0) {
            scoreComponents.push(Math.min((nutritionTotals.calories / goals.calorieTarget) * 100, 100));
        }
        if (goals.waterTargetMl > 0) {
            scoreComponents.push(Math.min((totalWaterMl / goals.waterTargetMl) * 100, 100));
        }
        
        let lifestyleScore = null;
        if (scoreComponents.length > 0) {
            lifestyleScore = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length);
        }

        res.render('dashboard/nutrition.ejs', {
            userName: req.session.userName || req.user.fullName,
            todayMeals,
            nutritionTotals,
            totalWaterMl,
            goals,
            todayHabits,
            lifestyleScore,
            activityData: latestSteps || null,
            sleepData: latestSleep || null,
            todayStr
        });
    } catch (err) {
        console.error('[HealthOrbit] Nutrition Route Error:', err);
        res.redirect('/dashboard');
    }
};

const addMeal = async (req, res) => {
    try {
        const userId = req.userContextId || req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        
        await Meal.create({
            userId,
            mealType: req.body.mealType,
            name: req.body.name,
            calories: Math.max(0, parseInt(req.body.calories) || 0),
            proteinGrams: Math.max(0, parseInt(req.body.proteinGrams) || 0),
            carbsGrams: Math.max(0, parseInt(req.body.carbsGrams) || 0),
            fatGrams: Math.max(0, parseInt(req.body.fatGrams) || 0),
            dateStr: todayStr
        });
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
};

const deleteMeal = async (req, res) => {
    try {
        const userId = req.userContextId || req.session.userId || req.user._id;
        await Meal.findOneAndDelete({ _id: req.params.id, userId: userId });
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
};

const logWater = async (req, res) => {
    try {
        const userId = req.userContextId || req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const amount = parseInt(req.body.amountMl);
        
        if (amount > 0) {
            await HydrationLog.create({ userId, amountMl: amount, dateStr: todayStr });
        }
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
};

const undoWater = async (req, res) => {
    try {
        const userId = req.userContextId || req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        
        const lastLog = await HydrationLog.findOne({ userId, dateStr: todayStr }).sort({ createdAt: -1 });
        if (lastLog) {
            await HydrationLog.findByIdAndDelete(lastLog._id);
        }
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
};

const toggleHabit = async (req, res) => {
    try {
        const userId = req.userContextId || req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const { habitKey, label, completed } = req.body;
        
        let habit = await LifestyleHabit.findOne({ userId, habitKey, dateStr: todayStr });
        if (habit) {
            habit.completed = completed === 'true';
            await habit.save();
        } else {
            await LifestyleHabit.create({
                userId, habitKey, label, dateStr: todayStr, completed: completed === 'true'
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
};

module.exports = {
    getNutritionWorkspace, addMeal, deleteMeal, logWater, undoWater, toggleHabit
};