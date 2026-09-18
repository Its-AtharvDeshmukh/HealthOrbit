const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    dosage: {
        type: String,
        required: true,
        trim: true
    },
    frequency: {
        type: String,
        default: 'Daily',
        trim: true
    },
    instructions: {
        type: String,
        default: '',
        trim: true
    },
    times: [{
        type: String // e.g. "08:00", "20:00"
    }],
    active: {
        type: Boolean,
        default: true
    },
    reminderEnabled: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

medicineSchema.index({ userId: 1, active: 1 });

module.exports = mongoose.models.Medicine || mongoose.model('Medicine', medicineSchema);