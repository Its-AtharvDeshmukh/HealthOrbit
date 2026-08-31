// models/FamilyMember.js
const mongoose = require('mongoose');

const familyMemberSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true,
        index: true
    },
    name: { type: String, required: true },
    relationship: { type: String, required: true },
    contact: { type: String, required: true },
    
    // In a real app, this would be 'pending' until they click an email link.
    // We set it to 'active' so you can test the "Manage Access" UI immediately.
    status: { type: String, default: 'active' }, 
    
    permissions: {
        emergencyInfo: { type: Boolean, default: false },
        medicalReports: { type: Boolean, default: false },
        healthSummary: { type: Boolean, default: false },
        medicines: { type: Boolean, default: false },
        symptoms: { type: Boolean, default: false },
        insurance: { type: Boolean, default: false },
        wearableData: { type: Boolean, default: false },
        healthTimeline: { type: Boolean, default: false }
    }
}, {
    timestamps: true 
});

const FamilyMember = mongoose.model('FamilyMember', familyMemberSchema);
module.exports = FamilyMember;