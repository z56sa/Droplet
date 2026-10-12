/* Droplet dashboard — settings save.
 * Static file loaded synchronously in <head>, so window.submitSettingsForm
 * exists before first paint (no load-order race with end-of-body scripts).
 * A second identical copy lives in the page template as fallback; both are
 * interchangeable and guarded against double-submit via form.dataset.saving.
 */
(function () {
  'use strict';

  function showSaveStatusLocal() {
    try {
      var status = document.getElementById('saveStatus');
      if (status) {
        status.classList.remove('hidden');
        setTimeout(function () { status.classList.add('hidden'); }, 4000);
      }
    } catch (e) {}
  }
  if (typeof window.showSaveStatus !== 'function') {
    window.showSaveStatus = showSaveStatusLocal;
  }

  async function submitSettingsForm(form) {
    if (!form || form.dataset.saving === '1') return;
    form.dataset.saving = '1';
    try {
      if (typeof collectTicketCatsFromDOM === 'function') collectTicketCatsFromDOM();
    } catch (e) {}
    var formData;
    try {
      formData = new FormData(form);
    } catch (e) {
      alert('❌ تعذر قراءة الحقول: ' + (e && e.message || e));
      try { delete form.dataset.saving; } catch (e2) {}
      return;
    }
    var payload = {};
    var _junk = { gwChannel: 1, gwReqRole: 1, gwPrize: 1, gwDesc: 1, gwWinners: 1, gwDuration: 1, gwEmoji: 1, gwColorInput: 1, gwImage: 1, gwBtnStyle: 1, gwEntryMode: 1, gwNotifyWinners: 1, arTrigger: 1, arReply: 1, arCase: 1, arDeleteTrigger: 1, arCooldown: 1, arAllowedChan: 1, arExemptChan: 1, arAllowedRole: 1, arExemptRole: 1, appTitleInput: 1, appDescInput: 1, appLogChannel: 1, appAcceptedRole: 1, appReviewerRole: 1, catDefaultChannel: 1, channel_id: 1, custom_prefix: 1, stat_type: 1, bonusUserId: 1, bonusAmount: 1, embedChannel: 1 };
    try {
      formData.forEach(function (v, k) {
        if (_junk[k]) return;
        if (typeof v !== 'string') return;
        if (payload[k] !== undefined) {
          if (Array.isArray(payload[k])) payload[k].push(v);
          else payload[k] = [payload[k], v];
        } else {
          payload[k] = v;
        }
      });
    } catch (e) {}
    try {
      var cbs = form.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < cbs.length; i++) {
        if (cbs[i].name) payload[cbs[i].name] = cbs[i].checked ? 1 : 0;
      }
    } catch (e) {}

    var btn = form.querySelector('button[type="button"].js-save-btn') || form.querySelector('button[type="submit"]');
    var origBtn = btn ? btn.innerHTML : '';
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>جاري الحفظ...</span>';
      }
      var parts = window.location.pathname.split('/');
      var targetGuildId = parts[2] || '';
      var res = await fetch('/api/guild/' + targetGuildId + '/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = null;
      try { data = await res.json(); } catch (e) {}
      if (res.ok && data && data.success) {
        if (typeof window.showSaveStatus === 'function') window.showSaveStatus();
      } else {
        alert('❌ خطأ أثناء الحفظ [' + res.status + ']: ' + ((data && data.error) || 'حدث خطأ غير متوقع'));
      }
    } catch (err) {
      alert('حدث خطأ في الاتصال بالخادم');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtn || '<span>💾</span><span>حفظ التغييرات</span>';
      }
      try { delete form.dataset.saving; } catch (e) { form.dataset.saving = '0'; }
    }
  }
  window.submitSettingsForm = submitSettingsForm;

  if (!window._saveDelegated) {
    window._saveDelegated = true;
    document.addEventListener('submit', function (e) {
      if (e.target && e.target.id === 'settingsForm') {
        e.preventDefault();
        try { e.stopPropagation(); } catch (err) {}
        submitSettingsForm(e.target);
      }
    }, true);
  }
})();
