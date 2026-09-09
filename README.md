# Kiosco — app de ventas (web + Google Sheets)

Punto de venta simple para el teléfono. Escáner de código de barras **en vivo**,
ventas en efectivo o fiado, cuenta corriente, stock y caja del día.

- **Pantalla**: página estática servida por **GitHub Pages** (por eso la cámara en
  vivo funciona: no está dentro del iframe de Apps Script).
- **Datos**: una **planilla de Google**, con **Apps Script** exponiendo una API JSON.
- Gratis, sin servidor propio.

```
Teléfono (GitHub Pages)  ──fetch()──►  Apps Script Web App  ──►  Google Sheet
```

## Para dejarlo funcionando

Ver **[MAÑANA.md](MAÑANA.md)** — checklist de ~20 min (Google + GitHub + conectar).

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html`, `estilos.css`, `app.js` | La app (lo que sirve GitHub Pages). |
| `config.js` | Dirección del Apps Script (`API_URL`) y `TOKEN` compartido. |
| `html5-qrcode.min.js` | Librería del escáner (incluida, no depende de internet externo). |
| `apps-script/Codigo.gs` | Backend: API JSON + lógica + `setup()`. Va en el editor de Apps Script. |
| `apps-script/appsscript.json` | Manifiesto del proyecto de Apps Script. |
| `PLANILLA.md` | Estructura de hojas y columnas + datos de ejemplo. |
| `MANUAL-VECINA.md` | Manual corto para quien atiende. |

## Estructura de datos y manual

Son los mismos que la versión anterior: ver `PLANILLA.md` y `MANUAL-VECINA.md`.

## Seguridad

La API queda accesible con la URL + el `TOKEN` (que viaja en `config.js`, público si
el repo fuera público). Protección real: **repo privado + no compartir la dirección
de GitHub Pages**. Para un kiosco de barrio alcanza. Si querés más, se puede rotar el
token (cambiándolo en `config.js` y en `Codigo.gs` a la vez).

## Cambiar cosas después

- **Precios / productos / clientes**: desde la app (pestañas Productos y Clientes) o
  editando la planilla.
- **Nombre del kiosco / vendedores**: hoja `Config` de la planilla.
- **Cambiar el código de la app**: editar los archivos, commit + push desde GitHub
  Desktop. GitHub Pages se actualiza solo en 1–2 min.
- **Cambiar el backend**: editar `apps-script/Codigo.gs` en el editor de Apps Script
  y volver a implementar como **nueva versión** (así la URL no cambia).
