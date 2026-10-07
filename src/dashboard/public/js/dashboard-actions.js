document.addEventListener('DOMContentLoaded', () => {
    console.log("Global Dashboard Actions Initialized");

    function t(text) {
        if (window.DropletI18n && typeof window.DropletI18n.translate === 'function') {
            return window.DropletI18n.translate(text);
        }
        return text;
    }

    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            if (!btn) return;

            const originalText = btn.textContent;
            btn.textContent = t('Saving...');
            btn.disabled = true;

            try {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                const endpoint = form.getAttribute('action') || window.location.pathname;
                
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(data)
                });
                
                const result = await res.json();
                if (result.success) {
                    alert(t('Saved successfully!'));
                } else {
                    alert(t('Error: ') + (result.error || t('Failed to save settings')));
                }
            } catch (err) {
                alert(t('Server connection error'));
            } finally {
                btn.textContent = originalText;
                btn.disabled = false;
            }
        });
    });
});
