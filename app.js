/* ═══════════════════════════════════════════
   GymLogger — app.js
   Vanilla JS Single Page Application
   ═══════════════════════════════════════════ */

'use strict';

// ──────────────────────────────────────────────
// ESTADO GLOBAL
// ──────────────────────────────────────────────
const state = {
  exercises: [],
  routines:  [],
  rmRecords: [],
  unit: localStorage.getItem('gymlogger_unit') || 'kg',

  // Logger en curso
  logger: {
    workoutId:    null,
    routineId:    null,
    routineData:  null,   // objeto rutina completo
    histories:    {},     // { idEjercicio: [sets] }
    currentSlide: 0,
    sets:         {},     // { 'idEjercicio-serieNum': set }
    sessionVolume: 0,
    startTime:    null,
    sessionTimer: null,   // interval para el reloj
    elapsed:      0,

    rest: {
      active:       false,
      remaining:    0,
      total:        0,
      exerciseName: '',
      nextSerie:    1,
      interval:     null
    },

    // series añadidas dinámicamente por ejercicio (extra)
    extraSeries: {}       // { idEjercicio: n }
  }
};

// ──────────────────────────────────────────────
// API WRAPPER
// ──────────────────────────────────────────────
async function api(accion, data = {}) {
  const resp = await fetch(CONFIG.API_URL, {
    method:   'POST',
    redirect: 'follow',
    headers:  { 'Content-Type': 'text/plain' },
    body:    JSON.stringify({ accion, data, token: CONFIG.TOKEN })
  });
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Error en la API');
  return json.data;
}

// ──────────────────────────────────────────────
// UTILIDADES UI
// ──────────────────────────────────────────────
function toast(msg, type = 'info', ms = 3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function showConfirm(msg) {
  return new Promise(resolve => {
    const ov = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = msg;
    ov.classList.remove('hidden');
    const ok  = document.getElementById('confirm-ok');
    const can = document.getElementById('confirm-cancel');
    function cleanup(val) {
      ov.classList.add('hidden');
      ok.replaceWith(ok.cloneNode(true));
      can.replaceWith(can.cloneNode(true));
      resolve(val);
    }
    document.getElementById('confirm-ok')    .addEventListener('click', () => cleanup(true),  { once: true });
    document.getElementById('confirm-cancel').addEventListener('click', () => cleanup(false), { once: true });
  });
}

function loading(show, msg = 'Cargando...') {
  const app = document.getElementById('app');
  if (show) {
    app.innerHTML = `<div class="loading-screen" style="position:relative;min-height:200px">
      <div class="spinner"></div><p style="color:var(--text2);font-size:.9rem">${msg}</p>
    </div>`;
  }
}

// Conversión de unidad
function toDisplay(kg) {
  if (!kg && kg !== 0) return '';
  return state.unit === 'lbs' ? Math.round(kg * 2.2046 * 10) / 10 : kg;
}
function toKg(val) {
  if (!val && val !== 0) return '';
  return state.unit === 'lbs' ? Math.round((val / 2.2046) * 10) / 10 : val;
}
function unitLabel() { return state.unit; }

// Formatear segundos como MM:SS
function fmtTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Formatear timestamp
function fmtDate(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch { return ''; }
}

// Icono de grupo muscular
const GROUP_ICONS = {
  'Pecho':'🫁','Espalda':'🔙','Hombros':'🦾','Bíceps':'💪','Tríceps':'💪',
  'Pierna':'🦵','Glúteo':'🍑','Core':'⚙️','Cardio':'🏃','Otro':'🏋️'
};
function groupIcon(g) { return GROUP_ICONS[g] || '🏋️'; }

// ──────────────────────────────────────────────
// INICIALIZACIÓN PWA
// ──────────────────────────────────────────────
async function inicializarPWA() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('SW registrado, scope:', reg.scope);
    } catch (err) {
      console.warn('SW no registrado:', err);
    }
  }
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(p => {
      if (p !== 'granted') toast('Activa las notificaciones para alertas de descanso', 'info', 5000);
    });
  }
}

// ──────────────────────────────────────────────
// NAVEGACIÓN
// ──────────────────────────────────────────────
async function navigate(view, params = {}) {
  const app = document.getElementById('app');
  app.classList.remove('hidden');

  switch (view) {
    case 'home':           return renderHome();
    case 'exercises':      return renderExerciseList();
    case 'editExercise':   return renderExerciseEditor(params.id);
    case 'routines':       return renderRoutineList();
    case 'editRoutine':    return renderRoutineEditor(params.id);
    case 'logger':         return renderLogger(params.routineId, params.continuar);
    case 'summary':        return renderSummary(params);
  }
}

// ──────────────────────────────────────────────
// HOME
// ──────────────────────────────────────────────
async function renderHome() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <span class="topbar-logo">💪</span>
      <span class="topbar-title">GymLogger</span>
      <button class="btn-icon" onclick="navigate('exercises')" title="Ejercicios">🏋️</button>
      <button class="btn-icon" onclick="toggleUnit()" title="Unidad">${state.unit.toUpperCase()}</button>
    </div>
    <div class="main fade-in" id="home-main">
      <div class="spinner" style="margin:40px auto"></div>
    </div>`;

  try {
    const [activeWo, routines, rm] = await Promise.all([
      api('getWorkoutActivo'),
      api('getRutinas'),
      api('getRMEjercicios')
    ]);
    state.routines  = routines;
    state.rmRecords = rm;

    let html = '';

    // Banner de sesión activa
    if (activeWo) {
      html += `
        <div class="banner" onclick="navigate('logger', {routineId:'${activeWo.idRutina}', continuar:true})">
          <div class="banner-icon">🔥</div>
          <div class="banner-text">
            <div class="title">Sesión en curso</div>
            <div class="sub">Toca para continuar el entrenamiento</div>
          </div>
          <div class="banner-arrow">›</div>
        </div>`;
    }

    // Rutinas
    html += `<div class="section-header">
      <span class="section-title">🗂 Mis Rutinas</span>
      <button class="btn btn-sm btn-primary" onclick="navigate('editRoutine')">+ Nueva</button>
    </div>`;

    if (!routines.length) {
      html += `<div class="card text-center"><p class="text2">No hay rutinas todavía.<br>Crea una para empezar.</p></div>`;
    } else {
      routines.forEach(r => {
        const rpe = r.rpeObjetivo ? `<span class="badge badge-rpe">@${r.rpeObjetivo}</span>` : '';
        const ejCount = r.ejercicios.length;
        html += `
          <div class="routine-card">
            <div class="card-title">${r.nombre}</div>
            <div class="card-sub">${r.descripcion || ''}</div>
            <div class="routine-meta">
              <span class="badge badge-group">${ejCount} ejercicio${ejCount !== 1 ? 's' : ''}</span>
              ${rpe}
            </div>
            <div class="routine-actions">
              <button class="btn btn-success" onclick="startWorkout('${r.id}')">▶ Entrenar</button>
              <button class="btn btn-ghost btn-sm" onclick="navigate('editRoutine', {id:'${r.id}'})">✏️ Editar</button>
            </div>
          </div>`;
      });
    }

    // Récords personales @RM
    html += `<hr class="divider"><div class="section-header">
      <span class="section-title">🏆 Récords Personales (@RM)</span>
    </div>`;

    if (!rm.length) {
      html += `<div class="card text-center"><p class="text2">Completa sesiones para ver tus récords.</p></div>`;
    } else {
      html += `<div class="card">`;
      rm.forEach(r => {
        const rpe  = r.rpeReal ? ` @${r.rpeReal}` : '';
        const date = fmtDate(r.fecha);
        html += `
          <div class="rm-item">
            <div>
              <div style="font-weight:600">${r.nombre}</div>
              <div class="rm-context">${date}${rpe}</div>
            </div>
            <div class="rm-weight">${r.rm} kg RM</div>
          </div>`;
      });
      html += `</div>`;
    }

    document.getElementById('home-main').innerHTML = html;
  } catch (err) {
    document.getElementById('home-main').innerHTML =
      `<div class="card text-center"><p style="color:var(--danger)">Error: ${err.message}</p>
       <button class="btn btn-primary mt-16" onclick="renderHome()">Reintentar</button></div>`;
  }
}

async function startWorkout(routineId) {
  const ok = await showConfirm('¿Iniciar sesión de entrenamiento?');
  if (!ok) return;
  navigate('logger', { routineId });
}

function toggleUnit() {
  state.unit = state.unit === 'kg' ? 'lbs' : 'kg';
  localStorage.setItem('gymlogger_unit', state.unit);
  toast(`Unidad cambiada a ${state.unit}`, 'info', 2000);
  renderHome();
}

// ──────────────────────────────────────────────
// EJERCICIOS — Lista
// ──────────────────────────────────────────────
async function renderExerciseList() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <button class="btn-icon" onclick="navigate('home')">←</button>
      <span class="topbar-title">Ejercicios</span>
      <button class="btn btn-sm btn-primary" onclick="navigate('editExercise')">+ Nuevo</button>
    </div>
    <div class="main fade-in" id="ex-list">
      <div class="spinner" style="margin:40px auto"></div>
    </div>`;

  try {
    const exercises = await api('getEjercicios');
    state.exercises = exercises;

    if (!exercises.length) {
      document.getElementById('ex-list').innerHTML =
        `<div class="card text-center"><p class="text2">No hay ejercicios. Crea el primero.</p></div>`;
      return;
    }

    // Agrupar por grupo muscular
    const groups = {};
    exercises.forEach(e => {
      if (!groups[e.grupoMuscular]) groups[e.grupoMuscular] = [];
      groups[e.grupoMuscular].push(e);
    });

    let html = '';
    Object.keys(groups).sort().forEach(g => {
      html += `<div class="section-title" style="margin:16px 0 8px">${groupIcon(g)} ${g}</div>`;
      groups[g].forEach(e => {
        const thumb = e.imagenUrl
          ? `<img src="${e.imagenUrl}" class="exercise-thumb" onerror="this.outerHTML='<div class=\\'exercise-thumb\\'>${groupIcon(e.grupoMuscular)}</div>'">`
          : `<div class="exercise-thumb">${groupIcon(e.grupoMuscular)}</div>`;
        html += `
          <div class="exercise-item" onclick="navigate('editExercise', {id:'${e.id}'})">
            ${thumb}
            <div class="exercise-info">
              <div class="exercise-name">${e.nombre}</div>
              ${e.youtubeUrl ? '<span style="font-size:.72rem;color:var(--text2)">📹 Tiene video</span>' : ''}
            </div>
            <span style="color:var(--text3)">›</span>
          </div>`;
      });
    });

    document.getElementById('ex-list').innerHTML = html;
  } catch (err) {
    document.getElementById('ex-list').innerHTML =
      `<div class="card text-center"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
  }
}

// ──────────────────────────────────────────────
// EJERCICIOS — Editor
// ──────────────────────────────────────────────
async function renderExerciseEditor(id) {
  const app = document.getElementById('app');
  const isNew = !id;

  let exercise = { id:'', nombre:'', grupoMuscular:'Pecho', imagenUrl:'', youtubeUrl:'', comentarios:'' };

  if (!isNew) {
    // Cargar datos del ejercicio
    if (!state.exercises.length) state.exercises = await api('getEjercicios');
    const found = state.exercises.find(e => e.id === id);
    if (found) exercise = { ...found };
  }

  const groups = ['Pecho','Espalda','Hombros','Bíceps','Tríceps','Pierna','Glúteo','Core','Cardio','Otro'];
  const opts   = groups.map(g => `<option value="${g}" ${g === exercise.grupoMuscular ? 'selected' : ''}>${g}</option>`).join('');

  app.innerHTML = `
    <div class="topbar">
      <button class="btn-icon" onclick="navigate('exercises')">←</button>
      <span class="topbar-title">${isNew ? 'Nuevo Ejercicio' : 'Editar Ejercicio'}</span>
    </div>
    <div class="main fade-in">
      <div class="form-group">
        <label>Nombre *</label>
        <input id="ex-nombre" class="form-control" type="text" value="${exercise.nombre}" placeholder="Ej: Press Banca con Barra">
      </div>
      <div class="form-group">
        <label>Grupo Muscular *</label>
        <select id="ex-grupo" class="form-control">${opts}</select>
      </div>
      <div class="form-group">
        <label>Imagen</label>
        <input id="ex-img-file" type="file" accept="image/*" class="form-control" onchange="previewImg(this)">
        ${exercise.imagenUrl ? `<img src="${exercise.imagenUrl}" class="img-preview" id="img-preview">` : '<div id="img-preview"></div>'}
      </div>
      <div class="form-group">
        <label>URL YouTube (opcional)</label>
        <input id="ex-yt" class="form-control" type="url" value="${exercise.youtubeUrl}" placeholder="https://youtu.be/...">
      </div>
      <div class="form-group">
        <label>Comentarios de técnica</label>
        <textarea id="ex-comments" class="form-control" rows="4" placeholder="Ej: Espalda pegada al banco, codos a 75°">${exercise.comentarios}</textarea>
      </div>

      <button class="btn btn-primary btn-fw" onclick="saveExercise('${id || ''}')">💾 Guardar</button>
      ${!isNew ? `<button class="btn btn-danger btn-fw mt-8" onclick="deleteExercise('${id}')">🗑 Eliminar ejercicio</button>` : ''}
    </div>`;
}

function previewImg(input) {
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('img-preview');
    if (prev) {
      prev.outerHTML = `<img src="${e.target.result}" class="img-preview" id="img-preview">`;
    }
  };
  reader.readAsDataURL(input.files[0]);
}

async function saveExercise(id) {
  const nombre  = document.getElementById('ex-nombre').value.trim();
  const grupo   = document.getElementById('ex-grupo').value;
  const yt      = document.getElementById('ex-yt').value.trim();
  const comm    = document.getElementById('ex-comments').value.trim();
  const imgFile = document.getElementById('ex-img-file').files[0];

  if (nombre.length < 2) { toast('El nombre es obligatorio (mín. 2 caracteres)', 'error'); return; }
  if (yt && !yt.match(/^https?:\/\/(www\.)?youtube\.com|^https?:\/\/youtu\.be/)) {
    toast('URL de YouTube inválida', 'error'); return;
  }

  let imagenUrl = '';
  // Mantener imagen existente si no se subió nueva
  if (id && state.exercises.length) {
    const found = state.exercises.find(e => e.id === id);
    if (found) imagenUrl = found.imagenUrl || '';
  }

  try {
    // Subir imagen si hay nueva
    if (imgFile) {
      toast('Subiendo imagen...', 'info');
      const base64 = await redimensionarImagen(imgFile);
      imagenUrl = await api('uploadImagen', { base64, nombre: imgFile.name });
    }

    await api('saveEjercicio', { id: id || undefined, nombre, grupoMuscular: grupo, imagenUrl, youtubeUrl: yt, comentarios: comm });
    toast('Ejercicio guardado ✓', 'success');
    navigate('exercises');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function deleteExercise(id) {
  const ok = await showConfirm('¿Eliminar este ejercicio? Esta acción no se puede deshacer.');
  if (!ok) return;
  try {
    await api('deleteEjercicio', { id });
    toast('Ejercicio eliminado', 'info');
    navigate('exercises');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

function redimensionarImagen(file, maxPx = 800) {
  // GIFs: skip canvas (canvas breaks animation and can fail on some browsers)
  if (file.type === 'image/gif') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio  = Math.min(maxPx / img.width, maxPx / img.height, 1);
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.src = url;
  });
}

// ──────────────────────────────────────────────
// RUTINAS — Lista
// ──────────────────────────────────────────────
async function renderRoutineList() {
  navigate('home'); // El home ya muestra las rutinas con acciones
}

// ──────────────────────────────────────────────
// RUTINAS — Editor
// ──────────────────────────────────────────────
async function renderRoutineEditor(id) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="topbar">
      <button class="btn-icon" onclick="navigate('home')">←</button>
      <span class="topbar-title">${id ? 'Editar Rutina' : 'Nueva Rutina'}</span>
    </div>
    <div class="main fade-in">
      <div class="spinner" style="margin:40px auto"></div>
    </div>`;

  try {
    if (!state.exercises.length) state.exercises = await api('getEjercicios');
    if (!state.routines.length)  state.routines  = await api('getRutinas');

    let rutina = { id: '', nombre: '', descripcion: '', rpeObjetivo: 8, notasDefault: '' };
    let ejercicios = [];

    if (id) {
      const found = state.routines.find(r => r.id === id);
      if (found) {
        rutina    = { ...found };
        ejercicios = found.ejercicios.map(e => ({ ...e }));
      }
    }

    renderRoutineForm(rutina, ejercicios);
  } catch (err) {
    document.querySelector('.main').innerHTML =
      `<div class="card text-center"><p style="color:var(--danger)">Error: ${err.message}</p></div>`;
  }
}

function renderRoutineForm(rutina, ejercicios) {
  const rpeOpts = [];
  for (let r = 6; r <= 10; r += 0.5) {
    rpeOpts.push(`<option value="${r}" ${Number(rutina.rpeObjetivo) === r ? 'selected' : ''}>@${r}</option>`);
  }

  const ejOptions = state.exercises.map(e =>
    `<option value="${e.id}">${e.nombre} (${e.grupoMuscular})</option>`
  ).join('');

  let rowsHtml = ejercicios.map((e, i) => buildRERow(e, i, ejOptions)).join('');

  document.querySelector('.main').innerHTML = `
    <div class="form-group">
      <label>Nombre de la rutina *</label>
      <input id="rt-nombre" class="form-control" value="${rutina.nombre}" placeholder="Ej: Día A — Empuje">
    </div>
    <div class="form-group">
      <label>Descripción</label>
      <input id="rt-desc" class="form-control" value="${rutina.descripcion}" placeholder="Descripción libre">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>@RPE objetivo global</label>
        <select id="rt-rpe" class="form-control">${rpeOpts.join('')}</select>
      </div>
    </div>

    <hr class="divider">
    <div class="section-header">
      <span class="section-title">Ejercicios</span>
      <button class="btn btn-sm btn-primary" onclick="addRERow()">+ Añadir</button>
    </div>

    <div id="re-rows">${rowsHtml}</div>

    <div style="margin-top:20px;display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-primary" onclick="saveRoutine('${rutina.id || ''}')">💾 Guardar rutina</button>
      ${rutina.id ? `<button class="btn btn-danger" onclick="deleteRoutine('${rutina.id}')">🗑 Eliminar rutina</button>` : ''}
    </div>`;
}

function buildRERow(e, idx, ejOptions) {
  const allOpts = ejOptions || state.exercises.map(ex =>
    `<option value="${ex.id}" ${ex.id === e.idEjercicio ? 'selected' : ''}>${ex.nombre} (${ex.grupoMuscular})</option>`
  ).join('');

  return `
    <div class="card" id="re-row-${idx}" data-idx="${idx}" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="color:var(--text2);font-weight:700">#${idx + 1}</span>
        <select class="form-control re-ejercicio" style="flex:1">${allOpts}</select>
        <button class="btn btn-sm btn-ghost" onclick="removeRERow(${idx})">✕</button>
      </div>
      <div class="form-row" style="flex-wrap:wrap;gap:6px">
        <div class="form-group" style="flex:0 0 70px">
          <label>Series</label>
          <input class="form-control re-series" type="number" min="1" value="${e.seriesSugeridas || 3}">
        </div>
        <div class="form-group" style="flex:0 0 70px">
          <label>Reps</label>
          <input class="form-control re-reps" type="number" min="1" value="${e.repsSugeridas || 8}">
        </div>
        <div class="form-group" style="flex:0 0 80px">
          <label>Peso (${unitLabel()})</label>
          <input class="form-control re-peso" type="number" step="0.5" value="${toDisplay(e.pesoSugeridoKg) || ''}">
        </div>
        <div class="form-group" style="flex:0 0 80px">
          <label>Descanso (s)</label>
          <input class="form-control re-descanso" type="number" min="10" value="${e.descansoProgramadoSeg || 120}">
        </div>
        <div class="form-group" style="flex:0 0 70px">
          <label>@RPE</label>
          <input class="form-control re-rpe" type="number" step="0.5" min="6" max="10" value="${e.rpeObjetivo || ''}">
        </div>
        <div class="form-group" style="flex:1;min-width:120px">
          <label>Notas específicas</label>
          <input class="form-control re-notas" type="text" value="${e.notasEspecificas || ''}" placeholder="Opcional">
        </div>
      </div>
    </div>`;
}

let _reRowCount = 0;
function addRERow() {
  _reRowCount++;
  const container  = document.getElementById('re-rows');
  const rowCount   = container.querySelectorAll('[data-idx]').length;
  const ejOptions  = state.exercises.map(e =>
    `<option value="${e.id}">${e.nombre} (${e.grupoMuscular})</option>`).join('');
  const div = document.createElement('div');
  div.innerHTML = buildRERow({ idEjercicio: state.exercises[0]?.id || '', seriesSugeridas: 3,
    repsSugeridas: 8, pesoSugeridoKg: '', descansoProgramadoSeg: 120, rpeObjetivo: '', notasEspecificas: '' },
    rowCount, ejOptions);
  container.appendChild(div.firstElementChild);
}

function removeRERow(idx) {
  const row = document.querySelector(`[data-idx="${idx}"]`);
  if (row) row.remove();
}

async function saveRoutine(id) {
  const nombre = document.getElementById('rt-nombre').value.trim();
  const desc   = document.getElementById('rt-desc').value.trim();
  const rpe    = document.getElementById('rt-rpe').value;

  if (nombre.length < 2) { toast('El nombre de la rutina es obligatorio', 'error'); return; }

  const rows    = document.querySelectorAll('#re-rows [data-idx]');
  const ejercicios = [];
  let valid = true;

  rows.forEach(row => {
    const idEjercicio = row.querySelector('.re-ejercicio').value;
    const series      = parseInt(row.querySelector('.re-series').value)  || 0;
    const reps        = parseInt(row.querySelector('.re-reps').value)    || 0;
    const peso        = parseFloat(row.querySelector('.re-peso').value)  || '';
    const descanso    = parseInt(row.querySelector('.re-descanso').value) || 120;
    const ejRpe       = row.querySelector('.re-rpe').value;
    const notas       = row.querySelector('.re-notas').value.trim();

    if (!idEjercicio || series < 1 || reps < 1) { valid = false; return; }
    ejercicios.push({
      idEjercicio,
      seriesSugeridas:       series,
      repsSugeridas:         reps,
      pesoSugeridoKg:        peso ? toKg(peso) : '',
      descansoProgramadoSeg: descanso,
      rpeObjetivo:           ejRpe || '',
      notasEspecificas:      notas
    });
  });

  if (!valid) { toast('Revisa que todos los ejercicios tengan series y reps', 'error'); return; }
  if (!ejercicios.length) { toast('Añade al menos un ejercicio', 'error'); return; }

  try {
    await api('saveRutina', {
      rutina:     { id: id || undefined, nombre, descripcion: desc, rpeObjetivo: rpe, notasDefault: '' },
      ejercicios
    });
    state.routines = [];
    toast('Rutina guardada ✓', 'success');
    navigate('home');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function deleteRoutine(id) {
  const ok = await showConfirm('¿Eliminar esta rutina y todos sus ejercicios? No se puede deshacer.');
  if (!ok) return;
  try {
    await api('deleteRutina', { id });
    state.routines = [];
    toast('Rutina eliminada', 'info');
    navigate('home');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ──────────────────────────────────────────────
// LIVE LOGGER
// ──────────────────────────────────────────────
async function renderLogger(routineId, continuar) {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-screen" style="position:relative;min-height:300px">
    <div class="spinner"></div><p class="text2" style="margin-top:8px">Cargando sesión...</p>
  </div>`;

  try {
    let workoutId;

    if (continuar) {
      const activo = await api('getWorkoutActivo');
      if (!activo) { toast('No hay sesión activa', 'error'); navigate('home'); return; }
      workoutId = activo.id;
      routineId = activo.idRutina;
      state.logger.startTime = activo.fechaInicio ? new Date(activo.fechaInicio) : new Date();
    } else {
      workoutId = await api('iniciarWorkout', { idRutina: routineId });
      state.logger.startTime = new Date();
    }

    const { rutina, historiales } = await api('getWorkoutData', { idRutina: routineId });

    // Inicializar estado del logger
    state.logger.workoutId   = workoutId;
    state.logger.routineId   = routineId;
    state.logger.routineData  = rutina;
    state.logger.histories   = historiales;
    state.logger.currentSlide = 0;
    state.logger.sets         = {};
    state.logger.sessionVolume = 0;
    state.logger.extraSeries  = {};

    buildLoggerUI();
    startSessionTimer();
  } catch (err) {
    app.innerHTML = `<div class="main"><div class="card text-center">
      <p style="color:var(--danger)">Error: ${err.message}</p>
      <button class="btn btn-primary mt-16" onclick="navigate('home')">← Volver</button>
    </div></div>`;
  }
}

function buildLoggerUI() {
  const { routineData } = state.logger;
  const app = document.getElementById('app');

  const slidesHtml = routineData.ejercicios.map((ej, i) => buildSlide(ej, i)).join('');
  const dotsHtml   = routineData.ejercicios.map((_, i) =>
    `<div class="dot ${i === 0 ? 'active' : ''}" id="dot-${i}" onclick="goSlide(${i})"></div>`
  ).join('');

  app.innerHTML = `
    <div class="logger-wrap">
      <div class="logger-header">
        <div class="logger-info">
          <div class="routine-name">${routineData.nombre}</div>
          <div class="session-meta" id="session-meta">00:00 · 0 ${unitLabel()} total</div>
        </div>
        <button class="logger-btn-fin" onclick="confirmarFinalizar()">FINALIZAR</button>
      </div>

      <div class="carousel" id="carousel" onscroll="onCarouselScroll()">
        ${slidesHtml}
      </div>

      <div class="logger-bar">
        <div class="logger-bar-top">
          <div class="dots-nav" id="dots-nav">${dotsHtml}</div>
          <span class="text2 text-sm" id="slide-counter">1/${routineData.ejercicios.length}</span>
        </div>
        <div class="rest-timer-bar hidden" id="rest-timer-bar">
          <span class="rest-timer-num" id="rest-timer-num">00:00</span>
          <span class="rest-timer-label" id="rest-timer-label">Descanso</span>
          <button class="rest-skip-btn" onclick="saltarDescanso()">⏭ Saltar</button>
        </div>
      </div>
    </div>`;
}

function buildSlide(ejData, slideIdx) {
  const ej      = ejData.ejercicio;
  const hist    = state.logger.histories[ejData.idEjercicio] || [];
  const rpe     = ejData.rpeObjetivo || state.logger.routineData.rpeObjetivo;
  const extras  = state.logger.extraSeries[ejData.idEjercicio] || 0;
  const totalS  = (ejData.seriesSugeridas || 3) + extras;

  // Imagen o placeholder
  const imgHtml = ej?.imagenUrl
    ? `<img src="${ej.imagenUrl}" class="slide-exercise-img" onerror="this.outerHTML='<div class=slide-exercise-placeholder>${groupIcon(ej?.grupoMuscular)}</div>'">`
    : `<div class="slide-exercise-placeholder">${groupIcon(ej?.grupoMuscular)}</div>`;

  // Sugerencia de progresión
  let suggestion = '';
  if (hist.length && rpe) {
    const lastNormal = [...hist].reverse().find(s => s.tipo !== 'Warmup');
    if (lastNormal && lastNormal.rpeReal) {
      const diff = Number(lastNormal.rpeReal) - Number(rpe);
      if (diff < -0.5)      suggestion = `<div class="suggestion-chip">⬆ Puedes subir peso (último @${lastNormal.rpeReal})</div>`;
      else if (diff > 0.5)  suggestion = `<div class="suggestion-chip">⬇ Considera bajar carga (último @${lastNormal.rpeReal})</div>`;
    }
  }

  // Historial
  let histHtml = '';
  if (hist.length) {
    const date = fmtDate(hist[0]?.fecha);
    histHtml = `
      <div class="slide-history">
        <div class="history-title">📋 Última vez — ${date}</div>
        <table class="history-table">
          <thead><tr><th>Serie</th><th>Tipo</th><th>Peso</th><th>Reps</th><th>@Obj</th><th>@Real</th></tr></thead>
          <tbody>${hist.map(s => `
            <tr class="${s.tipo === 'Warmup' ? 'history-warmup' : ''}">
              <td>${s.serie}</td>
              <td>${s.tipo === 'Warmup' ? 'W' : s.tipo}</td>
              <td>${toDisplay(s.peso)} ${unitLabel()}</td>
              <td>${s.reps}</td>
              <td>${s.rpeObjetivo || '—'}</td>
              <td>${s.rpeReal || '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } else {
    histHtml = `<div class="slide-history"><div class="history-title" style="color:var(--text3)">Primera vez realizando este ejercicio</div></div>`;
  }

  // Series
  const lastHist = hist.filter(s => s.tipo !== 'Warmup');
  const rowsHtml = Array.from({ length: totalS }, (_, i) => buildSetRow(ejData, slideIdx, i, lastHist)).join('');

  // Notas de técnica
  const techNotes = ejData.notasEspecificas || ej?.comentarios || '';
  const techBtn   = techNotes ? `
    <button class="slide-notes-toggle" onclick="toggleTechNotes(${slideIdx})">📌 Ver notas técnicas</button>
    <div class="slide-notes-box hidden" id="tech-notes-${slideIdx}">${techNotes}</div>` : '';

  // YouTube
  const ytBtn = ej?.youtubeUrl
    ? `<a href="${ej.youtubeUrl}" target="_blank" class="btn btn-sm btn-ghost">📹 Video</a>` : '';

  return `
    <div class="slide" id="slide-${slideIdx}">
      <div class="slide-header">
        ${imgHtml}
        <div class="slide-exercise-name">${ej?.nombre || 'Ejercicio'}</div>
        <div class="slide-meta-row">
          <span class="badge badge-group">${groupIcon(ej?.grupoMuscular)} ${ej?.grupoMuscular}</span>
          ${rpe ? `<span class="badge badge-rpe">@${rpe}</span>` : ''}
          ${ytBtn}
        </div>
        ${suggestion}
        ${techBtn}
      </div>

      ${histHtml}

      <div class="slide-sets" id="sets-${slideIdx}">
        ${rowsHtml}
        <div class="set-row-actions">
          <button class="btn btn-sm btn-ghost" onclick="addSetRow(${slideIdx})">+ Serie</button>
          <button class="btn btn-sm btn-ghost" onclick="removeLastSetRow(${slideIdx})">− Última</button>
        </div>
      </div>
    </div>`;
}

function buildSetRow(ejData, slideIdx, setIdx, lastHist) {
  const serieNum = setIdx + 1;
  const key      = `${ejData.idEjercicio}-${serieNum}`;
  const existing = state.logger.sets[key];

  // Peso sugerido: primero de la rutina, luego del último historial
  let pesoPre = ejData.pesoSugeridoKg || '';
  if (!pesoPre && lastHist && lastHist[setIdx]) pesoPre = lastHist[setIdx].peso || '';
  if (!pesoPre && lastHist && lastHist.length) pesoPre = lastHist[lastHist.length - 1].peso || '';

  const repsPre  = ejData.repsSugeridas || 8;
  const done     = existing?.completado;

  return `
    <div class="set-row ${done ? 'done' : ''}" id="setrow-${slideIdx}-${setIdx}" data-slide="${slideIdx}" data-setidx="${setIdx}" data-ejid="${ejData.idEjercicio}">
      <select class="set-type-sel" ${done ? 'disabled' : ''}>
        <option value="Normal">Normal</option>
        <option value="Warmup">Warm-up</option>
        <option value="DropSet">Drop Set</option>
        <option value="Fallo">Fallo</option>
      </select>
      <div class="set-num">${serieNum}</div>
      <input class="set-input" type="number" step="0.5" min="0" placeholder="${toDisplay(pesoPre) || 'kg'}" value="${done ? toDisplay(existing.pesoReal) : (toDisplay(pesoPre) || '')}" ${done ? 'disabled' : ''}>
      <input class="set-input" type="number" min="1" placeholder="${repsPre}" value="${done ? existing.repsReales : repsPre}" ${done ? 'disabled' : ''}>
      <input class="set-rpe-input" type="number" step="0.5" min="6" max="10" placeholder="@RPE" value="${done && existing.rpeReal ? existing.rpeReal : ''}" ${done ? 'disabled' : ''}>
      <button class="set-check ${done ? 'check-anim' : ''}" id="check-${slideIdx}-${setIdx}" onclick="onCheck(${slideIdx},${setIdx})" ${done ? 'disabled' : ''}>
        ${done ? '✓' : '○'}
      </button>
    </div>`;
}

function toggleTechNotes(slideIdx) {
  const el = document.getElementById(`tech-notes-${slideIdx}`);
  if (el) el.classList.toggle('hidden');
}

function goSlide(idx) {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;
  const slide    = document.getElementById(`slide-${idx}`);
  if (slide) {
    carousel.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  }
  updateDots(idx);
}

function onCarouselScroll() {
  const carousel = document.getElementById('carousel');
  if (!carousel) return;
  const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
  if (idx !== state.logger.currentSlide) {
    state.logger.currentSlide = idx;
    updateDots(idx);
  }
}

function updateDots(idx) {
  state.logger.currentSlide = idx;
  const total = state.logger.routineData.ejercicios.length;
  document.querySelectorAll('.dot').forEach((d, i) => {
    d.classList.toggle('active', i === idx);
  });
  const counter = document.getElementById('slide-counter');
  if (counter) counter.textContent = `${idx + 1}/${total}`;
}

function updateDotProgress(slideIdx, ejId) {
  const ejData  = state.logger.routineData.ejercicios[slideIdx];
  const extras  = state.logger.extraSeries[ejId] || 0;
  const total   = (ejData.seriesSugeridas || 3) + extras;
  const done    = Object.keys(state.logger.sets).filter(k => k.startsWith(ejId + '-') && state.logger.sets[k].completado).length;
  const dot     = document.getElementById(`dot-${slideIdx}`);
  if (!dot) return;
  dot.classList.remove('active', 'partial', 'done');
  if (done === 0)       dot.classList.add(slideIdx === state.logger.currentSlide ? 'active' : '');
  else if (done < total) dot.classList.add('partial');
  else                   dot.classList.add('done');
  if (slideIdx === state.logger.currentSlide) dot.classList.add('active');
}

async function onCheck(slideIdx, setIdx) {
  const row     = document.getElementById(`setrow-${slideIdx}-${setIdx}`);
  if (!row) return;
  const ejId    = row.dataset.ejid;
  const ejData  = state.logger.routineData.ejercicios[slideIdx];
  const serieNum = setIdx + 1;

  const inputs  = row.querySelectorAll('input');
  const tipo    = row.querySelector('.set-type-sel').value;
  const pesoDisp = parseFloat(inputs[0].value);
  const reps    = parseInt(inputs[1].value);
  const rpeReal = parseFloat(inputs[2].value) || null;

  if (!pesoDisp && pesoDisp !== 0) { toast('Introduce el peso', 'error'); return; }
  if (!reps || reps < 1)           { toast('Introduce las reps', 'error'); return; }

  const pesoKg = toKg(pesoDisp);
  const ts     = new Date().toISOString();

  // Calcular descanso real desde el Check anterior del mismo ejercicio
  const prevKey = `${ejId}-${setIdx}`;
  let descansoReal = 0;
  if (setIdx > 0) {
    const prevSet = state.logger.sets[`${ejId}-${setIdx}`];
    if (!prevSet) {
      const prevDone = state.logger.sets[`${ejId}-${setIdx}`];
      // Buscar el timestamp del check anterior del mismo ejercicio
      for (let i = setIdx - 1; i >= 0; i--) {
        const s = state.logger.sets[`${ejId}-${i + 1}`];
        if (s?.timestamp) {
          descansoReal = Math.round((new Date(ts) - new Date(s.timestamp)) / 1000);
          break;
        }
      }
    }
  }

  // Vibración haptic
  if (navigator.vibrate) navigator.vibrate(200);

  // Guardar en API
  try {
    const rpeObjetivo = ejData.rpeObjetivo || state.logger.routineData.rpeObjetivo || '';
    await api('saveSet', {
      idWorkout:       state.logger.workoutId,
      idEjercicio:     ejId,
      numeroSerie:     serieNum,
      tipo,
      pesoReal:        pesoKg,
      repsReales:      reps,
      rpeReal:         rpeReal || '',
      rpeObjetivo,
      timestampCheck:  ts,
      descansoRealSeg: descansoReal,
      notasSerie:      state.logger.sets[`${ejId}-${serieNum}`]?.nota || ''
    });

    // Actualizar estado local
    state.logger.sets[`${ejId}-${serieNum}`] = {
      completado: true, pesoReal: pesoKg, repsReales: reps,
      rpeReal, tipo, timestamp: ts, nota: ''
    };

    // Actualizar volumen
    if (tipo !== 'Warmup') {
      state.logger.sessionVolume += pesoKg * reps;
      updateSessionMeta();
    }

    // Marcar fila como completada
    row.classList.add('done');
    inputs.forEach(i => i.disabled = true);
    row.querySelector('.set-type-sel').disabled = true;
    const checkBtn = document.getElementById(`check-${slideIdx}-${setIdx}`);
    if (checkBtn) {
      checkBtn.textContent = '✓';
      checkBtn.disabled = true;
      checkBtn.classList.add('check-anim');
    }

    // Actualizar dot de progreso
    updateDotProgress(slideIdx, ejId);

    // Activar descanso (no para Drop Sets, que van encadenadas)
    if (tipo !== 'DropSet') {
      const descSeg = ejData.descansoProgramadoSeg || 120;
      const ejNombre = ejData.ejercicio?.nombre || 'Ejercicio';
      activarDescanso(descSeg, ejNombre, serieNum + 1);
    }

  } catch (err) {
    toast('Error guardando: ' + err.message, 'error');
  }
}

function editSetNote(slideIdx, setIdx) {
  const ejData = state.logger.routineData.ejercicios[slideIdx];
  const ejId   = ejData.idEjercicio;
  const key    = `${ejId}-${setIdx + 1}`;
  if (!state.logger.sets[key]) state.logger.sets[key] = {};
  const current = state.logger.sets[key].nota || '';
  const nota    = prompt('Nota para esta serie:', current);
  if (nota !== null) state.logger.sets[key].nota = nota;
}

function addSetRow(slideIdx) {
  const ejData  = state.logger.routineData.ejercicios[slideIdx];
  const ejId    = ejData.idEjercicio;
  state.logger.extraSeries[ejId] = (state.logger.extraSeries[ejId] || 0) + 1;
  const container = document.getElementById(`sets-${slideIdx}`);
  const extras  = state.logger.extraSeries[ejId];
  const total   = (ejData.seriesSugeridas || 3) + extras - 1; // 0-indexed
  const actionsRow = container.querySelector('.set-row-actions');
  const hist    = (state.logger.histories[ejId] || []).filter(s => s.tipo !== 'Warmup');
  const newRow  = document.createElement('div');
  newRow.innerHTML = buildSetRow(ejData, slideIdx, total, hist);
  container.insertBefore(newRow.firstElementChild, actionsRow);
}

function removeLastSetRow(slideIdx) {
  const ejData  = state.logger.routineData.ejercicios[slideIdx];
  const ejId    = ejData.idEjercicio;
  const container = document.getElementById(`sets-${slideIdx}`);
  const rows    = container.querySelectorAll('.set-row');
  if (rows.length <= 1) { toast('Mínimo 1 serie', 'info'); return; }
  const last = rows[rows.length - 1];
  if (last.classList.contains('done')) { toast('No puedes eliminar una serie ya completada', 'info'); return; }
  last.remove();
  if (state.logger.extraSeries[ejId] > 0) state.logger.extraSeries[ejId]--;
}

// ──────────────────────────────────────────────
// TEMPORIZADOR DE SESIÓN
// ──────────────────────────────────────────────
function startSessionTimer() {
  clearInterval(state.logger.sessionTimer);
  state.logger.sessionTimer = setInterval(() => {
    state.logger.elapsed = Math.floor((new Date() - state.logger.startTime) / 1000);
    updateSessionMeta();
  }, 1000);
}

function updateSessionMeta() {
  const el = document.getElementById('session-meta');
  if (!el) return;
  const vol = state.unit === 'lbs'
    ? Math.round(state.logger.sessionVolume * 2.2046)
    : Math.round(state.logger.sessionVolume);
  el.textContent = `${fmtTime(state.logger.elapsed)} · ${vol} ${unitLabel()} total`;
}

// ──────────────────────────────────────────────
// TEMPORIZADOR DE DESCANSO
// ──────────────────────────────────────────────
function activarDescanso(segundos, ejercicio, proximaSerie) {
  // Cancelar descanso anterior
  if (state.logger.rest.interval) {
    clearInterval(state.logger.rest.interval);
  }
  // Enviar al SW para notificación con pantalla bloqueada
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) {
        reg.active.postMessage({ tipo: 'INICIAR_DESCANSO', segundos, ejercicio, proximaSerie });
      }
    });
  }

  // Estado
  state.logger.rest = { active: true, remaining: segundos, total: segundos, exerciseName: ejercicio, nextSerie: proximaSerie, interval: null };

  // Mostrar barra
  const bar = document.getElementById('rest-timer-bar');
  if (bar) bar.classList.remove('hidden');

  // Mostrar overlay
  showRestOverlay(segundos, ejercicio, proximaSerie);

  // Tick
  state.logger.rest.interval = setInterval(() => {
    state.logger.rest.remaining--;
    updateRestUI();
    if (state.logger.rest.remaining <= 0) {
      clearInterval(state.logger.rest.interval);
      state.logger.rest.active = false;
      if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
      hideRestOverlay();
      const bar = document.getElementById('rest-timer-bar');
      if (bar) bar.classList.add('hidden');
    }
  }, 1000);
}

function updateRestUI() {
  const { remaining, total, exerciseName, nextSerie } = state.logger.rest;
  const timeStr = fmtTime(remaining);

  // Barra inferior
  const num = document.getElementById('rest-timer-num');
  if (num) num.textContent = timeStr;
  const lbl = document.getElementById('rest-timer-label');
  if (lbl) lbl.textContent = `${exerciseName} — Serie ${nextSerie}`;

  // Overlay
  const cd = document.getElementById('rest-countdown');
  if (cd) cd.textContent = timeStr;

  // Círculo SVG (circumference = 2π×54 ≈ 339.3)
  const circ   = 339.3;
  const offset = circ * (1 - remaining / total);
  const circle = document.getElementById('rest-svg-circle');
  if (circle) circle.style.strokeDashoffset = offset;
}

function showRestOverlay(segundos, ejercicio, proxSerie) {
  const ov = document.getElementById('rest-overlay');
  if (!ov) return;
  document.getElementById('rest-exercise-name').textContent = ejercicio;
  document.getElementById('rest-next-serie').textContent    = `Próxima serie: ${proxSerie}`;
  document.getElementById('rest-countdown').textContent     = fmtTime(segundos);
  document.getElementById('rest-svg-circle').style.strokeDashoffset = 0;
  ov.classList.remove('hidden');
}

function hideRestOverlay() {
  const ov = document.getElementById('rest-overlay');
  if (ov) ov.classList.add('hidden');
}

function saltarDescanso() {
  clearInterval(state.logger.rest.interval);
  state.logger.rest.active = false;
  hideRestOverlay();
  const bar = document.getElementById('rest-timer-bar');
  if (bar) bar.classList.add('hidden');
  // Cancelar notificación del SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) reg.active.postMessage({ tipo: 'CANCELAR_DESCANSO' });
    });
  }
}

function ajustarDescanso(delta) {
  if (!state.logger.rest.active) return;
  clearInterval(state.logger.rest.interval);
  state.logger.rest.remaining = Math.max(5, state.logger.rest.remaining + delta);
  state.logger.rest.total     = Math.max(state.logger.rest.total, state.logger.rest.remaining);

  // Re-enviar al SW
  const { remaining, exerciseName, nextSerie } = state.logger.rest;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(reg => {
      if (reg.active) reg.active.postMessage({ tipo: 'INICIAR_DESCANSO', segundos: remaining, ejercicio: exerciseName, proximaSerie: nextSerie });
    });
  }

  updateRestUI();
  state.logger.rest.interval = setInterval(() => {
    state.logger.rest.remaining--;
    updateRestUI();
    if (state.logger.rest.remaining <= 0) {
      clearInterval(state.logger.rest.interval);
      state.logger.rest.active = false;
      hideRestOverlay();
      const bar = document.getElementById('rest-timer-bar');
      if (bar) bar.classList.add('hidden');
    }
  }, 1000);
}

// ──────────────────────────────────────────────
// FINALIZAR SESIÓN
// ──────────────────────────────────────────────
async function confirmarFinalizar() {
  const ok = await showConfirm('¿Finalizar la sesión de entrenamiento?');
  if (!ok) return;

  saltarDescanso();
  clearInterval(state.logger.sessionTimer);

  const app = document.getElementById('app');
  app.innerHTML = `<div class="loading-screen" style="position:relative;min-height:200px">
    <div class="spinner"></div><p class="text2">Guardando sesión...</p>
  </div>`;

  // Pedir notas
  const notas = prompt('Notas de la sesión (opcional):') || '';

  try {
    const result = await api('finalizarWorkout', { idWorkout: state.logger.workoutId, notas });
    renderSummary({ result, notas, elapsed: state.logger.elapsed, routineData: state.logger.routineData, sets: state.logger.sets });
  } catch (err) {
    toast('Error al finalizar: ' + err.message, 'error');
    navigate('home');
  }
}

// ──────────────────────────────────────────────
// RESUMEN DE SESIÓN
// ──────────────────────────────────────────────
function renderSummary({ result, notas, elapsed, routineData, sets }) {
  const app = document.getElementById('app');
  const vol  = result?.volumen || 0;
  const dur  = elapsed || 0;

  const completedSets = Object.values(sets).filter(s => s.completado);
  const totalSeries   = completedSets.length;

  // Mejores sets por ejercicio
  let ejerciciosHtml = '';
  if (routineData) {
    routineData.ejercicios.forEach(ej => {
      const ejSets = Object.entries(sets)
        .filter(([k, v]) => k.startsWith(ej.idEjercicio + '-') && v.completado && v.tipo !== 'Warmup')
        .map(([, v]) => v);
      if (!ejSets.length) return;
      const best = ejSets.reduce((b, s) => (s.pesoReal * s.repsReales > b.pesoReal * b.repsReales ? s : b));
      const rm   = best.repsReales === 1 ? best.pesoReal : Math.round(best.pesoReal * (1 + best.repsReales / 30) * 10) / 10;
      ejerciciosHtml += `
        <div class="summary-exercise">
          <div class="summary-exercise-name">${ej.ejercicio?.nombre || 'Ejercicio'}</div>
          <div class="summary-best">
            Mejor serie: ${toDisplay(best.pesoReal)} ${unitLabel()} × ${best.repsReales} reps
            ${best.rpeReal ? `@${best.rpeReal}` : ''} → 1RM estimado: <strong>${toDisplay(rm)} ${unitLabel()}</strong>
          </div>
        </div>`;
    });
  }

  const volDisplay = toDisplay(vol);

  app.innerHTML = `
    <div class="topbar">
      <span class="topbar-title">🎉 Sesión completada</span>
    </div>
    <div class="main fade-in">
      <div class="card">
        <div class="summary-stat">
          <span>⏱ Duración</span>
          <span class="summary-stat-val">${fmtTime(dur)}</span>
        </div>
        <div class="summary-stat">
          <span>🏋️ Volumen total</span>
          <span class="summary-stat-val">${volDisplay} ${unitLabel()}</span>
        </div>
        <div class="summary-stat">
          <span>✓ Series completadas</span>
          <span class="summary-stat-val">${totalSeries}</span>
        </div>
      </div>

      ${notas ? `<div class="card"><p class="text2 text-sm">📝 ${notas}</p></div>` : ''}

      <hr class="divider">
      <div class="section-title" style="margin-bottom:12px">Ejercicios</div>
      ${ejerciciosHtml}

      <div style="margin-top:24px">
        <button class="btn btn-primary btn-fw" onclick="navigate('home')">← Volver al inicio</button>
      </div>
    </div>`;
}

// ──────────────────────────────────────────────
// ARRANQUE
// ──────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  // Verificar que config.js existe
  if (typeof CONFIG === 'undefined' || !CONFIG.API_URL || CONFIG.API_URL.includes('TU_SCRIPT_ID')) {
    document.getElementById('loading-screen').innerHTML = `
      <div class="loading-logo">⚠️</div>
      <div style="padding:24px;text-align:center">
        <p style="font-size:1rem;margin-bottom:16px">Falta el archivo <strong>config.js</strong>.<br>
        Crea el archivo con tu URL de API y token.</p>
        <code style="font-size:.8rem;color:#94a3b8;display:block;padding:12px;background:#16213e;border-radius:8px">
          const CONFIG = {<br>
          &nbsp;&nbsp;API_URL: 'https://...',<br>
          &nbsp;&nbsp;TOKEN: 'tu-token'<br>
          };
        </code>
      </div>`;
    return;
  }

  await inicializarPWA();

  // Ocultar loading, mostrar app
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');

  navigate('home');
});
