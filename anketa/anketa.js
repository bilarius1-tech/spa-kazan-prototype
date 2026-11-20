(function () {
  "use strict";

  var STORAGE_KEY = "spaKazanAnketaDraft.v1";
  var EMPTY = "не указано";
  var DEMO_SERVICES = [
    { name: "Массаж ног", duration: "40", price: "1800" },
    { name: "Массаж рук", duration: "30", price: "1300" },
    { name: "Массаж головы и шеи", duration: "30", price: "1500" },
    { name: "Массаж спины", duration: "50", price: "2300" },
    { name: "Общий массаж тела", duration: "90", price: "4200" },
    { name: "SPA-ритуал для тела", duration: "90", price: "4800" },
    { name: "SPA-уход и массаж лица", duration: "60", price: "3200" },
    { name: "Массаж для двоих", duration: "60", price: "7800" }
  ];

  var form = document.getElementById("anketa");
  var staffBox = document.getElementById("staffList");
  var staffTpl = document.getElementById("staffTpl");
  var svcBody = document.getElementById("svcBody");
  var saveState = document.getElementById("saveState");
  var toastEl = document.getElementById("toast");
  var saveTimer = null;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toast.t);
    toast.t = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2200);
  }

  function groupVal(name) {
    var els = form.querySelectorAll("[name=\"" + name + "\"]");
    if (!els.length) return "";
    var t = els[0].type;
    if (t === "radio") {
      var c = form.querySelector("[name=\"" + name + "\"]:checked");
      if (!c) return "";
      if (c.value === "__other__") {
        var o = form.querySelector("[name=\"" + name + "Other\"]");
        var ot = o && o.value.trim();
        return ot ? "другое: " + ot : "другое";
      }
      return c.value;
    }
    if (t === "checkbox") {
      var parts = [];
      for (var i = 0; i < els.length; i++) {
        if (!els[i].checked) continue;
        if (els[i].value === "__other__") {
          var ox = form.querySelector("[name=\"" + name + "Other\"]");
          var xt = ox && ox.value.trim();
          parts.push(xt ? "другое: " + xt : "другое");
        } else {
          parts.push(els[i].value);
        }
      }
      return parts.join("; ");
    }
    return els[0].value.trim();
  }

  function textVal(name) {
    var el = form.querySelector("[name=\"" + name + "\"]");
    return el ? el.value.trim() : "";
  }

  function setText(name, value) {
    var el = form.querySelector("[name=\"" + name + "\"]");
    if (el && value != null) el.value = value;
  }

  function setGroup(name, value, other) {
    var els = form.querySelectorAll("[name=\"" + name + "\"]");
    if (!els.length) return;
    if (els[0].type === "checkbox") {
      var set = {};
      (value || []).forEach(function (v) { set[v] = true; });
      for (var i = 0; i < els.length; i++) els[i].checked = !!set[els[i].value];
    } else if (els[0].type === "radio") {
      var found = false;
      for (var j = 0; j < els.length; j++) {
        if (els[j].value === value) { els[j].checked = true; found = true; }
      }
      if (!found && value) {
        var oth = form.querySelector("[name=\"" + name + "\"][value=\"__other__\"]");
        if (oth) oth.checked = true;
      }
    }
    if (other != null) setText(name + "Other", other);
  }

  function staffCount() {
    return staffBox.querySelectorAll("[data-staff]").length;
  }

  function renumberStaff() {
    var cards = staffBox.querySelectorAll("[data-staff]");
    cards.forEach(function (card, i) {
      var n = card.querySelector(".staff-n");
      if (n) n.textContent = String(i + 1);
      var rm = card.querySelector(".staff-remove");
      if (rm) rm.hidden = cards.length < 2;
    });
  }

  function addStaff(data) {
    var node = staffTpl.content.firstElementChild.cloneNode(true);
    staffBox.appendChild(node);
    uniquifyStaffRadios(node, staffCount() - 1);
    if (data) {
      node.querySelector("[name=\"staff_name\"]").value = data.name || "";
      node.querySelector("[name=\"staff_role\"]").value = data.role || "";
      node.querySelector("[name=\"staff_phone\"]").value = data.phone || "";
      node.querySelector("[name=\"staff_telegram\"]").value = data.telegram || "";
      var r = node.querySelectorAll("[data-self] input");
      var want = data.selfemployed || "да";
      r.forEach(function (inp) { inp.checked = inp.value === want; });
      node.querySelector("[name=\"staff_schedule\"]").value = data.schedule || "";
      node.querySelector("[name=\"staff_areas\"]").value = data.areas || "";
    }
    renumberStaff();
    return node;
  }

  function uniquifyStaffRadios(card, idx) {
    var name = "staff_self_" + idx;
    card.querySelectorAll("[data-self] input").forEach(function (inp, i) {
      inp.name = name;
      var id = name + "_" + i;
      inp.id = id;
      var lab = inp.closest("label");
      if (lab) lab.setAttribute("for", id);
    });
  }

  function refreshStaffRadioNames() {
    staffBox.querySelectorAll("[data-staff]").forEach(function (card, i) {
      uniquifyStaffRadios(card, i);
    });
  }

  function collectStaff() {
    return Array.prototype.map.call(staffBox.querySelectorAll("[data-staff]"), function (card) {
      var se = card.querySelector("[data-self] input:checked");
      return {
        name: card.querySelector("[name=\"staff_name\"]").value.trim(),
        role: card.querySelector("[name=\"staff_role\"]").value.trim(),
        phone: card.querySelector("[name=\"staff_phone\"]").value.trim(),
        telegram: card.querySelector("[name=\"staff_telegram\"]").value.trim(),
        selfemployed: se ? se.value : "",
        schedule: card.querySelector("[name=\"staff_schedule\"]").value.trim(),
        areas: card.querySelector("[name=\"staff_areas\"]").value.trim()
      };
    });
  }

  function addService(data) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      "<td class=\"col-name\"><input type=\"text\" name=\"svc_name\" placeholder=\"Название услуги\" autocomplete=\"off\"></td>" +
      "<td class=\"col-dur\"><input type=\"text\" name=\"svc_duration\" inputmode=\"numeric\" placeholder=\"мин\" autocomplete=\"off\"></td>" +
      "<td class=\"col-price\"><input type=\"text\" name=\"svc_price\" inputmode=\"numeric\" placeholder=\"₽\" autocomplete=\"off\"></td>" +
      "<td class=\"col-del\"><button type=\"button\" class=\"svc-del\" aria-label=\"Удалить услугу\">×</button></td>";
    if (data) {
      tr.querySelector("[name=\"svc_name\"]").value = data.name || "";
      tr.querySelector("[name=\"svc_duration\"]").value = data.duration || "";
      tr.querySelector("[name=\"svc_price\"]").value = data.price || "";
    }
    svcBody.appendChild(tr);
  }

  function collectServices() {
    return Array.prototype.map.call(svcBody.querySelectorAll("tr"), function (tr) {
      return {
        name: tr.querySelector("[name=\"svc_name\"]").value.trim(),
        duration: tr.querySelector("[name=\"svc_duration\"]").value.trim(),
        price: tr.querySelector("[name=\"svc_price\"]").value.trim()
      };
    }).filter(function (s) { return s.name || s.duration || s.price; });
  }

  function resetServices(list) {
    svcBody.innerHTML = "";
    (list && list.length ? list : DEMO_SERVICES).forEach(addService);
  }

  function collectState() {
    var fields = {};
    var names = {};
    Array.prototype.forEach.call(form.querySelectorAll("[name]"), function (el) {
      var n = el.name;
      if (!n || n.indexOf("staff_") === 0 || n.indexOf("svc_") === 0 || n.indexOf("staff_self_") === 0) return;
      if (names[n]) return;
      names[n] = true;
      if (el.type === "checkbox") {
        var checked = [];
        var other = "";
        form.querySelectorAll("[name=\"" + n + "\"]").forEach(function (x) {
          if (x.checked) checked.push(x.value);
        });
        var o = form.querySelector("[name=\"" + n + "Other\"]");
        if (o) other = o.value;
        fields[n] = { type: "check", value: checked, other: other };
      } else if (el.type === "radio") {
        var c = form.querySelector("[name=\"" + n + "\"]:checked");
        var ox = form.querySelector("[name=\"" + n + "Other\"]");
        fields[n] = { type: "radio", value: c ? c.value : "", other: ox ? ox.value : "" };
      } else if (n.slice(-5) !== "Other") {
        var oy = form.querySelector("[name=\"" + n + "Other\"]");
        fields[n] = { type: "text", value: el.value, other: oy ? oy.value : "" };
      }
    });
    return { v: 1, savedAt: Date.now(), fields: fields, staff: collectStaff(), services: collectServices() };
  }

  function applyState(state) {
    if (!state || !state.fields) return;
    Object.keys(state.fields).forEach(function (k) {
      var f = state.fields[k];
      if (f.type === "check") setGroup(k, f.value, f.other);
      else if (f.type === "radio") setGroup(k, f.value, f.other);
      else {
        setText(k, f.value);
        if (f.other) setText(k + "Other", f.other);
      }
    });
    staffBox.innerHTML = "";
    var staff = state.staff && state.staff.length ? state.staff : [{}];
    staff.forEach(addStaff);
    refreshStaffRadioNames();
    resetServices(state.services && state.services.length ? state.services : DEMO_SERVICES);
  }

  function moscowNow() {
    var parts = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    var g = {};
    parts.forEach(function (p) { g[p.type] = p.value; });
    return g.day + "." + g.month + "." + g.year + ", " + g.hour + ":" + g.minute + " (Europe/Moscow)";
  }

  function moscowFileDate() {
    var parts = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit", month: "2-digit", year: "numeric"
    }).formatToParts(new Date());
    var g = {};
    parts.forEach(function (p) { g[p.type] = p.value; });
    return g.year + "-" + g.month + "-" + g.day;
  }

  function line(label, value) {
    var v = (value || "").trim();
    return label + ": " + (v ? v : EMPTY);
  }

  function buildTxt() {
    var L = [];
    function blank() { L.push(""); }
    function h(t) { blank(); L.push("=== " + t + " ==="); blank(); }
    function q(label, name) { L.push(line(label, groupVal(name) || textVal(name))); }
    function p(label, value) { L.push(line(label, value)); }

    L.push("Опросник — Лучший выездной спа в Казани");
    L.push("Дата заполнения: " + moscowNow());
    L.push("Страница: опросник рядом с прототипом (ответы никуда не отправлялись)");
    L.push("Файл нужно прислать Алексею в Telegram или MAX.");

    h("1. Контакты и реквизиты Регины");
    q("ФИО", "fio");
    q("ИНН", "inn");
    q("Телефон", "phone");
    q("Email", "email");
    q("Telegram", "telegram");
    q("MAX", "maxid");
    q("Название для сайта", "siteName");
    q("Адрес базы выезда", "baseAddress");

    h("2. Сотрудники");
    q("Сколько сотрудниц на старте", "staffCount");
    q("Регина тоже принимает клиентов", "reginaWorks");
    L.push("Фото: прислать отдельно в MAX или Telegram (в форму не загружались).");
    blank();
    var staff = collectStaff();
    if (!staff.length) {
      p("Сотрудницы", "список пуст");
    } else {
      staff.forEach(function (s, i) {
        L.push("-- Сотрудница " + (i + 1) + " --");
        p("Имя для сайта", s.name);
        p("Роль / услуги", s.role);
        p("Телефон", s.phone);
        p("Telegram", s.telegram);
        p("Самозанятая", s.selfemployed);
        p("График", s.schedule);
        p("Районы выезда", s.areas);
        blank();
      });
    }

    h("3. Логика работы");
    L.push("-- Оплата и юридические вопросы --");
    q("Юридический статус Регины", "legalStatus");
    q("Банк / реквизиты / система налогообложения", "legalBank");
    q("Как оформлены массажистки", "staffLegal");
    q("Куда идут деньги за массаж", "moneyTo");
    q("Как клиент платит", "payHow");
    q("Предоплата или депозит", "prepay");
    q("Правила отмены", "cancelRules");
    q("Что при неявке клиента", "noShow");
    q("Что при опоздании", "late");
    q("Наличные и переводы в системе", "cashManual");
    blank();
    L.push("-- Услуги и цены --");
    q("Прайс из прототипа", "priceListOk");
    var svcs = collectServices();
    if (svcs.length) {
      L.push("Список услуг:");
      svcs.forEach(function (s, i) {
        L.push("  " + (i + 1) + ". " + (s.name || "без названия") +
          (s.duration ? ", " + s.duration + " мин" : "") +
          (s.price ? ", " + s.price + " ₽" : ""));
      });
    } else {
      p("Список услуг", "");
    }
    q("Цены и длительности у разных мастеров", "priceDiffers");
    q("Комплексы", "combos");
    q("Доп. услуги после сеанса", "extras");
    q("Ограничения", "limits");
    blank();
    L.push("-- Выезд и логистика --");
    q("Зоны и цены выезда", "zonesOk");
    q("Комментарий к зонам / свои тарифы", "zoneDetails");
    q("Максимальная зона обслуживания", "maxArea");
    q("Пригороды (если есть)", "suburbs");
    q("Минимальный заказ", "minOrder");
    q("Уточнение по минимуму", "minOrderDetails");
    q("На чём ездят", "transport");
    q("Пауза между заказами", "gapMin");
    q("Что привозят с собой", "bring");
    q("Буфер на подготовку", "buffer");
    q("Аренда кушетки", "couchOk");
    q("Цена кушетки, если другая", "couchPrice");
    blank();
    L.push("-- Запись и подтверждение --");
    q("Рабочие часы", "hours");
    q("Часы и дни подробно", "hoursDetails");
    q("За сколько минимум можно записаться", "minAdvance");
    q("На сколько дней вперёд открыта запись", "daysAhead");
    q("Временная бронь (HOLD)", "holdOk");
    q("Кто подтверждает заявку", "whoConfirms");
    q("Кто подтверждает ночью и в выходные", "nightConfirms");
    q("Как сообщают об отпусках и выходных", "vacationHow");
    blank();
    L.push("-- Telegram, бренд и данные --");
    q("Группа «Заказы салона» в Telegram", "tgGroup");
    q("Видят ли мастера свои заказы в боте", "mastersSeeOrders");
    q("Название бота", "botName");
    q("Кто создаёт бота", "botWho");
    q("Как уведомлять клиентов", "clientNotify");
    q("Нужен ли MAX", "maxNeeded");
    q("Подарочные сертификаты", "certificates");
    q("Акции и промо", "promo");
    q("Уточнение по акциям", "promoDetails");
    q("Отзывы на сайте", "reviews");
    q("Откуда брать отзывы", "reviewSource");
    q("Домен", "domain");
    q("Тексты и формулировки бренда", "brandTexts");
    q("Логотип и фото", "logoPhotos");
    q("Откуда сейчас приходят клиенты", "clientsFrom");
    q("Персональные данные (оператор ПДн)", "pdAgree");
    q("Срок хранения заявок", "pdStore");

    h("4. Свободные комментарии");
    var cmt = textVal("comments");
    L.push(cmt ? cmt : EMPTY);

    blank();
    L.push("— конец опросника —");
    return L.join("\r\n") + "\r\n";
  }

  function downloadTxt() {
    var text = "\uFEFF" + buildTxt();
    var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "anketa-ginaspa-" + moscowFileDate() + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast("Файл скачан — пришлите его Алексею");
  }

  function copyTxt() {
    var text = buildTxt();
    function ok() { toast("Текст скопирован"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok).catch(fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); ok(); }
      catch (e) { toast("Не получилось скопировать — скачайте файл"); }
      ta.remove();
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectState()));
      if (saveState) saveState.textContent = "Черновик сохранён на этом устройстве · " + moscowNow().replace(", ", ", в ");
    } catch (e) {
      if (saveState) saveState.textContent = "Черновик не сохранился (память браузера недоступна)";
    }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 250);
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      applyState(JSON.parse(raw));
      if (saveState) saveState.textContent = "Восстановлен черновик с этого устройства";
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearAll() {
    if (!confirm("Очистить все ответы на этом устройстве? Предустановленные адрес, название и варианты «как мы поняли» вернутся.")) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    form.reset();
    staffBox.innerHTML = "";
    addStaff({});
    addStaff({});
    refreshStaffRadioNames();
    resetServices(DEMO_SERVICES);
    if (saveState) saveState.textContent = "Форма очищена";
    toast("Ответы очищены");
  }

  staffBox.addEventListener("click", function (e) {
    var btn = e.target.closest(".staff-remove");
    if (!btn) return;
    if (staffCount() < 2) return;
    btn.closest("[data-staff]").remove();
    refreshStaffRadioNames();
    renumberStaff();
    scheduleSave();
  });

  document.getElementById("addStaff").addEventListener("click", function () {
    addStaff({});
    refreshStaffRadioNames();
    scheduleSave();
  });

  document.getElementById("addSvc").addEventListener("click", function () {
    addService({});
    scheduleSave();
  });

  svcBody.addEventListener("click", function (e) {
    var btn = e.target.closest(".svc-del");
    if (!btn) return;
    var rows = svcBody.querySelectorAll("tr");
    if (rows.length < 2) {
      btn.closest("tr").querySelectorAll("input").forEach(function (i) { i.value = ""; });
    } else {
      btn.closest("tr").remove();
    }
    scheduleSave();
  });

  document.getElementById("btnDownload").addEventListener("click", function () {
    persist();
    downloadTxt();
  });
  document.getElementById("btnCopy").addEventListener("click", copyTxt);
  document.getElementById("btnClear").addEventListener("click", clearAll);

  form.addEventListener("submit", function (e) { e.preventDefault(); });
  form.addEventListener("input", scheduleSave);
  form.addEventListener("change", scheduleSave);

  if (!restore()) {
    addStaff({});
    addStaff({});
    refreshStaffRadioNames();
    resetServices(DEMO_SERVICES);
    if (saveState) saveState.textContent = "Черновик будет сохраняться на этом устройстве";
  }
})();
