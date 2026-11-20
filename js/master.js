/* Калькулятор мастера (демо): услуги + выезд по зонам от базы + аренда кушетки → демо-QR СБП на счёт мастера. Данные — js/store.js. */
(function () {
  "use strict";
  var S = window.SpaStore;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var rub = function (n) { return Math.round(+n || 0).toLocaleString("ru-RU").replace(/,/g, " ") + " ₽"; };
  var km = function (n) { return (Math.round(n * 10) / 10).toLocaleString("ru-RU") + " км"; };
  var KEY = "spaKazanDemoMaster";
  var st = { svcs: [], place: null };

  function me() { try { return S.specById(sessionStorage.getItem(KEY)); } catch (e) { return null; } }
  function boot() {
    S.applyAll();
    var m = me(); $("#login").hidden = !!m; $("#app").hidden = !m;
    if (!m) { $("#who").innerHTML = S.activeSpecs().map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + " · " + esc(s.role) + "</option>"; }).join(""); return; }
    $("#whoName").textContent = m.name + " · мастер (самозанятая)";
    render();
  }
  $("#loginForm").addEventListener("submit", function (e) { e.preventDefault(); try { sessionStorage.setItem(KEY, $("#who").value); } catch (x) {} boot(); });
  $("#logoutBtn").addEventListener("click", function () { try { sessionStorage.removeItem(KEY); } catch (x) {} boot(); });

  function render() {
    var m = me(), P = window.SPA_CONFIG.pricing; if (!m) return;
    st.svcs = st.svcs.filter(function (id) { return m.services.indexOf(id) >= 0; });
    $("#mSvc").innerHTML = S.activeServices().filter(function (s) { return m.services.indexOf(s.id) >= 0; }).map(function (s) {
      return '<label><input type="checkbox" name="msvc" value="' + s.id + '"' + (st.svcs.indexOf(s.id) >= 0 ? " checked" : "") + '><span class="t">' + esc(s.title) + ' <span class="small muted">· ' + s.duration + ' мин</span></span><span class="p">' + rub(S.priceFor(m, s.id)) + "</span></label>";
    }).join("");
    $$("#mSvc input").forEach(function (i) { i.addEventListener("change", function () { st.svcs = $$("#mSvc input:checked").map(function (x) { return x.value; }); calc(); }); });
    $("#mCouchLbl").textContent = "Аренда кушетки (" + rub(P.couchPrice) + ", демо)";
    $("#baseNote").textContent = P.mode === "formula" ? "Выезд — по старой формуле от вашей базовой точки (" + m.base.label + "). Значения — демо." :
      "Выезд — по зонам от базы салона (" + P.base.label + ", координаты приблизительные). Зоны и цены — демо, задаются в админке.";
    calc();
  }

  function calc() {
    var m = me(), P = window.SPA_CONFIG.pricing, r = S.calcPrice(m, st.svcs, st.place, null, { couch: $("#mCouch").checked });
    var rows = [["Услуги" + (st.svcs.length ? '<div class="sub">' + st.svcs.map(function (id) { return esc(S.svcById(id).title) + " · " + rub(S.priceFor(m, id)); }).join("<br>") + "</div>" : ""), st.svcs.length ? rub(r.S) : "—"]];
    if (!st.place) rows.push(["Выезд<div class=\"sub\">выберите адрес из подсказок</div>", "—"]);
    else if (r.out) rows.push(["Выезд<div class=\"sub\">≈ " + km(r.D) + " — дальше зоны (" + S.maxKm() + " км), согласуйте вручную</div>", "вручную"]);
    else if (r.mode === "zones") rows.push(["Выезд, зона " + S.zoneLabel(r.zone) + '<div class="sub">≈ ' + km(r.D) + " по дороге от " + esc(r.origin) + "</div>", rub(r.travel)]);
    else rows.push(["Выезд<div class=\"sub\">≈ " + km(r.D) + " от " + esc(r.origin) + (r.minApplied ? ", минимум" : "") + "</div>", rub(r.travel)]);
    if (r.couch) rows.push(["Аренда кушетки", rub(r.couch)]);
    $("#mCalc").innerHTML = rows.map(function (x) { return "<tr><td>" + x[0] + "</td><td>" + x[1] + "</td></tr>"; }).join("");
    var total = r.P != null ? r.P : null;
    $("#mTotal").textContent = total != null && st.svcs.length ? rub(total) : st.svcs.length ? rub(r.S + r.couch) + (st.place ? " + выезд" : "") : "—";
    $("#mQrBtn").disabled = !(st.svcs.length && total != null);
    $("#mQr").innerHTML = "";
    calc.last = r;
  }
  $("#mCouch").addEventListener("change", calc);

  $("#mQrBtn").addEventListener("click", function () {
    var m = me(), r = calc.last; if (!r || r.P == null) return;
    var addr = st.place.name + ($("#mHouse").value.trim() ? ", д. " + $("#mHouse").value.trim() : "");
    $("#mQr").innerHTML = '<div class="qr"><span class="qr__tag">Демо-QR — не для оплаты</span><canvas id="mQrc" width="33" height="33" aria-label="Демонстрационный QR-код"></canvas>' +
      "<div><b>" + rub(r.P) + '</b><br><span class="small">Получатель: ' + esc(m.name) + " (самозанятая)<br>СБП: " + esc(m.pay ? m.pay.sbpPhone : "—") + " · " + esc(m.pay ? m.pay.bank : "") + "<br>Визит: " + esc(addr) + "</span></div>" +
      '<p class="small muted" style="margin:0">Деньги поступают напрямую мастеру, чек НПД в «Мой налог» формирует мастер. В рабочей версии QR формирует банк мастера (СБП).</p></div>';
    S.drawQR($("#mQrc"), "СБП · " + m.name + " · " + (m.pay ? m.pay.sbpPhone : "") + " · " + r.P + " RUB · " + addr);
    $("#mQr").scrollIntoView({ block: "nearest" });
  });

  /* адрес: комбобокс по демо-справочнику (как в форме на сайте) */
  var addr = $("#mAddr"), list = $("#mAddrList"), active = -1, matches = [];
  function norm(s) { return s.toLowerCase().replace(/ё/g, "е").replace(/[.,]/g, " ").replace(/\s+/g, " ").trim(); }
  function openList() {
    var q = norm(addr.value).replace(/^(ул|улица|пр|проспект|пос|с|г)\s/, "");
    matches = q ? window.SPA_DATA.places.filter(function (p) { return norm(p.name + " " + p.area).indexOf(q) >= 0; }).slice(0, 8) : [];
    active = -1;
    list.innerHTML = matches.length ? matches.map(function (p, i) { return '<li role="option" id="mopt' + i + '" aria-selected="false" data-i="' + i + '">' + esc(p.name) + "<span>" + esc(p.area) + "</span></li>"; }).join("") : (q ? '<li role="option" aria-disabled="true">Нет в демо-списке</li>' : "");
    list.hidden = !q; addr.setAttribute("aria-expanded", String(!!q));
  }
  function closeList() { list.hidden = true; addr.setAttribute("aria-expanded", "false"); addr.removeAttribute("aria-activedescendant"); }
  function choose(i) { var p = matches[i]; if (!p) return; st.place = p; addr.value = p.name + ", " + p.area; closeList(); calc(); $("#mHouse").focus(); }
  addr.addEventListener("input", function () { st.place = null; calc(); openList(); });
  addr.addEventListener("keydown", function (e) {
    var opts = $$("li[data-i]", list);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); if (list.hidden) openList(); if (!opts.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.setAttribute("aria-selected", String(i === active)); }); addr.setAttribute("aria-activedescendant", "mopt" + active);
    } else if (e.key === "Enter") { if (!list.hidden && active >= 0) { e.preventDefault(); choose(active); } }
    else if (e.key === "Escape") closeList();
  });
  list.addEventListener("mousedown", function (e) { var li = e.target.closest("li[data-i]"); if (li) { e.preventDefault(); choose(+li.getAttribute("data-i")); } });
  addr.addEventListener("blur", function () { setTimeout(closeList, 120); });

  /* изменения тарифов/услуг в админке (соседняя вкладка) */
  window.addEventListener("storage", function (e) { if (e.key && e.key.indexOf("spaKazanDemo") === 0) { S.applyAll(); if (me()) render(); } });
  boot();
})();
