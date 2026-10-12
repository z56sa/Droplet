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
    var _saveTimer = null;
    var _ctrl = null;
    try { if (typeof AbortController !== 'undefined') _ctrl = new AbortController(); } catch (e) {}
    try {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span><span>جاري الحفظ...</span>';
      }
      // ⏱️ حماية من التعليق: إجهاض الطلب بعد 30 ثانية + إعادة تفعيل الزر مهما حدث
      _saveTimer = setTimeout(function () {
        try { if (_ctrl && _ctrl.abort) _ctrl.abort(); } catch (e) {}
        try {
          delete form.dataset.saving;
          if (btn) { btn.disabled = false; btn.innerHTML = origBtn || '<span>💾</span><span>حفظ التغييرات</span>'; }
        } catch (e) {}
      }, 30000);
      var parts = window.location.pathname.split('/');
      var targetGuildId = parts[2] || '';
      var _fetchOpts = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
      if (_ctrl) _fetchOpts.signal = _ctrl.signal;
      var res = await fetch('/api/guild/' + targetGuildId + '/settings', _fetchOpts);
      var data = null;
      try { data = await res.json(); } catch (e) {}
      if (res.ok && data && data.success) {
        if (typeof window.showSaveStatus === 'function') window.showSaveStatus();
        try {
          if (typeof window.refreshNavBadge === 'function') {
            var _cbs2 = form.querySelectorAll('input[type="checkbox"][name]');
            for (var _j = 0; _j < _cbs2.length; _j++) window.refreshNavBadge(_cbs2[_j].name, _cbs2[_j].checked);
          }
        } catch (e) {}
      } else if (res.status === 403) {
        alert('⛔ مرفوض من السيرفر [403]: ' + ((data && data.error) || 'صلاحيات غير كافية'));
      } else {
        alert('❌ خطأ أثناء الحفظ [' + res.status + ']: ' + ((data && data.error) || 'حدث خطأ غير متوقع'));
      }
    } catch (err) {
      var _aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
      alert(_aborted ? '⏱️ انتهت مهلة الحفظ (30 ثانية) — تحقق من الاتصال ثم أعد المحاولة.' : 'حدث خطأ في الاتصال بالخادم');
    } finally {
      try { if (_saveTimer) clearTimeout(_saveTimer); } catch (e) {}
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origBtn || '<span>💾</span><span>حفظ التغييرات</span>';
      }
      try { delete form.dataset.saving; } catch (e) { form.dataset.saving = '0'; }
    }
  }
  window.submitSettingsForm = submitSettingsForm;

  /* دوائر حالة الأقسام: تحديث لحظي عند التفعيل/الإطفاء دون انتظار إعادة التحميل */
  window.refreshNavBadge = function (key, on) {
    try {
      var els = document.querySelectorAll('span[data-navbadge="' + key + '"]');
      for (var i = 0; i < els.length; i++) {
        if (on) {
          els[i].className = 'w-5 h-5 rounded-full bg-emerald-500 border-2 border-white/70 text-[#052e16] flex items-center justify-center text-[10px] font-black shadow-md shadow-emerald-500/40';
          els[i].textContent = '✓';
        } else {
          els[i].className = 'w-4 h-4 rounded-full border border-white/10 bg-white/5 flex items-center justify-center text-[9px] font-black text-gray-600';
          els[i].textContent = '•';
        }
      }
    } catch (e) {}
  };

  /* مفاتيح التفعيل الفردية — نسخ مستقلة تعمل في كل الصفحات */
  function dropletGuildId() {
    try { return window.location.pathname.split('/')[2] || ''; } catch (e) { return ''; }
  }
  async function postSingleSetting(key, value) {
    var res = await fetch('/api/guild/' + dropletGuildId() + '/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value ? 1 : 0 })
    });
    var data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.ok && data && data.success) {
      if (typeof window.showSaveStatus === 'function') window.showSaveStatus();
      try { if (typeof window.refreshNavBadge === 'function') window.refreshNavBadge(key, !!value); } catch (e) {}
      return true;
    }
    if (res.status === 403) {
      alert('⛔ مرفوض من السيرفر [403].');
    } else {
      alert('❌ خطأ أثناء الحفظ [' + res.status + ']: ' + ((data && data.error) || 'حدث خطأ غير متوقع'));
    }
    return false;
  }
  if (typeof window.toggleModule !== 'function') {
    window.toggleModule = async function (gId, key, isEnabled) {
      try {
        await postSingleSetting(key, isEnabled);
      } catch (e) { console.error('toggleModule error', e); }
    };
  }
  if (typeof window.saveProtectionSetting !== 'function') {
    window.saveProtectionSetting = async function (key, value) {
      try { await postSingleSetting(key, value); }
      catch (e) { console.error('saveProtectionSetting error', e); }
    };
  }
  if (typeof window.saveAutomodSetting !== 'function') {
    window.saveAutomodSetting = async function (key, value) {
      try { await postSingleSetting(key, value); }
      catch (e) { console.error('saveAutomodSetting error', e); }
    };
  }

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

  /* bfcache: الرجوع للصفحة قد يعيد زراً معطلاً وحالة حفظ عالقة دون إعادة تشغيل السكربتات */
  try {
    window.addEventListener('pageshow', function () {
      try {
        var forms = document.querySelectorAll('#settingsForm');
        for (var i = 0; i < forms.length; i++) { try { delete forms[i].dataset.saving; } catch (e) {} }
        var btns = document.querySelectorAll('.js-save-btn');
        for (var j = 0; j < btns.length; j++) {
          try {
            if (btns[j].disabled && btns[j].innerHTML.indexOf('جاري الحفظ') !== -1) {
              btns[j].disabled = false;
              btns[j].innerHTML = '<span>💾</span><span>حفظ التغييرات</span>';
            }
          } catch (e) {}
        }
      } catch (e) {}
    });
  } catch (e) {}
})();
