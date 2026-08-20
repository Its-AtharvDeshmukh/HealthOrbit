const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    originalFileName: {
        type: String,
        required: true
    },
    storedFileName: {
        type: String,
        required: true
    },
    filePath: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    fileSizeBytes: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['uploaded', 'processing', 'extracted', 'failed'],
        default: 'uploaded'
    },
    extractedData: {
        rawText: { type: String, default: '' },
        parameters: [{
            name: String,
            category: String,
            value: String,
            unit: String,
            referenceRange: String,
            status: String,
            statusClass: String
        }]
    },
    aiExplanation: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

const MedicalReport = mongoose.model('MedicalReport', medicalReportSchema);

module.exports = MedicalReport;