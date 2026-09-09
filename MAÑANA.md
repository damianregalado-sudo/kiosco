# MAÑANA — dejar la app funcionando (checklist)

Todo el código ya está escrito y commiteado en esta carpeta. Faltan 3 cosas que
**sí o sí** las tenés que hacer vos porque necesitan tu cuenta de Google y de GitHub.
Tiempo total: ~20 minutos, sin pensar, siguiendo los pasos.

Orden: **A) Google  →  B) GitHub  →  C) Conectar**.

---

## A) Backend en Google (Apps Script)  ·  ~8 min

> Ya tenés una planilla y un proyecto de Apps Script de las pruebas de ayer.
> Vamos a reusar esa planilla y solo cambiar el código.

1. Abrí tu planilla **"Kiosco"** → **Extensiones → Apps Script**.
2. **Reemplazá TODO el contenido de `Código.gs`** por el de **`apps-script/Codigo.gs`** de esta carpeta. Guardá (`Ctrl+S`).
   - Si tenés archivos `Index.html`, `Estilos.html`, `App.html` de las pruebas de ayer: **borralos** (esta versión no los usa). Clic derecho en cada uno → Eliminar.
3. Manifiesto: engranaje **Configuración del proyecto** → tildá *"Mostrar appsscript.json"*. Abrí ese archivo y reemplazalo por el de **`apps-script/appsscript.json`**. Guardá.
4. Selector de función (arriba, al lado de ▶) → elegí **`setup`** → **Ejecutar** → aceptá permisos.
   - En la planilla tienen que quedar las 7 hojas con datos de ejemplo.
   - ⚠️ `setup()` **borra y rehace** las hojas. Si ayer ya cargaste datos de verdad, avisame antes de correrlo.
5. **Implementar → Administrar implementaciones** (si ya tenías una) → lápiz ✏️ → **Versión: "Nueva versión"**.
   - **Ejecutar como:** Yo
   - **Quién tiene acceso:** **Cualquier persona** ← IMPORTANTE, tiene que decir esto exacto.
   - **Implementar**.
   - Si NO tenías implementación: **Implementar → Nueva implementación → Aplicación web**, misma config.
6. Copiá la **URL** (termina en `/exec`).
   - Debería ser la misma de ayer:
     `https://script.google.com/macros/s/AKfycbywe1sRwVka9qmKyIBqjtWiS-amEwlRobkrgF5Rpif8jTN2SZ8w1NOPdu67BHIPjVSr6Q/exec`
   - Ya está puesta en `config.js`. **Si te da una URL distinta**, editá `config.js` y cambiala (después, en el paso B).

### Probar que el backend anda
Abrí en el navegador (en la compu):
```
https://script.google.com/macros/s/AKfycbywe1sRwVka9qmKyIBqjtWiS-amEwlRobkrgF5Rpif8jTN2SZ8w1NOPdu67BHIPjVSr6Q/exec?action=bootstrap&token=kio_2StaCqxRg8Ifc5LvE9nSxQu
```
Tiene que aparecer un texto que empieza con `{"ok":true,"data":{...}` y se ven los
productos de ejemplo. Si aparece una pantalla de Google pidiendo permiso/login, el
acceso NO quedó en "Cualquier persona" → volvé al paso 5.

---

## B) Publicar la pantalla en GitHub (GitHub Desktop)  ·  ~5 min

1. Abrí **GitHub Desktop**.
2. **File → Add local repository…** → elegí la carpeta
   `/home/damian/claude-omniroute/kiosco-web`
   - Ya tiene git inicializado y un commit hecho, lo va a reconocer.
3. Arriba: **Publish repository**.
   - Name: `kiosco` (o el que quieras).
   - **Keep this code private**: dejalo **tildado** (privado). GitHub Pages funciona igual.
   - **Publish repository**.
4. En el navegador, andá a `github.com/TU_USUARIO/kiosco` → **Settings** (del repo) → **Pages** (menú izquierdo).
   - **Source**: *Deploy from a branch*.
   - **Branch**: `main` — carpeta `/ (root)` — **Save**.
5. Esperá 1–2 minutos y recargá esa página de Pages. Va a mostrar:
   **"Your site is live at https://TU_USUARIO.github.io/kiosco/"**
   - Esa es la dirección de la app. Anotala.

> Si en el paso A la URL del Apps Script te dio distinta: antes del paso 3, abrí
> `config.js` con cualquier editor, cambiá `API_URL`, guardá. En GitHub Desktop va
> a aparecer el cambio → escribí un resumen → **Commit to main** → **Push origin**.

---

## C) Conectar y usar  ·  ~3 min

1. En el **teléfono**, abrí `https://TU_USUARIO.github.io/kiosco/` en **Chrome**.
2. Si te pide la dirección del servidor: ya viene precargada, tocá **Guardar y entrar**.
   (Si quedó vacía, pegá la URL `/exec` del paso A.)
3. Debería cargar con los productos de ejemplo.
4. Tocá **📷 Escanear** → **Permitir** la cámara → apuntá a cualquier código de barras.
   - Ahora sí tendría que abrir la cámara en vivo (ya no estamos dentro del iframe de Google).
   - Si no: botón **🖼️ Foto al código** funciona igual.
5. **Agregar a pantalla de inicio**: menú ⋮ de Chrome → *Agregar a la pantalla principal*.
6. Repetir 1–5 en el segundo teléfono.

### Cambiar los nombres de los vendedores
Planilla → hoja **Config** → fila `vendedores` → escribí los nombres separados por
coma (ej: `María, Ana`). Recargar la app.

---

## Si algo falla

| Síntoma | Causa / solución |
|---|---|
| La app dice "No se pudo conectar" o "no respondió JSON" | El acceso del Apps Script no está en "Cualquier persona" (paso A5), o pegaste mal la URL. Probá el link de prueba del final del paso A. |
| "Token inválido" | El `TOKEN` de `config.js` y el de `Codigo.gs` no coinciden. Los dos tienen que decir `kio_2StaCqxRg8Ifc5LvE9nSxQu`. |
| La página de GitHub Pages da 404 | Todavía no terminó de publicar (esperá 2 min) o la rama/carpeta en Settings → Pages está mal (tiene que ser `main` + `/root`). |
| La cámara en vivo no abre | Candado 🔒 → Permisos → Cámara → Permitir. Igual anda **🖼️ Foto al código**. |
| Escaneás un código y dice "sin cargar" | El producto no está en la planilla. La app te ofrece cargarlo ahí mismo. |

Cualquier cosa, mandame el mensaje de error que te tira y lo vemos.
