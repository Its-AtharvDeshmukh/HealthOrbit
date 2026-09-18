const mongoose = require('mongoose');

const insurancePolicySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    providerName: { type: String, required: true, trim: true },
    policyName: { type: String, required: true, trim: true },
    policyNumber: { type: String, required: true, trim: true },
    validThru: { type: String, required: true, trim: true }, // e.g., "12/2028"
    policyHolderName: { type: String, required: true, trim: true },
    coverageAmount: { type: Number, required: true, min: 0 },
    coPayPercentage: { type: Number, default: 0, min: 0, max: 100 },
    networkHospitals: { type: String, trim: true, default: 'Standard Network' },
    isPrimary: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('InsurancePolicy', insurancePolicySchema);