(() => {
  "use strict";

  /* ---------------- Access control ----------------
     One shared hosted copy, gated by a single passcode set below.
     This is NOT secure against someone reading the source — it's a low-friction
     barrier suitable for "buy access to a link," not a real login system.
     Change this before deploying, and change it again whenever you want to
     effectively revoke everyone's access and issue a new code. */
  const ACCESS_CODE = "JobTrack26";
  const UNLOCK_KEY = "jobtrack.unlocked.v1";

  /* ---------------- Storage ---------------- */
  const JOBS_KEY = "jobtrack.jobs.v2";
  const ACTIVE_KEY = "jobtrack.activeTimer.v2";
  const BUSINESS_KEY = "jobtrack.business.v1";
  const THEME_KEY = "jobtrack.theme.v1";
  const NUMBERING_KEY = "jobtrack.numbering.v1";
  const CUSTOMERS_KEY = "jobtrack.customers.v1";
  const TEMPLATES_KEY = "jobtrack.templates.v1";
  const TRADE_KEY = "jobtrack.trade.v1";

  /* ---------------- Trade terminology ----------------
     Relabels Vehicle/Registration/Parts across the app for trades that don't
     work on vehicles. This only changes display strings — the underlying data
     fields (job.vehicle, job.registration, job.parts) are unchanged, so switching
     trade mid-use never touches stored data, only what it's called on screen. */
  const TRADE_TERMS = {
    mechanic: { vehicle: "Vehicle", vehiclePh: "e.g. Ford Transit", registration: "Registration", regPh: "e.g. AB12 CDE", parts: "Parts", part: "Part", equipment: "Equipment" },
    ag: { vehicle: "Machine", vehiclePh: "e.g. Baler", registration: "Serial number", regPh: "e.g. SN-48213", parts: "Parts", part: "Part", equipment: "Equipment" },
    electrician: { vehicle: "Installation", vehiclePh: "e.g. Consumer unit", registration: "Reference", regPh: "e.g. Circuit 4 / property ref", parts: "Materials", part: "Material", equipment: "Installations" },
    plumber: { vehicle: "System", vehiclePh: "e.g. Combi boiler", registration: "Reference", regPh: "e.g. Model / serial number", parts: "Materials", part: "Material", equipment: "Systems" },
    general: { vehicle: "Item", vehiclePh: "e.g. Equipment name", registration: "Reference", regPh: "e.g. Serial / ID number", parts: "Parts", part: "Part", equipment: "Equipment" }
  };
  const TRADE_LABELS = { mechanic: "Mechanic", ag: "Ag / plant engineer", electrician: "Electrician", plumber: "Plumber", general: "General trade" };

  function getTerm(key) {
    const trade = Store.getTrade();
    return (TRADE_TERMS[trade] || TRADE_TERMS.mechanic)[key] || TRADE_TERMS.mechanic[key];
  }

  const Store = {
    getJobs() {
      try { return JSON.parse(localStorage.getItem(JOBS_KEY)) || []; }
      catch { return []; }
    },
    saveJobs(jobs) {
      localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
    },
    upsertJob(job) {
      const jobs = Store.getJobs();
      const idx = jobs.findIndex((j) => j.id === job.id);
      if (idx === -1) jobs.unshift(job);
      else jobs[idx] = job;
      Store.saveJobs(jobs);
    },
    getJob(id) {
      return Store.getJobs().find((j) => j.id === id) || null;
    },
    getCustomers() {
      try { return JSON.parse(localStorage.getItem(CUSTOMERS_KEY)) || []; }
      catch { return []; }
    },
    saveCustomers(list) {
      localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(list));
    },
    getActiveTimer() {
      try { return JSON.parse(localStorage.getItem(ACTIVE_KEY)) || null; }
      catch { return null; }
    },
    setActiveTimer(activeTimer) {
      if (activeTimer) localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeTimer));
      else localStorage.removeItem(ACTIVE_KEY);
    },
    getBusiness() {
      try { return JSON.parse(localStorage.getItem(BUSINESS_KEY)) || { name: "", phone: "", email: "" }; }
      catch { return { name: "", phone: "", email: "" }; }
    },
    saveBusiness(business) {
      localStorage.setItem(BUSINESS_KEY, JSON.stringify(business));
    },
    getTheme() {
      return localStorage.getItem(THEME_KEY) || "system";
    },
    saveTheme(theme) {
      localStorage.setItem(THEME_KEY, theme);
    },
    getNumbering() {
      try { return JSON.parse(localStorage.getItem(NUMBERING_KEY)) || { enabled: false, prefix: "", next: 1 }; }
      catch { return { enabled: false, prefix: "", next: 1 }; }
    },
    saveNumbering(n) {
      localStorage.setItem(NUMBERING_KEY, JSON.stringify(n));
    },
    getTemplates() {
      try { return JSON.parse(localStorage.getItem(TEMPLATES_KEY)) || []; }
      catch { return []; }
    },
    saveTemplates(list) {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
    },
    getTrade() {
      return localStorage.getItem(TRADE_KEY) || "mechanic";
    },
    saveTrade(trade) {
      localStorage.setItem(TRADE_KEY, trade);
    }
  };

  /* ---------------- Helpers ---------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function fmtHMS(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function fmtMS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  function csvField(value) {
    const s = String(value ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function decimalHours(totalSeconds) {
    return (Math.round((totalSeconds / 3600) * 100) / 100).toFixed(2);
  }

  // One row per finalised visit (spreadsheet-friendly for hours-per-job/customer/month
  // bookkeeping). Jobs currently in progress contribute a row for their live, unsaved
  // session so today's work isn't missing from the export before the job is completed.
  function buildHoursCsv(jobs) {
    const header = ["Date", "Job number", "Customer", getTerm("vehicle"), getTerm("registration"), "Job type", "Status", "Travel hours", "Labour hours", "Total hours"];
    const rows = [];

    jobs.forEach((job) => {
      const visits = Array.isArray(job.visits) ? job.visits : [];
      visits.forEach((v) => {
        rows.push([
          v.date || "",
          job.jobNumber || "",
          job.customer || "",
          job.vehicle || "",
          job.registration || "",
          job.jobType || "",
          "Completed",
          decimalHours(v.travelSeconds || 0),
          decimalHours(v.labourSeconds || 0),
          decimalHours((v.travelSeconds || 0) + (v.labourSeconds || 0))
        ]);
      });

      const liveTravel = job.travelSeconds || 0;
      const liveLabour = job.labourSeconds || 0;
      if (job.status !== "completed" && (liveTravel > 0 || liveLabour > 0)) {
        rows.push([
          todayISODate(),
          job.jobNumber || "",
          job.customer || "",
          job.vehicle || "",
          job.registration || "",
          job.jobType || "",
          "In progress",
          decimalHours(liveTravel),
          decimalHours(liveLabour),
          decimalHours(liveTravel + liveLabour)
        ]);
      }
    });

    if (!rows.length) return "";
    return [header, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function safeDiffSeconds(startedAt) {
    // Guards against a corrupted or missing start time ever producing a nonsense elapsed value.
    if (typeof startedAt !== "number" || !isFinite(startedAt) || startedAt <= 0) return 0;
    const diff = Math.floor((Date.now() - startedAt) / 1000);
    const ONE_DAY = 60 * 60 * 24;
    if (diff < 0 || diff > ONE_DAY) return 0; // no single job should ever run this long — treat as corrupted
    return diff;
  }

  let toastTimer = null;
  function toast(msg, onUndo) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    if (onUndo) {
      const undoBtn = document.createElement("button");
      undoBtn.textContent = "Undo";
      undoBtn.className = "toast-undo";
      undoBtn.onclick = () => { onUndo(); el.classList.remove("show"); clearTimeout(toastTimer); };
      el.appendChild(undoBtn);
    }
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 4000);
  }

  /* ---------------- App state ---------------- */
  const app = document.getElementById("app");

  let screen = "list";       // list | form | detail | summary
  let listTab = "active";    // active | completed
  let currentJobId = null;
  let globalTick = null;

  function newJob() {
    return {
      id: uid(),
      customer: "",
      vehicle: "",
      registration: "",
      jobNumber: "",
      hoursMiles: "",
      jobType: "",
      site: "",
      customerPhone: "",
      customerEmail: "",
      description: "",
      status: "not_started",  // not_started | in_progress | completed
      travelSeconds: 0,
      labourSeconds: 0,
      visits: [],              // finalized past visits: { id, date, travelSeconds, labourSeconds }
      parts: [],
      workNotes: "",
      recommendations: "",
      createdAt: Date.now(),
      completedAt: null
    };
  }

  function repeatJob(source) {
    const job = newJob();
    job.customer = source.customer;
    job.vehicle = source.vehicle;
    job.registration = source.registration;
    job.jobType = source.jobType;
    job.hoursMiles = source.hoursMiles;
    job.site = source.site;
    job.customerPhone = source.customerPhone;
    job.customerEmail = source.customerEmail;
    // Deliberately NOT carried over: job number, times, parts, work notes, recommendations, description —
    // this is a fresh visit, not a copy of the finished one.
    Store.upsertJob(job);
    currentJobId = job.id;
    render("detail");
    toast("New job created from repeat");
  }

  /* ---------------- Theme ---------------- */
  function applyTheme(pref) {
    const resolved = pref === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : pref;
    document.documentElement.setAttribute("data-theme", resolved);
  }

  // Keep in sync with the OS if the person has chosen "System".
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (Store.getTheme() === "system") applyTheme("system");
  });

  function formatJobNumber(n) {
    return n.prefix ? `${n.prefix}${String(n.next).padStart(4, "0")}` : String(n.next);
  }

  function todayISODate() {
    return new Date().toISOString().slice(0, 10);
  }

  function fmtVisitDate(isoDate) {
    const d = new Date(`${isoDate}T00:00:00`);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  }

  /* ---------------- Active timer engine ---------------- */
  // Only one timer runs system-wide. Starting a timer on any job auto-pauses whatever else was running.
  function pauseActiveTimer() {
    const active = Store.getActiveTimer();
    if (!active) return;
    const job = Store.getJob(active.jobId);
    if (job) {
      const elapsed = safeDiffSeconds(active.startedAt);
      job[active.type === "travel" ? "travelSeconds" : "labourSeconds"] += elapsed;
      Store.upsertJob(job);
    }
    Store.setActiveTimer(null);
  }

  function startTimer(jobId, type) {
    const current = Store.getActiveTimer();
    if (current && current.jobId === jobId && current.type === type) {
      // Tapping the already-active timer pauses it (toggle off).
      pauseActiveTimer();
      return;
    }
    pauseActiveTimer();
    const job = Store.getJob(jobId);
    if (!job) return;
    const wasCompleted = job.status === "completed";
    if (job.status !== "in_progress") {
      job.status = "in_progress";
      job.completedAt = null;
    }
    Store.upsertJob(job);
    Store.setActiveTimer({ jobId, type, startedAt: Date.now() });
    if (wasCompleted) toast("Job reopened — back in progress");
  }

  function isTimerActive(jobId, type) {
    const active = Store.getActiveTimer();
    return !!active && active.jobId === jobId && active.type === type;
  }

  function liveSeconds(job, type) {
    const base = job[type === "travel" ? "travelSeconds" : "labourSeconds"];
    const active = Store.getActiveTimer();
    if (active && active.jobId === job.id && active.type === type) {
      return base + safeDiffSeconds(active.startedAt);
    }
    return base;
  }

  /* ---------------- Rendering ---------------- */
  function render(next) {
    screen = next || screen;
    stopGlobalTick();
    app.innerHTML = "";
    const tpl = document.getElementById(`tpl-${screen}`);
    const node = tpl.content.cloneNode(true);
    app.appendChild(node);
    applyTerminology();
    wireScreen(screen);
    startGlobalTick();
    updateBottomNav();
    updateGlobalTimerBanner();
  }

  // Swaps static Vehicle/Registration/Parts labels and placeholders for whatever
  // the selected trade calls them. Runs once per render, right after the fresh
  // template is inserted (and again from sheet-opening code, since sheets like
  // Add Part live outside the per-screen template and aren't touched by render()).
  function applyTerminology() {
    document.querySelectorAll('[data-term-label]').forEach((el) => {
      el.textContent = getTerm(el.dataset.termLabel);
    });
    document.querySelectorAll('[data-term-placeholder]').forEach((el) => {
      el.placeholder = getTerm(el.dataset.termPlaceholder);
    });
  }

  function updateGlobalTimerBanner() {
    const banner = document.getElementById("global-timer-banner");
    if (!banner) return;
    const active = Store.getActiveTimer();
    const onThatJobsDetail = screen === "detail" && active && currentJobId === active.jobId;
    if (!active || onThatJobsDetail || screen === "lock") {
      banner.hidden = true;
      document.body.classList.remove("has-global-banner");
      return;
    }
    const job = Store.getJob(active.jobId);
    if (!job) {
      banner.hidden = true;
      document.body.classList.remove("has-global-banner");
      return;
    }
    banner.hidden = false;
    document.body.classList.add("has-global-banner");
    banner.className = `global-timer-banner active-timer-banner-${active.type}`;
    document.getElementById("gtb-icon").innerHTML = active.type === "travel" ? TRAVEL_ICON : LABOUR_ICON;
    const time = active.type === "travel" ? fmtMS(liveSeconds(job, "travel")) : fmtHMS(liveSeconds(job, "labour"));
    document.getElementById("gtb-text").textContent = `${job.customer} · ${active.type === "travel" ? "On travel" : "On labour"} · ${time}`;
    banner.onclick = () => { currentJobId = job.id; render("detail"); };
  }

  function updateBottomNav() {
    const nav = document.getElementById("bottom-nav");
    const hideOn = ["lock", "summary", "detail"]; // detail has its own Travel/Labour/Complete bar — two bottom bars stacked was redundant
    const show = !hideOn.includes(screen);
    nav.hidden = !show;
    document.body.classList.toggle("has-bottom-nav", show);
    const activeMap = { list: "jobs", customers: "jobs", "customer-detail": "jobs", form: "jobs", detail: "jobs", settings: "settings", templates: "settings" };
    // "Jobs" stays highlighted for anything reached from the job list, since there's no dedicated tab for those sub-screens.
    const activeKey = screen === "customers" || screen === "customer-detail" ? "customers" : (activeMap[screen] || "");
    document.querySelectorAll(".bottom-nav-item").forEach((btn) => {
      btn.classList.toggle("bottom-nav-item-active", btn.dataset.nav === activeKey);
    });
  }

  function stopGlobalTick() {
    if (globalTick) { clearInterval(globalTick); globalTick = null; }
  }

  function startGlobalTick() {
    globalTick = setInterval(() => {
      if (screen === "list") tickList();
      if (screen === "detail") tickDetail();
      updateGlobalTimerBanner();
    }, 1000);
  }

  function wireScreen(name) {
    if (name === "lock") return wireLock();
    if (name === "list") return wireList();
    if (name === "form") return wireForm();
    if (name === "detail") return wireDetail();
    if (name === "summary") return wireSummary();
    if (name === "settings") return wireSettings();
    if (name === "customers") return wireCustomers();
    if (name === "customer-detail") return wireCustomerDetail();
    if (name === "templates") return wireTemplates();
  }

  function wireLock() {
    const input = document.getElementById("lock-code");
    const btn = document.getElementById("btn-unlock");
    input.focus();

    function attempt() {
      if (input.value === ACCESS_CODE) {
        localStorage.setItem(UNLOCK_KEY, "1");
        render("list");
      } else {
        toast("Incorrect code");
        input.value = "";
        input.focus();
      }
    }
    btn.addEventListener("click", attempt);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") attempt(); });
  }

  /* ---------------- Side menu ---------------- */
  function wireBottomNav() {
    document.querySelectorAll(".bottom-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const dest = btn.dataset.nav;
        if (dest === "jobs") { listTab = "active"; render("list"); }
        else if (dest === "new-job") { currentJobId = null; render("form"); }
        else if (dest === "customers") { render("customers"); }
        else if (dest === "settings") { render("settings"); }
      });
    });
  }
  wireBottomNav();

  /* ---------------- List screen ---------------- */
  function wireList() {
    document.querySelector('[data-action="header-new-job"]').addEventListener("click", () => {
      currentJobId = null;
      render("form");
    });

    // Sync the visual tab highlight to the actual listTab state — the template hardcodes
    // "Active" as highlighted, but listTab can be set programmatically (e.g. after Mark Complete).
    document.querySelectorAll(".list-tab").forEach((b) => {
      b.classList.toggle("list-tab-active", b.dataset.tab === listTab);
    });

    document.querySelectorAll(".list-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        listTab = btn.dataset.tab;
        document.querySelectorAll(".list-tab").forEach((b) => b.classList.toggle("list-tab-active", b === btn));
        renderJobList();
      });
    });

    renderJobList();
  }

  function renderJobList() {
    const listEl = document.getElementById("job-list");
    const emptyEl = document.getElementById("list-empty");
    const jobs = Store.getJobs()
      .filter((j) => (listTab === "completed" ? j.status === "completed" : j.status !== "completed"))
      .sort((a, b) => b.createdAt - a.createdAt);

    listEl.innerHTML = "";
    if (!jobs.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;

    const tpl = document.getElementById("tpl-job-card");
    jobs.forEach((job) => {
      const node = tpl.content.cloneNode(true);
      const card = node.querySelector(".job-card");
      card.classList.add(`job-card-${job.status}`);
      card.dataset.jobId = job.id;
      card.querySelector(".job-card-customer").textContent = job.customer || "Untitled job";
      card.querySelector(".job-card-vehicle").textContent = [job.vehicle, job.registration].filter(Boolean).join(" · ") || job.jobType || "";

      const pill = card.querySelector(".job-card-pill");
      const active = Store.getActiveTimer();
      if (active && active.jobId === job.id) {
        pill.dataset.live = active.type;
        pill.innerHTML = `<span class="pill-live-dot"></span><span class="pill-live-text"></span>`;
      } else if (job.status === "completed") {
        pill.textContent = "Completed";
      } else if (job.status === "in_progress") {
        pill.textContent = "In progress";
      } else {
        pill.textContent = "Not started";
      }

      card.addEventListener("click", () => {
        currentJobId = job.id;
        render("detail");
      });
      listEl.appendChild(node);
    });
    tickList(); // paint live badges immediately
  }

  function tickList() {
    const active = Store.getActiveTimer();
    document.querySelectorAll(".job-card-pill[data-live]").forEach((pill) => {
      if (!active) return;
      const seconds = active.type === "travel"
        ? safeDiffSeconds(active.startedAt) + (Store.getJob(active.jobId)?.travelSeconds || 0)
        : safeDiffSeconds(active.startedAt) + (Store.getJob(active.jobId)?.labourSeconds || 0);
      const textEl = pill.querySelector(".pill-live-text");
      if (textEl) textEl.textContent = active.type === "travel" ? fmtMS(seconds) : fmtHMS(seconds);
    });
  }

  /* ---------------- Form (new job) ---------------- */
  /* ---------------- Customer/vehicle history lookups ---------------- */
  function getKnownCustomers(query) {
    const q = query.trim().toLowerCase();
    const jobs = Store.getJobs().slice().sort((a, b) => b.createdAt - a.createdAt);
    const seen = new Map(); // lowercase name -> {name, count, site, phone, email}
    jobs.forEach((j) => {
      if (!j.customer) return;
      const key = j.customer.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, {
          name: j.customer, count: 0,
          site: j.site || "", phone: j.customerPhone || "", email: j.customerEmail || ""
        });
      }
      seen.get(key).count++;
    });
    return Array.from(seen.values())
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 6);
  }

  function getKnownVehiclesForCustomer(customerName, query) {
    const q = query.trim().toLowerCase();
    const nameKey = customerName.trim().toLowerCase();
    if (!nameKey) return [];
    const jobs = Store.getJobs()
      .filter((j) => j.customer && j.customer.toLowerCase() === nameKey)
      .sort((a, b) => b.createdAt - a.createdAt);
    const seen = new Map(); // "vehicle|reg" -> {vehicle, registration, hoursMiles, date}
    jobs.forEach((j) => {
      if (!j.vehicle) return;
      const key = `${j.vehicle.toLowerCase()}|${(j.registration || "").toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, {
          vehicle: j.vehicle,
          registration: j.registration,
          hoursMiles: j.hoursMiles,
          date: j.completedAt || j.createdAt
        });
      }
    });
    return Array.from(seen.values())
      .filter((v) => !q || v.vehicle.toLowerCase().includes(q))
      .slice(0, 6);
  }

  /* ---------------- Customers ---------------- */
  let currentCustomerName = null;
  let formPrefill = null; // set before render("form") to pre-populate customer/phone/email/site

  function getCustomersSummary() {
    const jobs = Store.getJobs();
    const map = new Map();
    // Seed with standalone customer records (created before any job exists) first.
    Store.getCustomers().forEach((sc) => {
      if (!sc.name) return;
      map.set(sc.name.toLowerCase(), { name: sc.name, jobs: [], seedPhone: sc.phone || "", seedEmail: sc.email || "", seedSite: sc.site || "" });
    });
    jobs.forEach((j) => {
      if (!j.customer) return;
      const key = j.customer.toLowerCase();
      if (!map.has(key)) map.set(key, { name: j.customer, jobs: [], seedPhone: "", seedEmail: "", seedSite: "" });
      map.get(key).jobs.push(j);
    });
    return Array.from(map.values())
      .map((c) => {
        c.jobs.sort((a, b) => b.createdAt - a.createdAt);
        return {
          name: c.name,
          count: c.jobs.length,
          phone: (c.jobs.find((j) => j.customerPhone) || {}).customerPhone || c.seedPhone || "",
          email: (c.jobs.find((j) => j.customerEmail) || {}).customerEmail || c.seedEmail || "",
          site: (c.jobs.find((j) => j.site) || {}).site || c.seedSite || "",
          jobs: c.jobs
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  function wireCustomers() {
    document.querySelector('[data-action="new-customer"]').addEventListener("click", openNewCustomerSheet);
    const listEl = document.getElementById("customers-list");
    const emptyEl = document.getElementById("customers-empty");
    const customers = getCustomersSummary();
    listEl.innerHTML = "";
    if (!customers.length) { emptyEl.hidden = false; return; }
    emptyEl.hidden = true;
    customers.forEach((c) => {
      const card = document.createElement("button");
      card.className = "job-card job-card-not_started";
      card.innerHTML = `
        <span class="job-card-dot"></span>
        <span class="job-card-body">
          <span class="job-card-customer">${escapeHtml(c.name)}</span>
          <span class="job-card-vehicle">${c.count === 0 ? "No jobs yet" : `${c.count} previous job${c.count === 1 ? "" : "s"}`}</span>
        </span>`;
      card.addEventListener("click", () => {
        currentCustomerName = c.name;
        render("customer-detail");
      });
      listEl.appendChild(card);
    });
  }

  function wireCustomerDetail() {
    const customers = getCustomersSummary();
    const c = customers.find((x) => x.name === currentCustomerName);
    if (!c) { render("customers"); return; }

    document.querySelector('[data-action="go-customers"]').addEventListener("click", () => render("customers"));
    document.querySelector('[data-action="new-job-for-customer"]').addEventListener("click", () => {
      formPrefill = { name: c.name, phone: c.phone, email: c.email, site: c.site };
      render("form");
    });
    document.getElementById("cd-name").textContent = c.name;

    const qa = document.getElementById("cd-quick-actions");
    const callBtn = document.getElementById("cd-call");
    const navBtn = document.getElementById("cd-navigate");
    const emailBtn = document.getElementById("cd-email");
    callBtn.hidden = !c.phone;
    if (c.phone) callBtn.href = `tel:${c.phone.replace(/\s+/g, "")}`;
    navBtn.hidden = !c.site;
    if (c.site) navBtn.href = `https://maps.google.com/?q=${encodeURIComponent(c.site)}`;
    emailBtn.hidden = !c.email;
    if (c.email) emailBtn.href = `mailto:${c.email}`;
    qa.hidden = !(c.phone || c.site || c.email);

    const vehiclesEl = document.getElementById("cd-vehicles");
    const vehicles = [...new Set(c.jobs.map((j) => [j.vehicle, j.registration].filter(Boolean).join(" · ")).filter(Boolean))];
    vehiclesEl.innerHTML = vehicles.length
      ? vehicles.map((v) => `<div class="visit-row"><span class="visit-row-date">${escapeHtml(v)}</span></div>`).join("")
      : `<p class="parts-panel-empty">No ${getTerm("equipment").toLowerCase()} recorded yet.</p>`;

    const jobsEl = document.getElementById("cd-jobs");
    jobsEl.innerHTML = c.jobs.map((j) => `
      <button class="visit-row" data-job-id="${j.id}" style="width:100%;text-align:left;border:1px solid var(--line);cursor:pointer">
        <span class="visit-row-date">${escapeHtml(fmtDate(j.createdAt))} — ${escapeHtml(j.jobType || "Job")}</span>
        <span class="visit-row-times">${j.status === "completed" ? "Completed" : j.status === "in_progress" ? "In progress" : "Not started"}</span>
      </button>`).join("");
    jobsEl.querySelectorAll("[data-job-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentJobId = btn.dataset.jobId;
        render("detail");
      });
    });
  }

  function wireSuggestList(inputEl, listEl, getItems, renderItem, onPick) {
    function show() {
      const items = getItems(inputEl.value);
      if (!items.length) { listEl.hidden = true; return; }
      listEl.innerHTML = "";
      items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "suggest-item";
        row.innerHTML = renderItem(item);
        // mousedown fires before the input's blur, so the click registers before we hide the list
        row.addEventListener("mousedown", (e) => e.preventDefault());
        row.addEventListener("click", () => { onPick(item); listEl.hidden = true; });
        listEl.appendChild(row);
      });
      listEl.hidden = false;
    }
    inputEl.addEventListener("input", show);
    inputEl.addEventListener("focus", show);
    inputEl.addEventListener("blur", () => setTimeout(() => { listEl.hidden = true; }, 120));
  }

  function wireForm() {
    const customer = document.getElementById("f-customer");
    const vehicle = document.getElementById("f-vehicle");
    const reg = document.getElementById("f-reg");
    const jobtype = document.getElementById("f-jobtype");
    const jobnum = document.getElementById("f-jobnum");
    const hours = document.getElementById("f-hours");
    const hoursHint = document.getElementById("f-hours-hint");
    const description = document.getElementById("f-description");
    const site = document.getElementById("f-site");
    const phone = document.getElementById("f-phone");
    const email = document.getElementById("f-email");
    const saveBtn = document.getElementById("btn-save-job");
    const customerSuggest = document.getElementById("customer-suggest");
    const vehicleSuggest = document.getElementById("vehicle-suggest");

    if (formPrefill) {
      customer.value = formPrefill.name || "";
      phone.value = formPrefill.phone || "";
      email.value = formPrefill.email || "";
      site.value = formPrefill.site || "";
      formPrefill = null;
    }

    const useTemplateBtn = document.getElementById("btn-use-template");
    if (useTemplateBtn) {
      useTemplateBtn.hidden = Store.getTemplates().length === 0;
      useTemplateBtn.onclick = () => openTemplatePickSheet();
    }

    function checkValid() {
      saveBtn.disabled = !customer.value.trim();
    }
    [customer, vehicle, reg, jobtype, jobnum, hours, description].forEach((el) => el.addEventListener("input", checkValid));
    checkValid();

    const numbering = Store.getNumbering();
    if (numbering.enabled && !jobnum.value.trim()) {
      jobnum.value = formatJobNumber(numbering);
      jobnum.placeholder = "Auto-numbered — edit to override";
    }

    document.querySelectorAll('#jobtype-chips [data-chip]').forEach((chip) => {
      chip.addEventListener("click", () => {
        const isSelected = chip.classList.contains("chip-selected");
        document.querySelectorAll('#jobtype-chips [data-chip]').forEach((c) => c.classList.remove("chip-selected"));
        if (isSelected) {
          jobtype.value = "";
        } else {
          chip.classList.add("chip-selected");
          jobtype.value = chip.dataset.chip;
        }
        checkValid();
      });
    });
    // Typing something that doesn't match a chip should un-highlight all chips.
    jobtype.addEventListener("input", () => {
      document.querySelectorAll('#jobtype-chips [data-chip]').forEach((c) => {
        c.classList.toggle("chip-selected", c.dataset.chip === jobtype.value);
      });
    });

    wireSuggestList(
      customer,
      customerSuggest,
      (query) => getKnownCustomers(query),
      (c) => `<span class="suggest-item-main">${escapeHtml(c.name)}</span><span class="suggest-item-meta">${c.count} previous job${c.count === 1 ? "" : "s"}</span>`,
      (c) => {
        customer.value = c.name;
        if (c.site) site.value = c.site;
        if (c.phone) phone.value = c.phone;
        if (c.email) email.value = c.email;
        checkValid();
        vehicle.focus();
      }
    );

    wireSuggestList(
      vehicle,
      vehicleSuggest,
      (query) => getKnownVehiclesForCustomer(customer.value, query),
      (v) => `<span class="suggest-item-main">${escapeHtml(v.vehicle)}</span><span class="suggest-item-meta">${escapeHtml(v.registration || "")}${v.hoursMiles ? " · " + escapeHtml(v.hoursMiles) : ""}</span>`,
      (v) => {
        vehicle.value = v.vehicle;
        if (v.registration) reg.value = v.registration;
        hoursHint.textContent = v.hoursMiles ? `Last recorded: ${v.hoursMiles} (${fmtDate(v.date)})` : "";
        checkValid();
        reg.focus();
      }
    );

    document.querySelector('[data-action="go-list"]').addEventListener("click", () => render("list"));

    saveBtn.addEventListener("click", () => {
      const job = newJob();
      job.customer = customer.value.trim();
      job.vehicle = vehicle.value.trim();
      job.registration = reg.value.trim().toUpperCase();
      job.jobType = jobtype.value.trim();
      job.jobNumber = jobnum.value.trim();
      job.hoursMiles = hours.value.trim();
      job.description = description.value.trim();
      job.site = site.value.trim();
      job.customerPhone = phone.value.trim();
      job.customerEmail = email.value.trim();
      Store.upsertJob(job);
      if (numbering.enabled && job.jobNumber === formatJobNumber(numbering)) {
        Store.saveNumbering({ ...numbering, next: numbering.next + 1 });
      }
      currentJobId = job.id;
      render("detail");
    });
  }

  /* ---------------- Job detail ---------------- */
  let partsExpanded = false;

  function wireDetail() {
    const job = Store.getJob(currentJobId);
    if (!job) { render("list"); return; }

    partsExpanded = false;

    document.querySelector('[data-action="go-list"]').addEventListener("click", () => render("list"));

    document.getElementById("detail-jobnum").textContent = job.jobNumber ? `Job #${job.jobNumber}` : "Job";
    document.getElementById("detail-customer").textContent = job.customer;
    const vehicleLine = [job.vehicle, job.registration].filter(Boolean).join(" · ");
    document.getElementById("detail-vehicle-row").hidden = !vehicleLine;
    document.getElementById("detail-vehicle").textContent = vehicleLine;

    const jobtypeRow = document.getElementById("detail-jobtype-row");
    if (job.jobType) {
      document.getElementById("detail-jobtype").textContent = job.jobType;
      jobtypeRow.hidden = false;
    } else {
      jobtypeRow.hidden = true;
    }

    const hoursRow = document.getElementById("detail-hours-row");
    if (job.hoursMiles) {
      document.getElementById("detail-hours").textContent = job.hoursMiles;
      hoursRow.hidden = false;
    } else {
      hoursRow.hidden = true;
    }

    const siteRow = document.getElementById("detail-site-row");
    if (job.site) {
      document.getElementById("detail-site").textContent = job.site;
      siteRow.hidden = false;
    } else {
      siteRow.hidden = true;
    }

    const quickActions = document.getElementById("quick-actions");
    const callBtn = document.getElementById("quick-call");
    const navBtn = document.getElementById("quick-navigate");
    const emailBtn = document.getElementById("quick-email");
    callBtn.hidden = !job.customerPhone;
    if (job.customerPhone) callBtn.href = `tel:${job.customerPhone.replace(/\s+/g, "")}`;
    navBtn.hidden = !job.site;
    if (job.site) navBtn.href = `https://maps.google.com/?q=${encodeURIComponent(job.site)}`;
    emailBtn.hidden = !job.customerEmail;
    if (job.customerEmail) emailBtn.href = `mailto:${job.customerEmail}`;
    quickActions.hidden = !(job.customerPhone || job.site || job.customerEmail);

    const descriptionBlock = document.getElementById("detail-description-block");
    if (job.description) {
      document.getElementById("detail-description-text").textContent = job.description;
      descriptionBlock.hidden = false;
    } else {
      descriptionBlock.hidden = true;
    }

    const statusPill = document.getElementById("detail-status-pill");
    statusPill.className = `status-pill status-pill-${job.status}`;
    statusPill.textContent = job.status === "completed" ? "Completed" : job.status === "in_progress" ? "In progress" : "Not started";

    function refreshStatusPill() {
      const j = Store.getJob(currentJobId);
      if (!j) return;
      statusPill.className = `status-pill status-pill-${j.status}`;
      statusPill.textContent = j.status === "completed" ? "Completed" : j.status === "in_progress" ? "In progress" : "Not started";
    }

    document.querySelector('[data-action="edit-details"]').addEventListener("click", () => openEditSheet(job));
    document.querySelector('[data-action="repeat-job"]').addEventListener("click", () => repeatJob(job));
    document.querySelector('[data-action="delete-job"]').addEventListener("click", () => {
      if (!confirm(`Delete this job for ${job.customer}? This can't be undone.`)) return;
      const active = Store.getActiveTimer();
      if (active && active.jobId === job.id) Store.setActiveTimer(null);
      Store.saveJobs(Store.getJobs().filter((j) => j.id !== job.id));
      currentJobId = null;
      toast("Job deleted");
      render("list");
    });

    renderVisitsHistory(job);
    renderPartsPanel(job);
    document.querySelector('[data-action="toggle-parts"]').addEventListener("click", () => {
      partsExpanded = !partsExpanded;
      renderPartsPanel(Store.getJob(currentJobId));
    });
    document.querySelector('[data-action="add-part"]').addEventListener("click", () => openPartSheet());
    document.getElementById("add-part-btn").textContent = `+ Add a ${getTerm("part").toLowerCase()}`;
    document.querySelector('[data-action="written-note"]').addEventListener("click", openNoteSheet);
    document.querySelector('[data-action="recommendations"]').addEventListener("click", openRecommendationsSheet);
    updateRecommendationsCount(job);

    tickDetail();

    document.querySelector('[data-action="toggle-travel"]').addEventListener("click", () => {
      startTimer(job.id, "travel");
      refreshStatusPill();
      tickDetail();
    });
    document.querySelector('[data-action="toggle-labour"]').addEventListener("click", () => {
      startTimer(job.id, "labour");
      refreshStatusPill();
      tickDetail();
    });

    document.querySelector('[data-action="go-complete"]').addEventListener("click", () => {
      pauseActiveTimer(); // bank whatever was running before we lock into the summary
      render("summary");
    });
  }

  function renderVisitsHistory(job) {
    const wrap = document.getElementById("visits-history");
    const list = document.getElementById("visits-history-list");
    const visits = Array.isArray(job.visits) ? job.visits : [];
    if (!visits.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    list.innerHTML = "";
    visits.forEach((v, i) => {
      const row = document.createElement("div");
      row.className = "visit-row";
      row.innerHTML = `<span class="visit-row-date">Visit ${i + 1} · ${escapeHtml(fmtVisitDate(v.date))}</span><span class="visit-row-times">${fmtMS(v.travelSeconds)} · ${fmtHMS(v.labourSeconds)}</span>`;
      list.appendChild(row);
    });
  }

  function renderPartsPanel(job) {
    const tile = document.querySelector('[data-action="toggle-parts"]');
    const panel = document.getElementById("parts-panel");
    const countEl = document.getElementById("count-parts");
    const listEl = document.getElementById("parts-panel-list");

    countEl.textContent = job.parts.length;
    countEl.classList.toggle("show", job.parts.length > 0);
    if (tile) tile.setAttribute("aria-expanded", String(partsExpanded));
    panel.hidden = !partsExpanded;

    if (!partsExpanded) return;

    listEl.innerHTML = "";
    if (!job.parts.length) {
      const empty = document.createElement("p");
      empty.className = "parts-panel-empty";
      empty.textContent = `No ${getTerm("parts").toLowerCase()} added yet.`;
      listEl.appendChild(empty);
      return;
    }

    const tpl = document.getElementById("tpl-part-row");
    job.parts.forEach((part) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector(".part-row-desc").textContent = part.description || part.number || getTerm("part");
      node.querySelector(".part-row-meta").textContent = [part.number, `Qty ${part.quantity}`].filter(Boolean).join(" · ");
      node.querySelector(".part-row-body").addEventListener("click", () => {
        openPartSheet(part);
      });
      node.querySelector(".part-row-remove").addEventListener("click", (e) => {
        e.stopPropagation();
        const current = Store.getJob(currentJobId);
        current.parts = current.parts.filter((p) => p.id !== part.id);
        Store.upsertJob(current);
        renderPartsPanel(current);
        toast(`${getTerm("part")} removed`, () => {
          const j = Store.getJob(currentJobId);
          if (!j) return;
          j.parts.push(part);
          Store.upsertJob(j);
          partsExpanded = true;
          renderPartsPanel(j);
        });
      });
      listEl.appendChild(node);
    });
  }

  function tickDetail() {
    const job = Store.getJob(currentJobId);
    if (!job) return;

    const travelActive = isTimerActive(job.id, "travel");
    const labourActive = isTimerActive(job.id, "labour");
    const travelBtn = document.querySelector('[data-action="toggle-travel"]');
    const labourBtn = document.querySelector('[data-action="toggle-labour"]');
    if (travelBtn) travelBtn.classList.toggle("is-active", travelActive);
    if (labourBtn) labourBtn.classList.toggle("is-active", labourActive);

    updateTimerHero(job, travelActive, labourActive);
  }

  function updateTimerHero(job, travelActive, labourActive) {
    const hero = document.getElementById("timer-hero");
    if (!hero) return;
    // Labour is the primary metric by default (this is the actual work being billed);
    // if Travel is the one currently running, it takes the hero spot instead.
    const primaryIsTravel = travelActive;
    const primarySeconds = liveSeconds(job, primaryIsTravel ? "travel" : "labour");
    const secondarySeconds = liveSeconds(job, primaryIsTravel ? "labour" : "travel");

    document.getElementById("timer-hero-eyebrow").textContent = primaryIsTravel ? "Travel time" : "Labour time";
    document.getElementById("timer-hero-value").textContent = primaryIsTravel ? fmtMS(primarySeconds) : fmtHMS(primarySeconds);
    document.getElementById("timer-hero-sub").textContent = primaryIsTravel
      ? `Labour ${fmtHMS(secondarySeconds)}`
      : `Travel ${fmtMS(secondarySeconds)}`;

    hero.className = "timer-hero" + (travelActive ? " timer-hero-travel" : labourActive ? " timer-hero-labour" : "");
  }

  const TRAVEL_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M5 17h1.5a2.5 2.5 0 005 0H14a2.5 2.5 0 005 0H20a1 1 0 001-1v-3.6a1 1 0 00-.29-.7l-2.5-2.5A1 1 0 0017.5 9H15V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const LABOUR_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6-6a6 6 0 0 1 -8 -8l3.5 3.5" /></svg>';

  function openNewCustomerSheet() {
    document.getElementById("nc-name").value = "";
    document.getElementById("nc-phone").value = "";
    document.getElementById("nc-email").value = "";
    document.getElementById("nc-site").value = "";
    openSheet("sheet-new-customer");
    document.getElementById("btn-save-customer").onclick = () => {
      const name = document.getElementById("nc-name").value.trim();
      if (!name) { toast("Name is required"); return; }
      const customers = Store.getCustomers();
      if (customers.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
        toast("A customer with that name already exists");
        return;
      }
      customers.push({
        id: uid(),
        name,
        phone: document.getElementById("nc-phone").value.trim(),
        email: document.getElementById("nc-email").value.trim(),
        site: document.getElementById("nc-site").value.trim(),
        createdAt: Date.now()
      });
      Store.saveCustomers(customers);
      closeSheet("sheet-new-customer");
      toast("Customer added");
      render("customers");
    };
  }

  function openEditSheet(job) {
    document.getElementById("e-customer").value = job.customer;
    document.getElementById("e-vehicle").value = job.vehicle;
    document.getElementById("e-reg").value = job.registration;
    document.getElementById("e-jobtype").value = job.jobType || "";
    document.getElementById("e-jobnum").value = job.jobNumber;
    document.getElementById("e-hours").value = job.hoursMiles || "";
    document.getElementById("e-site").value = job.site || "";
    document.getElementById("e-phone").value = job.customerPhone || "";
    document.getElementById("e-email").value = job.customerEmail || "";
    document.getElementById("e-description").value = job.description || "";
    openSheet("sheet-edit");
    document.getElementById("btn-save-edit").onclick = () => {
      const customer = document.getElementById("e-customer").value.trim();
      const vehicle = document.getElementById("e-vehicle").value.trim();
      const reg = document.getElementById("e-reg").value.trim();
      if (!customer) { toast("Customer is required"); return; }
      const current = Store.getJob(currentJobId);
      current.customer = customer;
      current.vehicle = vehicle;
      current.registration = reg.toUpperCase();
      current.jobType = document.getElementById("e-jobtype").value.trim();
      current.jobNumber = document.getElementById("e-jobnum").value.trim();
      current.hoursMiles = document.getElementById("e-hours").value.trim();
      current.site = document.getElementById("e-site").value.trim();
      current.customerPhone = document.getElementById("e-phone").value.trim();
      current.customerEmail = document.getElementById("e-email").value.trim();
      current.description = document.getElementById("e-description").value.trim();
      Store.upsertJob(current);
      closeSheet("sheet-edit");
      wireDetail();
      toast("Job details updated");
    };
  }

  /* ---------------- Sheets ---------------- */
  function openSheet(id) {
    const el = document.getElementById(id);
    el.hidden = false;
    el.querySelectorAll('[data-action="close-sheet"]').forEach((btn) => {
      btn.onclick = () => closeSheet(id);
    });
    el.onclick = (e) => {
      if (e.target === el) closeSheet(id);
    };
  }
  function closeSheet(id) {
    document.getElementById(id).hidden = true;
  }

  function openPartSheet(existingPart) {
    const isEdit = !!existingPart;
    const partTerm = getTerm("part");
    document.getElementById("p-number").value = isEdit ? (existingPart.number || "") : "";
    document.getElementById("p-desc").value = isEdit ? (existingPart.description || "") : "";
    document.getElementById("p-qty").value = isEdit ? String(existingPart.quantity || 1) : "1";
    document.getElementById("part-sheet-title").textContent = isEdit ? `Edit ${partTerm.toLowerCase()}` : `Add ${partTerm.toLowerCase()}`;
    document.getElementById("btn-save-part").textContent = isEdit ? "Save changes" : `Add ${partTerm.toLowerCase()}`;
    openSheet("sheet-part");
    document.getElementById("btn-save-part").onclick = () => {
      const number = document.getElementById("p-number").value.trim();
      const desc = document.getElementById("p-desc").value.trim();
      const qty = parseInt(document.getElementById("p-qty").value, 10) || 1;
      if (!desc && !number) { toast(`Add a ${getTerm("part").toLowerCase()} number or description`); return; }
      const job = Store.getJob(currentJobId);
      if (isEdit) {
        const target = job.parts.find((p) => p.id === existingPart.id);
        if (target) {
          target.number = number;
          target.description = desc;
          target.quantity = qty;
        }
      } else {
        job.parts.push({ id: uid(), number, description: desc, quantity: qty });
      }
      Store.upsertJob(job);
      partsExpanded = true;
      renderPartsPanel(job);
      closeSheet("sheet-part");
      toast(isEdit ? `${getTerm("part")} updated` : `${getTerm("part")} added`);
    };
  }

  function openNoteSheet() {
    const job = Store.getJob(currentJobId);
    document.getElementById("note-text").value = job.workNotes || "";
    openSheet("sheet-note");
    document.getElementById("btn-save-note").onclick = () => {
      const text = document.getElementById("note-text").value.trim();
      const current = Store.getJob(currentJobId);
      current.workNotes = text;
      Store.upsertJob(current);
      closeSheet("sheet-note");
      toast("Note saved");
    };
  }

  function openRecommendationsSheet() {
    const job = Store.getJob(currentJobId);
    document.getElementById("recommendations-text").value = job.recommendations || "";
    openSheet("sheet-recommendations");
    document.getElementById("btn-save-recommendations").onclick = () => {
      const text = document.getElementById("recommendations-text").value.trim();
      const current = Store.getJob(currentJobId);
      current.recommendations = text;
      Store.upsertJob(current);
      updateRecommendationsCount(current);
      closeSheet("sheet-recommendations");
      toast("Saved");
    };
  }

  function updateRecommendationsCount(job) {
    const el = document.getElementById("count-recommendations");
    if (!el) return;
    const has = !!(job.recommendations && job.recommendations.trim());
    el.textContent = has ? "1" : "";
    el.classList.toggle("show", has);
  }

  /* ---------------- Settings ---------------- */
  function wireSettings() {
    document.querySelector('[data-action="go-list"]').addEventListener("click", () => render("list"));

    const currentTheme = Store.getTheme();
    document.querySelectorAll(".theme-chip").forEach((chip) => {
      chip.classList.toggle("theme-chip-active", chip.dataset.themeChoice === currentTheme);
      chip.addEventListener("click", () => {
        Store.saveTheme(chip.dataset.themeChoice);
        applyTheme(chip.dataset.themeChoice);
        document.querySelectorAll(".theme-chip").forEach((c) => c.classList.toggle("theme-chip-active", c === chip));
      });
    });

    const currentTrade = Store.getTrade();
    document.querySelectorAll(".trade-chip").forEach((chip) => {
      chip.classList.toggle("trade-chip-active", chip.dataset.tradeChoice === currentTrade);
      chip.addEventListener("click", () => {
        Store.saveTrade(chip.dataset.tradeChoice);
        applyTerminology();
        document.querySelectorAll(".trade-chip").forEach((c) => c.classList.toggle("trade-chip-active", c === chip));
        toast(`Using ${TRADE_LABELS[chip.dataset.tradeChoice]} terminology`);
      });
    });

    const business = Store.getBusiness();
    document.getElementById("s-business-name").value = business.name || "";
    document.getElementById("s-business-phone").value = business.phone || "";
    document.getElementById("s-business-email").value = business.email || "";

    document.getElementById("btn-save-business").addEventListener("click", () => {
      Store.saveBusiness({
        name: document.getElementById("s-business-name").value.trim(),
        phone: document.getElementById("s-business-phone").value.trim(),
        email: document.getElementById("s-business-email").value.trim()
      });
      toast("Business details saved");
    });

    const jobs = Store.getJobs();
    const completedCount = jobs.filter((j) => j.status === "completed").length;
    document.getElementById("settings-data-count").textContent =
      `${jobs.length} job${jobs.length === 1 ? "" : "s"} stored on this device (${completedCount} completed).`;

    document.querySelector('[data-action="export-backup"]').addEventListener("click", () => {
      const payload = { exportedAt: new Date().toISOString(), business: Store.getBusiness(), jobs: Store.getJobs(), templates: Store.getTemplates() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobtrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Backup downloaded");
    });

    document.querySelector('[data-action="export-csv"]').addEventListener("click", () => {
      const csv = buildHoursCsv(Store.getJobs());
      if (!csv) { toast("No hours logged yet to export"); return; }
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobtrack-hours-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("CSV downloaded");
    });

    document.querySelector('[data-action="restore-backup"]').addEventListener("click", () => {
      document.getElementById("restore-file-input").click();
    });

    document.getElementById("restore-file-input").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.jobs)) {
          toast("That doesn't look like a JobTrack backup file");
          return;
        }
        const jobCount = data.jobs.length;
        if (!confirm(`Restore ${jobCount} job${jobCount === 1 ? "" : "s"} from this backup? This replaces everything currently on this device — export a fresh backup first if you want to keep it.`)) {
          return;
        }
        Store.saveJobs(data.jobs);
        if (data.business) Store.saveBusiness(data.business);
        if (Array.isArray(data.templates)) Store.saveTemplates(data.templates);
        Store.setActiveTimer(null);
        toast("Backup restored");
        render("settings");
      } catch (err) {
        console.error(err);
        toast("Couldn't read that file — is it a JobTrack backup?");
      }
    });

    document.querySelector('[data-action="clear-completed"]').addEventListener("click", () => {
      const remaining = Store.getJobs().filter((j) => j.status !== "completed");
      const removed = Store.getJobs().length - remaining.length;
      if (!removed) { toast("No completed jobs to clear"); return; }
      if (!confirm(`Remove ${removed} completed job${removed === 1 ? "" : "s"}? This can't be undone.`)) return;
      Store.saveJobs(remaining);
      toast("Completed jobs cleared");
      render("settings");
    });

    const jn = Store.getNumbering();
    document.getElementById("jn-off").classList.toggle("numbering-chip-active", !jn.enabled);
    document.getElementById("jn-on").classList.toggle("numbering-chip-active", jn.enabled);
    document.getElementById("jn-prefix").value = jn.prefix || "";
    document.getElementById("jn-next").value = jn.next || 1;
    let jnEnabledDraft = jn.enabled;
    document.getElementById("jn-off").addEventListener("click", () => {
      jnEnabledDraft = false;
      document.getElementById("jn-off").classList.add("numbering-chip-active");
      document.getElementById("jn-on").classList.remove("numbering-chip-active");
    });
    document.getElementById("jn-on").addEventListener("click", () => {
      jnEnabledDraft = true;
      document.getElementById("jn-on").classList.add("numbering-chip-active");
      document.getElementById("jn-off").classList.remove("numbering-chip-active");
    });
    document.getElementById("btn-save-jobnumbering").addEventListener("click", () => {
      const next = parseInt(document.getElementById("jn-next").value, 10) || 1;
      Store.saveNumbering({
        enabled: jnEnabledDraft,
        prefix: document.getElementById("jn-prefix").value.trim(),
        next
      });
      toast("Job numbering saved");
    });

    document.querySelector('[data-action="manage-templates"]').addEventListener("click", () => {
      render("templates");
    });

    document.querySelector('[data-action="lock-app"]').addEventListener("click", () => {
      localStorage.removeItem(UNLOCK_KEY);
      render("lock");
    });

    document.querySelector('[data-action="clear-all"]').addEventListener("click", () => {
      if (!confirm("Delete every job and business detail on this device? This can't be undone.")) return;
      Store.saveJobs([]);
      Store.setActiveTimer(null);
      Store.saveBusiness({ name: "", phone: "", email: "" });
      toast("All data cleared");
      render("settings");
    });
  }

  /* ---------------- Job templates ---------------- */
  function wireTemplates() {
    document.querySelector('[data-action="go-settings"]').addEventListener("click", () => render("settings"));
    document.querySelector('[data-action="new-template"]').addEventListener("click", () => openTemplateEditSheet());
    renderTemplatesList();
  }

  function renderTemplatesList() {
    const listEl = document.getElementById("templates-list");
    const emptyEl = document.getElementById("templates-empty");
    if (!listEl) return;
    const templates = Store.getTemplates();
    listEl.innerHTML = "";
    emptyEl.hidden = templates.length > 0;
    const tpl = document.getElementById("tpl-template-row");
    templates.forEach((t) => {
      const node = tpl.content.cloneNode(true);
      node.querySelector(".template-row-name").textContent = t.name;
      node.querySelector(".template-row-type").textContent = t.jobType ? t.jobType : "No job type set";
      node.querySelector(".job-card").addEventListener("click", () => openTemplateEditSheet(t));
      listEl.appendChild(node);
    });
  }

  function openTemplateEditSheet(existingTemplate) {
    const isEdit = !!existingTemplate;
    const nameInput = document.getElementById("tpl-name");
    const jobtypeInput = document.getElementById("tpl-jobtype");
    const notesInput = document.getElementById("tpl-notes");
    const deleteBtn = document.getElementById("btn-delete-template");

    nameInput.value = isEdit ? existingTemplate.name || "" : "";
    jobtypeInput.value = isEdit ? existingTemplate.jobType || "" : "";
    notesInput.value = isEdit ? existingTemplate.notes || "" : "";
    document.getElementById("template-sheet-title").textContent = isEdit ? "Edit template" : "New template";
    document.getElementById("btn-save-template").textContent = isEdit ? "Save changes" : "Save template";
    deleteBtn.hidden = !isEdit;

    document.querySelectorAll('#tpl-jobtype-chips [data-chip]').forEach((chip) => {
      chip.classList.toggle("chip-selected", chip.dataset.chip === jobtypeInput.value);
      chip.onclick = () => {
        const isSelected = chip.classList.contains("chip-selected");
        document.querySelectorAll('#tpl-jobtype-chips [data-chip]').forEach((c) => c.classList.remove("chip-selected"));
        if (isSelected) {
          jobtypeInput.value = "";
        } else {
          chip.classList.add("chip-selected");
          jobtypeInput.value = chip.dataset.chip;
        }
      };
    });
    jobtypeInput.oninput = () => {
      document.querySelectorAll('#tpl-jobtype-chips [data-chip]').forEach((c) => {
        c.classList.toggle("chip-selected", c.dataset.chip === jobtypeInput.value);
      });
    };

    openSheet("sheet-template");

    document.getElementById("btn-save-template").onclick = () => {
      const name = nameInput.value.trim();
      if (!name) { toast("Give the template a name"); return; }
      const templates = Store.getTemplates();
      if (isEdit) {
        const target = templates.find((t) => t.id === existingTemplate.id);
        if (target) {
          target.name = name;
          target.jobType = jobtypeInput.value.trim();
          target.notes = notesInput.value.trim();
        }
      } else {
        templates.push({ id: uid(), name, jobType: jobtypeInput.value.trim(), notes: notesInput.value.trim(), createdAt: Date.now() });
      }
      Store.saveTemplates(templates);
      closeSheet("sheet-template");
      renderTemplatesList();
      toast(isEdit ? "Template updated" : "Template saved");
    };

    deleteBtn.onclick = () => {
      if (!isEdit) return;
      if (!confirm(`Delete the "${existingTemplate.name}" template? This can't be undone.`)) return;
      const templates = Store.getTemplates().filter((t) => t.id !== existingTemplate.id);
      Store.saveTemplates(templates);
      closeSheet("sheet-template");
      renderTemplatesList();
      toast("Template deleted");
    };
  }

  function openTemplatePickSheet() {
    const listEl = document.getElementById("template-pick-list");
    const templates = Store.getTemplates();
    listEl.innerHTML = "";
    if (!templates.length) return;
    templates.forEach((t) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "part-row";
      row.style.width = "100%";
      row.style.textAlign = "left";
      row.innerHTML = `<span class="part-row-body"><span class="part-row-desc">${escapeHtml(t.name)}</span><span class="part-row-meta">${escapeHtml(t.jobType || "No job type set")}</span></span>`;
      row.addEventListener("click", () => {
        applyTemplateToForm(t);
        closeSheet("sheet-template-pick");
      });
      listEl.appendChild(row);
    });
    openSheet("sheet-template-pick");
  }

  function applyTemplateToForm(t) {
    const jobtypeInput = document.getElementById("f-jobtype");
    const descriptionInput = document.getElementById("f-description");
    jobtypeInput.value = t.jobType || "";
    if (t.notes) descriptionInput.value = t.notes;
    document.querySelectorAll('#jobtype-chips [data-chip]').forEach((c) => {
      c.classList.toggle("chip-selected", c.dataset.chip === jobtypeInput.value);
    });
    const saveBtn = document.getElementById("btn-save-job");
    if (saveBtn) saveBtn.disabled = !document.getElementById("f-customer").value.trim();
    toast(`Applied "${t.name}"`);
  }

  /* ---------------- Summary (locked complete screen) ---------------- */
  function wireSummary() {
    const job = Store.getJob(currentJobId);
    if (!job) { render("list"); return; }

    const sheet = document.getElementById("summary-sheet");
    sheet.innerHTML = buildSummaryHtml(job);

    document.querySelector('[data-action="cancel-complete"]').addEventListener("click", backToDetail);
    document.getElementById("btn-cancel-complete").addEventListener("click", backToDetail);

    document.getElementById("btn-mark-complete").addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      // Archive this session as a dated visit, then reset the live counters so a future
      // reopen starts a fresh visit instead of blending into this one's numbers.
      if (!Array.isArray(job.visits)) job.visits = [];
      job.visits.push({
        id: uid(),
        date: todayISODate(),
        travelSeconds: job.travelSeconds,
        labourSeconds: job.labourSeconds
      });
      job.travelSeconds = 0;
      job.labourSeconds = 0;
      job.status = "completed";
      job.completedAt = Date.now();
      Store.upsertJob(job);
      currentJobId = null;
      listTab = "completed";
      render("list");
      toast("Job marked complete");
    });

    document.querySelector('[data-action="copy"]').addEventListener("click", () => copySummary(job));
    document.querySelector('[data-action="print"]').addEventListener("click", () => window.print());
    document.querySelector('[data-action="share"]').addEventListener("click", () => shareSummary(job));
    document.querySelector('[data-action="email"]').addEventListener("click", () => emailSummary(job));
    document.querySelector('[data-action="pdf"]').addEventListener("click", () => exportPdf(job));

    function backToDetail() {
      render("detail");
    }
  }

  function visitsWithCurrent(j) {
    const past = Array.isArray(j.visits) ? j.visits : [];
    const current = { date: todayISODate(), travelSeconds: liveSeconds(j, "travel"), labourSeconds: liveSeconds(j, "labour") };
    return [...past, current];
  }

  function buildSummaryHtml(j) {
    const partsHtml = j.parts.length
      ? `<ul class="summary-parts">${j.parts.map(p => `<li><span>${escapeHtml(p.description || p.number || getTerm("part"))}</span><span class="part-meta">${escapeHtml(p.number ? p.number + " · " : "")}Qty ${p.quantity}</span></li>`).join("")}</ul>`
      : `<p class="summary-empty">No ${getTerm("parts").toLowerCase()} recorded.</p>`;

    const business = Store.getBusiness();
    const businessLine = [business.name, business.phone, business.email].filter(Boolean).join(" · ");

    const visits = visitsWithCurrent(j);
    const totalTravel = visits.reduce((sum, v) => sum + v.travelSeconds, 0);
    const totalLabour = visits.reduce((sum, v) => sum + v.labourSeconds, 0);
    const timeRowsHtml = visits.length > 1
      ? `
        <div class="summary-row"><span class="k">Visits</span><span class="v">${visits.length}</span></div>
        ${visits.map((v, i) => `<div class="summary-row summary-row-visit"><span class="k">Visit ${i + 1} · ${escapeHtml(fmtVisitDate(v.date))}</span><span class="v">${fmtMS(v.travelSeconds)} travel · ${fmtHMS(v.labourSeconds)} labour</span></div>`).join("")}
        <div class="summary-row"><span class="k">Total travel time</span><span class="v">${fmtMS(totalTravel)}</span></div>
        <div class="summary-row"><span class="k">Total labour time</span><span class="v">${fmtHMS(totalLabour)}</span></div>
      `
      : `
        <div class="summary-row"><span class="k">Travel time</span><span class="v">${fmtMS(totalTravel)}</span></div>
        <div class="summary-row"><span class="k">Labour time</span><span class="v">${fmtHMS(totalLabour)}</span></div>
      `;

    return `
      <h3 class="summary-heading">Job summary</h3>
      ${businessLine ? `<p class="summary-business">${escapeHtml(businessLine)}</p>` : ""}
      <div>
        <div class="summary-row"><span class="k">Customer</span><span class="v">${escapeHtml(j.customer)}</span></div>
        <div class="summary-row"><span class="k">${getTerm("vehicle")}</span><span class="v">${escapeHtml(j.vehicle)}</span></div>
        <div class="summary-row"><span class="k">${getTerm("registration")}</span><span class="v">${escapeHtml(j.registration)}</span></div>
        ${j.site ? `<div class="summary-row"><span class="k">Site</span><span class="v">${escapeHtml(j.site)}</span></div>` : ""}
        ${j.jobType ? `<div class="summary-row"><span class="k">Job type</span><span class="v">${escapeHtml(j.jobType)}</span></div>` : ""}
        ${j.jobNumber ? `<div class="summary-row"><span class="k">Job number</span><span class="v">${escapeHtml(j.jobNumber)}</span></div>` : ""}
        ${j.hoursMiles ? `<div class="summary-row"><span class="k">Hours / miles</span><span class="v">${escapeHtml(j.hoursMiles)}</span></div>` : ""}
        <div class="summary-row"><span class="k">Date</span><span class="v">${fmtDate(Date.now())}</span></div>
        ${timeRowsHtml}
      </div>
      ${j.description ? `
      <div class="summary-block">
        <h3 class="summary-heading">Additional notes</h3>
        <p>${escapeHtml(j.description)}</p>
      </div>` : ""}
      <div class="summary-block">
        <h3 class="summary-heading">${getTerm("parts")} used</h3>
        ${partsHtml}
      </div>
      <div class="summary-block">
        <h3 class="summary-heading">Work done</h3>
        <p>${escapeHtml(j.workNotes || "No notes recorded.")}</p>
      </div>
      ${j.recommendations ? `
      <div class="summary-block">
        <h3 class="summary-heading">Further work</h3>
        <p>${escapeHtml(j.recommendations)}</p>
      </div>` : ""}
    `;
  }

  function summaryPlainText(j) {
    const business = Store.getBusiness();
    const businessLine = [business.name, business.phone, business.email].filter(Boolean).join(" · ");
    const visits = visitsWithCurrent(j);
    const totalTravel = visits.reduce((sum, v) => sum + v.travelSeconds, 0);
    const totalLabour = visits.reduce((sum, v) => sum + v.labourSeconds, 0);

    const lines = [];
    lines.push("JOB SUMMARY");
    if (businessLine) lines.push(businessLine);
    lines.push("");
    lines.push(`Customer: ${j.customer}`);
    lines.push(`${getTerm("vehicle")}: ${j.vehicle}`);
    lines.push(`${getTerm("registration")}: ${j.registration}`);
    if (j.site) lines.push(`Site: ${j.site}`);
    if (j.jobType) lines.push(`Job type: ${j.jobType}`);
    if (j.jobNumber) lines.push(`Job number: ${j.jobNumber}`);
    if (j.hoursMiles) lines.push(`Hours / miles: ${j.hoursMiles}`);
    lines.push(`Date: ${fmtDate(Date.now())}`);
    if (visits.length > 1) {
      lines.push(`Visits: ${visits.length}`);
      visits.forEach((v, i) => lines.push(`  Visit ${i + 1} (${fmtVisitDate(v.date)}): ${fmtMS(v.travelSeconds)} travel, ${fmtHMS(v.labourSeconds)} labour`));
      lines.push(`Total travel time: ${fmtMS(totalTravel)}`);
      lines.push(`Total labour time: ${fmtHMS(totalLabour)}`);
    } else {
      lines.push(`Travel time: ${fmtMS(totalTravel)}`);
      lines.push(`Labour time: ${fmtHMS(totalLabour)}`);
    }
    lines.push("");
    if (j.description) {
      lines.push("Additional notes:");
      lines.push(j.description);
      lines.push("");
    }
    lines.push(`${getTerm("parts")} used:`);
    if (j.parts.length) {
      j.parts.forEach(p => lines.push(`- ${p.description || p.number || getTerm("part")}${p.number ? ` (${p.number})` : ""} x${p.quantity}`));
    } else {
      lines.push("- None recorded");
    }
    lines.push("");
    lines.push("Work done:");
    lines.push(j.workNotes || "No notes recorded.");
    if (j.recommendations) {
      lines.push("");
      lines.push("Further work:");
      lines.push(j.recommendations);
    }
    return lines.join("\n");
  }

  async function copySummary(j) {
    try {
      await navigator.clipboard.writeText(summaryPlainText(j));
      toast("Summary copied");
    } catch {
      toast("Couldn't copy — try again");
    }
  }

  async function shareSummary(j) {
    const text = summaryPlainText(j);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Job summary — ${j.vehicle}`, text });
      } catch { /* cancelled */ }
    } else {
      copySummary(j);
      toast("Sharing isn't available — copied instead");
    }
  }

  function emailSummary(j) {
    const subject = encodeURIComponent(`Job summary — ${j.vehicle} ${j.registration}`);
    const body = encodeURIComponent(summaryPlainText(j));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function exportPdf(j) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      let y = margin;
      const lineHeight = 16;
      const pageHeight = doc.internal.pageSize.getHeight();
      const pageWidth = doc.internal.pageSize.getWidth();

      function ensureRoom(extra = lineHeight) {
        if (y + extra > pageHeight - margin) { doc.addPage(); y = margin; }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(20, 83, 45);
      doc.text("Job summary", margin, y);
      y += 24;

      const business = Store.getBusiness();
      const businessLine = [business.name, business.phone, business.email].filter(Boolean).join("  ·  ");
      if (businessLine) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(91, 110, 101);
        doc.text(businessLine, margin, y);
        y += 18;
      }
      y += 4;

      doc.setDrawColor(230, 236, 232);
      doc.line(margin, y, pageWidth - margin, y);
      y += 20;

      doc.setFontSize(11);
      const pdfVisits = visitsWithCurrent(j);
      const pdfTotalTravel = pdfVisits.reduce((sum, v) => sum + v.travelSeconds, 0);
      const pdfTotalLabour = pdfVisits.reduce((sum, v) => sum + v.labourSeconds, 0);
      const rows = [
        ["Customer", j.customer],
        [getTerm("vehicle"), j.vehicle],
        [getTerm("registration"), j.registration],
        ...(j.site ? [["Site", j.site]] : []),
        ...(j.jobType ? [["Job type", j.jobType]] : []),
        ...(j.jobNumber ? [["Job number", j.jobNumber]] : []),
        ...(j.hoursMiles ? [["Hours / miles", j.hoursMiles]] : []),
        ["Date", fmtDate(Date.now())],
        ...(pdfVisits.length > 1
          ? [
              ["Visits", String(pdfVisits.length)],
              ...pdfVisits.map((v, i) => [`  Visit ${i + 1} (${fmtVisitDate(v.date)})`, `${fmtMS(v.travelSeconds)} travel, ${fmtHMS(v.labourSeconds)} labour`]),
              ["Total travel time", fmtMS(pdfTotalTravel)],
              ["Total labour time", fmtHMS(pdfTotalLabour)]
            ]
          : [
              ["Travel time", fmtMS(pdfTotalTravel)],
              ["Labour time", fmtHMS(pdfTotalLabour)]
            ])
      ];
      rows.forEach(([k, v]) => {
        ensureRoom();
        doc.setFont("helvetica", "bold");
        doc.setTextColor(91, 110, 101);
        doc.text(k, margin, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(11, 31, 23);
        doc.text(String(v || "-"), margin + 160, y);
        y += lineHeight;
      });

      if (j.description) {
        y += 12;
        ensureRoom(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(20, 83, 45);
        doc.text("Additional notes", margin, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(11, 31, 23);
        doc.splitTextToSize(j.description, pageWidth - margin * 2).forEach((line) => {
          ensureRoom();
          doc.text(line, margin, y);
          y += lineHeight;
        });
      }

      y += 12;
      ensureRoom(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20, 83, 45);
      doc.text(`${getTerm("parts")} used`, margin, y);
      y += 18;
      doc.setFontSize(11);
      doc.setTextColor(11, 31, 23);
      doc.setFont("helvetica", "normal");
      if (j.parts.length) {
        j.parts.forEach((p) => {
          ensureRoom();
          const line = `- ${p.description || p.number || getTerm("part")}${p.number ? ` (${p.number})` : ""}  x${p.quantity}`;
          doc.text(line, margin, y);
          y += lineHeight;
        });
      } else {
        ensureRoom();
        doc.text("None recorded.", margin, y);
        y += lineHeight;
      }

      y += 12;
      ensureRoom(20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(20, 83, 45);
      doc.text("Work done", margin, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(11, 31, 23);
      const notes = j.workNotes || "No notes recorded.";
      const wrapped = doc.splitTextToSize(notes, pageWidth - margin * 2);
      wrapped.forEach((line) => {
        ensureRoom();
        doc.text(line, margin, y);
        y += lineHeight;
      });

      if (j.recommendations) {
        y += 12;
        ensureRoom(20);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(20, 83, 45);
        doc.text("Further work", margin, y);
        y += 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(11, 31, 23);
        doc.splitTextToSize(j.recommendations, pageWidth - margin * 2).forEach((line) => {
          ensureRoom();
          doc.text(line, margin, y);
          y += lineHeight;
        });
      }

      const filenameSafe = `${j.vehicle || "job"}-${j.registration || ""}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      doc.save(`jobtrack-${filenameSafe || j.id}.pdf`);
      toast("PDF exported");
    } catch (err) {
      console.error(err);
      toast("Couldn't export PDF");
    }
  }

  /* ---------------- Service worker + update detection ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // Covers the case where an update already finished installing before this
        // tab loaded (e.g. it was installed while the tab was closed).
        if (reg.waiting) showUpdateBanner(reg);

        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            // "installed" + an existing controller means this is a genuine update,
            // not the very first install on a fresh device.
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              showUpdateBanner(reg);
            }
          });
        });
      }).catch(() => {});

      // Once the new worker takes control, reload once to actually run the new code.
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
    });
  }

  function showUpdateBanner(reg) {
    const banner = document.getElementById("update-banner");
    banner.hidden = false;
    document.getElementById("btn-update-now").onclick = () => {
      if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      banner.hidden = true;
    };
  }

  applyTheme(Store.getTheme());
  render(localStorage.getItem(UNLOCK_KEY) === "1" ? "list" : "lock");
})();
