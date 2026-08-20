// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true, // Prevents duplicate accounts
        lowercase: true,
        trim: true
    },
    passwordHash: {
        type: String,
        required: [true, 'Password is required']
    },
    // Future HealthOrbit Profile Fields (Optional at registration)
    age: {
        type: Number
    },
    bloodGroup: {
        type: String
    },
    allergies: {
        type: [String],
        default: []
    }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt dates
});

const User = mongoose.model('User', userSchema);

module.exports = User;