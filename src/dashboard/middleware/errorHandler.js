/**
 * Error handling middleware for dashboard & API
 */

// Escape لعرض رسالة الخطأ داخل HTML بدون XSS
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function errorHandler(err, req, res, next) {
    console.error(`[DASHBOARD ERROR] ${req.method} ${req.originalUrl}:`, err);

    const status = err.status || err.statusCode || 500;
    const message = err.message || 'حدث خطأ داخلي في الخادم';

    if (req.originalUrl.startsWith('/api/')) {
        return res.status(status).json({
            success: false,
            error: message,
            code: err.code || 'INTERNAL_ERROR'
        });
    }

    return res.status(status).send(`
        <div style="background:#0b0d14;color:#fff;font-family:sans-serif;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;">
            <h2 style="color:#ef4444;font-size:24px;margin-bottom:10px;">عذراً، حدث خطأ أثناء معالجة الطلب</h2>
            <p style="color:#aaa;max-width:550px;margin-bottom:20px;line-height:1.6;">${escHtml(message)}</p>
            <a href="/dashboard/manage" style="background:#9333ea;color:#fff;padding:10px 24px;border-radius:12px;text-decoration:none;font-weight:bold;">العودة للوحة التحكم</a>
        </div>
    `);
}

module.exports = {
    errorHandler
};
