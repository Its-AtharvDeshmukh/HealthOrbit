const mongoose = require('mongoose');

const lifestyleHabitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    habitKey: { type: String, required: true },
    label: { type: String, required: true },
    dateStr: { type: String, required: true }, // "YYYY-MM-DD"
    completed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('LifestyleHabit', lifestyleHabitSchema);