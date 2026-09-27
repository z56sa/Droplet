document.addEventListener('DOMContentLoaded', () => {
    console.log("Logs Manager Initialized");

    function t(text) {
        if (window.ZenoI18n && typeof window.ZenoI18n.translate === 'function') {
            return window.ZenoI18n.translate(text);
        }
        return text;
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.dataset.filter;
            document.querySelectorAll('.log-card').forEach(card => {
                const isEnabled = card.querySelector('.log-toggle').checked;
                if (filter === 'all') card.style.display = 'block';
                else if (filter === 'enabled') card.style.display = isEnabled ? 'block' : 'none';
                else card.style.display = !isEnabled ? 'block' : 'none';
            });
        });
    });

    document.getElementById('enable-all')?.addEventListener('click', () => {
        document.querySelectorAll('.log-toggle').forEach(t => t.checked = true);
    });
    document.getElementById('disable-all')?.addEventListener('click', () => {
        document.querySelectorAll('.log-toggle').forEach(t => t.checked = false);
    });

    document.getElementById('save-logs-settings')?.addEventListener('click', async () => {
        const settings = [];
        document.querySelectorAll('.log-card').forEach(card => {
            settings.push({
                category: card.dataset.category,
                enabled: card.querySelector('.log-toggle').checked,
                channel: card.querySelector('.channel-input')?.value || ''
            });
        });

        const btn = document.getElementById('save-logs-settings');
        const originalText = btn.textContent;
        btn.textContent = t('Saving...');
        btn.disabled = true;

        try {
            const res = await fetch('/api/logs/save', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ settings })
            });
            const result = await res.json();
            alert(result.success ? t('✅ Log settings saved!') : t('❌ Failed to save log settings'));
        } catch (err) {
            alert(t('Connection error'));
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});
