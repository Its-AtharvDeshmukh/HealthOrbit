const mongoose = require('mongoose');

const symptomEntrySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symptom: { type: String, required: true },
    severity: { type: String, enum: ['Mild', 'Moderate', 'Severe', 'High'], default: 'Mild' },
    notes: { type: String },
    recordedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('SymptomEntry', symptomEntrySchema);