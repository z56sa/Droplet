/**
 * Automated Unit & Integration Tests for Auth Middleware & Validation Schemas
 */

const assert = require('assert');
const { requireAuth, createGuildAuthMiddleware } = require('../src/dashboard/middleware/auth');
const {
    settingsSchema,
    whitelistSchema,
    warnPunishmentSchema,
    aiChatSchema
} = require('../src/dashboard/validators/apiSchemas');

console.log('🧪 Starting Droplet Dashboard Security & Validation Tests...\n');

let passed = 0;
let failed = 0;

function test(title, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${title}`);
        passed++;
    } catch (err) {
        console.error(`❌ FAIL: ${title}`);
        console.error(err.message);
        failed++;
    }
}

async function asyncTest(title, fn) {
    try {
        await fn();
        console.log(`✅ PASS: ${title}`);
        passed++;
    } catch (err) {
        console.error(`❌ FAIL: ${title}`);
        console.error(err.message);
        failed++;
    }
}

(async () => {
    // 1. Auth Middleware Test: Unauthenticated User
    test('requireAuth blocks request when session.user is absent', () => {
        let statusCode = null;
        let jsonResponse = null;

        const req = { originalUrl: '/api/guild/123/settings', session: {} };
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: (data) => { jsonResponse = data; }
                };
            }
        };
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireAuth(req, res, next);

        assert.strictEqual(statusCode, 401);
        assert.strictEqual(nextCalled, false);
        assert.strictEqual(jsonResponse.success, false);
    });

    // 2. Auth Middleware Test: Authenticated User Next Called
    test('requireAuth allows request when session.user is present', () => {
        const req = { originalUrl: '/api/guild/123/settings', session: { user: { id: '999' } } };
        const res = {};
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        requireAuth(req, res, next);

        assert.strictEqual(nextCalled, true);
    });

    // 3. Real-Time Guild Auth Test: Guild Owner Allowed
    await asyncTest('createGuildAuthMiddleware permits guild owner without needing member fetch', async () => {
        const mockClient = {
            guilds: {
                cache: new Map([
                    ['123', { id: '123', ownerId: 'user_owner', members: { cache: new Map() } }]
                ])
            }
        };

        const middleware = createGuildAuthMiddleware(mockClient);
        const req = {
            originalUrl: '/api/guild/123/settings',
            params: { guildId: '123' },
            session: { user: { id: 'user_owner' } }
        };
        const res = {};
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await middleware(req, res, next);
        assert.strictEqual(nextCalled, true);
        assert.strictEqual(req.isGuildOwner, true);
    });

    // 4. Real-Time Guild Auth Test: Non-admin Blocked
    await asyncTest('createGuildAuthMiddleware blocks member lacking Administrator or ManageGuild permissions', async () => {
        const mockClient = {
            guilds: {
                cache: new Map([
                    ['123', {
                        id: '123',
                        ownerId: 'different_user',
                        members: {
                            cache: new Map([
                                ['user_regular', { permissions: { has: () => false } }]
                            ])
                        }
                    }]
                ])
            }
        };

        const middleware = createGuildAuthMiddleware(mockClient);
        const req = {
            originalUrl: '/api/guild/123/settings',
            params: { guildId: '123' },
            session: { user: { id: 'user_regular' } }
        };
        let statusCode = null;
        const res = {
            status: (code) => {
                statusCode = code;
                return {
                    json: () => {}
                };
            }
        };
        let nextCalled = false;
        const next = () => { nextCalled = true; };

        await middleware(req, res, next);
        assert.strictEqual(statusCode, 403);
        assert.strictEqual(nextCalled, false);
    });

    // 5. Validation Test: Whitelist Schema Valid ID
    test('whitelistSchema accepts valid Discord ID', () => {
        const result = whitelistSchema.parse({
            userId: '1506005273893146775',
            type: 'whitelist'
        });
        assert.strictEqual(result.userId, '1506005273893146775');
    });

    // 6. Validation Test: Whitelist Schema Rejects Short Invalid ID
    test('whitelistSchema rejects malformed short Discord ID', () => {
        assert.throws(() => {
            whitelistSchema.parse({
                userId: '123',
                type: 'whitelist'
            });
        });
    });

    // 7. Validation Test: Warn Punishment Schema Valid Action
    test('warnPunishmentSchema parses valid action and transforms count', () => {
        const parsed = warnPunishmentSchema.parse({
            warnCount: '3',
            actionType: 'timeout'
        });
        assert.strictEqual(parsed.warnCount, 3);
        assert.strictEqual(parsed.actionType, 'timeout');
    });

    // 8. Validation Test: AI Chat Schema Empty Prompt Rejection
    test('aiChatSchema rejects empty prompt string', () => {
        assert.throws(() => {
            aiChatSchema.parse({ prompt: '' });
        });
    });

    console.log(`\n🏁 Test Results: ${passed} Passed, ${failed} Failed.`);
    if (failed > 0) process.exit(1);
})();
