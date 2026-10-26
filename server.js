require('dotenv').config();

// 1. CORE IMPORTS
const express = require('express');
const path = require('path');
const session = require('express-session');
const mongoose = require('mongoose');

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// 7. SESSION CONFIGURATION
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        httpOnly: true
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(localsMiddleware);

// 8. ROUTE MOUNTING
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

// Fallback Behavior
app.use((req, res) => res.redirect('/auth'));

// 9. SERVER STARTUP
async function startServer() {
    try {
        await connectDB();
        
        try {
            await mongoose.connection.collection('digitalhealthids').dropIndex('userId_1');
        } catch (err) {
            // Index already handled
        }

        initScheduler();

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`[HealthOrbit] Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('[HealthOrbit] Server startup failed:', error.message);
        process.exit(1);
    }
}

startServer();