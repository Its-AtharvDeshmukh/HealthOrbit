const express = require('express');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const localsMiddleware = require('./middleware/localsMiddleware');

// Route Imports (To be mapped in Step 2)
// const authRoutes = require('./routes/authRoutes');
// const dashboardRoutes = require('./routes/dashboardRoutes');
// const profileRoutes = require('./routes/profileRoutes');
// const familyRoutes = require('./routes/familyRoutes');
// const reportRoutes = require('./routes/reportRoutes');
// const aiRoutes = require('./routes/aiRoutes');
// const insuranceRoutes = require('./routes/insuranceRoutes');
// const emergencyRoutes = require('./routes/emergencyRoutes');
// const medicineRoutes = require('./routes/medicineRoutes');
// const nutritionRoutes = require('./routes/nutritionRoutes');
// const notificationRoutes = require('./routes/notificationRoutes');
// const accountRoutes = require('./routes/accountRoutes');

const app = express();

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

// Static Assets & Body Parsers
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'healthorbit_secret_session_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true
    }
}));

// Initialize Passport & Global Locals
app.use(passport.initialize());
app.use(passport.session());
app.use(localsMiddleware);

// ==========================================
// ROUTE MOUNTING (Will be activated in Step 2)
// ==========================================
// app.use('/', authRoutes);
// app.use('/', dashboardRoutes);
// app.use('/', profileRoutes);
// app.use('/family', familyRoutes);
// app.use('/', reportRoutes);
// app.use('/', aiRoutes);
// app.use('/insurance', insuranceRoutes);
// app.use('/emergency', emergencyRoutes);
// app.use('/', medicineRoutes);
// app.use('/nutrition', nutritionRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/account', accountRoutes);

// Fallback 404 Handler (Keep it last)
// app.use('*', require('./middleware/authMiddleware'), (req, res) => res.redirect('/error'));

module.exports = app;