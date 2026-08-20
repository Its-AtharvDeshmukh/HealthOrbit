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
        required: true // e.g., 'Hemoglobin', 'WBC Count', 'Heart Rate'
    },
    category: {
        type: String,
        default: 'General Metric'
    },
    value: {
        type: String,
        required: true
    },
    unit: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'Optimal' // Optimal, Low Range, High Range, Deficient
    },
    source: {
        type: String,
        default: 'OCR Report' // OCR Report, Wearable, Manual
    },
    recordedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

const HealthMeasurement = mongoose.model('HealthMeasurement', healthMeasurementSchema);

module.exports = HealthMeasurement;