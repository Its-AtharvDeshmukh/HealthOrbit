require('dotenv').config();

// 1. CORE IMPORTS
const express = require('express');
const path = require('path');
const session = require('express-session');

// 2. CONFIGURATION IMPORTS
const connectDB = require('./config/db');
const passport = require('./config/passport');
const { initScheduler } = require('./services/schedulerService');

// 3. MIDDLEWARE IMPORTS
const localsMiddleware = require('./middleware/localsMiddleware');

// 4. ROUTE IMPORTS
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const profileRoutes = require('./routes/profileRoutes');
const familyRoutes = require('./routes/familyRoutes');
const reportRoutes = require('./routes/reportRoutes');
const aiRoutes = require('./routes/aiRoutes');
const insuranceRoutes = require('./routes/insuranceRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');
const medicineRoutes = require('./routes/medicineRoutes');
const nutritionRoutes = require('./routes/nutritionRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const accountRoutes = require('./routes/accountRoutes');

// 5. ENVIRONMENT VALIDATION
if (!process.env.SESSION_SECRET) {
    console.error('[HealthOrbit] FATAL ERROR: SESSION_SECRET environment variable is missing.');
    process.exit(1);
}

// 6. EXPRESS INITIALIZATION
const app = express();
const PORT = process.env.PORT || 3000;

// 7. EXPRESS CONFIGURATION
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 8. SESSION CONFIGURATION
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true
    }
}));

// 9. PASSPORT INITIALIZATION
app.use(passport.initialize());
app.use(passport.session());

// 10. GLOBAL MIDDLEWARE
app.use(localsMiddleware);

// 11. ROUTE MOUNTING
app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/profile', profileRoutes);
app.use('/family', familyRoutes);
app.use('/', reportRoutes);
app.use('/', aiRoutes);
app.use('/insurance', insuranceRoutes);
app.use('/emergency', emergencyRoutes);
app.use('/', medicineRoutes);
app.use('/nutrition', nutritionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/account', accountRoutes);

// 12. GLOBAL 404 / FALLBACK BEHAVIOR
app.use((req, res) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return res.redirect('/error');
    }
    res.redirect('/auth');
});

// 13. APPLICATION STARTUP SEQUENCE
async function startServer() {
    try {
        // Step 1: Establish Database Connection
        await connectDB();
        
        // Step 2: Initialize Background Workers Once
        initScheduler();

        // Step 3: Bind HTTP Server (0.0.0.0 for Render compatibility)
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[HealthOrbit] Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error('[HealthOrbit] Server startup failed:', error.message);
        process.exit(1);
    }
}

// Execute Startup
startServer();