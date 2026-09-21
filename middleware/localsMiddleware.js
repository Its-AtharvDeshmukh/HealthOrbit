const crypto = require('crypto');

const localsMiddleware = (req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    res.locals.userName = req.session.userName || null;
    res.locals.userEmail = req.session.userEmail || null;
    next();
};

module.exports = localsMiddleware;