const crypto = require('crypto');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { askAI } = require('../utils/ai');

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.scr', '.bat', '.cmd', '.com', '.msi', '.vbs', '.js', '.jar',
  '.ps1', '.apk', '.dll', '.lnk', '.hta', '.reg', '.sh', '.py', '.iso'
]);

const MAGIC_SIGNATURES = [
  { bytes: Buffer.from('MZ'), label: 'Windows executable' },
  { bytes: Buffer.from('\x7fELF', 'binary'), label: 'Linux executable' },
  { bytes: Buffer.from('PK\x03\x04', 'binary'), label: 'ZIP/Office archive' }
];

const SECRET_PATTERNS = [
  ['Discord token', /[MNOPQR][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{5,8}\.[A-Za-z\d_-]{20,40}/g],
  ['OpenAI/API key', /\bsk-[A-Za-z0-9_-]{20,}\b/gi],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g]
];

const INVITE_RE = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9._-]+/gi;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function redact(text) {
  let out = String(text || '');
  for (const [, pattern] of SECRET_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags), '[REDACTED_SECRET]');
  }
  return out.slice(-7000);
}

function scanText(content) {
  const findings = [];
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(content || '')) findings.push(label);
    pattern.lastIndex = 0;
  }
  if (INVITE_RE.test(content || '')) findings.push('Discord invite link');
  INVITE_RE.lastIndex = 0;
  return [...new Set(findings)];
}

async function scanAttachment(attachment, maxBytes = 10 * 1024 * 1024) {
  const name = String(attachment.name || attachment.filename || '').toLowerCase();
  const ext = path.extname(name);
  const size = Number(attachment.size || 0);

  if (size > maxBytes) return { blocked: true, reason: 'File exceeds the configured size limit.' };
  if (DANGEROUS_EXTENSIONS.has(ext)) return { blocked: true, reason: `Dangerous file extension: ${ext}` };

  // Block executable-looking double extensions such as image.png.exe.
  const parts = name.split('.');
  if (parts.length > 2 && DANGEROUS_EXTENSIONS.has('.' + parts.at(-1))) {
    return { blocked: true, reason: 'Executable double-extension filename.' };
  }

  if (!attachment.url || size === 0 || size > maxBytes) return { blocked: false };

  try {
    const response = await fetch(attachment.url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { blocked: false };
    const buffer = Buffer.from(await response.arrayBuffer());
    const digest = sha256(buffer);

    for (const sig of MAGIC_SIGNATURES) {
      if (buffer.subarray(0, sig.bytes.length).equals(sig.bytes)) {
        return { blocked: true, reason: `${sig.label} detected in uploaded content.`, sha256: digest };
      }
    }

    return { blocked: false, sha256: digest };
  } catch {
    // Network failure must not make the bot fail closed for every normal upload.
    return { blocked: false, scanError: true };
  }
}

class SecurityGuardian {
  constructor(client) {
    this.client = client;
    this.startedAt = Date.now();
    this.lastIncidents = new Map();
    this.healthTimer = null;
    this.criticalHealthCount = 0;
  }

  async report(guild, title, details, severity = 'warning') {
    const key = `${guild?.id || 'global'}:${title}:${details.slice(0, 200)}`;
    const now = Date.now();
    if (now - (this.lastIncidents.get(key) || 0) < 10 * 60 * 1000) return;
    this.lastIncidents.set(key, now);

    const safeDetails = redact(details);
    let aiAnalysis = '';
    try {
      aiAnalysis = await askAI(
        `Security/diagnostic incident. Do not expose secrets. Explain root cause, immediate safe containment, and a developer fix.\nTitle: ${title}\nDetails:\n${safeDetails}`
      );
    } catch {}

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ ZENO Guardian • ${title}`)
      .setColor(severity === 'critical' ? 0xE74C3C : severity === 'warning' ? 0xF59E0B : 0x22C55E)
      .addFields(
        { name: 'Severity', value: severity, inline: true },
        { name: 'Details', value: safeDetails.slice(0, 1000) || 'No details', inline: false },
        ...(aiAnalysis ? [{ name: 'AI Analysis', value: redact(aiAnalysis).slice(0, 1000), inline: false }] : [])
      )
      .setTimestamp();

    const channelId = process.env.SECURITY_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
    if (channelId) {
      const channel = this.client.channels.cache.get(channelId);
      if (channel?.isTextBased()) await channel.send({ embeds: [embed] }).catch(() => {});
    }
    console.error(`[ZENO-GUARDIAN][${severity}] ${title}: ${safeDetails}`);
  }

  async scanMessage(message) {
    const findings = scanText(message.content || '');
    const attachmentResults = [];

    for (const attachment of message.attachments.values()) {
      const result = await scanAttachment(attachment);
      attachmentResults.push({ attachment, result });
      if (result.blocked) findings.push(`Dangerous attachment: ${attachment.name}`);
    }

    return {
      blocked: findings.length > 0,
      findings: [...new Set(findings)],
      attachmentResults
    };
  }

  startHealthMonitor() {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(async () => {
      const latency = Number(this.client.ws?.ping || 0);
      const rss = process.memoryUsage().rss / 1024 / 1024;
      const heap = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
      const problems = [];

      if (latency > Number(process.env.GUARDIAN_MAX_LATENCY_MS || 1500)) problems.push(`Discord latency: ${latency}ms`);
      if (rss > Number(process.env.GUARDIAN_MAX_RSS_MB || 768)) problems.push(`RSS memory: ${rss.toFixed(0)}MB`);
      if (heap > 0.90) problems.push(`Heap usage: ${(heap * 100).toFixed(1)}%`);

      if (problems.length) {
        this.criticalHealthCount += 1;
        await this.report(null, 'Health anomaly', problems.join('\n'), this.criticalHealthCount >= 3 ? 'critical' : 'warning');

        // Safe self-healing: ask V8 to release unused memory before considering a restart.
        if (global.gc && heap > 0.90) {
          try { global.gc(); } catch {}
        }

        // Let Render/Railway/Docker restart the process if it remains unhealthy.
        if (this.criticalHealthCount >= 5 && rss > Number(process.env.GUARDIAN_MAX_RSS_MB || 768)) {
          await this.report(null, 'Self-healing restart', 'Memory stayed above the safety limit after repeated health checks.', 'critical');
          process.exit(1);
        }
      } else {
        this.criticalHealthCount = 0;
      }
    }, 60_000);
    this.healthTimer.unref?.();
  }
}

module.exports = { SecurityGuardian, scanText, scanAttachment, redact };
