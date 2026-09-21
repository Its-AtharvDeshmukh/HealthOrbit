const bcrypt = require('bcryptjs');
const passport = require('passport');
const User = require('../models/User');

const getAuthPage = (req, res) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return res.redirect('/dashboard');
    }
    res.render('auth/auth', { loginError: null, signupError: null });
};

const redirectHome = (req, res) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
};

const signup = async (req, res) => {
    const { fullName, email, password } = req.body;
    try {
        if (!fullName || !email || !password) return res.render('auth/auth', { signupError: 'All fields are required.', loginError: null });
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) return res.render('auth/auth', { signupError: 'An account with this email already exists.', loginError: null });
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = await User.create({ fullName: fullName.trim(), email: email.toLowerCase().trim(), passwordHash: hashedPassword });

        req.session.userId = newUser._id;
        req.session.userName = newUser.fullName;
        req.session.userEmail = newUser.email;
        
        req.session.save((err) => {
            if (err) console.error("Session save error:", err);
            return res.redirect('/dashboard');
        });
    } catch (error) {
        return res.render('auth/auth', { signupError: 'Internal server error.', loginError: null });
    }
};

const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) return res.render('auth/auth', { loginError: 'Email and password are required.', signupError: null });
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) return res.render('auth/auth', { loginError: 'Invalid credentials supplied.', signupError: null });
        
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.render('auth/auth', { loginError: 'Invalid credentials supplied.', signupError: null });
        
        req.session.userId = user._id;
        req.session.userName = user.fullName;
        req.session.userEmail = user.email;
        
        req.session.save((err) => {
            if (err) console.error("Session save error:", err);
            return res.redirect('/dashboard');
        });
    } catch (error) {
        return res.render('auth/auth', { loginError: 'Internal server error.', signupError: null });
    }
};

const logout = (req, res) => {
    req.logout((err) => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.render('auth/logout');
        });
    });
};

const googleAuth = passport.authenticate('google', { scope: ['profile', 'email'] });

const googleCallback = [
    passport.authenticate('google', { failureRedirect: '/auth' }),
    (req, res) => {
        req.session.userId = req.user._id;
        req.session.userName = req.user.fullName;
        req.session.userEmail = req.user.email;
        res.redirect('/dashboard');
    }
];

module.exports = {
    getAuthPage,
    redirectHome,
    signup,
    login,
    logout,
    googleAuth,
    googleCallback
};