# GymLogger — Guía de Instalación Completa

## Visión General

```
Tu móvil  ←→  GitHub Pages (PWA)  ←→  Google Apps Script (API)  ←→  Google Sheets (BD)
```

---

## PASO 1 — Crear la Base de Datos (Google Sheets)

1. Ve a [sheets.new](https://sheets.new) y crea una nueva hoja.
2. Nómbrala **GymLogger_BD**.
3. **No cierres esta pestaña**, la necesitarás en el Paso 2.

---

## PASO 2 — Crear el Backend (Google Apps Script)

### 2.1 Crear el proyecto

1. En tu Google Sheet ve a **Extensiones → Apps Script**.
2. Se abre el editor. Borra el código por defecto en `Code.gs`.

### 2.2 Añadir los archivos

Tienes 4 archivos en la carpeta `backend/`. Añádelos así:

**Code.gs** (ya existe, solo pega el contenido):
- Selecciona `Code.gs` en el panel izquierdo.
- Borra todo y pega el contenido del archivo `Code.gs`.

**Crear Auth.gs**:
- Haz clic en `+` junto a "Archivos" → **Script**.
- Nómbralo `Auth` (sin extensión).
- Pega el contenido de `Auth.gs`.

**Crear Utils.gs**:
- Repite: `+` → **Script** → nombre `Utils`.
- Pega el contenido de `Utils.gs`.

**Crear Workout.gs**:
- Repite: `+` → **Script** → nombre `Workout`.
- Pega el contenido de `Workout.gs`.

### 2.3 Configurar el token de acceso

En `Auth.gs`, **cambia esta línea**:
```javascript
const AUTH_TOKEN = 'CAMBIA_ESTE_TOKEN_POR_UNO_SECRETO_TUYO';
```
Por un token único. Genera uno en: https://www.uuidgenerator.net/
Guárdalo, lo necesitarás en el Paso 4.

**Ejemplo:**
```javascript
const AUTH_TOKEN = 'f7a3e1b2-9c4d-4a6e-8f1b-3d2e5a7c9b0d';
```

### 2.4 Crear las hojas automáticamente

1. En el editor, selecciona la función `crearHojas` en el selector de funciones (arriba).
2. Haz clic en **▶ Ejecutar**.
3. Acepta los permisos cuando te los pida.
4. Verás un alert: "✅ Hojas creadas correctamente".

Ahora tu Spreadsheet tiene las 5 hojas necesarias con sus cabeceras.

### 2.5 Hacer el Deploy de la API

1. Haz clic en **Implementar → Nueva implementación**.
2. Tipo de implementación: **Aplicación web**.
3. Configura:
   - **Descripción**: GymLogger API v1
   - **Ejecutar como**: Yo (tu email)
   - **Quién tiene acceso**: Cualquier persona
4. Haz clic en **Implementar**.
5. Acepta los permisos.
6. **Copia la URL** que aparece. Tiene este formato:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   ⚠️ **Guarda esta URL**. La necesitas en el Paso 4.

---

## PASO 3 — Crear el Repositorio GitHub

### 3.1 Crear el repo

1. Ve a [github.com/new](https://github.com/new).
2. Nombre del repositorio: **gymlogger** (en minúsculas).
3. Visibilidad: **Público** (para GitHub Pages gratuito).
   - Si lo pones privado necesitarás GitHub Pro para Pages.
4. **No** inicialices con README.
5. Haz clic en **Create repository**.

### 3.2 Subir los archivos del frontend

Tienes dos opciones:

**Opción A — Desde la web (más fácil):**
1. En tu nuevo repo vacío, haz clic en **uploading an existing file**.
2. Arrastra todos los archivos de la carpeta `frontend/` EXCEPTO `config.js`:
   - `index.html`
   - `app.js`
   - `styles.css`
   - `sw.js`
   - `manifest.json`
   - `.gitignore`
3. Haz clic en **Commit changes**.

**Opción B — Por línea de comandos:**
```bash
git clone https://github.com/TU_USUARIO/gymlogger.git
cd gymlogger
# Copia aquí todos los archivos del frontend/ (EXCEPTO config.js)
git add .
git commit -m "Initial commit"
git push origin main
```

### 3.3 Añadir los iconos

Crea la carpeta `icons/` en el repo y añade dos archivos:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

Puedes generarlos gratis en: https://realfavicongenerator.net/

Si quieres usar placeholders temporales, sube cualquier imagen PNG renombrada así.

### 3.4 Activar GitHub Pages

1. Ve a tu repo → **Settings → Pages**.
2. En **Source**, selecciona: **Deploy from a branch**.
3. Branch: **main** / Folder: **/ (root)**.
4. Haz clic en **Save**.
5. Espera 1-2 minutos. Tu app estará en:
   ```
   https://TU_USUARIO.github.io/gymlogger/
   ```

---

## PASO 4 — Crear config.js (NO sube al repo)

Este archivo **no está en el repo** por seguridad (está en `.gitignore`).
Tienes que crearlo manualmente en tu dispositivo o editarlo directamente en GitHub con cuidado.

**Opción recomendada — editar directamente en GitHub** (más sencillo para empezar):

1. Ve a tu repo en GitHub.
2. Haz clic en **Add file → Create new file**.
3. Nombre del archivo: `config.js`
4. Contenido:
```javascript
// config.js — Configuración de la API
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/TU_SCRIPT_ID/exec',
  TOKEN:   'tu-token-secreto'
};
```
Reemplaza:
- `TU_SCRIPT_ID` → la URL completa que copiaste en el Paso 2.5
- `tu-token-secreto` → el token que pusiste en `Auth.gs`

5. Haz commit del archivo.

⚠️ **Nota de seguridad**: Si el repo es público, cualquiera puede ver tu `config.js` y por tanto tu token. Esto es aceptable para **uso personal** (nadie sabe que existe tu app ni tu URL). Si quieres mayor seguridad, considera hacer el repo privado o usar GitHub Actions para inyectar el token.

---

## PASO 5 — Instalar la PWA en tu móvil

### Android (Chrome):
1. Abre `https://TU_USUARIO.github.io/gymlogger/` en Chrome.
2. Toca el menú (⋮) → **Añadir a pantalla de inicio**.
3. Confirma. Ya tienes el icono en tu pantalla de inicio.
4. Cuando la app pida permiso para notificaciones, **acéptalo** (son las alertas de descanso).

### iOS (Safari 16.4+):
1. Abre la URL en **Safari** (no Chrome, no funciona para PWAs en iOS).
2. Toca el botón de compartir (cuadrado con flecha ↑).
3. Selecciona **Añadir a pantalla de inicio**.
4. Confirma.

---

## PASO 6 — Primera prueba

1. Abre la app instalada.
2. Si ves el mensaje de error de `config.js`, revisa el Paso 4.
3. Si carga bien, deberías ver la pantalla de inicio.
4. **Crea un ejercicio**: toca el icono 🏋️ → + Nuevo.
5. **Crea una rutina**: toca + Nueva en la pantalla de inicio.
6. **Entrena**: toca ▶ Entrenar en tu rutina.
7. Completa una serie y toca ✓ — debería aparecer el temporizador de descanso.
8. Bloquea el móvil — al terminar el tiempo recibirás la notificación.

---

## Estructura de archivos del repo

```
gymlogger/                  ← Repositorio GitHub
├── index.html
├── app.js
├── styles.css
├── sw.js
├── manifest.json
├── config.js               ← NO en .gitignore public, créalo a mano
├── .gitignore
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## Solución de problemas frecuentes

### "Error: Unauthorized"
- El token en `config.js` no coincide con el de `Auth.gs`.
- Verifica que no haya espacios extra al copiar/pegar.

### La notificación de descanso no llega con pantalla bloqueada
- Android: asegúrate de que el permiso de notificaciones esté concedido en Ajustes → Apps → Chrome.
- iOS: solo funciona si la app está instalada desde Safari.
- Prueba a desactivar el ahorro de batería para Chrome.

### La app no carga (pantalla en blanco)
- Espera 2-3 minutos después de activar GitHub Pages.
- Limpia el caché del navegador.
- Verifica que todos los archivos están en la raíz del repo (no en subcarpetas).

### "Deploy URL cambia" (Apps Script)
- Siempre usa la URL del **primer deploy** (la que copiaste en 2.5).
- Los redeploys de la misma versión mantienen la URL.
- Si haces una nueva implementación, actualiza `config.js`.

### El Service Worker no se registra
- La PWA **requiere HTTPS**. GitHub Pages lo provee automáticamente.
- No funciona en `http://localhost` sin configuración especial.

---

## Actualizar la app

Cuando cambies código en el frontend:
1. Sube los archivos actualizados al repo (GitHub web o `git push`).
2. GitHub Pages actualiza en ~1 minuto.
3. En el móvil: cierra y vuelve a abrir la app. El SW cargará la versión nueva.
4. Si los cambios no aparecen: Ajustes del navegador → Limpiar caché del sitio.

Cuando cambies el backend (Apps Script):
1. Guarda los cambios en el editor de Apps Script.
2. Haz **Implementar → Gestionar implementaciones → ✏️ Editar**.
3. Cambia la versión a **"Nueva versión"**.
4. Haz clic en **Implementar**.
5. La URL no cambia si usas la misma implementación.
