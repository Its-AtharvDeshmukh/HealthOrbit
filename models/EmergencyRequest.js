const mongoose = require('mongoose');

const emergencyRequestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requestType: { 
        type: String, 
        enum: [
            'Blood Donation', 
            'Oxygen / Respiratory Equipment', 
            'Emergency Medicine', 
            'Other Urgent Need'
        ], 
        required: true 
    },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    bloodGroup: { type: String, trim: true },
    hospitalName: { type: String, trim: true, maxlength: 100 },
    urgency: { 
        type: String, 
        enum: [
            'High Priority (Within Hours)', 
            'Medium Priority (Within 24 Hours)', 
            'Low Priority'
        ], 
        default: 'High Priority (Within Hours)' 
    },
    status: { type: String, enum: ['active', 'fulfilled', 'cancelled'], default: 'active' },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

emergencyRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmergencyRequest', emergencyRequestSchema);