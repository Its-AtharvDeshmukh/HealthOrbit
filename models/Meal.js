const mongoose = require('mongoose');

const mealSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mealType: { type: String, required: true }, // Breakfast, Lunch, Dinner, Snack
    name: { type: String, required: true }, // e.g., "Oatmeal & Banana"
    calories: { type: Number, default: 0 },
    proteinGrams: { type: Number, default: 0 },
    carbsGrams: { type: Number, default: 0 },
    fatGrams: { type: Number, default: 0 },
    dateStr: { type: String, required: true } // "YYYY-MM-DD" normalized to local timezone
}, { timestamps: true });

module.exports = mongoose.model('Meal', mealSchema);