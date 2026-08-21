const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const multer = require('multer');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const connectDB = require('./config/db');
const User = require('./models/User');
const MedicalReport = require('./models/MedicalReport');
const HealthMeasurement = require('./models/HealthMeasurement');
const { extractTextFromFile } = require('./services/ocrService');
const { analyzeMedicalTextWithAI } = require('./services/aiService');

connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `report-${uniqueSuffix}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only PDF, JPG, and PNG files are allowed.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 25 * 1024 * 1024 }
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'healthorbit_secret_session_key_2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true
    }
}));

app.use(passport.initialize());
app.use(passport.session());

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        
        callbackURL: 'http://localhost:3000/auth/google/callback'
        
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

const requireAuth = (req, res, next) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return next();
    }
    return res.redirect('/auth');
};

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.get('/auth', (req, res) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return res.redirect('/dashboard');
    }
    res.render('auth/auth', { loginError: null, signupError: null });
});

app.get('/', (req, res) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return res.redirect('/dashboard');
    }
    res.redirect('/auth');
});

// ==========================================
// HEALTH TIMELINE & REPLAY ROUTE (MODULE 9 & 16)
// ==========================================
app.get('/timeline', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        res.render('dashboard/timeline.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : '')
        });
    } catch (error) {
        console.error('[HealthOrbit] Timeline Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// TRENDS & ANOMALIES ROUTE (MODULE 6 & 7)
// ==========================================
app.get('/trends', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const measurements = await HealthMeasurement.find({ userId: activeUserId })
            .sort({ recordedAt: -1 })
            .limit(30);

        res.render('dashboard/trends.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : ''),
            measurements
        });
    } catch (error) {
        console.error('[HealthOrbit] Trends Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// MEDICINES & SYMPTOMS ROUTE (MODULE 8)
// ==========================================
app.get('/medicines', requireAuth, async (req, res) => {
    try {
        res.render('dashboard/medicines.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : '')
        });
    } catch (error) {
        console.error('[HealthOrbit] Medicines Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// INSURANCE & DIGITAL ID ROUTE
// ==========================================
app.get('/insurance', requireAuth, (req, res) => {
    try {
        res.render('dashboard/insurance.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : '')
        });
    } catch (error) {
        console.error('[HealthOrbit] Insurance Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// AI HEALTH ASSISTANT ROUTE (MODULE 10)
// ==========================================
app.get('/ai-assistant', requireAuth, (req, res) => {
    try {
        res.render('dashboard/ai-assistant.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : '')
        });
    } catch (error) {
        console.error('[HealthOrbit] AI Assistant Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// NUTRITION & LIFESTYLE ROUTE (MODULE 10)
// ==========================================
app.get('/nutrition', requireAuth, (req, res) => {
    try {
        res.render('dashboard/nutrition.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : '')
        });
    } catch (error) {
        console.error('[HealthOrbit] Nutrition Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// PROFILE & FAMILY ROUTE
// ==========================================
// ==========================================
// PROFILE & FAMILY ROUTE
// ==========================================
app.get('/profile', requireAuth, async (req, res) => {
    try {
        res.render('profile/profile.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : '')
        });
    } catch (error) {
        console.error('[HealthOrbit] Profile Load Error:', error);
        res.redirect('/dashboard');
    }
});

// --- ADD THIS NEW POST ROUTE ---
app.post('/profile', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const { fullName } = req.body;
        
        if (fullName) {
            // Update the User in the database
            await User.findByIdAndUpdate(activeUserId, { fullName: fullName.trim() });
            // Update the current session so the UI reflects the change immediately
            req.session.userName = fullName.trim();
        }
        
        // Redirect back to the profile page to see the changes
        return res.redirect('/profile');
    } catch (error) {
        console.error('[HealthOrbit] Profile Update Error:', error);
        return res.redirect('/profile');
    }
});
// -------------------------------

// ==========================================
// AI ANALYSIS & TRENDS ROUTE (MODULE 6 & 7)
// ==========================================
app.get('/ai-analysis', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const healthHistory = await HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: 1 });

        res.render('dashboard/ai-analysis.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : ''),
            healthHistory: healthHistory 
        });
    } catch (error) {
        console.error('[HealthOrbit] AI Analysis Load Error:', error);
        res.redirect('/dashboard'); 
    }
});

// ==========================================
// WEARABLE TELEMETRY ROUTE (MODULE 4)
// ==========================================
app.get('/wearables', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const latestWearables = await HealthMeasurement.find({ 
            userId: activeUserId,
            source: { $regex: /Report|Device|Wearable/i } 
        }).sort({ recordedAt: -1 }).limit(10);

        res.render('dashboard/wearables.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : ''),
            wearables: latestWearables
        });
    } catch (error) {
        console.error('[HealthOrbit] Wearables Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// REPORT DELETE ROUTE
// ==========================================
app.post('/reports/delete/:id', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        
        await MedicalReport.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        await HealthMeasurement.deleteMany({ source: `Report:${req.params.id}`, userId: activeUserId });
        
        return res.redirect('/ocr');
    } catch (error) {
        console.error('[HealthOrbit] Delete Error:', error);
        return res.redirect('/ocr');
    }
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth' }),
    (req, res) => {
        req.session.userId = req.user._id;
        req.session.userName = req.user.fullName;
        req.session.userEmail = req.user.email;
        res.redirect('/dashboard');
    }
);

app.post('/signup', async (req, res) => {
    const { fullName, email, password } = req.body;
    try {
        if (!fullName || !email || !password) {
            return res.render('auth/auth', { signupError: 'All fields are required.', loginError: null });
        }
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('auth/auth', { signupError: 'An account with this email already exists.', loginError: null });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const newUser = new User({
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            passwordHash: hashedPassword
        });
        await newUser.save();

        req.session.userId = newUser._id;
        req.session.userName = newUser.fullName;
        req.session.userEmail = newUser.email;
        return res.redirect('/dashboard');
    } catch (error) {
        console.error('[HealthOrbit] Signup Error:', error);
        return res.render('auth/auth', { signupError: 'Internal server error during registration.', loginError: null });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        if (!email || !password) {
            return res.render('auth/auth', { loginError: 'Email and password are required.', signupError: null });
        }
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.render('auth/auth', { loginError: 'Invalid credentials supplied.', signupError: null });
        }
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.render('auth/auth', { loginError: 'Invalid credentials supplied.', signupError: null });
        }
        req.session.userId = user._id;
        req.session.userName = user.fullName;
        req.session.userEmail = user.email;
        return res.redirect('/dashboard');
    } catch (error) {
        console.error('[HealthOrbit] Login Error:', error);
        return res.render('auth/auth', { loginError: 'Internal server error during login.', signupError: null });
    }
});

app.get('/logout', (req, res) => {
    if (req.logout) req.logout(() => {});
    req.session.destroy(() => res.redirect('/auth'));
});

// ==========================================
// WORKSPACE & OCR ROUTES 
// ==========================================

app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const reportCount = await MedicalReport.countDocuments({ userId: activeUserId });
        const recentMeasurements = await HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(5);

        res.render('dashboard/index', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            userEmail: req.session.userEmail || (req.user ? req.user.email : ''),
            reportCount,
            recentMeasurements
        });
    } catch (error) {
        console.error('[HealthOrbit] Dashboard Load Error:', error);
        res.render('dashboard/index', { userName: 'User', userEmail: '', reportCount: 0, recentMeasurements: [] });
    }
});

app.get('/ocr', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const selectedReportId = req.query.reportId;
        
        const reports = await MedicalReport.find({ userId: activeUserId }).sort({ createdAt: -1 });

        let latestReport = null;
        if (selectedReportId) {
            latestReport = reports.find(r => r._id.toString() === selectedReportId) || null;
        }
        if (!latestReport && reports.length > 0) {
            latestReport = reports[0];
        }

        res.render('dashboard/ocr.ejs', { 
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            reports,
            latestReport
        });
    } catch (error) {
        console.error('[HealthOrbit] Workspace Load Error:', error);
        res.render('dashboard/ocr.ejs', { userName: 'User', reports: [], latestReport: null });
    }
});

// ==========================================
// CLOUDINARY UPLOAD ROUTE
// ==========================================
app.post('/reports/upload', requireAuth, upload.single('reportFile'), async (req, res) => {
    try {
        if (!req.file) return res.redirect('/ocr');
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        
        let fileUrl = req.file.filename; // Default Local Storage filename
        
        // Secure Cloud Upload if Cloudinary is configured in .env
        if (process.env.CLOUDINARY_API_KEY) {
            const cloudinary = require('cloudinary').v2;
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
            try {
                const cloudRes = await cloudinary.uploader.upload(req.file.path, { resource_type: 'auto', folder: 'healthorbit' });
                fileUrl = cloudRes.secure_url;
            } catch (err) { 
                console.warn('[HealthOrbit] Cloud upload failed, using local storage.', err.message); 
            }
        }

        const newReport = new MedicalReport({
            userId: activeUserId,
            originalFileName: req.file.originalname,
            storedFileName: fileUrl, // <--- Stores Cloud URL or Local filename
            filePath: req.file.path,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
            status: 'processing'
        });
        await newReport.save();

        const rawFallbackText = await extractTextFromFile(req.file.path, req.file.mimetype);
        const { parameters, aiExplanation, rawText } = await analyzeMedicalTextWithAI(req.file.path, req.file.mimetype, rawFallbackText);

        newReport.extractedData.rawText = rawText;
        newReport.extractedData.parameters = parameters;
        newReport.aiExplanation = aiExplanation;
        newReport.status = 'extracted';
        await newReport.save();

        if (Array.isArray(parameters) && parameters.length > 0) {
            for (const param of parameters) {
                await HealthMeasurement.create({
                    userId: activeUserId,
                    metricName: param.name,
                    category: param.category || 'Clinical Metric',
                    value: param.value,
                    unit: param.unit || '',
                    status: param.status || 'Optimal',
                    source: `Report:${newReport._id}`
                });
            }
        }

        return res.redirect(`/ocr?reportId=${newReport._id}`);
    } catch (error) {
        console.error('[HealthOrbit] Upload Error:', error);
        return res.redirect('/ocr');
    }
});

app.post('/reports/update/:id', requireAuth, async (req, res) => {
    try {
        const reportId = req.params.id;
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        
        const report = await MedicalReport.findOne({ _id: reportId, userId: activeUserId });
        if (!report) return res.redirect('/ocr');

        const { params } = req.body;
        const updatedParameters = params ? Object.values(params) : [];

        report.extractedData.parameters = updatedParameters;
        await report.save();

        await HealthMeasurement.deleteMany({ userId: activeUserId, source: `Report:${report._id}` });
        for (const param of updatedParameters) {
            await HealthMeasurement.create({
                userId: activeUserId,
                metricName: param.name,
                category: param.category || 'Clinical Metric',
                value: param.value,
                unit: param.unit || '',
                status: param.status || 'Optimal',
                source: `Report:${report._id}`
            });
        }

        return res.redirect(`/ocr?reportId=${report._id}`);
    } catch (error) {
        console.error('[HealthOrbit] Manual Correction Error:', error);
        return res.redirect('/ocr');
    }
});

app.listen(PORT, () => {
    console.log(`[HealthOrbit] Server running on http://localhost:${PORT}`);
});