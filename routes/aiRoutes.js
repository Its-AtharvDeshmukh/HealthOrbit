const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/ai-assistant', requireAuth, aiController.getAssistantWorkspace);
router.get('/ai-analysis', requireAuth, aiController.getAnalysisWorkspace);

// AI Conversation APIs
router.get('/api/conversations', requireAuth, aiController.getConversations);
router.get('/api/conversations/:id/messages', requireAuth, aiController.getMessages);
router.post('/api/conversations/:id/rename', requireAuth, aiController.renameConversation);
router.post('/api/conversations/:id/delete', requireAuth, aiController.deleteConversation);

// AI Chat Interaction APIs
router.post('/api/chat', requireAuth, aiController.processChat);
router.post('/api/chat/regenerate', requireAuth, aiController.regenerateChat);
router.post('/api/chat/reset', requireAuth, aiController.resetChatHistory);

module.exports = router;