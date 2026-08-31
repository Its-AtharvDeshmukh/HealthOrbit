const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: [true, 'Full name is required'], trim: true },
    email: { type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: [true, 'Password is required'] },
    
    // --- NEW PROFILE FIELDS ---
    age: { type: Number },
    gender: { type: String },
    phone: { type: String },
    
    // --- NEW HEALTH INFO FIELDS ---
    bloodGroup: { type: String },
    allergies: { type: [String], default: [] },
    medicalConditions: { type: [String], default: [] },
    currentMedicines: { type: [String], default: [] },
    
    // --- NEW EMERGENCY CONTACT FIELDS ---
    emergencyContactName: { type: String },
    emergencyContactRelation: { type: String },
    emergencyContactPhone: { type: String }
}, {
    timestamps: true 
});

const User = mongoose.model('User', userSchema);
module.exports = User;