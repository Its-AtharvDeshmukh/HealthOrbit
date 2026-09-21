const requireAuth = (req, res, next) => {
    if ((req.session && req.session.userId) || (req.isAuthenticated && req.isAuthenticated())) {
        // Unify user identity securely so controllers only need to read req.userContextId
        req.userContextId = req.session.userId || (req.user ? req.user._id : null);
        return next();
    }
    return res.redirect('/auth');
};

module.exports = { requireAuth };