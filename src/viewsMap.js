/**
 * @file viewsMap.js
 * @description
 * Compatibility entry point for the dashboard server.
 *
 * This file was previously a renamed/truncated copy of the dashboard server,
 * which left incomplete JavaScript such as "/* ... */" and duplicated server
 * logic. The real implementation now lives in src/dashboard/server.js.
 *
 * Keeping this small re-export preserves compatibility for any older code
 * that still requires("./viewsMap") without maintaining a second dashboard
 * server implementation.
 *
 * Localization (AR ↔ EN) is intentionally handled by:
 *   src/dashboard/public/i18n.js
 *
 * Do not put language-switching logic here. The dashboard's existing
 * zenoI18n/data-lang-toggle integration remains untouched.
 */

'use strict';

module.exports = require('./dashboard/server');
