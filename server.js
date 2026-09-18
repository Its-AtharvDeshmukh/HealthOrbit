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
const crypto = require('crypto');

const connectDB = require('./config/db');
const User = require('./models/User');
const MedicalReport = require('./models/MedicalReport');
const HealthMeasurement = require('./models/HealthMeasurement');
const FamilyMember = require('./models/FamilyMember');
const InsurancePolicy = require('./models/InsurancePolicy');
const InsuranceClaim = require('./models/InsuranceClaim');
const DigitalHealthId = require('./models/DigitalHealthId');

const { extractTextFromFile } = require('./services/ocrService');
const { buildUserAIContext } = require('./services/contextService');
const { analyzeMedicalTextWithAI, chatWithMeshAPI } = require('./services/aiService');
const AIConversation = require('./models/AIConversation');
const AIMessage = require('./models/AIMessage');
const EmergencyAlert = require('./models/EmergencyAlert');
const EmergencyRequest = require('./models/EmergencyRequest');
const Medicine = require('./models/Medicine');
const MedicineLog = require('./models/MedicineLog');
const SymptomEntry = require('./models/SymptomEntry');
const Notification = require('./models/Notification');
const { initScheduler } = require('./services/schedulerService');

// Destructure both methods from healthAnalysisService
const { getHealthAnalytics, generateSafeAISummary, buildReportSpecificAnalysis } = require('./services/healthAnalysisService');

const Meal = require('./models/Meal');
const HydrationLog = require('./models/HydrationLog');
const LifestyleHabit = require('./models/LifestyleHabit');
const WellnessGoal = require('./models/WellnessGoal');


const { sendTelegramAlert } = require('./services/schedulerService');



// Initialize Database & Scheduler
connectDB();
initScheduler();

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Local File Uploads Directory
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
app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
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

// GLOBAL CSRF & USER VAR MIDDLEWARE
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.userName = req.session.userName || null;
    res.locals.userEmail = req.session.userEmail || null;
    next();
});

app.use(passport.initialize());
app.use(passport.session());

// GOOGLE OAUTH
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

const requireAuth = (req, res, next) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        return next();
    }
    return res.redirect('/auth');
};

// ==========================================
// AUTHENTICATION & CORE ROUTES
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

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/auth' }), (req, res) => {
    req.session.userId = req.user._id;
    req.session.userName = req.user.fullName;
    req.session.userEmail = req.user.email;
    res.redirect('/dashboard');
});

app.post('/signup', async (req, res) => {
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
        
        // FIX: Force session to save before redirecting
        req.session.save((err) => {
            if (err) console.error("Session save error:", err);
            return res.redirect('/dashboard');
        });
    } catch (error) {
        return res.render('auth/auth', { signupError: 'Internal server error.', loginError: null });
    }
});

app.post('/login', async (req, res) => {
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
        
        // FIX: Force session to save before redirecting
        req.session.save((err) => {
            if (err) console.error("Session save error:", err);
            return res.redirect('/dashboard');
        });
    } catch (error) {
        return res.render('auth/auth', { loginError: 'Internal server error.', signupError: null });
    }
});

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.render('auth/logout');
        });
    });
});

// ==========================================
// STATIC/DASHBOARD ROUTES
// ==========================================

app.get('/dashboard', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const reportCount = await MedicalReport.countDocuments({ userId: activeUserId });
        const recentMeasurements = await HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(5);

        res.render('dashboard/index', { reportCount, recentMeasurements });
    } catch (error) {
        console.error('[HealthOrbit] Dashboard Load Error:', error);
        res.render('dashboard/index', { reportCount: 0, recentMeasurements: [] });
    }
});

app.get('/timeline', requireAuth, (req, res) => res.render('dashboard/timeline.ejs'));
app.get("/error", requireAuth, (req, res) => res.render('errors/not-found.ejs'));

app.get('/trends', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const measurements = await HealthMeasurement.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(30);
        res.render('dashboard/trends.ejs', { measurements });
    } catch (error) {
        res.redirect('/dashboard');
    }
});

app.get('/wearables', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const latestWearables = await HealthMeasurement.find({ 
            userId: activeUserId, source: { $regex: /Report|Device|Wearable/i } 
        }).sort({ recordedAt: -1 }).limit(10);
        res.render('dashboard/wearables.ejs', { wearables: latestWearables });
    } catch (error) {
        res.redirect('/dashboard');
    }
});

// ==========================================
// AI ASSISTANT & ANALYST ROUTES
// ==========================================

app.get('/ai-assistant', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const selectedReportId = req.query.reportId;
        
        let activeReport = null;
        if (selectedReportId) {
            activeReport = await MedicalReport.findOne({ _id: selectedReportId, userId: activeUserId });
        }

        res.render('dashboard/ai-assistant.ejs', {
            userName: req.session.userName || (req.user ? req.user.fullName : 'User'),
            activeReport: activeReport
        });
    } catch (error) {
        console.error('[HealthOrbit] AI Assistant Load Error:', error);
        res.render('dashboard/ai-assistant.ejs', { userName: 'User', activeReport: null });
    }
});

app.get('/ai-analysis', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const requestedReportId = req.query.reportId || null;

        const user = await User.findById(activeUserId).lean();
        const aiAccess = user.privacySettings?.aiAccess || {
            medicalReports: true,
            healthMeasurements: true,
            medicines: true,
            symptoms: true
        };

        let reportAnalysis = {};
        if (buildReportSpecificAnalysis) {
            reportAnalysis = await buildReportSpecificAnalysis(activeUserId, requestedReportId, aiAccess);
        }

        const globalAnalytics = await getHealthAnalytics(activeUserId, aiAccess);

        const analysisView = {
            selectedReport: reportAnalysis.selectedReport,
            clinicalBreakdown: reportAnalysis.clinicalBreakdown || '',
            importantFindings: reportAnalysis.importantFindings || [],
            plainEnglishExplanation: reportAnalysis.plainEnglishExplanation || '',
            referenceMatrix: reportAnalysis.referenceMatrix || [],
            longitudinalComparisons: reportAnalysis.longitudinalComparisons || [],
            synthesisSummary: reportAnalysis.synthesisSummary || '',
            doctorQuestions: reportAnalysis.doctorQuestions || [],
            recentReports: globalAnalytics.reports || [],
            medicines: globalAnalytics.medicines || [],
            symptoms: globalAnalytics.symptoms || [],
            snapshots: globalAnalytics.snapshots || [],
            dataCounts: globalAnalytics.counts || { reports: 0, measurements: 0, medicines: 0, symptoms: 0 }
        };

        res.render('dashboard/ai-analysis.ejs', {
            userName: req.session.userName || user.fullName,
            aiAccess,
            analysisView,
            analytics: globalAnalytics,
            aiSummary: reportAnalysis.synthesisSummary || await generateSafeAISummary(globalAnalytics)
        });
    } catch (error) {
        console.error('[HealthOrbit] AI Analysis Load Error:', error);
        res.redirect('/dashboard');
    }
});

// ==========================================
// PROFILE & FAMILY ROUTES
// ==========================================

const calculateProfileCompletion = (user) => {
    const fields = ['fullName', 'email', 'phone', 'age', 'gender', 'bloodGroup', 'emergencyContactName'];
    let filled = 0;
    fields.forEach(f => { if (user[f] && user[f].toString().trim() !== '') filled++; });
    if (user.allergies && user.allergies.length > 0) filled++;
    if (user.medicalConditions && user.medicalConditions.length > 0) filled++;
    if (user.currentMedicines && user.currentMedicines.length > 0) filled++;
    return Math.round((filled / 10) * 100);
};

app.get('/profile', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        
        const [user, familyMembers] = await Promise.all([
            User.findById(activeUserId).lean(),
            FamilyMember.find({ userId: activeUserId }).sort({ createdAt: -1 }).lean()
        ]);
        
        const completionPct = calculateProfileCompletion(user);
        
        const [reportCount, measurementCount, policyCount] = await Promise.all([
            MedicalReport.countDocuments({ userId: activeUserId }),
            HealthMeasurement.countDocuments({ userId: activeUserId }),
            InsurancePolicy ? InsurancePolicy.countDocuments({ userId: activeUserId }) : 0
        ]);

        res.render('profile/profile.ejs', { 
            user, 
            familyMembers, 
            completionPct,
            counts: { reports: reportCount, measurements: measurementCount, policies: policyCount },
            hasPassword: !!user.passwordHash,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error('[HealthOrbit] Profile Load Error:', error);
        res.redirect('/dashboard');
    }
});

app.post('/profile', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { fullName, age, gender, phone } = req.body;
        await User.findByIdAndUpdate(activeUserId, { 
            fullName: fullName.trim(), age: age ? parseInt(age) : null, gender, phone: phone.trim()
        });
        req.session.userName = fullName.trim();
        return res.redirect('/profile?success=Personal+Info+updated+successfully');
    } catch (error) {
        return res.redirect('/profile?error=Failed+to+update+Personal+Info');
    }
});

app.post('/profile/health', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { bloodGroup, allergies, medicalConditions, currentMedicines } = req.body;
        const toArray = (str) => str ? str.split(',').map(s => s.trim()).filter(s => s) : [];
        await User.findByIdAndUpdate(activeUserId, { 
            bloodGroup, allergies: toArray(allergies), medicalConditions: toArray(medicalConditions), currentMedicines: toArray(currentMedicines)
        });
        return res.redirect('/profile?success=Health+Profile+updated+successfully');
    } catch (error) {
        return res.redirect('/profile?error=Failed+to+update+Health+Profile');
    }
});

app.post('/profile/emergency', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { emergencyContactName, emergencyContactRelation, emergencyContactPhone } = req.body;
        await User.findByIdAndUpdate(activeUserId, { 
            emergencyContactName: emergencyContactName.trim(), emergencyContactRelation: emergencyContactRelation.trim(), emergencyContactPhone: emergencyContactPhone.trim()
        });
        return res.redirect('/profile?success=Emergency+contact+updated');
    } catch (error) {
        return res.redirect('/profile?error=Failed+to+update+Emergency+Info');
    }
});

app.post('/profile/privacy', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { emergencyCardEnabled, aiProfile, aiReports, aiMeasurements, aiMedicines, aiFamily } = req.body;
        
        const privacySettings = {
            emergencyCardEnabled: emergencyCardEnabled === 'on',
            aiAccess: {
                profile: aiProfile === 'on',
                medicalReports: aiReports === 'on',
                healthMeasurements: aiMeasurements === 'on',
                medicines: aiMedicines === 'on',
                familyMetadata: aiFamily === 'on'
            }
        };

        await User.findByIdAndUpdate(activeUserId, { privacySettings });
        res.redirect('/profile?success=Privacy+settings+updated+successfully');
    } catch (error) {
        res.redirect('/profile?error=Failed+to+update+privacy+settings');
    }
});

app.post('/profile/password', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (newPassword !== confirmPassword) return res.redirect('/profile?error=New+passwords+do+not+match');
        if (newPassword.length < 8) return res.redirect('/profile?error=Password+must+be+at+least+8+characters');

        const user = await User.findById(activeUserId);
        if (!user.passwordHash) return res.redirect('/profile?error=Google+accounts+cannot+change+passwords+here');

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) return res.redirect('/profile?error=Current+password+is+incorrect');

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.redirect('/profile?success=Password+changed+successfully');
    } catch (error) {
        res.redirect('/profile?error=Failed+to+change+password');
    }
});

app.post('/family/add', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { name, relationship, contact, permissions } = req.body;
        let permObj = { emergencyInfo: false, medicalReports: false, healthSummary: false, medicines: false, symptoms: false, insurance: false, wearableData: false, healthTimeline: false };
        if (permissions) {
            const permArray = Array.isArray(permissions) ? permissions : [permissions];
            permArray.forEach(p => { if (permObj.hasOwnProperty(p)) permObj[p] = true; });
        }
        await FamilyMember.create({ userId: activeUserId, name: name.trim(), relationship, contact: contact.trim(), permissions: permObj });
        res.redirect('/profile?success=Family+member+added');
    } catch (error) {
        res.redirect('/profile');
    }
});

app.post('/family/:id/permissions', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { permissions } = req.body;
        let permObj = { emergencyInfo: false, medicalReports: false, healthSummary: false, medicines: false, symptoms: false, insurance: false, wearableData: false, healthTimeline: false };
        if (permissions) {
            const permArray = Array.isArray(permissions) ? permissions : [permissions];
            permArray.forEach(p => { if (permObj.hasOwnProperty(p)) permObj[p] = true; });
        }
        await FamilyMember.findOneAndUpdate({ _id: req.params.id, userId: activeUserId }, { permissions: permObj });
        res.redirect('/profile?success=Permissions+updated');
    } catch (error) {
        res.redirect('/profile');
    }
});

app.post('/family/:id/remove', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await FamilyMember.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/profile?success=Family+member+removed');
    } catch (error) {
        res.redirect('/profile');
    }
});

// ==========================================
// OCR / DOCUMENT ENGINE ROUTES (LOCAL ONLY)
// ==========================================

app.get('/ocr', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const selectedReportId = req.query.reportId;
        const reports = await MedicalReport.find({ userId: activeUserId }).sort({ createdAt: -1 });

        let latestReport = null;
        if (selectedReportId) {
            latestReport = reports.find(r => r._id.toString() === selectedReportId) || null;
        }
        if (!latestReport && reports.length > 0) {
            latestReport = reports[0];
        }

        res.render('dashboard/ocr.ejs', { reports, latestReport });
    } catch (error) {
        res.render('dashboard/ocr.ejs', { reports: [], latestReport: null });
    }
});

app.post('/reports/upload', requireAuth, upload.single('reportFile'), async (req, res) => {
    try {
        if (!req.file) return res.redirect('/ocr');
        const activeUserId = req.session.userId || req.user._id;

        // 1. Run OCR and AI Analysis using the local file
        const rawFallbackText = await extractTextFromFile(req.file.path, req.file.mimetype);
        const { parameters, aiExplanation, rawText } = await analyzeMedicalTextWithAI(req.file.path, req.file.mimetype, rawFallbackText);

        // 2. Save MedicalReport record securely using the local file
        const newReport = new MedicalReport({
            userId: activeUserId,
            originalFileName: req.file.originalname,
            storedFileName: req.file.filename, // Local file name
            filePath: req.file.path,
            mimeType: req.file.mimetype,
            fileSizeBytes: req.file.size,
            status: 'extracted',
            aiExplanation: aiExplanation,
            extractedData: {
                rawText: rawText,
                parameters: parameters
            }
        });
        await newReport.save();

        return res.redirect(`/ocr?reportId=${newReport._id}`);
    } catch (error) {
        console.error('[Upload & Processing Pipeline Error]:', error);
        // Clean up local file on error to save disk space
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
        }
        return res.redirect('/ocr');
    }
});

app.post('/reports/update/:id', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        if (!report) return res.redirect('/ocr');

        const { params } = req.body;
        const updatedParameters = params ? Object.values(params) : [];
        report.extractedData.parameters = updatedParameters;

        report.analysisData = {
            documentTitle: report.analysisData?.documentTitle || report.originalFileName,
            plainEnglishExplanation: '',
            doctorQuestions: [],
            generatedAt: null,
            dataHash: '',
            status: 'stale'
        };
        report.aiExplanation = 'Report parameters updated by user. Fresh analysis ready.';
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
                source: `Report:${report._id}`,
                recordedAt: report.createdAt
            });
        }

        return res.redirect(`/ocr?reportId=${report._id}`);
    } catch (error) {
        console.error('[HealthOrbit] Report Update Error:', error);
        return res.redirect('/ocr');
    }
});

app.post('/reports/delete/:id', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        
        if (report) {
            // Permanently delete the file from the local uploads folder
            const filePath = path.join(__dirname, 'uploads', report.storedFileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            
            await MedicalReport.findByIdAndDelete(report._id);
            await HealthMeasurement.deleteMany({ source: `Report:${report._id}`, userId: activeUserId });
        }
        return res.redirect('/ocr');
    } catch (error) {
        console.error('[Report Delete Error]:', error);
        return res.redirect('/ocr');
    }
});

// Secure Local File Delivery
app.get('/reports/:id/file', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || (req.user ? req.user._id : null);
        const report = await MedicalReport.findOne({ _id: req.params.id, userId: activeUserId });
        if (!report) return res.status(404).send('Document not found or unauthorized.');

        const filePath = path.join(__dirname, 'uploads', report.storedFileName);
        if (!fs.existsSync(filePath)) return res.status(404).send('Local file missing.');
        
        res.setHeader('Content-Type', report.mimeType || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${report.originalFileName}"`);
        res.sendFile(filePath);
    } catch (error) {
        console.error('[HealthOrbit] Secure File Delivery Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ==========================================
// INSURANCE & DIGITAL ID ROUTES
// ==========================================

app.get('/insurance', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        
        const policies = await InsurancePolicy.find({ userId: activeUserId }).sort({ isPrimary: -1, createdAt: -1 });
        const claims = await InsuranceClaim.find({ userId: activeUserId }).populate('policyId').sort({ claimDate: -1 });
        const digitalIds = await DigitalHealthId.find({ userId: activeUserId });

        let primaryPolicy = policies.find(p => p.isPrimary) || policies[0] || null;
        let totalCoverage = primaryPolicy ? primaryPolicy.coverageAmount : 0;
        let usedCoverage = 0;

        if (primaryPolicy) {
            const primaryClaims = claims.filter(c => 
                c.policyId && c.policyId._id.toString() === primaryPolicy._id.toString() &&
                ['Approved', 'Settled'].includes(c.status)
            );
            usedCoverage = primaryClaims.reduce((sum, claim) => sum + (claim.claimAmount || 0), 0);
        }

        res.render('dashboard/insurance.ejs', {
            policies,
            claims,
            digitalIds,
            primaryPolicy,
            totalCoverage,
            usedCoverage,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error('[HealthOrbit] Insurance Load Error:', error);
        res.redirect('/dashboard');
    }
});

app.post('/insurance/policies', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const existingCount = await InsurancePolicy.countDocuments({ userId: activeUserId });
        
        await InsurancePolicy.create({
            ...req.body,
            userId: activeUserId,
            isPrimary: existingCount === 0 
        });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
});

app.post('/insurance/digital-id', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await DigitalHealthId.create({ ...req.body, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
});

app.post('/insurance/claims', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const policy = await InsurancePolicy.findOne({ _id: req.body.policyId, userId: activeUserId });
        if (!policy) throw new Error('Unauthorized policy selected');

        await InsuranceClaim.create({ ...req.body, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
});

app.post('/insurance/digital-id/:id/delete', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await DigitalHealthId.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
});

app.post('/insurance/claims/:id/delete', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await InsuranceClaim.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/insurance');
    } catch (error) {
        res.redirect('/insurance');
    }
});

// ==========================================
// EXPORT / DELETE ACCOUNT ACTIONS
// ==========================================

app.get('/account/export', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const [user, reports, measurements, family, policies, claims, digitalIds] = await Promise.all([
            User.findById(activeUserId).select('-passwordHash -__v').lean(),
            MedicalReport.find({ userId: activeUserId }).select('-__v').lean(),
            HealthMeasurement.find({ userId: activeUserId }).select('-__v').lean(),
            FamilyMember.find({ userId: activeUserId }).select('-__v').lean(),
            InsurancePolicy.find({ userId: activeUserId }).select('-__v').lean(),
            InsuranceClaim.find({ userId: activeUserId }).select('-__v').lean(),
            DigitalHealthId.find({ userId: activeUserId }).select('-__v').lean()
        ]);
        
        const exportData = { profile: user, familyMembers: family, medicalReports: reports, healthMeasurements: measurements, insurancePolicies: policies, insuranceClaims: claims, digitalHealthIds: digitalIds, exportDate: new Date() };
        
        res.setHeader('Content-disposition', 'attachment; filename=HealthOrbit_Data_Export.json');
        res.setHeader('Content-type', 'application/json');
        res.write(JSON.stringify(exportData, null, 2));
        res.end();
    } catch (error) {
        res.redirect('/profile');
    }
});

app.post('/account/delete', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        
        const reports = await MedicalReport.find({ userId: activeUserId });
        reports.forEach(report => {
            if (report.storedFileName && !report.storedFileName.startsWith('http')) {
                const filePath = path.join(uploadsDir, report.storedFileName);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        });

        await MedicalReport.deleteMany({ userId: activeUserId });
        await HealthMeasurement.deleteMany({ userId: activeUserId });
        await FamilyMember.deleteMany({ userId: activeUserId });
        await InsurancePolicy.deleteMany({ userId: activeUserId });
        await InsuranceClaim.deleteMany({ userId: activeUserId });
        await DigitalHealthId.deleteMany({ userId: activeUserId });
        await User.findByIdAndDelete(activeUserId);
        
        req.logout((err) => {
            req.session.destroy(() => {
                res.clearCookie('connect.sid');
                res.redirect('/auth');
            });
        });
    } catch (error) {
        res.redirect('/profile');
    }
});

// ==========================================
// AI CONVERSATION MANAGEMENT & CHAT ROUTES
// ==========================================

app.get('/api/conversations', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const conversations = await AIConversation.find({ userId: activeUserId })
            .sort({ updatedAt: -1 })
            .limit(50);
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load conversations' });
    }
});

app.get('/api/conversations/:id/messages', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const conversation = await AIConversation.findOne({ _id: req.params.id, userId: activeUserId });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found or unauthorized' });

        const messages = await AIMessage.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
        res.json({ conversation, messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
});

app.post('/api/conversations/:id/rename', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { title } = req.body;
        
        if (!title || title.trim().length === 0) return res.status(400).json({ error: 'Title is required' });

        const conversation = await AIConversation.findOneAndUpdate(
            { _id: req.params.id, userId: activeUserId },
            { title: title.trim().substring(0, 60) },
            { new: true }
        );
        
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
        res.json(conversation);
    } catch (error) {
        res.status(500).json({ error: 'Failed to rename conversation' });
    }
});

app.post('/api/conversations/:id/delete', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const conversation = await AIConversation.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        if (conversation) {
            await AIMessage.deleteMany({ conversationId: conversation._id });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

app.post('/api/chat/reset', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await AIConversation.deleteMany({ userId: activeUserId });
        await AIMessage.deleteMany({ userId: activeUserId });
        
        req.session.chatHistory = []; 

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({ success: true });
        }
        res.redirect('/profile?success=All+AI+history+permanently+cleared');
    } catch (error) {
        res.redirect('/profile?error=Failed+to+clear+history');
    }
});

app.post('/api/chat', requireAuth, async (req, res) => {
    try {
        let { message, conversationId, currentPage, selectedRecordId } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const activeUserId = req.session.userId || req.user._id;
        
        let conversation;
        if (conversationId) {
            conversation = await AIConversation.findOne({ _id: conversationId, userId: activeUserId });
            if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
        } else {
            let generatedTitle = message.trim().substring(0, 35);
            if (message.length > 35) generatedTitle += '...';
            
            conversation = await AIConversation.create({
                userId: activeUserId,
                title: generatedTitle,
                selectedRecordId: selectedRecordId || null
            });
        }

        await AIMessage.create({
            userId: activeUserId,
            conversationId: conversation._id,
            role: 'user',
            content: message,
            currentPage,
            selectedRecordId
        });

        let userContextJSON = "{}";
        try { 
            userContextJSON = await buildUserAIContext(activeUserId, { currentPage, selectedRecordId }, message); 
        } catch (err) { 
            console.error('[HealthOrbit Context Error]:', err.message);
            userContextJSON = JSON.stringify({ error: "Data retrieval unavailable." }); 
        }

        const recentMessages = await AIMessage.find({ conversationId: conversation._id })
            .sort({ createdAt: -1 })
            .limit(10)
            .lean();
        
        const chatHistory = recentMessages.reverse().map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        chatHistory.pop();

        const reply = await chatWithMeshAPI(message, userContextJSON, chatHistory);
        
        await AIMessage.create({
            userId: activeUserId,
            conversationId: conversation._id,
            role: 'assistant',
            content: reply,
            currentPage,
            selectedRecordId
        });

        conversation.lastMessageAt = new Date();
        await conversation.save();

        res.json({ 
            reply: reply,
            conversationId: conversation._id,
            conversationTitle: conversation.title
        });

    } catch (error) {
        console.error('[HealthOrbit Chat API Error]:', error.message);
        res.status(500).json({ error: 'Failed to process chat request' });
    }
});

app.post('/api/chat/regenerate', requireAuth, async (req, res) => {
    try {
        const { conversationId } = req.body;
        const activeUserId = req.session.userId || req.user._id;

        const conversation = await AIConversation.findOne({ _id: conversationId, userId: activeUserId });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

        const lastMessages = await AIMessage.find({ conversationId: conversation._id }).sort({ createdAt: -1 }).limit(2);

        if (lastMessages.length < 2 || lastMessages[0].role !== 'assistant' || lastMessages[1].role !== 'user') {
            return res.status(400).json({ error: 'Cannot regenerate. Exchange is invalid.' });
        }

        const assistantMsgToReplace = lastMessages[0];
        const userMsgToReplay = lastMessages[1];

        let userContextJSON = "{}";
        try { 
            userContextJSON = await buildUserAIContext(activeUserId, { currentPage: userMsgToReplay.currentPage, selectedRecordId: userMsgToReplay.selectedRecordId }, userMsgToReplay.content); 
        } catch (err) { 
            userContextJSON = JSON.stringify({ error: "Data retrieval unavailable." }); 
        }

        const earlierMessages = await AIMessage.find({ 
            conversationId: conversation._id,
            createdAt: { $lt: userMsgToReplay.createdAt }
        }).sort({ createdAt: -1 }).limit(10).lean();

        const chatHistory = earlierMessages.reverse().map(msg => ({ role: msg.role, content: msg.content }));
        const reply = await chatWithMeshAPI(userMsgToReplay.content, userContextJSON, chatHistory);

        assistantMsgToReplace.content = reply;
        await assistantMsgToReplace.save();

        res.json({ reply: reply });
    } catch (error) {
        console.error('[HealthOrbit Chat Regenerate Error]:', error.message);
        res.status(500).json({ error: 'Failed to regenerate response' });
    }
});

// ==========================================
// LIVE NOTIFICATION CHECKER API
// ==========================================
app.get('/api/notifications/check', async (req, res) => {
    try {
        const activeUserId = req.session?.userId || req.user?._id;
        if (!activeUserId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const unread = await Notification.find({ userId: activeUserId, read: false });
        
        if (unread.length > 0) {
            await Notification.updateMany({ userId: activeUserId, read: false }, { read: true });
            return res.json({ newNotifications: unread });
        }
        
        res.json({ newNotifications: [] });
    } catch (err) {
        console.error('[Notification Check Error]:', err.message);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// ==========================================
// EMERGENCY & MEDICAL NETWORK ROUTES
// ==========================================

app.get('/emergency', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const user = await User.findById(activeUserId).lean();
        const activeAlert = await EmergencyAlert.findOne({ userId: activeUserId, status: 'active' }).sort({ createdAt: -1 });
        
        const communityRequests = await EmergencyRequest.find({ 
            status: 'active', 
            expiresAt: { $gt: new Date() } 
        }).populate('userId', 'fullName phone donorProfile').sort({ createdAt: -1 }).limit(20).lean();

        res.render('dashboard/emergency.ejs', { 
            userName: req.session.userName || user.fullName,
            userEmail: req.session.userEmail || user.email,
            user,
            activeAlert,
            communityRequests,
            csrfToken: req.session.csrfToken,
            successMsg: req.query.success,
            errorMsg: req.query.error
        });
    } catch (error) {
        console.error('[HealthOrbit] Emergency Load Error:', error);
        res.redirect('/dashboard');
    }
});

app.post('/emergency/sos', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { latitude, longitude, accuracy } = req.body;
        const user = await User.findById(activeUserId);

        const recentAlert = await EmergencyAlert.findOne({ 
            userId: activeUserId, 
            status: 'active',
            createdAt: { $gt: new Date(Date.now() - 2 * 60 * 1000) }
        });

        if (!recentAlert) {
            await EmergencyAlert.create({
                userId: activeUserId,
                latitude: latitude || null,
                longitude: longitude || null,
                accuracy: accuracy || null,
                locationCapturedAt: latitude ? new Date() : null,
                emergencyContactName: user.emergencyContactName || 'None',
                emergencyContactPhone: user.emergencyContactPhone || '',
                bloodGroup: user.bloodGroup || 'Unknown'
            });
        }
        res.json({ success: true, message: "Emergency alert saved in HealthOrbit." });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create SOS alert' });
    }
});

app.post('/emergency/sos/resolve', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await EmergencyAlert.updateMany({ userId: activeUserId, status: 'active' }, { status: 'resolved' });
        res.redirect('/emergency?success=Emergency+alert+resolved');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+resolve+alert');
    }
});

app.post('/emergency/donor-profile', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { bloodDonorEnabled, organDonorPreference, contactSharingEnabled } = req.body;
        
        await User.findByIdAndUpdate(activeUserId, {
            donorProfile: {
                bloodDonorEnabled: bloodDonorEnabled === 'on',
                organDonorPreference: organDonorPreference,
                contactSharingEnabled: contactSharingEnabled === 'on'
            }
        });
        res.redirect('/emergency?success=Donor+profile+updated');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+update+donor+profile');
    }
});

app.post('/emergency/community/request', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const { requestType, title, description, bloodGroup, hospitalName, urgency } = req.body;

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        await EmergencyRequest.create({
            userId: activeUserId,
            requestType,
            title: title.trim().substring(0, 100),
            description: description.trim().substring(0, 500),
            bloodGroup: requestType === 'Blood' ? bloodGroup : null,
            hospitalName: hospitalName.trim(),
            urgency,
            expiresAt
        });

        res.redirect('/emergency?success=Community+request+broadcasted');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+broadcast+request');
    }
});

app.post('/emergency/community/:id/delete', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await EmergencyRequest.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/emergency?success=Request+removed');
    } catch (error) {
        res.redirect('/emergency?error=Failed+to+remove+request');
    }
});

// ==========================================
// MEDICINES & SYMPTOMS ROUTES
// ==========================================

app.get('/medicines', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        
        const activeMeds = await Medicine.find({ userId: activeUserId, active: true });
        const recentSymptoms = await SymptomEntry.find({ userId: activeUserId }).sort({ recordedAt: -1 }).limit(10);
            
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const todayLogs = await MedicineLog.find({ userId: activeUserId, date: todayStr });
        let scheduleToday = [];
        
        activeMeds.forEach(med => {
            if(med.times && med.times.length > 0) {
                med.times.forEach(time => {
                    const log = todayLogs.find(l => l.medicineId.equals(med._id) && l.scheduledTime === time);
                    let status = 'Upcoming';
                    if (log) {
                        status = log.status.charAt(0).toUpperCase() + log.status.slice(1);
                    } else if (time < currentTimeStr) {
                        status = 'Missed';
                    }
                    
                    scheduleToday.push({
                        medicine: med,
                        time: time,
                        status: status,
                        logId: log ? log._id : null
                    });
                });
            }
        });
        
        scheduleToday.sort((a, b) => a.time.localeCompare(b.time));

        res.render('dashboard/medicines.ejs', { 
            userName: req.session.userName || req.user.fullName,
            userEmail: req.session.userEmail || req.user.email,
            medicines: activeMeds,
            scheduleToday: scheduleToday,
            symptoms: recentSymptoms
        });
    } catch (error) {
        console.error('[HealthOrbit] Medicines Load Error:', error);
        res.redirect('/dashboard');
    }
});

app.post('/medicines/add', requireAuth, async (req, res) => {
    try {
        const { name, dosage, frequency, duration, times } = req.body;
        let timesArray = [];
        if (times) {
            timesArray = Array.isArray(times) ? times : [times];
        }

        await Medicine.create({
            userId: req.session.userId || req.user._id,
            name: String(name).trim(),
            dosage: String(dosage).trim(),
            frequency: String(frequency || 'Daily').trim(),
            instructions: String(duration || '').trim(),
            times: timesArray
        });
        res.redirect('/medicines');
    } catch (err) {
        console.error(err);
        res.redirect('/medicines');
    }
});

app.post('/medicines/log/:medId', requireAuth, async (req, res) => {
    try {
        const { medId } = req.params;
        const { time, status } = req.body;
        const todayStr = new Date().toISOString().split('T')[0];
        
        let log = await MedicineLog.findOne({ 
            userId: req.session.userId || req.user._id, 
            medicineId: medId, 
            date: todayStr, 
            scheduledTime: time 
        });

        if (!log) {
            log = new MedicineLog({
                userId: req.session.userId || req.user._id,
                medicineId: medId,
                date: todayStr,
                scheduledTime: time
            });
        }
        
        log.status = status === 'taken' ? 'taken' : 'skipped';
        log.takenAt = new Date();
        await log.save();
        
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
});

// DELETE MEDICINE
app.post('/medicines/delete/:id', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        const deletedMed = await Medicine.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        if (deletedMed) {
            await MedicineLog.deleteMany({ medicineId: req.params.id, userId: activeUserId });
        }
        res.redirect('/medicines');
    } catch (err) {
        console.error('[HealthOrbit] Medicine Delete Error:', err);
        res.redirect('/medicines');
    }
});

app.post('/symptoms/add', requireAuth, async (req, res) => {
    try {
        const { symptomType, severity, notes } = req.body;
        await SymptomEntry.create({
            userId: req.session.userId || req.user._id,
            symptom: String(symptomType).trim(),
            severity: String(severity).trim(),
            notes: String(notes || '').trim()
        });
        res.redirect('/medicines');
    } catch (err) {
        res.redirect('/medicines');
    }
});

app.post('/symptoms/quick', requireAuth, async (req, res) => {
    try {
        const { symptomName } = req.body;
        await SymptomEntry.create({
            userId: req.session.userId || req.user._id,
            symptom: String(symptomName).trim(),
            severity: 'Mild',
            notes: 'Quick logged from dashboard.'
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// DELETE SYMPTOM
app.post('/symptoms/delete/:id', requireAuth, async (req, res) => {
    try {
        const activeUserId = req.session.userId || req.user._id;
        await SymptomEntry.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        res.redirect('/medicines');
    } catch (err) {
        console.error('[HealthOrbit] Symptom Delete Error:', err);
        res.redirect('/medicines');
    }
});

// ==========================================
// NUTRITION ROUTES
// ==========================================

app.get('/nutrition', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId || req.user._id;
        const now = new Date();
        const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

        let goals = await WellnessGoal.findOne({ userId });
        if (!goals) {
            goals = await WellnessGoal.create({ userId });
        }

        const todayMeals = await Meal.find({ userId, dateStr: todayStr }).sort({ createdAt: 1 });
        let nutritionTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
        todayMeals.forEach(m => {
            nutritionTotals.calories += (m.calories || 0);
            nutritionTotals.protein += (m.proteinGrams || 0);
            nutritionTotals.carbs += (m.carbsGrams || 0);
            nutritionTotals.fat += (m.fatGrams || 0);
        });

        const waterLogs = await HydrationLog.find({ userId, dateStr: todayStr });
        const totalWaterMl = waterLogs.reduce((sum, log) => sum + log.amountMl, 0);

        const todayHabits = await LifestyleHabit.find({ userId, dateStr: todayStr });

        const latestSteps = await HealthMeasurement.findOne({ userId, metricName: { $regex: /steps/i } }).sort({ recordedAt: -1 });
        const latestSleep = await HealthMeasurement.findOne({ userId, metricName: { $regex: /sleep/i } }).sort({ recordedAt: -1 });

        let scoreComponents = [];
        if (goals.calorieTarget > 0) {
            scoreComponents.push(Math.min((nutritionTotals.calories / goals.calorieTarget) * 100, 100));
        }
        if (goals.waterTargetMl > 0) {
            scoreComponents.push(Math.min((totalWaterMl / goals.waterTargetMl) * 100, 100));
        }
        
        let lifestyleScore = null;
        if (scoreComponents.length > 0) {
            lifestyleScore = Math.round(scoreComponents.reduce((a, b) => a + b, 0) / scoreComponents.length);
        }

        res.render('dashboard/nutrition.ejs', {
            userName: req.session.userName || req.user.fullName,
            todayMeals,
            nutritionTotals,
            totalWaterMl,
            goals,
            todayHabits,
            lifestyleScore,
            activityData: latestSteps || null,
            sleepData: latestSleep || null,
            todayStr
        });
    } catch (err) {
        console.error('[HealthOrbit] Nutrition Route Error:', err);
        res.redirect('/dashboard');
    }
});

app.post('/nutrition/meals', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        
        await Meal.create({
            userId,
            mealType: req.body.mealType,
            name: req.body.name,
            calories: Math.max(0, parseInt(req.body.calories) || 0),
            proteinGrams: Math.max(0, parseInt(req.body.proteinGrams) || 0),
            carbsGrams: Math.max(0, parseInt(req.body.carbsGrams) || 0),
            fatGrams: Math.max(0, parseInt(req.body.fatGrams) || 0),
            dateStr: todayStr
        });
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
});

app.post('/nutrition/meals/:id/delete', requireAuth, async (req, res) => {
    try {
        await Meal.findOneAndDelete({ _id: req.params.id, userId: req.session.userId || req.user._id });
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
});

app.post('/nutrition/water', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const amount = parseInt(req.body.amountMl);
        
        if (amount > 0) {
            await HydrationLog.create({ userId, amountMl: amount, dateStr: todayStr });
        }
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
});

app.post('/nutrition/water/undo', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        
        const lastLog = await HydrationLog.findOne({ userId, dateStr: todayStr }).sort({ createdAt: -1 });
        if (lastLog) {
            await HydrationLog.findByIdAndDelete(lastLog._id);
        }
        res.redirect('/nutrition');
    } catch (err) {
        res.redirect('/nutrition');
    }
});

app.post('/nutrition/habits', requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId || req.user._id;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const { habitKey, label, completed } = req.body;
        
        let habit = await LifestyleHabit.findOne({ userId, habitKey, dateStr: todayStr });
        if (habit) {
            habit.completed = completed === 'true';
            await habit.save();
        } else {
            await LifestyleHabit.create({
                userId, habitKey, label, dateStr: todayStr, completed: completed === 'true'
            });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});





app.get('/test-telegram', async (req, res) => {
    const success = await sendTelegramAlert('🚨 *Live Test from HealthOrbit Web Server!* Notification engine is working.');
    if (success) {
        return res.send('Telegram test message sent successfully! Check your phone.');
    }
    return res.status(500).send('Failed to send Telegram message. Check Render logs and environment variables.');
});

// START SERVER
app.listen(PORT, () => {
    console.log(`[HealthOrbit] Server running on http://localhost:${PORT}`);
});