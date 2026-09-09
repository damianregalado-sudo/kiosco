# ✅ LISTO — la app está publicada y funcionando

Probado end-to-end el 9/9/2026: la pantalla carga desde GitHub Pages, se conecta
al Apps Script, trae los productos, registra ventas y anula. Todo OK.

## Direcciones

| Qué | Link |
|---|---|
| **App (para los teléfonos)** | https://damianregalado-sudo.github.io/kiosco/ |
| **Link de configuración** (abrir 1 vez en cada teléfono) | `https://damianregalado-sudo.github.io/kiosco/#api=https://script.google.com/macros/s/AKfycbywe1sRwVka9qmKyIBqjtWiS-amEwlRobkrgF5Rpif8jTN2SZ8w1NOPdu67BHIPjVSr6Q/exec&token=kio_2StaCqxRg8Ifc5LvE9nSxQu` |
| Repo (público, sin datos sensibles) | https://github.com/damianregalado-sudo/kiosco |
| Planilla / Apps Script | tu Google Drive |
| Clave (token) | `kio_2StaCqxRg8Ifc5LvE9nSxQu` |

## Poner la app en cada teléfono (3 min)

1. Abrí en **Chrome** el **link de configuración** de la tabla de arriba.
   - La app guarda la dirección y la clave en ese teléfono y limpia el link solo.
   - (Si algún día se borra: pantalla de configuración → pegar dirección `/exec` + token a mano.)
2. Tocá **📷 Escanear** → **Permitir** la cámara → apuntá a un código de barras.
   - Ahora la cámara en vivo **sí** funciona (la app ya no está dentro del iframe de Google).
   - Si no abre: candado 🔒 → Cámara → Permitir. Igual está **🖼️ Foto al código**.
3. Menú **⋮ → Agregar a la pantalla principal** para que quede como app.
4. Repetir en el segundo teléfono.

## Limpieza opcional (datos de prueba)

En la prueba quedó **una venta V00001 anulada** en la planilla (no afecta la caja).
Si querés empezar 100% limpio: en la planilla borrá las filas de `V00001` en las
hojas **Ventas** y **Ventas_Items**, y poné `contador_venta` = `0` en **Config**.

Los **10 productos y 2 clientes** son de ejemplo: editalos o borralos desde la app
o la planilla y cargá los tuyos.

## Cambiar cosas después

| Quiero… | Dónde |
|---|---|
| Precios, stock, productos, clientes | En la app (pestañas Productos / Clientes) o en la planilla |
| Nombre del kiosco / vendedores | Planilla → hoja **Config** |
| Cambiar el código de la pantalla | Editar archivos y subirlos al repo (GitHub web o Desktop). Pages se actualiza solo en 1–2 min |
| Cambiar el backend | Editar `Codigo.gs` en Apps Script → Implementar → **Nueva versión** |
| Cambiar la clave (token) | Cambiarla en `Codigo.gs` (variable `TOKEN`) **y** volver a abrir el link de config nuevo en cada teléfono |

## Seguridad

- El repo es **público** pero **no tiene datos sensibles**: `config.js` va vacío,
  la dirección y la clave viajan solo en el link de configuración (privado) y quedan
  en cada teléfono.
- Cualquiera con el link `/exec` **y** la clave podría tocar la planilla. Mantené el
  link de configuración privado (no lo publiques). Si se filtra, cambiá el token.
- `apps-script/Codigo.gs` de esta carpeta tiene el token escrito: **no lo subas al
  repo público** (no está subido).
