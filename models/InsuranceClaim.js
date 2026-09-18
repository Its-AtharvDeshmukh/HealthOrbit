const mongoose = require('mongoose');

const insuranceClaimSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'InsurancePolicy', required: true },
    claimTitle: { type: String, required: true, trim: true }, // e.g. "Routine Diagnostics"
    hospitalName: { type: String, required: true, trim: true },
    claimDate: { type: Date, required: true },
    claimAmount: { type: Number, required: true, min: 0 },
    status: { 
        type: String, 
        enum: ['Processing', 'Approved', 'Rejected', 'Settled'], 
        default: 'Processing' 
    }
}, { timestamps: true });

module.exports = mongoose.model('InsuranceClaim', insuranceClaimSchema);