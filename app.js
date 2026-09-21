/* ==========================================================
   Getsemaní Kids · Sistema de asistencia
   - Sin frameworks: JavaScript simple.
   - Base de datos: Supabase (o modo demostración en el navegador).
   ========================================================== */
(() => {
  "use strict";

  const CFG = window.CONFIG || {};
  const DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  /* ---------- Datos fijos ---------- */
  const SALONES = [
    { id: "eden",  nombre: "Eden",  img: "img/salon-eden.webp"  },
    { id: "betel", nombre: "Betel", img: "img/salon-betel.webp" },
    { id: "sinai", nombre: "Sínai", img: "img/salon-sinai.webp" },
    { id: "sion",  nombre: "Sión",  img: "img/salon-sion.webp"  },
    { id: "emaus", nombre: "Emaús", img: "img/salon-emaus.webp" },
  ];
  const AVATAR = { F: "img/avatar-nina.webp", M: "img/avatar-nino.webp" };
  const SEXO = { F: "Niña", M: "Niño" };

  const ICON = {
    lock: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 11V8a4 4 0 018 0v3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    edit:  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ---------- Utilidades ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const pad = (n) => String(n).padStart(2, "0");
  const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const fmtFecha = (iso) => {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };
  const sinTildes = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  let toastTimer;
  function toast(msg, isError = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("error", isError);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3400);
  }

  /* ---------- Estado ---------- */
  const state = {
    students: [],       // estudiantes activos de todos los salones
    loaded: false,
    user: null,         // administrador con sesión iniciada
    salon: null,        // id del salón abierto
    fecha: hoy(),
    marks: new Map(),   // student_id -> "P" | "F"   (lo que se ve en pantalla)
    saved: new Map(),   // student_id -> "P" | "F"   (lo que está guardado)
  };

  const salonById = (id) => SALONES.find((s) => s.id === id);

  // Mujeres primero, luego varones; dentro de cada grupo, por orden alfabético
  const ordenar = (list) =>
    [...list].sort((a, b) => {
      if (a.sex !== b.sex) return a.sex === "F" ? -1 : 1;
      return a.full_name.localeCompare(b.full_name, "es");
    });

  const studentsOf = (salonId) => ordenar(state.students.filter((s) => s.salon === salonId));

  /* ==========================================================
     CAPA DE DATOS
     Dos versiones con la misma forma:
       · supaApi()  → Supabase
       · demoApi()  → localStorage (para probar sin base de datos)
     ========================================================== */

  function supaApi() {
    if (!window.supabase) throw new Error("No se pudo cargar la librería de Supabase. Revisa tu conexión a internet.");
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

    // Lee todas las filas aunque sean más de 1000
    async function leerTodo(armarConsulta) {
      const out = [];
      const paso = 1000;
      for (let desde = 0; ; desde += paso) {
        const { data, error } = await armarConsulta(desde, desde + paso - 1);
        if (error) throw error;
        out.push(...data);
        if (data.length < paso) break;
      }
      return out;
    }

    return {
      async init() {
        const { data } = await sb.auth.getSession();
        state.user = data.session ? data.session.user : null;
        sb.auth.onAuthStateChange((_evento, session) => {
          state.user = session ? session.user : null;
          setTimeout(refreshAuthUI, 0);
        });
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signOut() {
        await sb.auth.signOut();
      },
      async listStudents() {
        const { data, error } = await sb.from("students").select("*").eq("active", true).order("full_name");
        if (error) throw error;
        return data;
      },
      async addStudent({ full_name, sex, salon }) {
        const { error } = await sb.from("students").insert({ full_name, sex, salon });
        if (error) throw error;
      },
      async updateStudent(id, patch) {
        const { error } = await sb.from("students").update(patch).eq("id", id);
        if (error) throw error;
      },
      async removeStudent(id) {
        // "Quitar" = desactivar. Así se conserva el historial de asistencia.
        const { error } = await sb.from("students").update({ active: false }).eq("id", id);
        if (error) throw error;
      },
      async getAttendance(ids, fecha) {
        if (!ids.length) return new Map();
        const { data, error } = await sb.from("attendance").select("student_id,status").eq("date", fecha).in("student_id", ids);
        if (error) throw error;
        return new Map(data.map((r) => [r.student_id, r.status]));
      },
      async saveAttendance(fecha, upserts, deletes) {
        if (upserts.length) {
          const filas = upserts.map((u) => ({ student_id: u.student_id, date: fecha, status: u.status }));
          const { error } = await sb.from("attendance").upsert(filas, { onConflict: "student_id,date" });
          if (error) throw error;
        }
        if (deletes.length) {
          const { error } = await sb.from("attendance").delete().eq("date", fecha).in("student_id", deletes);
          if (error) throw error;
        }
      },
      async getHistory(ids) {
        if (!ids.length) return [];
        return leerTodo((a, b) =>
          sb.from("attendance").select("student_id,date,status").in("student_id", ids).order("date").range(a, b)
        );
      },
    };
  }

  function demoApi() {
    const KEY = "getsemani_demo_v1";
    const ADMIN_KEY = "getsemani_demo_admin";
    let mem = null;

    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

    function seed() {
      const nombres = {
        eden:  [["Sofía", "F"], ["Valentina", "F"], ["Mateo", "M"], ["Diego", "M"]],
        betel: [["Camila", "F"], ["Luciana", "F"], ["Santiago", "M"], ["Adrián", "M"]],
        sinai: [["Antonella", "F"], ["Renata", "F"], ["Joaquín", "M"], ["Gael", "M"]],
        sion:  [["Isabella", "F"], ["Mía", "F"], ["Thiago", "M"], ["Bruno", "M"]],
        emaus: [["Emma", "F"], ["Zoe", "F"], ["Lucas", "M"], ["Benjamín", "M"]],
      };
      const students = [];
      Object.entries(nombres).forEach(([salon, arr]) =>
        arr.forEach(([full_name, sex]) => students.push({ id: uid(), full_name, sex, salon, active: true }))
      );
      return { students, attendance: [] };
    }

    function db() {
      if (mem) return mem;
      try { mem = JSON.parse(localStorage.getItem(KEY)); } catch (_) { mem = null; }
      if (!mem) mem = seed();
      return mem;
    }
    function persist() {
      try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch (_) { /* sin almacenamiento */ }
    }

    return {
      async init() {
        try { state.user = sessionStorage.getItem(ADMIN_KEY) ? { email: "admin@getsemani.pe" } : null; } catch (_) { state.user = null; }
      },
      async signIn(email, password) {
        if (email.trim().toLowerCase() !== "admin@getsemani.pe" || password !== "admin123") throw new Error("credenciales");
        try { sessionStorage.setItem(ADMIN_KEY, "1"); } catch (_) { /* nada */ }
        state.user = { email: "admin@getsemani.pe" };
      },
      async signOut() {
        try { sessionStorage.removeItem(ADMIN_KEY); } catch (_) { /* nada */ }
        state.user = null;
      },
      async listStudents() {
        return db().students.filter((s) => s.active).map((s) => ({ ...s }));
      },
      async addStudent({ full_name, sex, salon }) {
        db().students.push({ id: uid(), full_name, sex, salon, active: true });
        persist();
      },
      async updateStudent(id, patch) {
        const s = db().students.find((x) => x.id === id);
        if (s) Object.assign(s, patch);
        persist();
      },
      async removeStudent(id) {
        const s = db().students.find((x) => x.id === id);
        if (s) s.active = false;
        persist();
      },
      async getAttendance(ids, fecha) {
        const set = new Set(ids);
        return new Map(db().attendance.filter((a) => a.date === fecha && set.has(a.student_id)).map((a) => [a.student_id, a.status]));
      },
      async saveAttendance(fecha, upserts, deletes) {
        const d = db();
        upserts.forEach((u) => {
          const fila = d.attendance.find((a) => a.student_id === u.student_id && a.date === fecha);
          if (fila) fila.status = u.status;
          else d.attendance.push({ student_id: u.student_id, date: fecha, status: u.status });
        });
        const del = new Set(deletes);
        d.attendance = d.attendance.filter((a) => !(a.date === fecha && del.has(a.student_id)));
        persist();
      },
      async getHistory(ids) {
        const set = new Set(ids);
        return db().attendance.filter((a) => set.has(a.student_id)).map((a) => ({ ...a }));
      },
    };
  }

  let api;

  /* ==========================================================
     RUTAS (pantallas)
     #/            inicio
     #/salones     los 5 salones
     #/salon/eden  lista de un salón
     ========================================================== */

  function currentRoute() {
    const [a, b] = location.hash.replace(/^#\/?/, "").split("/");
    if (a === "salones") return { name: "salones" };
    if (a === "salon" && salonById(b)) return { name: "salon", id: b };
    return { name: "home" };
  }

  async function route() {
    const r = currentRoute();

    // Si se exige sesión para entrar a un salón
    if (r.name === "salon" && CFG.REQUIRE_LOGIN_TO_ENTER_SALON && !state.user) {
      location.hash = "#/salones";
      openLogin();
      return;
    }

    $("#view-home").hidden = r.name !== "home";
    $("#view-salones").hidden = r.name !== "salones";
    $("#view-salon").hidden = r.name !== "salon";
    window.scrollTo(0, 0);

    if (r.name === "home") document.title = "Getsemaní Kids · Asistencia";
    if (r.name === "salones") {
      document.title = "Salones · Getsemaní Kids";
      state.salon = null;
      await showSalones();
    }
    if (r.name === "salon") await openSalon(r.id);
  }

  async function ensureStudents(force = false) {
    if (state.loaded && !force) return true;
    try {
      state.students = await api.listStudents();
      state.loaded = true;
      state.loadError = false;
      return true;
    } catch (err) {
      console.error(err);
      state.loadError = true;
      paintCounts();
      toast(DEMO
        ? "No se pudo cargar la lista de estudiantes."
        : "No se pudo leer la base de datos. ¿Ya ejecutaste supabase.sql en Supabase? Revisa también js/config.js.", true);
      return false;
    }
  }

  async function showSalones() {
    await ensureStudents();
    paintCounts();
  }

  function paintCounts() {
    SALONES.forEach((s) => {
      const el = $(`[data-count="${s.id}"]`);
      if (!el) return;
      const n = state.students.filter((x) => x.salon === s.id).length;
      el.textContent = state.loaded
        ? `${n} ${n === 1 ? "estudiante" : "estudiantes"}`
        : state.loadError ? "Sin conexión a datos" : "…";
    });
  }

  /* ==========================================================
     PANTALLA DE UN SALÓN
     ========================================================== */

  async function openSalon(id) {
    const salon = salonById(id);
    state.salon = id;
    document.title = `Salón ${salon.nombre} · Getsemaní Kids`;
    $("#salon-thumb").src = salon.img;
    $("#salon-title").textContent = `Salón ${salon.nombre}`;
    $("#salon-sub").textContent = "Cargando…";
    $("#lista").innerHTML = "";
    $("#fecha").value = state.fecha;
    state.marks = new Map();
    state.saved = new Map();
    updateSummary();
    updateSaveState();

    const ok = await ensureStudents();
    if (state.salon !== id) return; // el usuario ya cambió de pantalla
    if (!ok) { $("#salon-sub").textContent = "No se pudo cargar"; return; }

    await loadMarks();
    if (state.salon !== id) return;
    renderList();
    refreshAuthUI();
  }

  async function loadMarks() {
    const ids = studentsOf(state.salon).map((s) => s.id);
    try {
      const m = await api.getAttendance(ids, state.fecha);
      state.saved = new Map(m);
      state.marks = new Map(m);
    } catch (err) {
      console.error(err);
      toast("No se pudo cargar la asistencia de esa fecha.", true);
      state.saved = new Map();
      state.marks = new Map();
    }
  }

  function rowHTML(s) {
    const st = state.marks.get(s.id) || "";
    const nombre = esc(s.full_name);
    const tools = state.user
      ? `<div class="tools">
           <button type="button" class="icon-btn" data-action="edit" data-id="${s.id}" aria-label="Editar a ${nombre}">${ICON.edit}</button>
           <button type="button" class="icon-btn danger" data-action="remove" data-id="${s.id}" aria-label="Quitar a ${nombre} de la lista">${ICON.trash}</button>
         </div>`
      : "";
    return `
      <li class="row" data-id="${s.id}" data-status="${st}">
        <img class="avatar" src="${AVATAR[s.sex]}" alt="${SEXO[s.sex]}">
        <div class="who">
          <div class="nameline">
            <span class="name">${nombre}</span>
            ${tools}
          </div>
          <div class="seg" role="group" aria-label="Asistencia de ${nombre}">
            <button type="button" data-action="mark" data-id="${s.id}" data-status="P" aria-pressed="${st === "P"}">${ICON.check} Presente</button>
            <button type="button" data-action="mark" data-id="${s.id}" data-status="F" aria-pressed="${st === "F"}">${ICON.cross} Falta</button>
          </div>
        </div>
      </li>`;
  }

  function renderList() {
    const list = studentsOf(state.salon);
    const ninas = list.filter((s) => s.sex === "F");
    const ninos = list.filter((s) => s.sex === "M");
    $("#salon-sub").textContent = `${list.length} ${list.length === 1 ? "estudiante" : "estudiantes"}`;

    const grupo = (titulo, arr) =>
      arr.length
        ? `<h2 class="group">${titulo} <span>${arr.length}</span></h2><ul class="list">${arr.map(rowHTML).join("")}</ul>`
        : "";

    if (!list.length) {
      $("#lista").innerHTML = `
        <div class="empty">
          <p>Este salón aún no tiene estudiantes.</p>
          ${state.user
            ? '<button type="button" class="btn primary" data-action="add">Agregar estudiante</button>'
            : "<p>Un administrador puede agregarlos iniciando sesión.</p>"}
        </div>`;
    } else {
      $("#lista").innerHTML = grupo("Niñas", ninas) + grupo("Niños", ninos);
    }
    updateSummary();
    updateSaveState();
  }

  function updateRow(id) {
    const row = $(`.row[data-id="${id}"]`);
    if (!row) return;
    const st = state.marks.get(id) || "";
    row.dataset.status = st;
    $$('[data-action="mark"]', row).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.status === st)));
  }

  function updateSummary() {
    const list = state.salon ? studentsOf(state.salon) : [];
    let p = 0, f = 0;
    list.forEach((s) => {
      const m = state.marks.get(s.id);
      if (m === "P") p++;
      else if (m === "F") f++;
    });
    $("#n-p").textContent = p;
    $("#n-f").textContent = f;
    $("#n-n").textContent = list.length - p - f;
  }

  function isDirty() {
    if (!state.salon) return false;
    const ids = studentsOf(state.salon).map((s) => s.id);
    return ids.some((id) => (state.marks.get(id) || "") !== (state.saved.get(id) || ""));
  }

  function updateSaveState() {
    const el = $("#save-state");
    const dirty = isDirty();
    el.classList.toggle("dirty", dirty);
    el.textContent = dirty
      ? "Hay cambios sin guardar"
      : state.saved.size
        ? "Asistencia guardada"
        : "Marca la asistencia y guarda";
    $("#btn-save").disabled = false;
  }

  function mark(id, status) {
    const actual = state.marks.get(id) || "";
    if (actual === status) state.marks.delete(id); // tocar de nuevo desmarca
    else state.marks.set(id, status);
    updateRow(id);
    updateSummary();
    updateSaveState();
  }

  async function guardar() {
    if (!state.salon) return;
    const btn = $("#btn-save");
    const upserts = [];
    const deletes = [];
    studentsOf(state.salon).forEach((s) => {
      const nuevo = state.marks.get(s.id) || "";
      const viejo = state.saved.get(s.id) || "";
      if (nuevo && nuevo !== viejo) upserts.push({ student_id: s.id, status: nuevo });
      if (!nuevo && viejo) deletes.push(s.id);
    });
    if (!upserts.length && !deletes.length) { toast("No hay cambios por guardar."); return; }

    btn.disabled = true;
    btn.textContent = "Guardando…";
    try {
      await api.saveAttendance(state.fecha, upserts, deletes);
      state.saved = new Map(state.marks);
      toast("Asistencia guardada.");
    } catch (err) {
      console.error(err);
      toast("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.", true);
    } finally {
      btn.textContent = "Guardar asistencia";
      updateSaveState();
    }
  }

  /* ---------- Descargar Excel ---------- */
  async function exportarExcel() {
    if (!window.XLSX) { toast("No se pudo cargar la librería de Excel. Revisa tu conexión.", true); return; }
    if (!state.salon) return;

    const salon = salonById(state.salon);
    const lista = studentsOf(state.salon);
    if (!lista.length) { toast("Este salón no tiene estudiantes para exportar.", true); return; }
    const ids = lista.map((s) => s.id);

    let historial;
    try { historial = await api.getHistory(ids); }
    catch (err) { console.error(err); toast("No se pudo leer el historial de asistencia.", true); return; }

    // student_id -> (fecha -> estado). La fecha en pantalla usa lo marcado ahora.
    const porAlumno = new Map(ids.map((id) => [id, new Map()]));
    historial.forEach((r) => porAlumno.get(r.student_id)?.set(r.date, r.status));
    lista.forEach((s) => {
      const m = state.marks.get(s.id);
      const mapa = porAlumno.get(s.id);
      if (m) mapa.set(state.fecha, m); else mapa.delete(state.fecha);
    });

    const estadoTxt = { P: "Presente", F: "Falta" };
    const genero = { F: "Mujer", M: "Varón" };

    /* Hoja 1: asistencia de la fecha elegida */
    let p = 0, f = 0;
    const filas = lista.map((s, i) => {
      const e = porAlumno.get(s.id).get(state.fecha);
      if (e === "P") p++; else if (e === "F") f++;
      return [i + 1, s.full_name, genero[s.sex], estadoTxt[e] || "Sin marcar"];
    });
    const hoja1 = [
      [`Getsemaní Kids · Salón ${salon.nombre}`],
      ["Fecha", fmtFecha(state.fecha)],
      [],
      ["N°", "Estudiante", "Género", "Asistencia"],
      ...filas,
      [],
      ["", "Presentes", p],
      ["", "Faltas", f],
      ["", "Sin marcar", lista.length - p - f],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(hoja1);
    ws1["!cols"] = [{ wch: 6 }, { wch: 34 }, { wch: 12 }, { wch: 14 }];

    /* Hoja 2: historial completo (estudiantes × fechas) */
    const fechas = Array.from(new Set(Array.from(porAlumno.values()).flatMap((m) => Array.from(m.keys())))).sort();
    const cab = ["Estudiante", "Género", ...fechas.map(fmtFecha), "Presentes", "Faltas", "% asistencia"];
    const cuerpo = lista.map((s) => {
      const mapa = porAlumno.get(s.id);
      let pp = 0, ff = 0;
      const celdas = fechas.map((d) => {
        const e = mapa.get(d);
        if (e === "P") { pp++; return "P"; }
        if (e === "F") { ff++; return "F"; }
        return "";
      });
      return [s.full_name, genero[s.sex], ...celdas, pp, ff, pp + ff ? pp / (pp + ff) : 0];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([cab, ...cuerpo, [], ["P = Presente · F = Falta"]]);
    ws2["!cols"] = [{ wch: 34 }, { wch: 10 }, ...fechas.map(() => ({ wch: 11 })), { wch: 11 }, { wch: 8 }, { wch: 14 }];
    const colPct = cab.length - 1;
    cuerpo.forEach((_, i) => {
      const celda = ws2[XLSX.utils.encode_cell({ r: i + 1, c: colPct })];
      if (celda) celda.z = "0%";
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, `Asistencia ${state.fecha}`);
    XLSX.utils.book_append_sheet(wb, ws2, "Historial");
    XLSX.writeFile(wb, `Asistencia_${sinTildes(salon.nombre)}_${state.fecha}.xlsx`);
    toast("Excel descargado.");
  }

  /* ==========================================================
     ADMINISTRADOR
     ========================================================== */

  function refreshAuthUI() {
    const logged = !!state.user;
    $$('[data-action="admin"]').forEach((b) => {
      const texto = logged ? "Cerrar sesión" : "Administrador";
      b.innerHTML = `${ICON.lock} <span class="lbl">${texto}</span>`;
      b.setAttribute("aria-label", texto);
    });
    $("#admin-strip").hidden = !(logged && state.salon);
    if (state.salon && state.loaded) renderList();
  }

  const dlg = () => $("#dlg");
  function openDialog(html) {
    dlg().innerHTML = html;
    if (!dlg().open) dlg().showModal();
    const primero = $("input:not([type=radio]), select, button", dlg());
    if (primero) primero.focus();
  }
  function closeDialog() { if (dlg().open) dlg().close(); }

  function openLogin() {
    openDialog(`
      <form data-form="login" novalidate>
        <h2>Ingreso de administrador</h2>
        <p class="lead">Para agregar o quitar estudiantes de las listas.</p>
        ${DEMO ? '<p class="hint"><b>Modo demostración.</b> Correo: admin@getsemani.pe · Contraseña: admin123</p>' : ""}
        <div class="form-error" role="alert" hidden></div>
        <label class="field">Correo
          <input type="email" name="email" autocomplete="username" required>
        </label>
        <label class="field">Contraseña
          <input type="password" name="password" autocomplete="current-password" required>
        </label>
        <div class="dlg-actions">
          <button type="button" class="btn ghost" data-action="close-dialog">Cancelar</button>
          <button type="submit" class="btn primary">Ingresar</button>
        </div>
      </form>`);
  }

  function openStudentForm(student = null) {
    const salonActual = student ? student.salon : state.salon || SALONES[0].id;
    openDialog(`
      <form data-form="student" data-id="${student ? student.id : ""}" novalidate>
        <h2>${student ? "Editar estudiante" : "Agregar estudiante"}</h2>
        <p class="lead">Escribe el nombre como quieres verlo en la lista.</p>
        <div class="form-error" role="alert" hidden></div>
        <label class="field">Nombre
          <input type="text" name="full_name" maxlength="80" autocomplete="off" value="${student ? esc(student.full_name) : ""}" required>
        </label>
        <div class="field">
          <span>¿Niña o niño?</span>
          <div class="sexo">
            <label><input type="radio" name="sex" value="F" ${student && student.sex === "F" ? "checked" : ""}><img src="${AVATAR.F}" alt=""><span>Niña</span></label>
            <label><input type="radio" name="sex" value="M" ${student && student.sex === "M" ? "checked" : ""}><img src="${AVATAR.M}" alt=""><span>Niño</span></label>
          </div>
        </div>
        <label class="field">Salón
          <select name="salon">
            ${SALONES.map((s) => `<option value="${s.id}" ${s.id === salonActual ? "selected" : ""}>${s.nombre}</option>`).join("")}
          </select>
        </label>
        <div class="dlg-actions">
          <button type="button" class="btn ghost" data-action="close-dialog">Cancelar</button>
          <button type="submit" class="btn primary">${student ? "Guardar cambios" : "Agregar"}</button>
        </div>
      </form>`);
  }

  function openRemove(student) {
    openDialog(`
      <form data-form="remove" data-id="${student.id}">
        <h2>Quitar de la lista</h2>
        <p class="lead">¿Quitar a <b>${esc(student.full_name)}</b> del salón ${esc(salonById(student.salon).nombre)}?
          Su historial de asistencia se conserva.</p>
        <div class="dlg-actions">
          <button type="button" class="btn ghost" data-action="close-dialog">Cancelar</button>
          <button type="submit" class="btn danger">Quitar</button>
        </div>
      </form>`);
  }

  function showFormError(form, msg) {
    const box = $(".form-error", form);
    box.textContent = msg;
    box.hidden = false;
  }

  function mensajeLogin(err) {
    const msg = String((err && err.message) || "").toLowerCase();
    if (DEMO) return "Correo o contraseña incorrectos.";
    if (msg.includes("invalid login") || msg.includes("invalid credentials"))
      return "Correo o contraseña incorrectos. Usa el usuario que creaste en Supabase (Authentication → Users), no el de demostración.";
    if (msg.includes("not confirmed"))
      return "Ese usuario existe pero no está confirmado. En Supabase, Authentication → Users, confírmalo o créalo con «Auto Confirm User».";
    if (msg.includes("fetch") || msg.includes("network") || msg.includes("failed"))
      return "No se pudo conectar con Supabase. Revisa tu internet y la URL en js/config.js.";
    if (msg.includes("rate limit") || msg.includes("too many"))
      return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
    return "No se pudo ingresar: " + ((err && err.message) || "error desconocido");
  }

  async function onDialogSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const tipo = form.dataset.form;
    const enviar = $('button[type="submit"]', form);
    const textoBoton = enviar.textContent;
    enviar.disabled = true;

    try {
      if (tipo === "login") {
        const email = form.email.value.trim();
        const password = form.password.value;
        if (!email || !password) { showFormError(form, "Escribe tu correo y tu contraseña."); return; }
        try { await api.signIn(email, password); }
        catch (err) { console.error(err); showFormError(form, mensajeLogin(err)); return; }
        closeDialog();
        refreshAuthUI();
        toast("Sesión iniciada.");
        if (CFG.REQUIRE_LOGIN_TO_ENTER_SALON) await route();
      }

      if (tipo === "student") {
        const full_name = form.full_name.value.trim().replace(/\s+/g, " ");
        const sex = (form.querySelector('input[name="sex"]:checked') || {}).value;
        const salon = form.salon.value;
        if (!full_name) { showFormError(form, "Escribe el nombre del estudiante."); return; }
        if (!sex) { showFormError(form, "Elige si es niña o niño."); return; }
        try {
          if (form.dataset.id) await api.updateStudent(form.dataset.id, { full_name, sex, salon });
          else await api.addStudent({ full_name, sex, salon });
        } catch (err) {
          console.error(err);
          showFormError(form, "No se pudo guardar. ¿Tu sesión sigue activa? Inicia sesión otra vez.");
          return;
        }
        await ensureStudents(true);
        closeDialog();
        await reloadCurrent();
        toast(form.dataset.id ? "Cambios guardados." : "Estudiante agregado.");
      }

      if (tipo === "remove") {
        try { await api.removeStudent(form.dataset.id); }
        catch (err) { console.error(err); closeDialog(); toast("No se pudo quitar. Inicia sesión otra vez.", true); return; }
        await ensureStudents(true);
        closeDialog();
        await reloadCurrent();
        toast("Estudiante quitado de la lista.");
      }
    } finally {
      if (form.isConnected) { enviar.disabled = false; enviar.textContent = textoBoton; }
    }
  }

  // Vuelve a dibujar la pantalla actual con los datos nuevos
  async function reloadCurrent() {
    if (state.salon) {
      const marcasActuales = new Map(state.marks);
      await loadMarks();
      // Conserva lo marcado en pantalla para quienes siguen en la lista
      studentsOf(state.salon).forEach((s) => {
        if (marcasActuales.has(s.id)) state.marks.set(s.id, marcasActuales.get(s.id));
      });
      renderList();
    } else {
      paintCounts();
    }
  }

  /* ==========================================================
     EVENTOS
     ========================================================== */

  document.addEventListener("click", async (e) => {
    // Evita perder marcas sin guardar al salir de la lista
    const enlace = e.target.closest('a[href^="#/"]');
    if (enlace && state.salon && isDirty()) {
      if (!confirm("Tienes cambios sin guardar. ¿Salir de todos modos?")) { e.preventDefault(); return; }
    }

    const el = e.target.closest("[data-action]");
    if (!el) return;
    const accion = el.dataset.action;

    switch (accion) {
      case "admin":
        if (state.user) {
          await api.signOut();
          state.user = null;
          refreshAuthUI();
          toast("Sesión cerrada.");
          if (CFG.REQUIRE_LOGIN_TO_ENTER_SALON && state.salon) location.hash = "#/salones";
        } else openLogin();
        break;

      case "mark":
        mark(el.dataset.id, el.dataset.status);
        break;

      case "all-present":
        studentsOf(state.salon).forEach((s) => state.marks.set(s.id, "P"));
        studentsOf(state.salon).forEach((s) => updateRow(s.id));
        updateSummary();
        updateSaveState();
        break;

      case "clear":
        state.marks = new Map();
        studentsOf(state.salon).forEach((s) => updateRow(s.id));
        updateSummary();
        updateSaveState();
        break;

      case "save": await guardar(); break;
      case "excel": await exportarExcel(); break;
      case "add": openStudentForm(); break;

      case "edit": {
        const s = state.students.find((x) => x.id === el.dataset.id);
        if (s) openStudentForm(s);
        break;
      }
      case "remove": {
        const s = state.students.find((x) => x.id === el.dataset.id);
        if (s) openRemove(s);
        break;
      }
      case "close-dialog": closeDialog(); break;
    }
  });

  dlg().addEventListener("submit", onDialogSubmit);

  // Cambiar la fecha de la clase
  $("#fecha").addEventListener("change", async (e) => {
    const nueva = e.target.value;
    if (!nueva) { e.target.value = state.fecha; return; }
    if (isDirty() && !confirm("Tienes cambios sin guardar en esta fecha. ¿Cambiar de fecha de todos modos?")) {
      e.target.value = state.fecha;
      return;
    }
    state.fecha = nueva;
    await loadMarks();
    renderList();
  });

  window.addEventListener("beforeunload", (e) => {
    if (state.salon && isDirty()) { e.preventDefault(); e.returnValue = ""; }
  });

  window.addEventListener("hashchange", route);

  /* ==========================================================
     ARRANQUE
     ========================================================== */
  (async function start() {
    const boot = document.getElementById("boot");
    if (boot) boot.remove();
    if (DEMO) $$("[data-demo]").forEach((el) => (el.hidden = false));

    try {
      api = DEMO ? demoApi() : supaApi();
      await api.init();
    } catch (err) {
      console.error(err);
      // Sin conexión a Supabase NO se cae al modo demostración (los datos parecerían guardados y no lo estarían).
      api = new Proxy({}, { get: () => async () => { throw err; } });
      toast(err.message || "No se pudo conectar con Supabase.", true);
    }

    refreshAuthUI();
    await route();
  })();
})();