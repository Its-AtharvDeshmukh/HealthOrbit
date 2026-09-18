const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String }, // Optional for Google OAuth users
    
    // Personal Info
    age: { type: Number, min: 0, max: 130 },
    gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say', ''] },
    phone: { type: String, trim: true },
    
    // Health Info
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''] },
    allergies: [{ type: String, trim: true }],
    medicalConditions: [{ type: String, trim: true }],
    currentMedicines: [{ type: String, trim: true }],
    
    // Emergency Contact
    emergencyContactName: { type: String, trim: true },
    emergencyContactRelation: { type: String, trim: true },
    emergencyContactPhone: { type: String, trim: true },

    // PRIVACY & AI SETTINGS (NEW FOR PHASE 7)
    privacySettings: {
        emergencyCardEnabled: { type: Boolean, default: false },
        aiAccess: {
            profile: { type: Boolean, default: true },
            medicalReports: { type: Boolean, default: true },
            healthMeasurements: { type: Boolean, default: true },
            medicines: { type: Boolean, default: true },
            familyMetadata: { type: Boolean, default: false }
        }
    },
    // Add this right below your privacySettings:
    donorProfile: {
        bloodDonorEnabled: { type: Boolean, default: false },
        organDonorPreference: { type: String, enum: ['Yes', 'No', 'Not specified'], default: 'Not specified' },
        contactSharingEnabled: { type: Boolean, default: false }
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);