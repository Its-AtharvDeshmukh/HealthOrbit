const mongoose = require('mongoose');

const medicineLogSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    medicineId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Medicine', 
        required: true 
    },
    scheduledTime: { 
        type: String, 
        required: true // "HH:mm"
    },
    date: { 
        type: String, 
        required: true // "YYYY-MM-DD"
    },
    status: { 
        type: String, 
        enum: ['pending', 'taken', 'skipped', 'missed'], 
        default: 'pending' 
    },
    takenAt: { 
        type: Date 
    }
}, { timestamps: true });

medicineLogSchema.index({ userId: 1, date: 1, scheduledTime: 1 });

module.exports = mongoose.models.MedicineLog || mongoose.model('MedicineLog', medicineLogSchema);