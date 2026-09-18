const mongoose = require('mongoose');

const wellnessGoalSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    calorieTarget: { type: Number, default: 2000 },
    proteinTarget: { type: Number, default: 90 },
    carbTarget: { type: Number, default: 250 },
    fatTarget: { type: Number, default: 65 },
    waterTargetMl: { type: Number, default: 2500 }
}, { timestamps: true });

module.exports = mongoose.model('WellnessGoal', wellnessGoalSchema);