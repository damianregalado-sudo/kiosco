// ============================================================
//  CONFIGURACIÓN DE LA APP
// ============================================================
// Este archivo NO lleva datos sensibles (el repo es público).
//
// La dirección del servidor y la clave (token) se cargan en cada
// teléfono la primera vez, de dos formas:
//   1) Abriendo el "link de configuración":
//        https://TU_USUARIO.github.io/kiosco/#api=<URL/exec>&token=<TOKEN>
//      La app los guarda y limpia el link solo.
//   2) A mano, en la pantalla de configuración que aparece al abrir la app.
//
// Quedan guardados en ese teléfono (localStorage). Para cambiarlos:
// pestaña Caja -> "Cambiar la conexión con el servidor".
// ============================================================

window.CONFIG = {
  API_URL: '',
  TOKEN: ''
};
