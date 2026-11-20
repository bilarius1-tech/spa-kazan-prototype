(function () {
  "use strict";
  var C = window.SPA_CONFIG, D = window.SPA_DATA;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rub = function (n) { return Math.round(n).toLocaleString("ru-RU").replace(/,/g, " ") + " ₽"; };
  var Store = window.SpaStore;
  var svcById = function (id) { return Store.svcById(id) || { title: id, duration: 0, price: 0 }; };
  var specById = function (id) { return Store.specById(id); };
  var HOLD_KEY = "spaKazanDemoHolds";

  var state = { step: 1, spec: null, svcs: [], place: null, day: null, slot: null, travel: null };

  /* ---------- helpers ---------- */
  function priceFor(spec, sid) { return Store.priceFor(spec, sid); }
  function toMin(t) { var p = t.split(":"); return +p[0] * 60 + +p[1]; }
  function fmt(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
  function durLabel(m) { var h = Math.floor(m / 60), mm = m % 60; return (h ? h + " ч " : "") + (mm ? mm + " мин" : "").trim(); }
  function haversine(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* Расчёт цены — общий с админкой (js/store.js): P = S + max(T + max(0, D − D0) × R, Tmin) */
  function calc() { return Store.calcPrice(state.spec, state.svcs, state.place); }

  /* ---------- расписание: заявки + ручные блокировки из общего хранилища ---------- */
  function busyFor(specId, date) { return Store.busy(specId, dayKey(date)); }
  function slotsFor(spec, date, dur) {
    var out = [], start = toMin(spec.workStart || C.schedule.dayStart), end = toMin(spec.workEnd || C.schedule.dayEnd);
    var busy = busyFor(spec.id, date), now = new Date();
    var isToday = dayKey(now) === dayKey(date), nowMin = now.getHours() * 60 + now.getMinutes() + 60;
    var need = Math.max(dur, 30) + C.schedule.travelBufferMin;
    for (var t = start; t + Math.max(dur, 30) <= end; t += C.schedule.stepMin) {
      var conflict = null;
      busy.forEach(function (b) { if (t < b.e && t + need > b.s) conflict = conflict === "busy" ? "busy" : b.kind; });
      if (isToday && t < nowMin) conflict = "busy";
      out.push({ t: t, state: conflict || "free" });
    }
    return out;
  }
  function nextFree(spec) {
    var dur = 60, d = new Date();
    for (var i = 0; i < C.schedule.daysAhead; i++) {
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      var f = slotsFor(spec, day, dur).filter(function (s) { return s.state === "free"; })[0];
      if (f) return (i === 0 ? "сегодня" : i === 1 ? "завтра" : day.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })) + " в " + fmt(f.t);
    }
    return null;
  }

  /* ---------- рендер витрины ---------- */
  function picture(spec, sizes, cls, alt) {
    if (spec.photo) return '<img class="' + (cls || "") + '" src="' + spec.photo + '" alt="' + (alt || "") + '" loading="lazy" decoding="async" width="400" height="500">';
    if (!spec.img) return '<div class="ph-photo" role="img" aria-label="Фото не загружено">' + spec.name.charAt(0) + '</div>';
    return '<picture><source type="image/webp" srcset="images/' + spec.img + '-400.webp 400w, images/' + spec.img + '-800.webp 800w" sizes="' + sizes + '">' +
      '<img class="' + (cls || "") + '" src="images/' + spec.img + '-400.webp" alt="' + (alt || "") + '" loading="lazy" decoding="async" width="400" height="500"></picture>';
  }
  function renderSpecs() {
    $("#specGrid").innerHTML = Store.activeSpecs().map(function (s) {
      var nf = nextFree(s);
      return '<article class="spec">' +
        '<div class="spec__media"><span class="badge">Пример</span>' + picture(s, "(min-width:960px) 340px, (min-width:600px) 50vw, 100vw", "", "Фото-пример: массажистка за работой") + '</div>' +
        '<div class="spec__body"><h3 class="spec__name">' + s.name + '</h3><p class="spec__role">' + s.role + '</p>' +
        '<p class="spec__text">' + s.text + '</p><p class="spec__meta">' + s.exp + ' · выезжает из: ' + s.base.label + '</p>' +
        '<ul class="tags" aria-label="Услуги">' + s.services.filter(function (id) { var x = Store.svcById(id); return x && x.active !== false; }).map(function (id) { return "<li>" + svcById(id).title + "</li>"; }).join("") + "</ul>" +
        '<p class="spec__next">' + (nf ? "Ближайшее свободное время: " + nf : "Нет свободного времени на 2 недели") + "</p>" +
        '<button class="btn btn--line btn--sm" type="button" data-pick="' + s.id + '"' + (nf ? "" : " disabled") + ' aria-label="Записаться: ' + s.name + '">Записаться</button></div></article>';
    }).join("");
    $$("[data-pick]").forEach(function (b) {
      b.addEventListener("click", function () {
        selectSpec(b.getAttribute("data-pick"));
        goStep(2);
        $("#booking").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      });
    });
  }
  function renderServices() {
    $("#svcList").innerHTML = Store.activeServices().map(function (s) {
      return '<li class="svc"><h3>' + s.title + '</h3><div class="svc__price">от ' + rub(s.price) + "<small>" + s.duration + " мин · пример</small></div><p>" + s.text + "</p></li>";
    }).join("");
  }

  /* ---------- шаги формы ---------- */
  function renderSpecChoices() {
    $("#specChoices").innerHTML = Store.activeSpecs().map(function (s) {
      return '<label class="choice"><input type="radio" name="spec" value="' + s.id + '"' + (state.spec && state.spec.id === s.id ? " checked" : "") + '><span class="choice__mark" aria-hidden="true"></span>' +
        '<img class="choice__img" src="' + avatar(s) + '" alt="" width="56" height="56" loading="lazy" decoding="async">' + '<span class="choice__main"><span class="choice__title">' + s.name + '</span><span class="choice__sub"> · ' + s.role + "</span></span></label>";
    }).join("");
    $$('#specChoices input').forEach(function (i) { i.addEventListener("change", function () { selectSpec(i.value); }); });
  }
  function selectSpec(id) {
    var prev = state.spec && state.spec.id;
    state.spec = specById(id);
    if (prev !== id) {
      state.svcs = state.svcs.filter(function (s) { return state.spec.services.indexOf(s) >= 0; });
      state.slot = null;
    }
    renderSpecChoices(); renderSvcChoices(); updateDistance(); renderSummary();
  }
  function renderSvcChoices() {
    var spec = state.spec;
    $("#svcChoices").innerHTML = Store.activeServices().map(function (s) {
      var avail = !spec || spec.services.indexOf(s.id) >= 0;
      return '<label class="choice choice--check"><input type="checkbox" name="svc" value="' + s.id + '"' + (state.svcs.indexOf(s.id) >= 0 ? " checked" : "") + (avail ? "" : " disabled") +
        '><span class="choice__mark" aria-hidden="true"></span><span class="choice__main"><span class="choice__title">' + s.title + '</span><br><span class="choice__sub">' +
        (avail ? s.duration + " мин" : "не выполняет " + (spec ? spec.name : "")) + '</span></span><span class="choice__price">' + (avail ? rub(priceFor(spec, s.id)) : "—") + "</span></label>";
    }).join("");
    $$('#svcChoices input').forEach(function (i) {
      i.addEventListener("change", function () {
        state.svcs = $$('#svcChoices input:checked').map(function (x) { return x.value; });
        state.slot = null; renderSummary();
      });
    });
  }

  /* адрес: комбобокс */
  var addr = $("#addr"), list = $("#addrList"), active = -1, matches = [];
  function norm(s) { return s.toLowerCase().replace(/ё/g, "е").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim(); }
  function openList() {
    var q = norm(addr.value).replace(/^(ул|улица|пр|проспект|пос|с|г)\s/, "");
    matches = q.length < 1 ? [] : D.places.filter(function (p) { return norm(p.name + " " + p.area).indexOf(q) >= 0; }).slice(0, 8);
    active = -1;
    if (!matches.length) {
      list.innerHTML = q.length ? '<li role="option" aria-disabled="true">Нет в демо-списке. Попробуйте: Баумана, Ямашева, Победы</li>' : "";
      list.hidden = !q.length; addr.setAttribute("aria-expanded", String(!!q.length)); return;
    }
    list.innerHTML = matches.map(function (p, i) { return '<li role="option" id="opt' + i + '" aria-selected="false" data-i="' + i + '">' + p.name + "<span>" + p.area + "</span></li>"; }).join("");
    list.hidden = false; addr.setAttribute("aria-expanded", "true");
  }
  function closeList() { list.hidden = true; addr.setAttribute("aria-expanded", "false"); addr.removeAttribute("aria-activedescendant"); }
  function choose(i) {
    var p = matches[i]; if (!p) return;
    state.place = p; addr.value = p.name + ", " + p.area; closeList(); updateDistance(); renderSummary();
    $("#house").focus();
  }
  addr.addEventListener("input", function () { state.place = null; updateDistance(); renderSummary(); openList(); });
  addr.addEventListener("focus", function () { if (!state.place && addr.value) openList(); });
  addr.addEventListener("keydown", function (e) {
    var opts = $$('li[data-i]', list);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (list.hidden) openList(); if (!opts.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.setAttribute("aria-selected", String(i === active)); });
      addr.setAttribute("aria-activedescendant", "opt" + active); opts[active].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") { if (!list.hidden && active >= 0) { e.preventDefault(); choose(active); } }
    else if (e.key === "Escape") closeList();
  });
  list.addEventListener("mousedown", function (e) { var li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); choose(+li.getAttribute("data-i")); } });
  addr.addEventListener("blur", function () { setTimeout(closeList, 120); });

  function updateDistance() {
    var box = $("#distanceBox"), r = calc();
    if (!state.place || !state.spec) { box.innerHTML = ""; return; }
    if (r.out) {
      box.innerHTML = '<div class="distance__card distance__card--out">≈ ' + r.D.toLocaleString("ru-RU") + " км от " + state.spec.base.label + ". Это за пределами зоны обслуживания (" + C.pricing.Dmax + " км, демо). Заявку можно отправить — администратор рассчитает выезд вручную.</div>";
    } else {
      box.innerHTML = '<div class="distance__card">≈ ' + r.D.toLocaleString("ru-RU") + " км по дороге от точки специалистки (" + state.spec.base.label + "). Выезд: <b>" + rub(r.travel) + "</b>" + (r.minApplied ? " (минимальная стоимость выезда)" : "") + ".</div>";
    }
  }

  /* дата и время */
  function renderDays() {
    var now = new Date(), html = "";
    for (var i = 0; i < C.schedule.daysAhead; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      var k = dayKey(d), sel = state.day && dayKey(state.day) === k;
      html += '<button type="button" class="day" role="radio" aria-checked="' + sel + '" tabindex="' + (sel || (!state.day && i === 0) ? 0 : -1) + '" data-i="' + i + '"><small>' +
        (i === 0 ? "сегодня" : d.toLocaleDateString("ru-RU", { weekday: "short" })) + "</small><b>" + d.getDate() + "</b><small>" + d.toLocaleDateString("ru-RU", { month: "short" }) + "</small></button>";
    }
    $("#days").innerHTML = html;
    $$("#days .day").forEach(function (b) {
      b.addEventListener("click", function () {
        var i = +b.getAttribute("data-i"); state.day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i); state.slot = null;
        renderDays(); renderSlots(); renderSummary(); $('#days .day[data-i="' + i + '"]').focus();
      });
    });
    radioKeys($("#days"), ".day");
  }
  function renderSlots() {
    var r = calc();
    $("#durHint").textContent = "Длительность сеанса: " + durLabel(r.dur) + ". Время блокируется на сеанс плюс " + C.schedule.travelBufferMin + " мин на дорогу.";
    if (!state.day) { $("#slots").innerHTML = '<p class="hint">Выберите дату.</p>'; return; }
    var sl = slotsFor(state.spec, state.day, r.dur);
    var free = sl.filter(function (s) { return s.state === "free"; }).length;
    $("#slots").innerHTML = free ? sl.map(function (s) {
      var sel = state.slot === s.t;
      return '<button type="button" class="slot' + (s.state === "hold" ? " is-hold" : "") + '" role="radio" aria-checked="' + sel + '" data-t="' + s.t + '"' + (s.state !== "free" ? " disabled aria-label=\"" + fmt(s.t) + (s.state === "hold" ? ", ожидает подтверждения" : ", занято") + "\"" : "") + ">" + fmt(s.t) + "</button>";
    }).join("") : '<p class="hint">На этот день свободного времени нет — выберите другую дату.</p>';
    $$("#slots .slot:not(:disabled)").forEach(function (b, idx) {
      if (state.slot == null ? idx === 0 : +b.getAttribute("data-t") === state.slot) b.tabIndex = 0; else b.tabIndex = -1;
      b.addEventListener("click", function () { state.slot = +b.getAttribute("data-t"); renderSlots(); renderSummary(); $('#slots .slot[data-t="' + state.slot + '"]').focus(); });
    });
    radioKeys($("#slots"), ".slot:not(:disabled)");
  }
  function radioKeys(group, sel) {
    group.onkeydown = function (e) {
      var items = $$(sel, group), i = items.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    };
  }

  /* сводка */
  function avatar(spec) {
    if (spec.avatar) return spec.avatar;
    if (!spec.img) return "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#E9DDC6"/><text x="32" y="42" font-size="28" text-anchor="middle" font-family="Georgia" fill="#352A20">' + spec.name.charAt(0) + '</text></svg>');
    return "images/" + spec.img.replace("specialist", "avatar") + ".webp";
  }
  function who(spec) {
    return '<span class="who"><img src="' + avatar(spec) + '" alt="" width="32" height="32" decoding="async">' + spec.name + "</span>";
  }
  function renderPicked() {
    var el = $("#picked"), sp = state.spec;
    if (!sp) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = '<img src="' + avatar(sp) + '" alt="" width="48" height="48" decoding="async"><span class="picked__txt"><b>' + sp.name + "</b>" + sp.role + "</span>" +
      (state.step > 1 ? '<button type="button" id="changeSpec">Сменить</button>' : "");
    var b = $("#changeSpec"); if (b) b.addEventListener("click", function () { goStep(1); });
  }
  function rows(r) {
    var out = [];
    out.push(["Специалистка", state.spec ? who(state.spec) : "—"]);
    out.push(["Услуги", state.svcs.length ? state.svcs.map(function (id) { return svcById(id).title; }).join(", ") : "—"]);
    out.push(["Длительность", r.dur ? durLabel(r.dur) : "—"]);
    out.push(["Адрес", state.place ? state.place.name + ($("#house").value ? ", д. " + $("#house").value : "") : "—"]);
    out.push(["Дата и время", state.day && state.slot != null ? state.day.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" }) + ", " + fmt(state.slot) + "–" + fmt(state.slot + r.dur) : "—"]);
    out.push(["Услуги, S", r.S ? rub(r.S) : "—"]);
    out.push(["Выезд", r.out ? "вручную" : r.travel != null ? rub(r.travel) + " (" + r.D.toLocaleString("ru-RU") + " км)" : "—"]);
    return out;
  }
  function renderSummary() {
    var r = calc();
    renderPicked();
    $("#summary").innerHTML = rows(r).map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>"; }).join("");
    $("#total").textContent = r.P != null ? rub(r.P) : r.out && r.S ? rub(r.S) + " + выезд" : r.S ? "от " + rub(r.S) : "—";
    $("#totalMini").textContent = $("#total").textContent;
    var P = C.pricing;
    $("#formulaVals").textContent = "Демо-значения: T = " + rub(P.T) + ", D₀ = " + P.D0 + " км, R = " + rub(P.R) + "/км, Tmin = " + rub(P.Tmin) + ", макс. зона " + P.Dmax + " км, выезд округляется вверх до " + (P.roundTo || 1) + " ₽." +
      (r.travel != null ? " Сейчас: " + rub(r.S) + " + max(" + rub(P.T) + " + " + (Math.round(r.extraKm * 10) / 10).toLocaleString("ru-RU") + " × " + P.R + ", " + P.Tmin + ") = " + rub(r.P) + "." : "");
  }

  /* навигация */
  function validate(step) {
    var err = "";
    if (step === 1 && !state.spec) err = "Выберите специалистку.";
    if (step === 2 && !state.svcs.length) err = "Отметьте хотя бы одну услугу.";
    if (step === 3) {
      if (!state.place) err = "Выберите адрес из подсказок.";
      else if (!$("#house").value.trim()) { err = "Укажите номер дома."; $("#house").setAttribute("aria-invalid", "true"); }
      else $("#house").removeAttribute("aria-invalid");
      addr.setAttribute("aria-invalid", String(!state.place));
    }
    if (step === 4 && (!state.day || state.slot == null)) err = "Выберите дату и свободное время.";
    if (step === 5) {
      var nm = $("#name"), ph = $("#phone"), digits = ph.value.replace(/\D/g, "");
      nm.setAttribute("aria-invalid", String(!nm.value.trim())); ph.setAttribute("aria-invalid", String(digits.length !== 11));
      if (!nm.value.trim()) err = "Укажите имя.";
      else if (digits.length !== 11) err = "Проверьте телефон: нужно 11 цифр.";
      else if (!$("#agree").checked) err = "Нужно согласие на обработку данных.";
    }
    $("#err" + step).textContent = err;
    return !err;
  }
  function goStep(n) {
    state.step = n;
    $$(".panel").forEach(function (p) { p.hidden = +p.getAttribute("data-step") !== n; });
    $$("#progress li").forEach(function (li) {
      var s = +li.getAttribute("data-step");
      li.className = s < n ? "is-done" : s === n ? "is-current" : "";
      if (s === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    $("#backBtn").disabled = n === 1;
    renderPicked();
    $("#nextBtn").textContent = n === 5 ? "Отправить заявку" : "Далее";
    if (n === 4) { if (!state.day) state.day = new Date(new Date().setHours(0, 0, 0, 0)); renderDays(); renderSlots(); }
    var t = $('.panel[data-step="' + n + '"] .panel__title'); if (t && document.activeElement !== document.body) t.focus({ preventScroll: true });
  }
  $("#nextBtn").addEventListener("click", function () {
    if (!validate(state.step)) return;
    if (state.step < 5) goStep(state.step + 1); else submit();
  });
  $("#backBtn").addEventListener("click", function () { if (state.step > 1) goStep(state.step - 1); });
  $("#house").addEventListener("input", renderSummary);
  $("#phone").addEventListener("input", function (e) {
    var d = e.target.value.replace(/\D/g, ""); if (d[0] === "8") d = "7" + d.slice(1); if (d && d[0] !== "7") d = "7" + d; d = d.slice(0, 11);
    var f = d ? "+7" : ""; if (d.length > 1) f += " (" + d.slice(1, 4); if (d.length >= 4) f += ")"; if (d.length > 4) f += " " + d.slice(4, 7); if (d.length > 7) f += "-" + d.slice(7, 9); if (d.length > 9) f += "-" + d.slice(9, 11);
    e.target.value = f;
  });
  $("#wizard").addEventListener("submit", function (e) { e.preventDefault(); });

  /* отправка (демо) */
  var lastHold = null, lastFocus = null;
  function submit() {
    var r = calc(), list = Store.requests();
    lastHold = Store.makeRequest({ spec: state.spec.id, svcs: state.svcs.slice(), day: dayKey(state.day), s: state.slot, place: state.place,
      house: $("#house").value.trim(), flat: $("#flat").value.trim(), entr: $("#entr").value.trim(),
      name: $("#name").value.trim(), phone: $("#phone").value.trim(), comment: $("#comment").value.trim() });
    list.push(lastHold); Store.saveRequests(list);
    var ex = new Date(lastHold.expires);
    $("#modalLead").textContent = "Номер заявки " + lastHold.id + " (демо). Специалистка: " + state.spec.name + ". Выбранное время держится за вами " + C.schedule.holdMinutes + " минут — до " + fmt(ex.getHours() * 60 + ex.getMinutes()) + ". Администратор перезвонит для подтверждения.";
    $("#modalSummary").innerHTML = rows(r).concat([["Итого предварительно", r.P != null ? rub(r.P) : rub(r.S) + " + выезд вручную"]]).map(function (x) { return "<div><dt>" + x[0] + "</dt><dd>" + x[1] + "</dd></div>"; }).join("");
    renderTimeline(1); $("#simConfirm").hidden = false;
    lastFocus = document.activeElement;
    $("#modal").hidden = false; document.body.classList.add("no-scroll"); $(".modal__box").focus();
    renderSpecs();
  }
  function renderTimeline(stage) {
    var items = ["Заявка отправлена", "Администратор позвонил и подтвердил время", "Сеанс у вас дома", "Итоговый счёт и оплата по СБП (QR-код)"];
    $("#timeline").innerHTML = items.map(function (t, i) { return '<li class="' + (i < stage ? "is-done" : i === stage ? "is-current" : "") + '">' + t + (i === stage ? " — ожидаем" : "") + "</li>"; }).join("");
  }
  $("#simConfirm").addEventListener("click", function () {
    if (lastHold) Store.updateRequest(lastHold.id, function (h) { h.status = "confirmed"; h.history.push({ at: Date.now(), text: "Подтверждена (демо-кнопка на сайте)" }); });
    $("#modalTitle").textContent = "Заявка подтверждена (демо)";
    renderTimeline(2); this.hidden = true; $(".modal__box").focus(); renderSpecs();
  });
  function closeModal() {
    $("#modal").hidden = true; document.body.classList.remove("no-scroll");
    $("#modalTitle").textContent = "Заявка отправлена, ожидайте подтверждения";
    state.slot = null; goStep(4); renderSummary();
    if (lastFocus) lastFocus.focus();
  }
  $$("[data-close]").forEach(function (b) { b.addEventListener("click", closeModal); });
  document.addEventListener("keydown", function (e) {
    if ($("#modal").hidden) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") {
      var f = $$("#modal button:not([hidden])"); var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* подвал: фон грузим, когда подвал близко */
  (function () {
    var f = $("#footer"); if (!f) return;
    if (!("IntersectionObserver" in window)) { f.classList.add("is-bg"); return; }
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { f.classList.add("is-bg"); io.disconnect(); } }); }, { rootMargin: "600px" });
    io.observe(f);
  })();

  /* настройки салона из админки */
  function applySettings() {
    var st = Store.settings(), dl = $("#contactsList");
    if (dl) dl.innerHTML = [["Телефон", st.phone], ["Telegram", st.telegram], ["Часы работы", st.hours], ["Зона выезда", st.zone]].map(function (x) {
      var d = document.createElement("dd"); d.textContent = x[1]; return "<div><dt>" + x[0] + "</dt>" + d.outerHTML + "</div>"; }).join("");
    if (st.heroTitle) $("#hero-title").textContent = st.heroTitle;
    if (st.heroLead) $(".hero__lead").textContent = st.heroLead;
  }
  /* изменения из админки в соседней вкладке */
  window.addEventListener("storage", function (e) {
    if (!e.key || e.key.indexOf("spaKazanDemo") !== 0) return;
    Store.applyAll();
    if (state.spec) state.spec = specById(state.spec.id) || null;
    renderSpecs(); renderServices(); renderSpecChoices(); renderSvcChoices(); renderSummary(); updateDistance();
    if (state.step === 4) renderSlots();
    applySettings();
  });

  /* init */
  applySettings();
  renderSpecs(); renderServices(); renderSpecChoices(); renderSvcChoices(); renderSummary(); goStep(1);
})();
