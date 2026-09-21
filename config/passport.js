const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
        proxy: true
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails && profile.emails[0] ? profile.emails[0].value.toLowerCase() : null;
            if (!email) return done(new Error('No email found from Google profile'), null);

            let user = await User.findOne({ email });
            if (!user) {
                user = new User({
                    fullName: profile.displayName || 'Google User',
                    email: email,
                    passwordHash: await bcrypt.hash(Math.random().toString(36), 10)
                });
                await user.save();
            }
            return done(null, user);
        } catch (error) {
            return done(error, null);
        }
    }));
}

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;