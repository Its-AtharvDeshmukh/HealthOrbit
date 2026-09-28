const mongoose = require('mongoose');

const healthMeasurementSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true 
    },
    metricName: { 
        type: String, 
        required: true, 
        trim: true 
    },
    metricKey: { 
        type: String, 
        trim: true, 
        index: true 
    },
    category: { 
        type: String, 
        default: 'General' 
    },
    value: { 
        type: mongoose.Schema.Types.Mixed, 
        required: true 
    },
    numericValue: { 
        type: Number 
    },
    unit: { 
        type: String, 
        default: '', 
        trim: true 
    },
    referenceRange: { 
        type: String, 
        default: 'N/A' 
    },
    status: { 
        type: String, 
        default: 'Standard' 
    },
    source: { 
        type: String, 
        default: 'manual' 
    },
    sourceType: {
        type: String,
        enum: ['medical_report', 'wearable', 'manual', 'unknown'],
        default: 'manual'
    },
    sourceRecordId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'MedicalReport',
        index: true 
    },
    provider: {
        type: String,
        enum: ['health_connect', 'apple_health', 'manual', 'lab'],
        default: 'health_connect'
    },
    externalRecordId: {
        type: String,
        trim: true,
        index: true
    },
    recordedAt: { 
        type: Date, 
        default: Date.now 
    }
}, { timestamps: true });

// Existing compound indexes
healthMeasurementSchema.index({ userId: 1, metricKey: 1, recordedAt: -1 });
healthMeasurementSchema.index({ userId: 1, sourceRecordId: 1, metricKey: 1 });

// Wearables deduplication index (sparse so reports without externalRecordId are ignored)
healthMeasurementSchema.index(
    { userId: 1, provider: 1, externalRecordId: 1, metricKey: 1 },
    { unique: true, sparse: true }
);

module.exports = mongoose.model('HealthMeasurement', healthMeasurementSchema);