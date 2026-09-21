const User = require('../models/User');
const MedicalReport = require('../models/MedicalReport');
const AIConversation = require('../models/AIConversation');
const AIMessage = require('../models/AIMessage');
const { buildUserAIContext } = require('../services/contextService');
const { chatWithMeshAPI } = require('../services/aiService');
const { getHealthAnalytics, generateSafeAISummary, buildReportSpecificAnalysis } = require('../services/healthAnalysisService');

const getAssistantWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || (req.user ? req.user._id : null);
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
};

const getAnalysisWorkspace = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const requestedReportId = req.query.reportId || null;

        const user = await User.findById(activeUserId).lean();
        const aiAccess = user.privacySettings?.aiAccess || {
            medicalReports: true, healthMeasurements: true, medicines: true, symptoms: true
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
};

const getConversations = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const conversations = await AIConversation.find({ userId: activeUserId })
            .sort({ updatedAt: -1 })
            .limit(50);
        res.json(conversations);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load conversations' });
    }
};

const getMessages = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const conversation = await AIConversation.findOne({ _id: req.params.id, userId: activeUserId });
        if (!conversation) return res.status(404).json({ error: 'Conversation not found or unauthorized' });

        const messages = await AIMessage.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
        res.json({ conversation, messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load messages' });
    }
};

const renameConversation = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
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
};

const deleteConversation = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        const conversation = await AIConversation.findOneAndDelete({ _id: req.params.id, userId: activeUserId });
        if (conversation) {
            await AIMessage.deleteMany({ conversationId: conversation._id });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
};

const resetChatHistory = async (req, res) => {
    try {
        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        await AIConversation.deleteMany({ userId: activeUserId });
        await AIMessage.deleteMany({ userId: activeUserId });
        
        req.session.chatHistory = []; 

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.json({ success: true });
        }
        res.redirect('/profile?success=All+AI+history+permanently+cleared');
    } catch (error) {
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            return res.status(500).json({ error: 'Failed to clear history' });
        }
        res.redirect('/profile?error=Failed+to+clear+history');
    }
};

const processChat = async (req, res) => {
    try {
        let { message, conversationId, currentPage, selectedRecordId } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const activeUserId = req.userContextId || req.session.userId || req.user._id;
        
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
        
        const chatHistory = recentMessages.reverse().map(msg => ({ role: msg.role, content: msg.content }));
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
};

const regenerateChat = async (req, res) => {
    try {
        const { conversationId } = req.body;
        const activeUserId = req.userContextId || req.session.userId || req.user._id;

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
};

module.exports = {
    getAssistantWorkspace,
    getAnalysisWorkspace,
    getConversations,
    getMessages,
    renameConversation,
    deleteConversation,
    resetChatHistory,
    processChat,
    regenerateChat
};