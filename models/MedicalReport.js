const mongoose = require('mongoose');

const medicalReportSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true, 
        index: true 
    },
    originalFileName: { type: String, required: true },
    storedFileName: { type: String },
    fileSize: { type: Number },
    mimeType: { type: String, required: true },
    
    // Cloud Asset Tracking
    storageProvider: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
    cloudPublicId: { type: String },
    cloudResourceType: { type: String, default: 'auto' },
    cloudDeliveryType: { type: String, default: 'upload' },
    cloudSecureUrl: { type: String },

    // Clinical Observation Date
    recordedAt: { type: Date, default: Date.now },

    // Granular Pipeline Statuses
    status: { 
        type: String, 
        enum: ['processing', 'completed', 'extracted', 'needs_review', 'partial', 'failed'], 
        default: 'processing' 
    },
    failureStage: { 
        type: String, 
        enum: ['validation', 'text_extraction', 'ai_extraction', 'cloud_storage', 'health_sync', 'none'], 
        default: 'none' 
    },
    failureMessage: { type: String, default: null },

    // Extracted Content
    rawText: { type: String, default: '' },
    aiExplanation: { type: String, default: '' },
    extractedData: {
        documentType: { type: String, default: 'lab_report' },
        documentTitle: { type: String, default: 'Medical Report' },
        parameters: [{
            name: { type: String, required: true },
            category: { type: String, default: 'General' },
            value: { type: String, required: true },
            unit: { type: String, default: '' },
            referenceRange: { type: String, default: 'N/A' },
            status: { type: String, default: 'Standard' },
            statusClass: { type: String, default: 'good' }
        }]
    },
    analysisData: {
        documentTitle: String,
        plainEnglishExplanation: String,
        doctorQuestions: [String],
        generatedAt: Date,
        dataHash: String,
        status: String
    }
}, { timestamps: true });

medicalReportSchema.index({ userId: 1, createdAt: -1 });
medicalReportSchema.index({ userId: 1, recordedAt: -1 });

module.exports = mongoose.model('MedicalReport', medicalReportSchema);