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
        type: String 
    },
    mimeType: { 
        type: String, 
        required: true 
    },
    fileSizeBytes: { 
        type: Number 
    },
    status: {
        type: String,
        enum: ['uploaded', 'processing', 'extracted', 'failed'],
        default: 'uploaded'
    },
    aiExplanation: { 
        type: String, 
        default: '' 
    },
    extractedData: {
        rawText: { 
            type: String, 
            default: '' 
        },
        parameters: [
            {
                name: { type: String },
                category: { type: String, default: 'General' },
                value: { type: String },
                unit: { type: String, default: '' },
                referenceRange: { type: String, default: '' },
                status: { type: String, default: 'Standard' },
                statusClass: { type: String, default: 'good' }
            }
        ]
    },
    analysisData: {
        documentTitle: { type: String, default: '' },
        plainEnglishExplanation: { type: String, default: '' },
        doctorQuestions: [{ type: String }],
        generatedAt: { type: Date, default: null },
        dataHash: { type: String, default: '' },
        status: { type: String, enum: ['ready', 'pending', 'stale'], default: 'pending' }
    }
}, { timestamps: true });

medicalReportSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.MedicalReport || mongoose.model('MedicalReport', medicalReportSchema);