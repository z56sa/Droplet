
//----script0----

                                (function() {
                                    function wlSetBtn(t) { var b = document.getElementById('btn_text_welcome_banner_image'); if (b) b.innerText = t; }
                                    function wlShowPreview(url) {
                                        var hiddenInput = document.getElementById('input_welcome_banner_image');
                                        if (hiddenInput) hiddenInput.value = url;
                                        var imgElem = document.getElementById('img_welcome_banner_image');
                                        var placeholderElem = document.getElementById('placeholder_welcome_banner_image');
                                        if (imgElem) { imgElem.src = url; imgElem.classList.remove('hidden'); }
                                        if (placeholderElem) { placeholderElem.classList.add('hidden'); }
                                    }
                                    window.uploadWelcomeBanner = function(input) {
                                        var file = input.files && input.files[0];
                                        if (!file) return;
                                        try { input.value = ''; } catch (e) {}
                                        if (!file.type || file.type.indexOf('image/') !== 0) { wlSetBtn('❌ ملف غير صالح'); alert('❌ يرجى اختيار ملف صورة صالح (PNG, JPG, GIF, WEBP)'); wlSetBtn('رفع الصورة'); return; }
                                        if (file.size > 15 * 1024 * 1024) { wlSetBtn('❌ كبير جداً'); alert('❌ حجم الصورة يتجاوز 15 ميجابايت'); wlSetBtn('رفع الصورة'); return; }
                                        wlSetBtn('جاري الرفع... ⏳');
                                        var t = setTimeout(function() { wlSetBtn('❌ انتهت المهلة — أعد المحاولة'); }, 90000);
                                        function finishSend(blob) {
                                            var reader = new FileReader();
                                            reader.onerror = function() { clearTimeout(t); wlSetBtn('❌ تعذر القراءة'); alert('❌ تعذر قراءة الصورة من جهازك'); };
                                            reader.onload = function(e) {
                                                var gId = window.location.pathname.split('/')[2];
                                                fetch('/api/guild/' + gId + '/upload-image', {
                                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ imageBase64: e.target.result, fieldName: 'welcome_banner_image' })
                                                }).then(function(r) { return r.json().then(function(d) { return { status: r.status, body: d }; }); }).then(function(out) {
                                                    clearTimeout(t);
                                                    var d = out.body || {};
                                                    if (out.status === 200 && d.success && d.url) {
                                                        wlShowPreview(d.url);
                                                        saveWelcomeBannerNow(d.url);
                                                        wlSetBtn('✅ تم الرفع');
                                                        if (!d.persistent) alert('⚠️ تم الرفع لكن الاستضافة الدائمة فشلت — تحقق من صلاحيات البوت.');
                                                        setTimeout(function() { wlSetBtn('رفع الصورة'); }, 3000);
                                                    } else {
                                                        var msg = '❌ فشل [' + out.status + ']: ' + (d.error || 'خطأ غير معروف');
                                                        wlSetBtn(msg); alert(msg);
                                                    }
                                                }).catch(function(err) {
                                                    clearTimeout(t);
                                                    var msg = (err && err.name === 'AbortError') ? '❌ انتهت المهلة' : '❌ خطأ اتصال';
                                                    wlSetBtn(msg); alert(msg);
                                                });
                                            };
                                            reader.readAsDataURL(blob);
                                        }
                                        try {
                                            if (/^image\/(jpeg|jpg|png|webp)$/.test(file.type) && file.size > 900 * 1024) {
                                                var url = URL.createObjectURL(file);
                                                var img = new Image();
                                                img.onload = function() {
                                                    try {
                                                        var maxDim = 1280, w = img.naturalWidth, h = img.naturalHeight;
                                                        var sc = Math.min(1, maxDim / Math.max(w, h));
                                                        if (!sc || sc >= 1) { URL.revokeObjectURL(url); finishSend(file); return; }
                                                        var cv = document.createElement('canvas');
                                                        cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
                                                        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
                                                        URL.revokeObjectURL(url);
                                                        var mime = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
                                                        if (cv.toBlob) cv.toBlob(function(b) { finishSend(b || file); }, mime, 0.85);
                                                        else finishSend(file);
                                                    } catch (e) { try { URL.revokeObjectURL(url); } catch (_) {} finishSend(file); }
                                                };
                                                img.onerror = function() { try { URL.revokeObjectURL(url); } catch (_) {} finishSend(file); };
                                                img.src = url;
                                            } else { finishSend(file); }
                                        } catch (e) { finishSend(file); }
                                    };
                                    window.saveWelcomeBannerNow = function(url) {
                                        saveWl('welcome_banner_image', url);
                                    };
                                    window.checkBannerUrl = function() {
                                        var el = document.getElementById('bannerUrlStatus');
                                        var inp = document.getElementById('input_welcome_banner_image');
                                        if (!el) return;
                                        var url = inp ? (inp.value || '').trim() : '';
                                        if (!url) { el.innerHTML = '<span class="text-gray-500">لا توجد صورة محفوظة — ارفع صورة.</span>'; return; }
                                        var host = '';
                                        try { host = new URL(url).hostname; } catch (e) { host = url.slice(0, 40); }
                                        el.innerHTML = '<span class="text-gray-400">فحص الرابط (' + host + ')...</span>';
                                        var done = false;
                                        var im = new Image();
                                        im.onload = function() { if (done) return; done = true; el.innerHTML = '<span class="text-emerald-400">✅ الرابط يعمل (' + host + ')</span>'; };
                                        im.onerror = function() { if (done) return; done = true; el.innerHTML = '<span class="text-rose-400">❌ الرابط ميت (' + host + ') — أعد الرفع.</span>'; };
                                        im.src = url;
                                        setTimeout(function() { if (!done) { done = true; el.innerHTML = '<span class="text-amber-400">⏳ تعذر التأكد (مهلة).</span>'; } }, 12000);
                                    };
                                    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', window.checkBannerUrl);
                                    else window.checkBannerUrl();
                                })();
                                
//----script1----

                    var _wlGuildId = window.location.pathname.split('/')[2];
                    var _wlSaveTimer = {};
                    function saveWl(key, value) {
                        var body = {};
                        body[key] = value;
                        fetch('/api/guild/' + _wlGuildId + '/settings', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        }).then(function(r) { return r.json(); }).then(function(d) {
                            if (d && d.success) { if (typeof showSaveStatus === 'function') showSaveStatus(); }
                        }).catch(function() {});
                    }
                    function saveWlDebounced(key, value) {
                        if (_wlSaveTimer[key]) clearTimeout(_wlSaveTimer[key]);
                        _wlSaveTimer[key] = setTimeout(function() { saveWl(key, value); }, 800);
                    }
                    function paintWlTypes() {
                        var emb = document.getElementById('welcome_embed_enabled').value === '1';
                        var img = !emb && document.getElementById('welcome_image').value === '1';
                        var cur = emb ? 'embed' : (img ? 'image' : 'text');
                        var on = 'p-4 rounded-2xl border border-blue-400 bg-orange-950/20 text-white text-center transition';
                        var off = 'p-4 rounded-2xl border border-blue-500/20 bg-[#0b1322] text-white text-center transition';
                        var t = document.getElementById('btnWlTypeText'); if (t) t.className = (cur === 'text') ? on : off;
                        var im = document.getElementById('btnWlTypeImage'); if (im) im.className = (cur === 'image') ? on : off;
                        var em = document.getElementById('btnWlTypeEmbed'); if (em) em.className = (cur === 'embed') ? on : off;
                        var lvEmb = document.getElementById('leave_embed_enabled').value === '1';
                        var lt = document.getElementById('btnLvTypeText'); if (lt) lt.className = (!lvEmb) ? on.replace(/blue-/g, 'rose-').replace('orange-950/20', 'rose-950/20') : off;
                        var le = document.getElementById('btnLvTypeEmbed'); if (le) le.className = lvEmb ? on.replace(/blue-/g, 'rose-').replace('orange-950/20', 'rose-950/20') : off;
                    }
                    function switchWelcomeTab(tab) {
                        var secWl = document.getElementById('sectionWelcomeBox');
                        var secLv = document.getElementById('sectionLeaveBox');
                        var btnWl = document.getElementById('btnTabWelcome');
                        var btnLv = document.getElementById('btnTabLeave');
                        if (tab === 'welcome') {
                            secWl.classList.remove('hidden');
                            secLv.classList.add('hidden');
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-lg";
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-white hover:text-gray-300";
                        } else {
                            secWl.classList.add('hidden');
                            secLv.classList.remove('hidden');
                            btnLv.className = "px-5 py-2 rounded-xl text-xs font-bold transition bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-lg";
                            btnWl.className = "px-5 py-2 rounded-xl text-xs font-bold transition text-blue-300 hover:text-white";
                        }
                    }
                    function insertVar(targetId, varName) {
                        var el = document.getElementById(targetId);
                        if (!el) return;
                        el.value += ' ' + varName;
                        if (targetId === 'welcomeText') { updateWelcomePreview(); saveWlDebounced('welcome_message', el.value); }
                        if (targetId === 'leaveText') { updateLeavePreview(); saveWlDebounced('leave_message', el.value); }
                    }
                    function updateWelcomePreview() {
                        var el = document.getElementById('welcomeText');
                        var pv = document.getElementById('pvWlMsg');
                        if (pv && el) pv.innerText = el.value || 'مرحباً {user} في سيرفر **{server}**!';
                    }
                    function updateLeavePreview() {
                        var el = document.getElementById('leaveText');
                        var pv = document.getElementById('pvLvMsg');
                        if (pv && el) pv.innerText = el.value || 'وداعاً **{user}**، نتمنى لك التوفيق';
                    }
                    function setWelcomeType(type) {
                        document.getElementById('welcome_embed_enabled').value = type === 'embed' ? 1 : 0;
                        document.getElementById('welcome_image').value = type === 'image' ? 1 : 0;
                        saveWl('welcome_embed_enabled', type === 'embed' ? 1 : 0);
                        saveWl('welcome_image', type === 'image' ? 1 : 0);
                        paintWlTypes();
                    }
                    function setLeaveType(type) {
                        document.getElementById('leave_embed_enabled').value = type === 'embed' ? 1 : 0;
                        saveWl('leave_embed_enabled', type === 'embed' ? 1 : 0);
                        paintWlTypes();
                    }
                    function setWlColor(c) {
                        var i = document.getElementById('wlColorInput'); if (i) i.value = c;
                        var p = document.getElementById('wlPreviewEmbed'); if (p) p.style.borderRightColor = c;
                        var l = document.getElementById('wlColorLabel'); if (l) l.innerText = c;
                        saveWl('welcome_embed_color', c);
                    }
                    function setLvColor(c) {
                        var i = document.getElementById('lvColorInput'); if (i) i.value = c;
                        var p = document.getElementById('lvPreviewEmbed'); if (p) p.style.borderRightColor = c;
                        var l = document.getElementById('lvColorLabel'); if (l) l.innerText = c;
                        saveWl('leave_embed_color', c);
                    }
                    // selects inside the generic form also submit via footer — add instant save too
                    (function() {
                        var wc = document.querySelector('select[name="welcome_channel"]');
                        if (wc) wc.addEventListener('change', function() { saveWl('welcome_channel', this.value); });
                        var lc = document.querySelector('select[name="leave_channel"]');
                        if (lc) lc.addEventListener('change', function() { saveWl('leave_channel', this.value); });
                        paintWlTypes();
                    })();
                    