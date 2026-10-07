/**
 * @module staffShiftService
 * @description خلفية مراقبة ساعات الإدارة وتسجيل الخروج التلقائي بعد مدة معينة
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../database');

class StaffShiftService {
    constructor(client) {
        this.client = client;
        this.running = false;
        this._interval = null;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this._interval = setInterval(() => this._tick(), 60 * 1000);
        console.log('[StaffShiftService] ✅ خدمة مراقبة شفتات الإدارة تعمل بنجاح (فحص كل دقيقة)');
    }

    stop() {
        if (this._interval) clearInterval(this._interval);
        this.running = false;
    }

    async _tick() {
        try {
            const activeShifts = db.getAllActiveShifts ? db.getAllActiveShifts() : [];
            if (!activeShifts || activeShifts.length === 0) return;

            const now = Math.floor(Date.now() / 1000);

            for (const shift of activeShifts) {
                const { guild_id, user_id, start_time } = shift;
                const settings = db.getGuildSettings(guild_id);
                if (settings.staff_auto_logout === 0) continue;

                // ─── Fallback: فحص الحضور مباشرة (بديل عن presenceUpdate) ───
                // إذا كان المستخدم offline/invisible في الكاش، نطرده فوراً
                const guild = this.client.guilds.cache.get(guild_id);
                if (guild) {
                    const member = guild.members.cache.get(user_id);
                    const presence = member?.presence;
                    const status = presence?.status;
                    if (status === 'offline' || status === 'invisible' || (!presence && member)) {
                        const result = db.endStaffShift(guild_id, user_id, 'auto_offline');
                        if (result && result.success) {
                            const durationHours = Math.floor(result.duration / 3600);
                            const durationMins = Math.floor((result.duration % 3600) / 60);
                            const durationStr = `${durationHours > 0 ? `${durationHours} ساعة و ` : ''}${durationMins} دقيقة`;
                            const logChannelId = settings.staff_log_channel || settings.log_channel;
                            const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
                            if (logChannel && logChannel.isTextBased()) {
                                const { EmbedBuilder } = require('discord.js');
                                const embed = new EmbedBuilder()
                                    .setColor('#ef4444')
                                    .setTitle('⚠️ تسجيل خروج تلقائي (خروج من ديسكورد)')
                                    .setDescription(`تم تسجيل خروج <@${user_id}> تلقائياً لأنه خرج من ديسكورد.`)
                                    .addFields(
                                        { name: '👤 الإداري', value: `<@${user_id}>`, inline: true },
                                        { name: '⏱️ المدة', value: `\`${durationStr}\``, inline: true },
                                        { name: '⭐ النقاط', value: `+${result.pointsEarned} نقطة`, inline: true }
                                    )
                                    .setFooter({ text: 'نظام مراقبة نشاط الإدارة • Droplet' })
                                    .setTimestamp();
                                await logChannel.send({ embeds: [embed] }).catch(() => {});
                            }
                        }
                        continue; // انتقل للشفت التالي
                    }
                }

                const maxHours = Number(settings.staff_max_shift_hours) || 8;
                const maxSeconds = maxHours * 3600;
                const elapsed = now - start_time;

                const inactivityMins = Number(settings.staff_inactivity_minutes) || 30;
                const lastAction = shift.last_action_time || start_time;
                const inactiveSeconds = now - lastAction;

                if (elapsed >= maxSeconds) {
                    const result = db.endStaffShift(guild_id, user_id, 'auto_timeout');
                    if (result && result.success) {
                        const durationHours = Math.floor(result.duration / 3600);
                        const durationMins = Math.floor((result.duration % 3600) / 60);
                        const durationStr = durationHours + ' ساعة و ' + durationMins + ' دقيقة';

                        const guild = this.client.guilds.cache.get(guild_id);
                        const logChannelId = settings.staff_log_channel || settings.log_channel;
                        const logChannel = (guild && logChannelId) ? guild.channels.cache.get(logChannelId) : null;

                        if (logChannel && logChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#e11d48')
                                .setTitle('⏰ تسجيل خروج تلقائي (انتهاء الحد الأقصى للشفت)')
                                .setDescription(`تم تسجيل خروج الإداري <@${user_id}> تلقائياً بعد بلوغ الحد الأقصى للمدة المسموحة (${maxHours} ساعات متواصلة) لحفظ الساعات بدقة.`)
                                .addFields(
                                    { name: '👤 الإداري', value: `<@${user_id}>`, inline: true },
                                    { name: '⏱️ المدة المحتسبة', value: `\`${durationStr}\``, inline: true },
                                    { name: '⭐ النقاط', value: `+${result.pointsEarned} نقطة`, inline: true }
                                )
                                .setFooter({ text: 'نظام حماية ساعات الإدارة • Droplet' })
                                .setTimestamp();

                            await logChannel.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                } else if (inactivityMins > 0 && inactiveSeconds >= (inactivityMins * 60)) {
                    // تسجيل خروج لعدم التفاعل (شات أو استلام تذاكر)
                    const result = db.endStaffShift(guild_id, user_id, 'auto_inactive');
                    if (result && result.success) {
                        const durationHours = Math.floor(result.duration / 3600);
                        const durationMins = Math.floor((result.duration % 3600) / 60);
                        const durationStr = durationHours > 0 
                            ? `${durationHours} ساعة و ${durationMins} دقيقة` 
                            : `${durationMins} دقيقة`;

                        const guild = this.client.guilds.cache.get(guild_id);
                        const logChannelId = settings.staff_log_channel || settings.log_channel;
                        const logChannel = (guild && logChannelId) ? guild.channels.cache.get(logChannelId) : null;

                        if (logChannel && logChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#f59e0b')
                                .setTitle('💤 تسجيل خروج تلقائي (عدم تفاعل)')
                                .setDescription(`تم تسجيل خروج الإداري <@${user_id}> تلقائياً لعدم التفاعل في الشات أو استلام التذاكر لمدة (${inactivityMins} دقيقة).`)
                                .addFields(
                                    { name: '👤 الإداري', value: `<@${user_id}>`, inline: true },
                                    { name: '⏱️ المدة المحتسبة', value: `\`${durationStr}\``, inline: true },
                                    { name: '⭐ النقاط', value: `+${result.pointsEarned} نقطة`, inline: true }
                                )
                                .setFooter({ text: 'نظام حماية ساعات الإدارة • Droplet' })
                                .setTimestamp();

                            await logChannel.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                }
            }

            // ─── فحص انتهاء عقوبات السجن المؤقت (Expired Jails) ───
            if (db.getExpiredJails) {
                const expiredJails = db.getExpiredJails();
                for (const row of expiredJails) {
                    const guild = this.client.guilds.cache.get(row.guild_id);
                    if (guild) {
                        const member = guild.members.cache.get(row.user_id) || await guild.members.fetch(row.user_id).catch(() => null);
                        const settings = db.getGuildSettings(guild.id);
                        const jailRole = settings.jail_role ? guild.roles.cache.get(settings.jail_role) : guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed' || r.name.includes('سجن'));
                        if (member) {
                            if (jailRole && member.roles.cache.has(jailRole.id)) {
                                await member.roles.remove(jailRole).catch(() => {});
                            }
                            if (row.old_roles) {
                                try {
                                    const oldRolesArr = JSON.parse(row.old_roles);
                                    if (oldRolesArr.length) await member.roles.add(oldRolesArr).catch(() => {});
                                } catch (e) {}
                            }
                        }
                    }
                    db.unjailUser(row.guild_id, row.user_id);
                }
            }

            // ─── فحص انتهاء عقوبات الكتم المؤقت (Expired Temp Mutes) ───
            if (db.getExpiredTempMutes) {
                const expiredMutes = db.getExpiredTempMutes();
                for (const row of expiredMutes) {
                    const guild = this.client.guilds.cache.get(row.guild_id);
                    if (guild) {
                        const member = guild.members.cache.get(row.user_id) || await guild.members.fetch(row.user_id).catch(() => null);
                        const settings = db.getGuildSettings(guild.id);
                        const muteRole = settings.mute_role ? guild.roles.cache.get(settings.mute_role) : guild.roles.cache.find(r => r.name.toLowerCase() === 'muted' || r.name.includes('مكتوم'));
                        if (member) {
                            if (muteRole && member.roles.cache.has(muteRole.id)) {
                                await member.roles.remove(muteRole).catch(() => {});
                            }
                            if (member.communicationDisabledUntilTimestamp) {
                                await member.timeout(null, 'انتهاء مدة الكتم التلقائي').catch(() => {});
                            }
                        }
                    }
                    db.removeTempMute(row.guild_id, row.user_id);
                }
            }

            // ─── فحص الترقيات التلقائية لطاقم الإدارة (Staff Auto-Promotions) ───
            if (db.getStaffRanks && db.checkStaffPromotion) {
                for (const guild of this.client.guilds.cache.values()) {
                    const ranks = db.getStaffRanks(guild.id);
                    if (!ranks || ranks.length === 0) continue;

                    const leaderboard = db.getStaffLeaderboard ? db.getStaffLeaderboard(guild.id, 50) : [];
                    for (const staffMember of leaderboard) {
                        const promotion = db.checkStaffPromotion(guild.id, staffMember.user_id);
                        if (!promotion) continue;

                        const member = guild.members.cache.get(staffMember.user_id) || await guild.members.fetch(staffMember.user_id).catch(() => null);
                        if (!member) continue;

                        for (const r of promotion.allEligible) {
                            if (!member.roles.cache.has(r.role_id)) {
                                const roleToAdd = guild.roles.cache.get(r.role_id);
                                if (roleToAdd) {
                                    await member.roles.add(roleToAdd).catch(() => {});
                                    const settings = db.getGuildSettings(guild.id);
                                    const logChannelId = settings.staff_log_channel || settings.log_channel;
                                    const logChannel = logChannelId ? guild.channels.cache.get(logChannelId) : null;
                                    if (logChannel && logChannel.isTextBased()) {
                                        const promoEmbed = new EmbedBuilder()
                                            .setColor('#10b981')
                                            .setTitle('🎖️ ترقية تلقائية لإداري!')
                                            .setDescription(`تهانينا للإداري <@${member.id}>! حصل على ترقية تلقائية إلى رتبة <@&${r.role_id}> بعد بلوغ نقاطه **${staffMember.points}** نقطة 🚀`)
                                            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                                            .setFooter({ text: 'ZENO Staff Auto-Promotion System' })
                                            .setTimestamp();
                                        await logChannel.send({ embeds: [promoEmbed] }).catch(() => {});
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ─── فحص انتهاء صلاحية الرتب الخاصة المؤقتة (Expired Custom Roles) ───
            if (db.getExpiredCustomRoles) {
                const expiredRoles = db.getExpiredCustomRoles();
                for (const row of expiredRoles) {
                    const guild = this.client.guilds.cache.get(row.guild_id);
                    if (guild) {
                        const role = guild.roles.cache.get(row.role_id);
                        if (role) await role.delete('انتهاء مدة صلاحية الرتبة المخصصة').catch(() => {});
                    }
                    db.deleteCustomRole(row.guild_id, row.role_id);
                }
            }

            // ─── فحص انتهاء صلاحية الرومات المؤجرة (Expired Rented Channels) ───
            if (db.getExpiredRentedChannels) {
                const expiredChannels = db.getExpiredRentedChannels();
                for (const row of expiredChannels) {
                    const guild = this.client.guilds.cache.get(row.guild_id);
                    if (guild) {
                        const channel = guild.channels.cache.get(row.channel_id);
                        if (channel) await channel.delete('انتهاء مدة استئجار الروم').catch(() => {});
                    }
                    db.deleteRentedChannel(row.guild_id, row.channel_id);
                }
            }
        } catch (e) {
            console.error('[StaffShiftService] Error in tick:', e.message);
        }
    }
}

module.exports = StaffShiftService;
