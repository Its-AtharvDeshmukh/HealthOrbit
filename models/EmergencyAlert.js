const mongoose = require('mongoose');

const emergencyAlertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    accuracy: { type: Number, min: 0 },
    locationCapturedAt: { type: Date },
    emergencyContactName: { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },
    bloodGroup: { type: String, trim: true },
    status: { type: String, enum: ['active', 'resolved'], default: 'active' }
}, { timestamps: true });

// Index for finding a user's active alerts quickly
emergencyAlertSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('EmergencyAlert', emergencyAlertSchema);