/* Демо-админка. Без бэкенда: всё в localStorage через js/store.js, общее с публичной формой. */
(function () {
  "use strict";
  var S = window.SpaStore, D = window.SPA_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var rub = function (n) { return Math.round(+n || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " ₽"; };
  var km = function (n) { return (Math.round(n * 10) / 10).toLocaleString("ru-RU") + " км"; };
  var fmt = S.fmt, toMin = S.toMin;
  var AUTH = "spaKazanDemoAdmin";
  var STATUS = { hold: "HOLD · ждёт подтверждения", confirmed: "CONFIRMED · подтверждена", done: "DONE · выполнена", paid: "PAID · оплачена", cancelled: "CANCELLED · отклонена", expired: "CANCELLED · истекла" };
  var SHORT = { hold: "HOLD", confirmed: "CONFIRMED", done: "DONE", paid: "PAID", cancelled: "CANCELLED", expired: "CANCELLED" };
  var DISTRICTS = [
    { label: "Вахитовский район", lat: 55.790, lon: 49.122 }, { label: "Ново-Савиновский район", lat: 55.826, lon: 49.115 },
    { label: "Советский район", lat: 55.778, lon: 49.180 }, { label: "Приволжский район", lat: 55.752, lon: 49.200 },
    { label: "Московский район", lat: 55.818, lon: 49.075 }, { label: "Кировский район", lat: 55.805, lon: 49.040 },
    { label: "Авиастроительный район", lat: 55.860, lon: 49.085 }
  ];
  var ui = { filter: "all", q: "", calMode: "day", calDate: S.today(), calSpec: null };

  /* ---------- общие помощники ---------- */
  function toast(t) { var el = $("#toast"); el.textContent = t; el.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("is-on"); }, 2600); }
  function avatar(spec) {
    if (!spec) return "";
    if (spec.avatar) return spec.avatar;
    if (!spec.img) return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#E9DDC6"/><text x="32" y="42" font-size="28" text-anchor="middle" font-family="Georgia" fill="#352A20">' + esc(spec.name.charAt(0)) + "</text></svg>");
    return "../images/" + spec.img.replace("specialist", "avatar") + ".webp";
  }
  function who(spec, cls) { return spec ? '<span class="who"><img class="' + (cls || "") + '" src="' + avatar(spec) + '" alt="" width="30" height="30">' + esc(spec.name) + "</span>" : "—"; }
  function dayLabel(dk, opts) { return S.keyToDate(dk).toLocaleDateString("ru-RU", opts || { weekday: "short", day: "numeric", month: "short" }); }
  function chip(r) { var st = S.effStatus(r); return '<span class="chip st-' + st + '">' + SHORT[st] + "</span>" + (st === "hold" ? '<span class="timer" data-expires="' + r.expires + '"></span>' : ""); }
  function left(ms) { if (ms <= 0) return "истекла"; var m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); return "осталось " + m + ":" + (s < 10 ? "0" : "") + s; }
  function tick() { $$("[data-expires]").forEach(function (el) { var ms = +el.getAttribute("data-expires") - Date.now(); el.textContent = left(ms); if (ms <= 0 && !el.dataset.done) { el.dataset.done = 1; render(); } }); updateCount(); }
  function updateCount() { var n = S.requests().filter(function (r) { return S.effStatus(r) === "hold"; }).length; $("#holdCount").textContent = n || ""; }
  function svcTitle(id) { var s = S.svcById(id); return s ? s.title : id; }
  function addHistory(r, t) { (r.history = r.history || []).push({ at: Date.now(), text: t }); }
  function dt(ms) { return new Date(ms).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

  /* диалог: body — HTML, onOk(form) возвращает false, чтобы не закрывать */
  function dialog(title, body, okText, onOk) {
    var d = $("#dlg"); $("#dlgTitle").textContent = title; $("#dlgBody").innerHTML = body; $("#dlgOk").textContent = okText || "Сохранить"; $("#dlgOk").hidden = okText === null;
    d.onclose = function () { if (d.returnValue === "ok" && onOk) onOk($("#dlgForm")); };
    d.returnValue = ""; d.showModal();
    var f = $("#dlgBody input, #dlgBody select, #dlgBody textarea"); if (f) f.focus();
  }

  /* ---------- вход ---------- */
  function authed() { try { return sessionStorage.getItem(AUTH) === "1"; } catch (e) { return false; } }
  $("#loginBtn").addEventListener("click", function () { try { sessionStorage.setItem(AUTH, "1"); } catch (e) {} boot(); });
  $("#logoutBtn").addEventListener("click", function () { try { sessionStorage.removeItem(AUTH); } catch (e) {} boot(); });
  $("#resetBtn").addEventListener("click", function () {
    if (!confirm("Сбросить демо-данные? Заявки, специалистки, услуги, цены и настройки вернутся к исходным.")) return;
    S.resetDemo(); ui.filter = "all"; ui.q = ""; toast("Демо-данные сброшены"); location.hash = "#requests"; render();
  });
  $("#burger").addEventListener("click", function () { var sb = $("#sidebar"), open = !sb.classList.contains("is-open"); sb.classList.toggle("is-open", open); this.setAttribute("aria-expanded", String(open)); if (open) $("#sidebar a").focus(); });
  $("#sidebar").addEventListener("click", function (e) { if (e.target.closest("a[data-nav]")) { this.classList.remove("is-open"); $("#burger").setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && $("#sidebar").classList.contains("is-open")) { $("#sidebar").classList.remove("is-open"); $("#burger").setAttribute("aria-expanded", "false"); $("#burger").focus(); } });

  function boot() {
    var ok = authed(); $("#login").hidden = ok; $("#app").hidden = !ok;
    if (ok) { if (!location.hash) location.hash = "#requests"; render(); } else $("#loginBtn").focus();
  }

  /* ---------- роутинг ---------- */
  function route() { var h = (location.hash || "#requests").slice(1).split("/"); return { page: h[0] || "requests", id: h[1] ? decodeURIComponent(h[1]) : null }; }
  function render() {
    if (!authed()) return;
    S.applyAll(); D = window.SPA_DATA;
    var r = route(), nav = r.page === "request" ? "requests" : r.page === "specialist" ? "specialists" : r.page;
    $$("[data-nav]").forEach(function (a) { if (a.getAttribute("data-nav") === nav) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    var fn = { requests: pRequests, request: pRequest, calendar: pCalendar, specialists: pSpecialists, specialist: pSpecialist, services: pServices, pricing: pPricing, settings: pSettings }[r.page] || pRequests;
    var y = window.scrollY; fn(r.id); updateCount(); tick();
    if (render.lastPage === location.hash) window.scrollTo(0, y); else { window.scrollTo(0, 0); }
    render.lastPage = location.hash;
  }
  window.addEventListener("hashchange", function () { render(); $("#main").focus({ preventScroll: true }); });
  window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf("spaKazanDemo") === 0 && !$("#dlg").open) render(); });
  setInterval(tick, 1000);

  /* ---------- 1. Заявки ---------- */
  function sortReq(a, b) {
    var w = { hold: 0, confirmed: 1, done: 2, paid: 3, cancelled: 4, expired: 4 }, sa = S.effStatus(a), sb = S.effStatus(b);
    if (w[sa] !== w[sb]) return w[sa] - w[sb];
    if (sa === "hold") return a.expires - b.expires;
    return (S.keyToDate(a.day) - S.keyToDate(b.day)) || a.s - b.s;
  }
  function pRequests() {
    var all = S.requests().sort(sortReq), counts = { all: all.length, hold: 0, confirmed: 0, done: 0, paid: 0, cancelled: 0 };
    all.forEach(function (r) { var s = S.effStatus(r); counts[s === "expired" ? "cancelled" : s]++; });
    var list = all.filter(function (r) {
      var s = S.effStatus(r); if (s === "expired") s = "cancelled";
      if (ui.filter !== "all" && s !== ui.filter) return false;
      if (!ui.q) return true;
      var q = ui.q.toLowerCase(); return [r.id, r.name, r.phone, r.place && r.place.name].join(" ").toLowerCase().indexOf(q) >= 0;
    });
    var F = [["all", "Все"], ["hold", "HOLD"], ["confirmed", "CONFIRMED"], ["done", "DONE"], ["paid", "PAID"], ["cancelled", "CANCELLED"]];
    $("#main").innerHTML = '<div class="page-head"><div><h1>Заявки</h1><p>Новые заявки с сайта держат время ' + window.SPA_CONFIG.schedule.holdMinutes + ' минут. Подтвердите после звонка клиенту.</p></div></div>' +
      '<div class="filters" role="group" aria-label="Фильтр по статусу">' + F.map(function (f) { return '<button class="fbtn" type="button" data-f="' + f[0] + '" aria-pressed="' + (ui.filter === f[0]) + '">' + f[1] + "<span>" + counts[f[0]] + "</span></button>"; }).join("") +
      '<label class="sr" for="q" hidden>Поиск</label><input type="search" id="q" placeholder="Поиск: имя, телефон, №, улица" aria-label="Поиск заявок" value="' + esc(ui.q) + '"></div>' +
      (list.length ? '<table class="table"><thead><tr><th>№ и статус</th><th>Дата и время</th><th>Специалистка</th><th>Клиент</th><th>Адрес</th><th class="num">Сумма</th></tr></thead><tbody>' +
        list.map(function (r) {
          var sp = S.specById(r.spec);
          return '<tr data-id="' + esc(r.id) + '"><td><a class="rowlink" href="#request/' + encodeURIComponent(r.id) + '">' + esc(r.id) + "</a><br>" + chip(r) + "</td>" +
            '<td data-l="Когда">' + dayLabel(r.day) + ", " + fmt(r.s) + "–" + fmt(r.s + r.dur) + "</td>" +
            '<td data-l="Специалистка">' + who(sp) + "</td>" +
            '<td data-l="Клиент">' + esc(r.name) + '<br><span class="small muted">' + esc(r.phone) + "</span></td>" +
            '<td data-l="Адрес">' + esc(r.place ? r.place.name : "—") + (r.house ? ", д. " + esc(r.house) : "") + '<br><span class="small muted">' + (r.calc && r.calc.D != null ? km(r.calc.D) : "") + "</span></td>" +
            '<td class="num" data-l="Сумма">' + (r.calc && r.calc.out ? rub(S.finalTotal(r)) + " + выезд" : rub(S.finalTotal(r))) + "</td></tr>";
        }).join("") + "</tbody></table>" : '<p class="empty">Заявок с таким статусом нет.</p>');
    $$(".fbtn").forEach(function (b) { b.addEventListener("click", function () { ui.filter = b.getAttribute("data-f"); render(); }); });
    $("#q").addEventListener("input", function () { ui.q = this.value; var pos = this.selectionStart; render(); var q = $("#q"); q.focus(); q.setSelectionRange(pos, pos); });
    $$(".table tbody tr").forEach(function (tr) { tr.addEventListener("click", function (e) { if (!e.target.closest("a")) location.hash = "#request/" + encodeURIComponent(tr.getAttribute("data-id")); }); });
  }

  /* ---------- карточка заявки ---------- */
  function conflicts(r) {
    return S.busy(r.spec, r.day).filter(function (b) { return b.id !== r.id && r.s < b.e && r.e > b.s; });
  }
  function pRequest(id) {
    var r = S.requests().filter(function (x) { return x.id === id; })[0];
    if (!r) { $("#main").innerHTML = '<a class="back" href="#requests">← Все заявки</a><p class="empty">Заявка не найдена (возможно, демо-данные сброшены).</p>'; return; }
    var sp = S.specById(r.spec), c = r.calc || {}, st = S.effStatus(r);
    var extrasSum = (r.extras || []).reduce(function (a, x) { return a + (+x.price || 0); }, 0);
    var conf = (st === "hold" || st === "confirmed") ? conflicts(r) : [];
    var calcRows =
      '<tr><td>S — услуги<div class="sub">' + r.svcs.map(function (id) { return esc(svcTitle(id)) + " · " + rub(S.priceFor(sp, id)); }).join("<br>") + "</div></td><td>" + rub(c.S) + "</td></tr>" +
      (c.out ? '<tr><td>Выезд<div class="sub">' + km(c.D) + " — вне зоны (макс. " + window.SPA_CONFIG.pricing.Dmax + " км), рассчитать вручную через корректировку</div></td><td>—</td></tr>" :
      '<tr><td>T — базовый выезд<div class="sub">включает ' + c.D0 + " км</div></td><td>" + rub(c.T) + "</td></tr>" +
      '<tr><td>Доплата за км<div class="sub">max(0, ' + km(c.D) + " − " + c.D0 + " км) = " + km(c.extraKm) + " × " + rub(c.R) + "</div></td><td>" + rub(c.extraCost) + "</td></tr>" +
      '<tr><td>Выезд итого<div class="sub">' + (c.minApplied ? "применена минимальная стоимость " + rub(c.Tmin) : "округление вверх до 10 ₽") + "</div></td><td>" + rub(c.travel) + "</td></tr>") +
      (r.extras && r.extras.length ? '<tr><td>Доп. услуги<div class="sub">' + r.extras.map(function (x) { return esc(x.title) + " · " + rub(x.price); }).join("<br>") + "</div></td><td>" + rub(extrasSum) + "</td></tr>" : "") +
      (r.adjust ? '<tr><td>Ручная корректировка<div class="sub">' + esc(r.adjust.comment || "без комментария") + "</div></td><td>" + (r.adjust.amount > 0 ? "+" : "") + rub(r.adjust.amount) + "</td></tr>" : "") +
      '<tr class="total"><td>Итого к оплате</td><td>' + rub(S.finalTotal(r)) + "</td></tr>";
    var A = [];
    if (st === "hold") A.push(["confirm", "Подтвердить", "gold"], ["reject", "Отклонить", "danger"]);
    if (st === "confirmed") A.push(["done", "Выполнено", "gold"], ["reject", "Отменить", "danger"]);
    if (st === "hold" || st === "confirmed" || st === "done") A.push(["extras", "Добавить услуги"], ["adjust", "Ручная корректировка цены"]);
    if (st === "done") A.push(["qr", "Сформировать QR СБП", "gold"], ["paid", "Отметить оплату"]);
    if (st === "paid") A.push(["qr", "Показать QR (повторно)"]);
    $("#main").innerHTML = '<a class="back" href="#requests">← Все заявки</a>' +
      '<div class="page-head"><div><h1>Заявка ' + esc(r.id) + "</h1><p>" + STATUS[st] + (st === "hold" ? ' · <span class="timer" data-expires="' + r.expires + '"></span>' : "") + (r.cancelReason ? " · " + esc(r.cancelReason) : "") + " · создана " + dt(r.created) + "</p></div><div>" + chip(r) + "</div></div>" +
      '<div class="grid2"><div>' +
        '<section class="panel"><h2>Визит</h2><div class="scard"><img class="ava ava--lg" src="' + avatar(sp) + '" alt=""><div><h3>' + esc(sp ? sp.name : r.spec) + "</h3><p>" + esc(sp ? sp.role : "") + "</p><p>Выезжает из: " + esc(sp ? sp.base.label : "—") + "</p></div></div>" +
          '<dl class="kv" style="margin-top:12px"><dt>Дата</dt><dd>' + dayLabel(r.day, { weekday: "long", day: "numeric", month: "long" }) + "</dd><dt>Время</dt><dd>" + fmt(r.s) + "–" + fmt(r.s + r.dur) + " (" + r.dur + " мин)</dd><dt>Блок в календаре</dt><dd>" + fmt(r.s) + "–" + fmt(r.e) + " с учётом дороги</dd><dt>Услуги</dt><dd>" + r.svcs.map(function (id) { return esc(svcTitle(id)); }).join(", ") + "</dd></dl>" +
          (conf.length ? '<p class="warn">Пересечение с другим занятым временем у специалистки: ' + conf.map(function (b) { return fmt(b.s) + "–" + fmt(b.e); }).join(", ") + ". Проверьте перед подтверждением.</p>" : "") + "</section>" +
        '<section class="panel"><h2>Клиент и адрес</h2><dl class="kv"><dt>Имя</dt><dd>' + esc(r.name) + '</dd><dt>Телефон</dt><dd><a href="tel:' + esc(String(r.phone).replace(/[^\d+]/g, "")) + '">' + esc(r.phone) + "</a></dd>" +
          "<dt>Адрес</dt><dd>" + esc(r.place ? r.place.name : "—") + (r.house ? ", д. " + esc(r.house) : "") + (r.flat ? ", кв. " + esc(r.flat) : "") + (r.entr ? ", " + esc(r.entr) : "") + '<br><span class="small muted">' + esc(r.place ? r.place.area : "") + "</span></dd>" +
          "<dt>Расстояние</dt><dd>" + (c.D != null ? "≈ " + km(c.D) + " по дороге (оценка)" : "—") + "</dd><dt>Комментарий</dt><dd>" + (r.comment ? esc(r.comment) : '<span class="muted">—</span>') + "</dd></dl></section>" +
        '<section class="panel"><h2>История</h2><ul class="history">' + (r.history || []).map(function (h) { return "<li><time>" + dt(h.at) + "</time>" + esc(h.text) + "</li>"; }).join("") + "</ul></section>" +
      "</div><div>" +
        '<section class="panel"><h2>Расчёт цены</h2><p class="small muted" style="margin:0 0 8px">P = S + max(T + max(0, D − D₀) × R, T<sub>min</sub>) + доп. услуги ± корректировка. Тарифы — на момент заявки.</p><table class="calc">' + calcRows + "</table>" +
          '<div class="actions">' + A.map(function (a) { return '<button class="btn btn--sm ' + (a[2] === "gold" ? "btn--gold" : a[2] === "danger" ? "btn--danger" : "") + '" type="button" data-act="' + a[0] + '">' + a[1] + "</button>"; }).join("") + "</div>" +
          (st === "done" || st === "paid" ? '<p class="small muted" style="margin-top:10px">Все специалистки — самозанятые: оплата по QR идёт напрямую на счёт специалистки, чек в «Мой налог» пробивает она. Салон деньги не принимает.</p>' : "") +
        "</section>" +
        (r.payment && r.payment.paidAt ? '<section class="panel"><h2>Оплата</h2><dl class="kv"><dt>Получатель</dt><dd>' + esc(sp ? sp.name : "") + " (самозанятая)</dd><dt>Сумма</dt><dd>" + rub(r.payment.amount || S.finalTotal(r)) + "</dd><dt>Отмечена</dt><dd>" + dt(r.payment.paidAt) + "</dd></dl></section>" : "") +
      "</div></div>";
    $$("[data-act]").forEach(function (b) { b.addEventListener("click", function () { act(r.id, b.getAttribute("data-act")); }); });
  }
  function act(id, a) {
    var r = S.requests().filter(function (x) { return x.id === id; })[0]; if (!r) return;
    var sp = S.specById(r.spec);
    if (a === "confirm") {
      if (conflicts(r).length && !confirm("Время пересекается с другим занятым интервалом. Всё равно подтвердить?")) return;
      S.updateRequest(id, function (x) { x.status = "confirmed"; addHistory(x, "Подтверждена администратором после звонка"); }); toast("Заявка подтверждена — время на сайте занято"); render();
    } else if (a === "reject") {
      dialog("Отклонить заявку " + id, '<div class="field"><label for="rr">Причина</label><select id="rr"><option>Клиент не отвечает</option><option>Нет свободной специалистки</option><option>Вне зоны выезда</option><option>Клиент передумал</option><option>Другое</option></select></div><div class="field"><label for="rc">Комментарий</label><input id="rc" type="text"></div>', "Отклонить", function () {
        var reason = $("#rr").value + ($("#rc").value ? ": " + $("#rc").value : "");
        S.updateRequest(id, function (x) { x.status = "cancelled"; x.cancelReason = reason; addHistory(x, "Отклонена: " + reason); }); toast("Заявка отклонена — время на сайте освобождено"); render();
      });
    } else if (a === "done") {
      S.updateRequest(id, function (x) { x.status = "done"; addHistory(x, "Сеанс выполнен"); }); toast("Отмечено как выполнено"); render();
    } else if (a === "extras") {
      var opts = S.activeServices().map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.title) + " — " + rub(S.priceFor(sp, s.id)) + "</option>"; }).join("");
      dialog("Добавить услуги", '<div class="field"><label for="ex">Из прайса</label><select id="ex"><option value="">— выбрать —</option>' + opts + '</select></div><p class="small muted" style="margin:0">или своя позиция:</p><div class="form"><div class="field"><label for="ext">Название</label><input id="ext" type="text" placeholder="Например, ароматерапия"></div><div class="field"><label for="exp">Цена, ₽</label><input id="exp" type="number" min="0" step="10"></div></div>', "Добавить", function () {
        var item = null;
        if ($("#ex").value) { var s = S.svcById($("#ex").value); item = { title: s.title, price: S.priceFor(sp, s.id) }; }
        else if ($("#ext").value && $("#exp").value) item = { title: $("#ext").value, price: +$("#exp").value };
        if (!item) { toast("Ничего не добавлено"); return; }
        S.updateRequest(id, function (x) { (x.extras = x.extras || []).push(item); addHistory(x, "Добавлена услуга: " + item.title + " (" + rub(item.price) + ")"); }); toast("Услуга добавлена в счёт"); render();
      });
    } else if (a === "adjust") {
      dialog("Ручная корректировка цены", '<div class="field"><label for="aj">Сумма, ₽ (минус — скидка)</label><input id="aj" type="number" step="10" value="' + (r.adjust ? r.adjust.amount : "") + '"></div><div class="field"><label for="ajc">Причина</label><input id="ajc" type="text" value="' + esc(r.adjust ? r.adjust.comment : "") + '" placeholder="Например, скидка постоянному клиенту"></div>', "Применить", function () {
        var v = +$("#aj").value || 0, cm = $("#ajc").value;
        S.updateRequest(id, function (x) { x.adjust = v ? { amount: v, comment: cm } : null; addHistory(x, v ? "Корректировка " + (v > 0 ? "+" : "") + rub(v) + (cm ? " (" + cm + ")" : "") : "Корректировка снята"); }); toast("Итог пересчитан"); render();
      });
    } else if (a === "qr") {
      var total = S.finalTotal(r), payload = "СБП · " + (sp ? sp.name : "") + " · " + (sp && sp.pay ? sp.pay.sbpPhone : "") + " · " + total + " RUB · " + r.id;
      dialog("QR СБП для оплаты", '<div class="qr"><span class="qr__tag">Демо-QR — не для оплаты</span><canvas id="qrc" width="33" height="33" aria-label="Демонстрационный QR-код"></canvas>' +
        "<div><b>" + rub(total) + '</b><br><span class="small">Получатель: ' + esc(sp ? sp.name : "") + " (самозанятая)<br>СБП: " + esc(sp && sp.pay ? sp.pay.sbpPhone : "—") + " · " + esc(sp && sp.pay ? sp.pay.bank : "") + "<br>Назначение: оплата услуг по заявке " + esc(r.id) + "</span></div>" +
        '<p class="small muted" style="margin:0">Деньги поступают напрямую специалистке, чек НПД в «Мой налог» формирует она. В рабочей версии QR формирует банк специалистки (СБП API) или ЮKassa для самозанятых, оплата подтверждается автоматически.</p></div>', "Отправить клиенту (демо)", function () {
        S.updateRequest(id, function (x) { x.payment = Object.assign(x.payment || {}, { qrAt: Date.now(), amount: total, to: x.spec }); addHistory(x, "Сформирован QR СБП на " + rub(total) + " (демо)"); }); toast("QR «отправлен» клиенту (демо)"); render();
      });
      drawQR($("#qrc"), payload);
    } else if (a === "paid") {
      dialog("Отметить оплату", '<p style="margin:0">Подтвердите, что клиент оплатил ' + rub(S.finalTotal(r)) + " на счёт " + esc(sp ? sp.name : "") + ' по СБП.</p><p class="small muted" style="margin:0">В рабочей версии статус ставится автоматически по уведомлению банка.</p>', "Оплачено", function () {
        S.updateRequest(id, function (x) { x.status = "paid"; x.payment = Object.assign(x.payment || {}, { paidAt: Date.now(), amount: S.finalTotal(x), to: x.spec }); addHistory(x, "Оплата отмечена: " + rub(S.finalTotal(x))); }); toast("Оплата отмечена"); render();
      });
    }
  }
  /* Демо-QR: узор с «глазками» как у QR, псевдослучайный от строки. Не является настоящим QR-кодом. */
  function drawQR(cv, text) {
    var n = 33, ctx = cv.getContext("2d"), h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    var rnd = function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
    ctx.fillStyle = "#F4EBDA"; ctx.fillRect(0, 0, n, n); ctx.fillStyle = "#352A20";
    var finder = function (x, y) { ctx.fillRect(x, y, 7, 7); ctx.fillStyle = "#F4EBDA"; ctx.fillRect(x + 1, y + 1, 5, 5); ctx.fillStyle = "#352A20"; ctx.fillRect(x + 2, y + 2, 3, 3); };
    for (var y = 2; y < n - 2; y++) for (var x = 2; x < n - 2; x++) {
      var inF = (x < 10 && y < 10) || (x > n - 11 && y < 10) || (x < 10 && y > n - 11);
      if (!inF && rnd() > 0.52) ctx.fillRect(x, y, 1, 1);
    }
    finder(2, 2); finder(n - 9, 2); finder(2, n - 9);
  }

  /* ---------- 2. Календарь ---------- */
  function pCalendar() {
    var specs = S.activeSpecs(); if (!ui.calSpec || !S.specById(ui.calSpec)) ui.calSpec = specs[0] && specs[0].id;
    var start = toMin("08:00"), end = toMin("22:00"), H = end - start, ppm = 1; /* 1px = 1 мин */
    var cols = ui.calMode === "day" ? specs.map(function (sp) { return { spec: sp, day: S.dayKey(ui.calDate) }; })
      : [0, 1, 2, 3, 4, 5, 6].map(function (i) { var d = S.addDays(weekStart(ui.calDate), i); return { spec: S.specById(ui.calSpec), day: S.dayKey(d) }; });
    var title = ui.calMode === "day" ? ui.calDate.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })
      : dayLabel(cols[0].day, { day: "numeric", month: "short" }) + " — " + dayLabel(cols[6].day, { day: "numeric", month: "short" });
    var reqs = S.requests(), blocks = S.blocks();
    var html = '<div class="page-head"><div><h1>Календарь</h1><p>Блок = сеанс + ' + window.SPA_CONFIG.schedule.travelBufferMin + ' мин на дорогу. HOLD — пунктир, CONFIRMED — сплошная рамка.</p></div><button class="btn btn--gold btn--sm" type="button" id="addBlock">Заблокировать время</button></div>' +
      '<div class="cal-tools"><div class="seg" role="group" aria-label="Вид"><button type="button" data-mode="day" aria-pressed="' + (ui.calMode === "day") + '">День</button><button type="button" data-mode="week" aria-pressed="' + (ui.calMode === "week") + '">Неделя</button></div>' +
      '<button class="btn btn--sm" type="button" id="prev" aria-label="Назад">←</button><button class="btn btn--sm" type="button" id="todayBtn">Сегодня</button><button class="btn btn--sm" type="button" id="next" aria-label="Вперёд">→</button>' +
      '<strong style="text-transform:capitalize">' + title + "</strong>" +
      (ui.calMode === "week" ? '<label class="small" for="calSpec" style="margin-left:auto">Специалистка</label><select id="calSpec" style="width:auto">' + specs.map(function (s) { return '<option value="' + s.id + '"' + (s.id === ui.calSpec ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + "</select>" : "") + "</div>";
    html += '<div class="cal-wrap"><div class="cal" style="grid-template-columns:52px repeat(' + cols.length + ',minmax(130px,1fr))">';
    html += '<div class="cal__head"></div>' + cols.map(function (c) {
      return '<div class="cal__head">' + (ui.calMode === "day" ? '<img class="ava" src="' + avatar(c.spec) + '" alt=""><span>' + esc(c.spec.name) + "<small>" + esc(c.spec.workStart || "09:00") + "–" + esc(c.spec.workEnd || "21:00") + "</small></span>" : '<span style="text-transform:capitalize">' + dayLabel(c.day) + "</span>") + "</div>";
    }).join("");
    html += '<div class="cal__times" style="height:' + H * ppm + 'px">';
    for (var t = start; t <= end; t += 60) html += '<span style="top:' + ((t - start) * ppm) + 'px">' + fmt(t) + "</span>";
    html += "</div>";
    cols.forEach(function (c) {
      var sp = c.spec, ws = toMin(sp.workStart || "09:00"), we = toMin(sp.workEnd || "21:00");
      html += '<div class="cal__col" style="height:' + H * ppm + 'px">';
      html += '<div class="cal__off" style="top:0;height:' + Math.max(0, ws - start) * ppm + 'px"></div><div class="cal__off" style="top:' + (we - start) * ppm + 'px;height:' + Math.max(0, end - we) * ppm + 'px"></div>';
      reqs.filter(function (r) { return r.spec === sp.id && r.day === c.day && S.isBusy(r); }).forEach(function (r) {
        var st = S.effStatus(r), top = (r.s - start) * ppm, hgt = (r.e - r.s) * ppm, buf = (r.e - r.s - r.dur) * ppm;
        html += '<button type="button" class="ev is-' + st + '" style="top:' + top + "px;height:" + hgt + 'px" data-req="' + esc(r.id) + '" aria-label="' + SHORT[st] + ", " + fmt(r.s) + "–" + fmt(r.s + r.dur) + ", " + esc(r.name) + '">' +
          '<span class="ev__main" style="height:' + (hgt - buf - 6) + 'px"><b>' + fmt(r.s) + "–" + fmt(r.s + r.dur) + " · " + SHORT[st] + "</b>" + esc(r.name) + "<br>" + r.svcs.map(function (id) { return esc(svcTitle(id)); }).join(", ") + "</span>" +
          '<span class="ev__buf" style="height:' + buf + 'px">дорога</span></button>';
      });
      blocks.filter(function (b) { return b.spec === sp.id && b.day === c.day; }).forEach(function (b) {
        html += '<button type="button" class="ev is-block" style="top:' + (b.s - start) * ppm + "px;height:" + (b.e - b.s) * ppm + 'px" data-block="' + esc(b.id) + '" aria-label="Блокировка ' + fmt(b.s) + "–" + fmt(b.e) + ", " + esc(b.reason) + '"><b>' + fmt(b.s) + "–" + fmt(b.e) + "</b>" + esc(b.reason) + "</button>";
      });
      html += "</div>";
    });
    html += '</div></div><div class="legend"><span><i class="l-hold"></i>HOLD — ждёт подтверждения</span><span><i></i>CONFIRMED</span><span><i class="l-buf"></i>буфер на дорогу</span><span><i class="l-block"></i>ручная блокировка / нерабочее время</span></div>';
    $("#main").innerHTML = html;
    $$("[data-mode]").forEach(function (b) { b.addEventListener("click", function () { ui.calMode = b.getAttribute("data-mode"); render(); }); });
    $("#prev").addEventListener("click", function () { ui.calDate = S.addDays(ui.calDate, ui.calMode === "day" ? -1 : -7); render(); });
    $("#next").addEventListener("click", function () { ui.calDate = S.addDays(ui.calDate, ui.calMode === "day" ? 1 : 7); render(); });
    $("#todayBtn").addEventListener("click", function () { ui.calDate = S.today(); render(); });
    if ($("#calSpec")) $("#calSpec").addEventListener("change", function () { ui.calSpec = this.value; render(); });
    $$("[data-req]").forEach(function (b) { b.addEventListener("click", function () { location.hash = "#request/" + encodeURIComponent(b.getAttribute("data-req")); }); });
    $$("[data-block]").forEach(function (b) { b.addEventListener("click", function () {
      var id = b.getAttribute("data-block"), bl = S.blocks().filter(function (x) { return x.id === id; })[0];
      dialog("Блокировка", "<p style=\"margin:0\">" + esc(S.specById(bl.spec).name) + ", " + dayLabel(bl.day) + ", " + fmt(bl.s) + "–" + fmt(bl.e) + ": " + esc(bl.reason) + "</p>", "Снять блокировку", function () {
        S.saveBlocks(S.blocks().filter(function (x) { return x.id !== id; })); toast("Блокировка снята — время на сайте свободно"); render();
      });
    }); });
    $("#addBlock").addEventListener("click", function () {
      var d = ui.calDate, iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      dialog("Заблокировать время", '<div class="form"><div class="field"><label for="bs">Специалистка</label><select id="bs">' + specs.map(function (s) { return '<option value="' + s.id + '"' + (s.id === ui.calSpec ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") + '</select></div>' +
        '<div class="field"><label for="bd">Дата</label><input id="bd" type="date" value="' + iso + '" required></div><div class="field"><label for="bf">С</label><input id="bf" type="time" value="13:00" step="1800" required></div><div class="field"><label for="bt">До</label><input id="bt" type="time" value="14:00" step="1800" required></div>' +
        '<div class="field field--wide"><label for="br">Причина</label><select id="br"><option>Перерыв</option><option>Выходной</option><option>Личное время</option><option>Обучение</option></select></div><label class="check field--wide"><input id="ball" type="checkbox"> Весь рабочий день</label></div>', "Заблокировать", function () {
        var sp = S.specById($("#bs").value), p = $("#bd").value.split("-"), dk = +p[0] + "-" + +p[1] + "-" + +p[2];
        var s = $("#ball").checked ? toMin(sp.workStart || "09:00") : toMin($("#bf").value), e = $("#ball").checked ? toMin(sp.workEnd || "21:00") : toMin($("#bt").value);
        if (!(e > s)) { toast("Время «до» должно быть позже «с»"); return; }
        var b = S.blocks(); b.push({ id: "B" + Date.now().toString(36), spec: sp.id, day: dk, s: s, e: e, reason: $("#br").value }); S.saveBlocks(b);
        toast("Время заблокировано — на сайте недоступно"); render();
      });
    });
  }
  function weekStart(d) { var wd = (d.getDay() + 6) % 7; return S.addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -wd); }

  /* ---------- 3. Специалистки ---------- */
  function pSpecialists() {
    var specs = D.specialists;
    $("#main").innerHTML = '<div class="page-head"><div><h1>Специалистки</h1><p>Скрытые не видны на сайте и в форме записи. Все — самозанятые, оплата идёт на их реквизиты.</p></div><a class="btn btn--gold btn--sm" href="#specialist/new">Добавить специалистку</a></div>' +
      '<div class="cards">' + specs.map(function (s) {
        return '<article class="panel scard"><img class="ava ava--lg" src="' + avatar(s) + '" alt=""><div style="flex:1;min-width:0"><h3>' + esc(s.name) + ' <span class="chip ' + (s.active !== false ? "st-confirmed" : "st-cancelled") + '">' + (s.active !== false ? "активна" : "скрыта") + "</span></h3><p>" + esc(s.role) + "</p><p>" + esc(s.base.label) + " · " + esc(s.workStart || "09:00") + "–" + esc(s.workEnd || "21:00") + "</p><p>Услуг: " + s.services.length + '</p><div class="actions" style="margin-top:8px"><a class="btn btn--sm" href="#specialist/' + s.id + '">Редактировать</a></div></div></article>';
      }).join("") + "</div>";
  }
  function pSpecialist(id) {
    var isNew = id === "new", sp = isNew ? { id: "s" + Date.now().toString(36), name: "", role: "", exp: "", text: "", base: DISTRICTS[0], services: [], workStart: "09:00", workEnd: "21:00", pay: { sbpPhone: "", bank: "" }, active: true } : JSON.parse(JSON.stringify(S.specById(id) || {}));
    if (!sp.id) { $("#main").innerHTML = '<p class="empty">Не найдена.</p>'; return; }
    var photo = sp.photo || (sp.img ? "../images/" + sp.img + "-400.webp" : "");
    $("#main").innerHTML = '<a class="back" href="#specialists">← Все специалистки</a><div class="page-head"><h1>' + (isNew ? "Новая специалистка" : esc(sp.name)) + "</h1></div>" +
      '<form class="panel" id="spForm" novalidate><div class="form">' +
      '<div class="field field--wide"><span class="lbl">Фото</span><div class="photo-edit">' + (photo ? '<img id="phPrev" src="' + photo + '" alt="Текущее фото">' : '<div class="ph" id="phPrev" role="img" aria-label="Нет фото">?</div>') +
        '<div><input type="file" id="phFile" accept="image/*" aria-describedby="phHint"><p class="hint" id="phHint">Фото обрежется до 4:5 и уменьшится; аватарка сделается автоматически. Хранится только в этом браузере.</p></div></div></div>' +
      '<div class="field"><label for="fName">Имя</label><input id="fName" type="text" required value="' + esc(sp.name) + '"></div>' +
      '<div class="field"><label for="fRole">Специализация</label><input id="fRole" type="text" value="' + esc(sp.role) + '"></div>' +
      '<div class="field"><label for="fExp">Опыт</label><input id="fExp" type="text" value="' + esc(sp.exp) + '" placeholder="Опыт 5 лет"></div>' +
      '<div class="field"><label for="fBase">Район выезда (базовая точка)</label><select id="fBase">' + DISTRICTS.map(function (d, i) { return '<option value="' + i + '"' + (d.label === sp.base.label ? " selected" : "") + ">" + d.label + "</option>"; }).join("") + "</select></div>" +
      '<div class="field field--wide"><label for="fText">Описание</label><textarea id="fText" rows="3">' + esc(sp.text) + "</textarea></div>" +
      '<div class="field"><label for="fWs">Начало работы</label><input id="fWs" type="time" step="1800" value="' + esc(sp.workStart || "09:00") + '"></div>' +
      '<div class="field"><label for="fWe">Конец работы</label><input id="fWe" type="time" step="1800" value="' + esc(sp.workEnd || "21:00") + '"></div>' +
      '<fieldset class="field field--wide" style="border:0;padding:0;margin:0"><legend class="lbl">Услуги и индивидуальные цены</legend><div class="checks" style="grid-template-columns:1fr">' + D.services.map(function (s) {
        var on = sp.services.indexOf(s.id) >= 0, ov = sp.priceOverride && sp.priceOverride[s.id];
        return '<div class="svc-row"><label class="check"><input type="checkbox" name="svc" value="' + esc(s.id) + '"' + (on ? " checked" : "") + "> " + esc(s.title) + ' <span class="small muted">(' + rub(s.price) + ")</span></label>" +
          '<input type="number" min="0" step="50" name="ov-' + esc(s.id) + '" aria-label="Своя цена: ' + esc(s.title) + '" placeholder="своя цена" value="' + (ov || "") + '"></div>';
      }).join("") + "</div></fieldset>" +
      '<div class="field"><label for="fSbp">Телефон для СБП</label><input id="fSbp" type="text" value="' + esc(sp.pay && sp.pay.sbpPhone) + '" placeholder="+7 (000) 000-00-00 (демо)" aria-describedby="payHint"></div>' +
      '<div class="field"><label for="fBank">Банк получателя</label><input id="fBank" type="text" value="' + esc(sp.pay && sp.pay.bank) + '" placeholder="Банк (демо)"></div>' +
      '<p class="hint field--wide" id="payHint">Демо: не вводите реальные данные. Деньги клиента идут напрямую специалистке (самозанятая).</p>' +
      '<label class="check field--wide"><input id="fActive" type="checkbox"' + (sp.active !== false ? " checked" : "") + "> Активна — показывать на сайте и в записи</label>" +
      '</div><p class="warn" id="spErr" hidden></p><div class="actions"><button class="btn btn--gold" type="submit">Сохранить</button><a class="btn btn--line" href="#specialists">Отмена</a></div></form>';
    var newPhoto = null;
    $("#phFile").addEventListener("change", function () {
      var f = this.files[0]; if (!f) return;
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var cut = function (w, h) { var c = document.createElement("canvas"); c.width = w; c.height = h; var ar = w / h, sw = img.width, sh = img.height, cw = sw, ch = sw / ar; if (ch > sh) { ch = sh; cw = sh * ar; } c.getContext("2d").drawImage(img, (sw - cw) / 2, (sh - ch) / 3, cw, ch, 0, 0, w, h); return c.toDataURL("image/webp", 0.8); };
        newPhoto = { photo: cut(400, 500), avatar: cut(160, 160) }; URL.revokeObjectURL(url);
        var p = $("#phPrev"), im = document.createElement("img"); im.id = "phPrev"; im.alt = "Новое фото"; im.src = newPhoto.photo; p.replaceWith(im);
      };
      img.src = url;
    });
    $("#spForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#fName").value.trim(), svcs = $$('input[name=svc]:checked').map(function (i) { return i.value; });
      var err = !name ? "Укажите имя." : !svcs.length ? "Отметьте хотя бы одну услугу." : toMin($("#fWe").value) <= toMin($("#fWs").value) ? "Конец работы должен быть позже начала." : "";
      $("#spErr").hidden = !err; $("#spErr").textContent = err; if (err) return;
      var ov = {}; D.services.forEach(function (s) { var v = +($('input[name="ov-' + s.id + '"]').value || 0); if (v) ov[s.id] = v; });
      Object.assign(sp, { name: name, role: $("#fRole").value.trim(), exp: $("#fExp").value.trim(), text: $("#fText").value.trim(), base: DISTRICTS[+$("#fBase").value], services: svcs,
        priceOverride: ov, workStart: $("#fWs").value, workEnd: $("#fWe").value, pay: { sbpPhone: $("#fSbp").value.trim(), bank: $("#fBank").value.trim() }, active: $("#fActive").checked });
      if (newPhoto) Object.assign(sp, newPhoto);
      var list = D.specialists.slice(), i = list.map(function (x) { return x.id; }).indexOf(sp.id);
      if (i >= 0) list[i] = sp; else list.push(sp);
      S.saveData(list, D.services); toast("Сохранено — на сайте обновится"); location.hash = "#specialists";
    });
  }

  /* ---------- 4. Услуги ---------- */
  function pServices() {
    var list = D.services.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    $("#main").innerHTML = '<div class="page-head"><div><h1>Услуги</h1><p>Порядок — как на сайте. Неактивные услуги скрыты в прайсе и в форме.</p></div><button class="btn btn--sm" type="button" id="addSvc">Добавить услугу</button></div>' +
      '<form id="svcForm"><table class="table svc-table"><thead><tr><th>Порядок</th><th>Название и описание</th><th>Длительность, мин</th><th>Цена, ₽</th><th>Активна</th></tr></thead><tbody>' +
      list.map(function (s, i) {
        return '<tr data-id="' + esc(s.id) + '"><td data-l="Порядок"><div class="ord"><button type="button" data-up="' + i + '" aria-label="Выше: ' + esc(s.title) + '"' + (i === 0 ? " disabled" : "") + '>↑</button><button type="button" data-down="' + i + '" aria-label="Ниже: ' + esc(s.title) + '"' + (i === list.length - 1 ? " disabled" : "") + ">↓</button></div></td>" +
          '<td data-l="Название"><input type="text" name="title" value="' + esc(s.title) + '" aria-label="Название" required><input type="text" name="text" value="' + esc(s.text) + '" aria-label="Описание" style="margin-top:6px"></td>' +
          '<td data-l="Длительность"><input type="number" name="duration" min="10" step="5" value="' + s.duration + '" aria-label="Длительность, мин"></td>' +
          '<td data-l="Цена"><input type="number" name="price" min="0" step="50" value="' + s.price + '" aria-label="Цена, ₽"></td>' +
          '<td data-l="Активна"><label class="check"><input type="checkbox" name="active"' + (s.active !== false ? " checked" : "") + "> да</label></td></tr>";
      }).join("") + '</tbody></table><div class="actions"><button class="btn btn--gold" type="submit">Сохранить услуги</button></div></form>';
    var collect = function () {
      return $$("#svcForm tbody tr").map(function (tr, i) {
        var old = list.filter(function (x) { return x.id === tr.getAttribute("data-id"); })[0];
        return Object.assign({}, old, { order: i + 1, title: $('[name=title]', tr).value.trim() || old.title, text: $('[name=text]', tr).value.trim(), duration: +$('[name=duration]', tr).value || old.duration, price: +$('[name=price]', tr).value || 0, active: $('[name=active]', tr).checked });
      });
    };
    var move = function (i, d) { var c = collect(), t = c[i]; c[i] = c[i + d]; c[i + d] = t; c.forEach(function (x, k) { x.order = k + 1; }); S.saveData(D.specialists, c); render(); };
    $$("[data-up]").forEach(function (b) { b.addEventListener("click", function () { move(+b.getAttribute("data-up"), -1); }); });
    $$("[data-down]").forEach(function (b) { b.addEventListener("click", function () { move(+b.getAttribute("data-down"), 1); }); });
    $("#svcForm").addEventListener("submit", function (e) { e.preventDefault(); S.saveData(D.specialists, collect()); toast("Услуги сохранены"); render(); });
    $("#addSvc").addEventListener("click", function () {
      var c = collect(); c.push({ id: "x" + Date.now().toString(36), order: c.length + 1, active: false, title: "Новая услуга", duration: 30, price: 1000, text: "" });
      S.saveData(D.specialists, c); toast("Добавлена неактивная услуга — заполните и включите"); render();
      var ins = $$('#svcForm tbody tr:last-child input[name=title]')[0]; if (ins) { ins.focus(); ins.select(); }
    });
  }

  /* ---------- 5. Выезд и цены ---------- */
  var PF = [
    ["T", "T — базовый выезд, ₽", 10], ["D0", "D₀ — км в базовом выезде", 0.5], ["R", "R — за каждый км сверх D₀, ₽", 1], ["Tmin", "Минимальная стоимость выезда, ₽", 10],
    ["Dmax", "Максимальная зона, км", 1], ["roadFactor", "Коэффициент дороги (прямая × k)", 0.05], ["roundTo", "Округление выезда вверх, ₽", 1]
  ];
  var SF = [["travelBufferMin", "Буфер на дорогу после сеанса, мин", 5], ["holdMinutes", "Временная бронь (HOLD), мин", 5], ["stepMin", "Шаг слотов, мин", 5]];
  function pPricing() {
    var C = window.SPA_CONFIG, specs = S.activeSpecs();
    var num = function (f, v) { return '<div class="field"><label for="p-' + f[0] + '">' + f[1] + '</label><input id="p-' + f[0] + '" data-k="' + f[0] + '" type="number" step="' + f[2] + '" min="0" value="' + v + '"></div>'; };
    $("#main").innerHTML = '<div class="page-head"><div><h1>Выезд и цены</h1><p>P = S + max(T + max(0, D − D₀) × R, T<sub>min</sub>). D — оценка км по дороге от базовой точки специалистки. Сохранение сразу меняет расчёт в форме на сайте.</p></div></div>' +
      '<div class="grid2"><form class="panel" id="prForm"><h2>Тарифы выезда</h2><div class="form">' + PF.map(function (f) { return num(f, C.pricing[f[0]]); }).join("") + "</div>" +
      '<h2 style="margin-top:18px">Расписание</h2><div class="form">' + SF.map(function (f) { return num(f, C.schedule[f[0]]); }).join("") +
      '<div class="field"><label for="p-dayStart">Начало дня (если у специалистки не задано)</label><input id="p-dayStart" type="time" step="1800" value="' + C.schedule.dayStart + '"></div><div class="field"><label for="p-dayEnd">Конец дня (если у специалистки не задано)</label><input id="p-dayEnd" type="time" step="1800" value="' + C.schedule.dayEnd + '"></div></div>' +
      '<div class="actions"><button class="btn btn--gold" type="submit">Сохранить</button><button class="btn btn--line" type="button" id="prReset">Вернуть значения по умолчанию</button></div></form>' +
      '<section class="panel"><h2>Превью расчёта</h2><div class="form"><div class="field"><label for="pvSpec">Специалистка</label><select id="pvSpec">' + specs.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + " · " + esc(s.base.label) + "</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="pvAddr">Тестовый адрес</label><select id="pvAddr">' + window.SPA_DATA.places.map(function (p, i) { return '<option value="' + i + '"' + (p.name === "пр. Победы" ? " selected" : "") + ">" + esc(p.name) + " — " + esc(p.area) + "</option>"; }).join("") + '</select></div></div>' +
      '<fieldset style="border:0;padding:0;margin:10px 0"><legend class="lbl small" style="font-weight:600">Услуги</legend><div class="checks">' + S.activeServices().map(function (s, i) { return '<label class="check"><input type="checkbox" name="pvs" value="' + s.id + '"' + (i === 3 ? " checked" : "") + "> " + esc(s.title) + "</label>"; }).join("") + "</div></fieldset>" +
      '<div class="preview" id="pvOut" aria-live="polite"></div><p class="small muted">Превью считает по значениям в форме слева, даже несохранённым.</p></section></div>';
    var formVals = function () {
      var p = Object.assign({}, C.pricing), s = Object.assign({}, C.schedule);
      $$("#prForm [data-k]").forEach(function (i) { var k = i.getAttribute("data-k"), v = +i.value; if (k in C.pricing) p[k] = v; else s[k] = v; });
      s.dayStart = $("#p-dayStart").value; s.dayEnd = $("#p-dayEnd").value; return { p: p, s: s };
    };
    var preview = function () {
      var v = formVals(), sp = S.specById($("#pvSpec").value), pl = window.SPA_DATA.places[+$("#pvAddr").value], ids = $$("input[name=pvs]:checked").map(function (i) { return i.value; });
      var r = S.calcPrice(sp, ids, pl, v.p);
      $("#pvOut").innerHTML = '<table class="calc"><tr><td>S — услуги</td><td>' + rub(r.S) + "</td></tr><tr><td>D — расстояние</td><td>≈ " + km(r.D) + "</td></tr>" +
        (r.out ? '<tr><td colspan="2">Вне зоны обслуживания (&gt; ' + v.p.Dmax + " км): заявка уйдёт с пометкой «ручной расчёт»</td></tr>" :
        "<tr><td>T — базовый выезд</td><td>" + rub(v.p.T) + "</td></tr><tr><td>Доплата: " + km(r.extraKm) + " × " + rub(v.p.R) + "</td><td>" + rub(r.extraCost) + "</td></tr><tr><td>Выезд" + (r.minApplied ? " (минимум)" : "") + "</td><td>" + rub(r.travel) + '</td></tr><tr class="total"><td>Итого</td><td>' + rub(r.P) + "</td></tr>") + "</table>";
    };
    $$("#main input, #main select").forEach(function (i) { i.addEventListener("input", preview); i.addEventListener("change", preview); });
    preview();
    $("#prForm").addEventListener("submit", function (e) { e.preventDefault(); var v = formVals(); S.saveConfig(v.p, v.s); toast("Тарифы сохранены — форма на сайте считает по ним"); render(); });
    $("#prReset").addEventListener("click", function () { try { localStorage.removeItem(S.K.cfg); } catch (e) {} S.applyAll(); toast("Тарифы по умолчанию (js/config.js)"); render(); });
  }

  /* ---------- 6. Настройки ---------- */
  function pSettings() {
    var st = S.settings(), last = S.requests().sort(function (a, b) { return b.created - a.created; })[0];
    var tf = function (id, label, v, ph) { return '<div class="field"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="text" value="' + esc(v) + '" placeholder="' + esc(ph || "") + '"></div>'; };
    var msg = last ? "🆕 Заявка " + last.id + "\n" + (S.specById(last.spec) || {}).name + " · " + dayLabel(last.day) + " " + fmt(last.s) + "\n" + last.svcs.map(svcTitle).join(", ") + "\n" + (last.place ? last.place.name : "") + "\nИтого ≈ " + rub(S.finalTotal(last)) + "\n[Подтвердить] [Отклонить]" : "—";
    $("#main").innerHTML = '<div class="page-head"><div><h1>Настройки</h1><p>Контакты и тексты сразу меняются на сайте (в этом браузере).</p></div></div>' +
      '<form class="panel" id="stForm"><h2>Контакты салона</h2><div class="form">' + tf("sPhone", "Телефон", st.phone) + tf("sTg", "Telegram", st.telegram) + tf("sHours", "Часы работы", st.hours) + tf("sZone", "Зона выезда", st.zone) + "</div>" +
      '<h2 style="margin-top:18px">Первый экран (необязательно)</h2><div class="form">' + tf("sHero", "Заголовок H1", st.heroTitle, "Лучший выездной спа в Казани") +
      '<div class="field field--wide"><label for="sLead">Подзаголовок</label><textarea id="sLead" rows="2" placeholder="Пусто — текст по умолчанию">' + esc(st.heroLead) + "</textarea></div></div>" +
      '<h2 style="margin-top:18px">Telegram-уведомления</h2><p class="small muted" style="margin:0 0 8px">Демо-заглушка: в прототипе ничего не отправляется, токены не нужны и не хранятся. В рабочей версии заявки приходят в бот салона с кнопками.</p>' +
      '<label class="check"><input id="sTgOn" type="checkbox"' + (st.tgEnabled ? " checked" : "") + '> Присылать новые заявки в Telegram (демо)</label>' +
      '<div class="form" style="margin-top:10px"><div class="field"><label for="sTgChat">Чат администратора</label><input id="sTgChat" type="text" value="' + esc(st.tgChat) + '" placeholder="подключится через бот в рабочей версии" disabled></div></div>' +
      '<div class="field" style="margin-top:10px"><span class="lbl">Так будет выглядеть уведомление</span><pre class="preview small" style="white-space:pre-wrap;margin:0;font-family:inherit">' + esc(msg) + "</pre></div>" +
      '<div class="actions"><button class="btn btn--gold" type="submit">Сохранить</button></div></form>';
    $("#stForm").addEventListener("submit", function (e) {
      e.preventDefault();
      S.saveSettings({ phone: $("#sPhone").value.trim(), telegram: $("#sTg").value.trim(), hours: $("#sHours").value.trim(), zone: $("#sZone").value.trim(), heroTitle: $("#sHero").value.trim(), heroLead: $("#sLead").value.trim(), tgEnabled: $("#sTgOn").checked, tgChat: "" });
      toast("Настройки сохранены");
    });
  }

  boot();
})();
