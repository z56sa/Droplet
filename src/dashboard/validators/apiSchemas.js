const { z } = require('zod');

/**
 * Validation Middleware generator using Zod
 */
function validate(schema, source = 'body') {
    return (req, res, next) => {
        try {
            const dataToValidate = source === 'params' ? req.params : (source === 'query' ? req.query : req.body);
            const parsed = schema.parse(dataToValidate);
            if (source === 'body') req.body = parsed;
            else if (source === 'query') req.query = parsed;
            else if (source === 'params') req.params = parsed;
            next();
        } catch (err) {
            if (err instanceof z.ZodError) {
                const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
                return res.status(400).json({
                    success: false,
                    error: `Validation Error: ${issues}`,
                    details: err.issues
                });
            }
            return res.status(400).json({
                success: false,
                error: 'Invalid input data'
            });
        }
    };
}

// =============================================
// Schemas
// =============================================

// Settings Validation
const settingsSchema = z.object({
    prefix: z.string().max(10).optional(),
    language: z.enum(['ar', 'en']).optional(),
    leveling_enabled: z.union([z.number(), z.string(), z.boolean()]).optional(),
    level_channel: z.string().max(32).optional(),
    level_message: z.string().max(1000).optional(),
    level_voice_msg: z.string().max(1000).optional(),
    level_multiplier: z.union([z.number(), z.string()]).optional(),
    welcome_enabled: z.union([z.number(), z.string(), z.boolean()]).optional(),
    welcome_channel: z.string().max(32).optional(),
    welcome_message: z.string().max(2000).optional(),
    leave_enabled: z.union([z.number(), z.string(), z.boolean()]).optional(),
    leave_channel: z.string().max(32).optional(),
    leave_message: z.string().max(2000).optional(),
    tickets_category: z.string().max(32).optional(),
    tickets_transcripts_channel: z.string().max(32).optional(),
    tickets_support_role: z.string().max(32).optional(),
    anti_nuke_enabled: z.union([z.number(), z.string(), z.boolean()]).optional(),
    anti_spam: z.union([z.number(), z.string(), z.boolean()]).optional(),
    anti_links: z.union([z.number(), z.string(), z.boolean()]).optional(),
    anti_mass_ban: z.union([z.number(), z.string(), z.boolean()]).optional(),
    anti_mass_kick: z.union([z.number(), z.string(), z.boolean()]).optional(),
    anti_role_delete: z.union([z.number(), z.string(), z.boolean()]).optional(),
    anti_channel_delete: z.union([z.number(), z.string(), z.boolean()]).optional(),
    bot_nickname: z.string().max(32).nullable().optional()
}).passthrough(); // allows other dashboard settings fields cleanly

// Whitelist Validation
const whitelistSchema = z.object({
    userId: z.string().min(15, 'Invalid Discord User ID').max(22),
    type: z.enum(['whitelist', 'antimod']).optional().default('whitelist')
});

// AutoResponder Validation
const autoresponderSchema = z.object({
    trigger_word: z.string().min(1, 'المحفز مطلوب').max(255),
    reply_text: z.string().min(1, 'الرد مطلوب').max(2000),
    match_type: z.enum(['exact', 'contains', 'startswith']).optional().default('exact'),
    enabled: z.union([z.number(), z.boolean()]).optional()
}).passthrough();

// Warn Punishments Validation
const warnPunishmentSchema = z.object({
    warnCount: z.union([z.number(), z.string()]).transform(v => parseInt(v, 10)).pipe(z.number().int().min(1).max(20)),
    actionType: z.enum(['mute', 'kick', 'ban', 'temp_ban', 'timeout'])
});

// Level Rewards Validation
const levelRewardSchema = z.object({
    level: z.union([z.number(), z.string()]).transform(v => parseInt(v, 10)).pipe(z.number().int().min(1).max(1000)),
    roleId: z.string().min(15).max(22),
    rewardType: z.enum(['text', 'voice', 'shared']).optional().default('text'),
    voiceLevel: z.union([z.number(), z.string()]).optional().default(0)
});

// Send Embed Validation
const sendEmbedSchema = z.object({
    channelId: z.string().min(15).max(22),
    color: z.string().max(10).optional(),
    title: z.string().max(256).optional(),
    titleUrl: z.string().url().max(1000).optional().or(z.literal('')),
    desc: z.string().max(4096).optional(),
    author: z.string().max(256).optional(),
    authorIcon: z.string().url().optional().or(z.literal('')),
    image: z.string().url().optional().or(z.literal('')),
    thumbnail: z.string().url().optional().or(z.literal('')),
    footer: z.string().max(2048).optional(),
    footerIcon: z.string().url().optional().or(z.literal('')),
    timestamp: z.boolean().optional(),
    fields: z.array(z.object({
        name: z.string().max(256).optional().default('\u200b'),
        value: z.string().max(1024).optional().default('\u200b'),
        inline: z.boolean().optional().default(false)
    })).optional()
}).refine(data => data.title || data.desc, {
    message: 'العنوان أو محتوى الوصف مطلوب على الأقل'
});

// Giveaway Validation
const giveawaySchema = z.object({
    prize: z.string().min(1, 'اسم الجائزة مطلوب').max(256),
    channelId: z.string().min(15).max(22),
    duration: z.string().optional().default('24h'),
    winners: z.union([z.number(), z.string()]).optional().default(1),
    desc: z.string().max(1000).optional(),
    color: z.string().max(10).optional(),
    image: z.string().url().optional().or(z.literal('')),
    emoji: z.string().max(50).optional(),
    reqRole: z.string().max(22).optional().or(z.literal('')),
    btnStyle: z.enum(['Primary', 'Success', 'Danger', 'Secondary']).optional().default('Primary'),
    entryMode: z.enum(['button', 'reaction']).optional().default('button'),
    notifyWinners: z.union([z.number(), z.string(), z.boolean()]).optional().default(1)
});

// Suggestions Validation
const suggestionSchema = z.object({
    content: z.string().min(1, 'محتوى الاقتراح مطلوب').max(2000),
    title: z.string().max(256).optional(),
    category: z.string().max(100).optional()
});

// Staff Points Validation
const staffPointsSchema = z.object({
    userId: z.string().min(15).max(22),
    points: z.union([z.number(), z.string()]).transform(v => parseInt(v, 10)).pipe(z.number().int())
});

// Invites Bonus Validation
const inviteBonusSchema = z.object({
    userId: z.string().min(15).max(22),
    amount: z.union([z.number(), z.string()]).transform(v => parseInt(v, 10)).pipe(z.number().int())
});

// AI Chat Validation
const aiChatSchema = z.object({
    prompt: z.string().min(1, 'نص السؤال مطلوب').max(1500)
});

module.exports = {
    validate,
    settingsSchema,
    whitelistSchema,
    autoresponderSchema,
    warnPunishmentSchema,
    levelRewardSchema,
    sendEmbedSchema,
    giveawaySchema,
    suggestionSchema,
    staffPointsSchema,
    inviteBonusSchema,
    aiChatSchema
};
