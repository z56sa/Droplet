const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const embedUtil = {
  /**
   * إنشاء Embed رسالة نجاح
   */
  success(title, description) {
    const icon = config.emojis?.success || '✅';
    return new EmbedBuilder()
      .setColor(config.colors?.success || '#22c55e')
      .setTitle(`${icon} ${String(title).slice(0, 250)}`)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed رسالة خطأ
   */
  error(title, description) {
    const icon = config.emojis?.error || '❌';
    return new EmbedBuilder()
      .setColor(config.colors?.danger || '#ef4444')
      .setTitle(`${icon} ${String(title).slice(0, 250)}`)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed رسالة تحذير
   */
  warning(title, description) {
    const icon = config.emojis?.warning || '⚠️';
    return new EmbedBuilder()
      .setColor(config.colors?.warning || '#f59e0b')
      .setTitle(`${icon} ${String(title).slice(0, 250)}`)
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed رسالة عادية / رئيسية
   */
  primary(title, description) {
    return new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(String(title).slice(0, 256))
      .setDescription(description)
      .setTimestamp();
  },

  /**
   * إنشاء Embed مخصص للسجلات (Logs)
   */
  log(title, description, color = config.colors.info) {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`📜 ${String(title).slice(0, 250)}`)
      .setDescription(description)
      .setTimestamp();
  }
};

module.exports = embedUtil;
