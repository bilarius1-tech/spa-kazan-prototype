/* Общий демо-слой данных для сайта и админки. Всё хранится в localStorage этого браузера.
   Ключи: spaKazanDemoHolds (заявки), spaKazanDemoConfig (цены/расписание поверх js/config.js),
   spaKazanDemoData (специалистки и услуги), spaKazanDemoSettings (контакты, тексты), spaKazanDemoBlocks (ручные блокировки). */
window.SpaStore = (function () {
  "use strict";
  var K = { holds: "spaKazanDemoHolds", cfg: "spaKazanDemoConfig", data: "spaKazanDemoData", settings: "spaKazanDemoSettings", blocks: "spaKazanDemoBlocks", ver: "spaKazanDemoVersion" };
  var VER = "2";
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var BASE_CFG = clone(window.SPA_CONFIG), BASE_DATA = clone(window.SPA_DATA);
  var DEFAULT_SETTINGS = {
    phone: "+7 (000) 000-00-00", telegram: "@example_spa_bot", hours: "Ежедневно 09:00–21:00 (пример)", zone: "Казань и ближайшие пригороды",
    heroTitle: "", heroLead: "", tgEnabled: false, tgChat: ""
  };
  function get(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert("Не удалось сохранить (localStorage переполнен?)"); } }

  /* ---- время ---- */
  function toMin(t) { var p = String(t).split(":"); return +p[0] * 60 + +(p[1] || 0); }
  function fmt(m) { var h = Math.floor(m / 60), mm = m % 60; return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm; }
  function dayKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function keyToDate(k) { var p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function today() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

  /* ---- конфиг и данные ---- */
  function applyAll() {
    var o = get(K.cfg, null), C = window.SPA_CONFIG;
    C.pricing = Object.assign(clone(BASE_CFG.pricing), o && o.pricing || {});
    C.schedule = Object.assign(clone(BASE_CFG.schedule), o && o.schedule || {});
    var d = get(K.data, null);
    window.SPA_DATA.specialists = d && d.specialists ? d.specialists : clone(BASE_DATA.specialists);
    window.SPA_DATA.services = d && d.services ? d.services : clone(BASE_DATA.services);
  }
  function saveConfig(pricing, schedule) { set(K.cfg, { pricing: pricing, schedule: schedule }); applyAll(); }
  function saveData(specialists, services) { set(K.data, { specialists: specialists, services: services }); applyAll(); }
  function settings() { return Object.assign({}, DEFAULT_SETTINGS, get(K.settings, {})); }
  function saveSettings(s) { set(K.settings, s); }
  function specById(id) { return window.SPA_DATA.specialists.filter(function (s) { return s.id === id; })[0]; }
  function svcById(id) { return window.SPA_DATA.services.filter(function (s) { return s.id === id; })[0]; }
  function activeSpecs() { return window.SPA_DATA.specialists.filter(function (s) { return s.active !== false; }); }
  function activeServices() { return window.SPA_DATA.services.filter(function (s) { return s.active !== false; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); }
  function priceFor(spec, sid) { var s = svcById(sid); return (spec && spec.priceOverride && spec.priceOverride[sid]) || (s ? s.price : 0); }

  /* ---- цена: P = S + max(T + max(0, D − D0) × R, Tmin); D > Dmax — ручной расчёт ---- */
  function haversine(a, b) {
    var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function calcPrice(spec, svcIds, place, pricing) {
    var P = pricing || window.SPA_CONFIG.pricing, S = 0, dur = 0;
    (svcIds || []).forEach(function (id) { var s = svcById(id); if (!s) return; S += priceFor(spec, id); dur += +s.duration; });
    var res = { S: S, dur: dur, D: null, travel: null, extraKm: 0, extraCost: 0, out: false, minApplied: false, P: null, T: P.T, R: P.R, D0: P.D0, Tmin: P.Tmin };
    if (spec && place) {
      var D = Math.round(haversine(spec.base, place) * P.roadFactor * 10) / 10;
      res.D = D;
      if (D > P.Dmax) res.out = true;
      else {
        res.extraKm = Math.round(Math.max(0, D - P.D0) * 10) / 10;
        res.extraCost = res.extraKm * P.R;
        var raw = P.T + res.extraCost, step = P.roundTo || 1, rounded = Math.ceil(raw / step) * step;
        res.travel = Math.max(rounded, P.Tmin);
        res.minApplied = P.Tmin > rounded;
        res.P = S + res.travel;
      }
    }
    return res;
  }

  /* ---- заявки ---- */
  function requests() { return get(K.holds, []); }
  function saveRequests(list) { set(K.holds, list); }
  function effStatus(r) { return r.status === "hold" && r.expires <= Date.now() ? "expired" : r.status; }
  function isBusy(r) { var s = effStatus(r); return s === "hold" || s === "confirmed" || s === "done" || s === "paid"; }
  function finalTotal(r) {
    var base = r.calc && r.calc.P != null ? r.calc.P : (r.calc ? r.calc.S : 0) + (r.manualTravel || 0);
    var ex = (r.extras || []).reduce(function (a, x) { return a + (+x.price || 0); }, 0);
    return base + ex + (r.adjust ? +r.adjust.amount || 0 : 0);
  }
  function updateRequest(id, fn) {
    var list = requests(); list.forEach(function (r) { if (r.id === id) fn(r); }); saveRequests(list);
  }
  function blocks() { return get(K.blocks, []); }
  function saveBlocks(b) { set(K.blocks, b); }
  /* Занятые интервалы специалистки на день: заявки (кроме отменённых/истёкших) + ручные блокировки */
  function busy(specId, dk) {
    var out = [];
    requests().forEach(function (r) { if (r.spec === specId && r.day === dk && isBusy(r)) out.push({ s: r.s, e: r.e, kind: effStatus(r) === "hold" ? "hold" : "busy", id: r.id }); });
    blocks().forEach(function (b) { if (b.spec === specId && b.day === dk) out.push({ s: b.s, e: b.e, kind: "busy", block: b.id }); });
    return out;
  }
  function makeRequest(o) {
    var spec = specById(o.spec), c = calcPrice(spec, o.svcs, o.place), now = Date.now();
    var buf = window.SPA_CONFIG.schedule.travelBufferMin;
    return Object.assign({
      id: "D-" + (now + Math.floor(Math.random() * 1000)).toString(36).toUpperCase().slice(-6),
      created: now, status: "hold", expires: now + window.SPA_CONFIG.schedule.holdMinutes * 60000,
      dur: c.dur, e: o.s + c.dur + buf, calc: c, extras: [], adjust: null, payment: null,
      history: [{ at: now, text: "Заявка отправлена с сайта" }]
    }, o);
  }

  /* ---- демо-наполнение ---- */
  function seed() {
    applyAll();
    var t = today(), now = Date.now(), P = window.SPA_DATA.places;
    var place = function (n) { return P.filter(function (p) { return p.name === n; })[0]; };
    var mk = function (o, extra) {
      var r = makeRequest(o); Object.assign(r, extra || {}); r.history = [{ at: r.created, text: "Заявка отправлена с сайта" }].concat(extra && extra.history || []); return r;
    };
    var list = [
      mk({ spec: "s1", svcs: ["legs", "back"], day: dayKey(addDays(t, 1)), s: toMin("12:00"), place: place("ул. Баумана"), house: "15", flat: "8", entr: "2 подъезд", name: "Анна (пример)", phone: "+7 (000) 000-00-11", comment: "Домофон не работает, позвоните" },
        { created: now - 22 * 60000, expires: now + 38 * 60000 }),
      mk({ spec: "s3", svcs: ["legs"], day: dayKey(addDays(t, 1)), s: toMin("15:00"), place: place("ул. Сахарова"), house: "3", flat: "41", entr: "", name: "Мария (пример)", phone: "+7 (000) 000-00-12", comment: "" },
        { created: now - 48 * 60000, expires: now + 12 * 60000 }),
      mk({ spec: "s2", svcs: ["body"], day: dayKey(addDays(t, 1)), s: toMin("10:00"), place: place("пр. Ямашева"), house: "71", flat: "120", entr: "5 подъезд, 9 этаж", name: "Елена (пример)", phone: "+7 (000) 000-00-13", comment: "Есть кошка" },
        { status: "confirmed", created: now - 5 * 3600000, history: [{ at: now - 4.5 * 3600000, text: "Подтверждена администратором" }] }),
      mk({ spec: "s5", svcs: ["back", "head"], day: dayKey(addDays(t, 2)), s: toMin("14:00"), place: place("ул. Декабристов"), house: "180", flat: "17", entr: "", name: "Ольга (пример)", phone: "+7 (000) 000-00-14", comment: "" },
        { status: "confirmed", created: now - 26 * 3600000, history: [{ at: now - 25 * 3600000, text: "Подтверждена администратором" }] }),
      mk({ spec: "s4", svcs: ["hands", "head"], day: dayKey(t), s: toMin("09:30"), place: place("ул. Минская"), house: "10", flat: "3", entr: "", name: "Ирина (пример)", phone: "+7 (000) 000-00-15", comment: "" },
        { status: "done", created: now - 30 * 3600000, history: [{ at: now - 29 * 3600000, text: "Подтверждена администратором" }, { at: now - 1 * 3600000, text: "Сеанс выполнен" }], extras: [{ title: "Массаж ног (доп.)", price: 1800 }] }),
      mk({ spec: "s1", svcs: ["body"], day: dayKey(addDays(t, -1)), s: toMin("18:00"), place: place("ул. Пушкина"), house: "5", flat: "22", entr: "", name: "Светлана (пример)", phone: "+7 (000) 000-00-16", comment: "" },
        { status: "paid", created: now - 50 * 3600000, payment: { qrAt: now - 20 * 3600000, paidAt: now - 19.8 * 3600000, to: "s1" },
          history: [{ at: now - 49 * 3600000, text: "Подтверждена администратором" }, { at: now - 20.5 * 3600000, text: "Сеанс выполнен" }, { at: now - 20 * 3600000, text: "Сформирован QR СБП" }, { at: now - 19.8 * 3600000, text: "Оплата отмечена" }] }),
      mk({ spec: "s2", svcs: ["back"], day: dayKey(addDays(t, 2)), s: toMin("11:00"), place: place("ул. Адоратского"), house: "40", flat: "9", entr: "", name: "Наталья (пример)", phone: "+7 (000) 000-00-17", comment: "" },
        { status: "cancelled", cancelReason: "Клиент перенёс на другую неделю", created: now - 8 * 3600000, history: [{ at: now - 7 * 3600000, text: "Отклонена: клиент перенёс на другую неделю" }] })
    ];
    saveRequests(list);
    saveBlocks([
      { id: "B1", spec: "s3", day: dayKey(addDays(t, 1)), s: toMin("13:00"), e: toMin("14:00"), reason: "Перерыв" },
      { id: "B2", spec: "s4", day: dayKey(addDays(t, 3)), s: toMin("09:00"), e: toMin("21:00"), reason: "Выходной" }
    ]);
    set(K.ver, VER);
  }
  function resetDemo() {
    Object.keys(K).forEach(function (k) { try { localStorage.removeItem(K[k]); } catch (e) {} });
    seed();
  }
  if (get(K.ver, null) !== VER) seed(); else applyAll();

  return {
    K: K, get: get, set: set, toMin: toMin, fmt: fmt, dayKey: dayKey, keyToDate: keyToDate, addDays: addDays, today: today,
    applyAll: applyAll, saveConfig: saveConfig, saveData: saveData, settings: settings, saveSettings: saveSettings,
    specById: specById, svcById: svcById, activeSpecs: activeSpecs, activeServices: activeServices, priceFor: priceFor,
    calcPrice: calcPrice, requests: requests, saveRequests: saveRequests, updateRequest: updateRequest, effStatus: effStatus, isBusy: isBusy,
    finalTotal: finalTotal, blocks: blocks, saveBlocks: saveBlocks, busy: busy, makeRequest: makeRequest, resetDemo: resetDemo,
    baseConfig: function () { return clone(BASE_CFG); }
  };
})();
