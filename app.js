// ============================================================
//  KIOSCO - lógica del cliente (versión GitHub Pages + API)
//  Guardado LOCAL primero + sincronización en segundo plano.
// ============================================================

// Tiene que ser IGUAL a VERSION en Codigo.gs. Subir los dos juntos cuando
// se cambia el backend: si no coinciden, la app avisa sola.
var APP_VERSION = 'v10-fix-ventas-duplicadas-2026-09-21';
var backendVersion = null; // se completa al conectar con la planilla

var DATA = { nombre_kiosco: 'Kiosco', moneda: '$', vendedores: [], productos: [], clientes: [] };
var cart = [];
var vendedor = '';
var scanner = null;
var escaneando = false;
var ultimoCodigo = '';
var ultimoCodigoT = 0;

function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

function money(n) {
  n = Math.round((Number(n) || 0) * 100) / 100;
  return DATA.moneda + n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function numJS(x) { var n = parseFloat(String(x).replace(',', '.')); return isNaN(n) ? 0 : n; }
function round2(n) { return Math.round(n * 100) / 100; }

function toast(mensaje, error) {
  var t = $('#toast');
  t.textContent = mensaje;
  t.className = 'toast' + (error ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.className = 'toast oculto'; }, 3600);
}

function beep() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); setTimeout(function () { o.stop(); ctx.close(); }, 120);
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate(60);
}

function cargando(btn, on, label) {
  if (!btn) return;
  if (on) {
    btn._txt = btn.textContent;
    btn.disabled = true;
    btn.classList.add('cargando');
    btn.textContent = (label || 'Guardando') + '…  ⏳';
  } else {
    btn.disabled = false;
    btn.classList.remove('cargando');
    if (btn._txt) btn.textContent = btn._txt;
  }
}

function msg(e) { return (e && e.message) ? e.message : String(e); }
function hoyISO() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function horaAhora() {
  var d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function esIdLocal(id) { return /-L\d+$/.test(String(id || '')); }
function cajaActiva() { var s = $('#scr-caja'); return !!(s && s.classList.contains('activa')); }

// ============================================================
//  CONEXIÓN CON EL SERVIDOR (Apps Script)
// ============================================================
function _cfg(clave, valorConfig) {
  var v = '';
  try { v = localStorage.getItem(clave) || ''; } catch (e) {}
  if (!v && window.CONFIG && valorConfig) v = valorConfig;
  return v;
}
function apiUrl() { return _cfg('kiosco_api_url', window.CONFIG && CONFIG.API_URL); }
function apiToken() { return _cfg('kiosco_token', window.CONFIG && CONFIG.TOKEN); }

function api(action, data, metodo) {
  var url = apiUrl();
  var token = apiToken();
  if (!url || !token) return Promise.reject(new Error('Falta configurar la dirección del servidor.'));
  var pedido;
  if (metodo === 'POST') {
    pedido = fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // "simple request": sin preflight
      body: JSON.stringify({ token: token, action: action, data: data || {} })
    });
  } else {
    var qs = 'token=' + encodeURIComponent(token) + '&action=' + encodeURIComponent(action);
    Object.keys(data || {}).forEach(function (k) {
      if (data[k] !== undefined && data[k] !== null) qs += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(data[k]);
    });
    pedido = fetch(url + '?' + qs, { method: 'GET', redirect: 'follow' });
  }
  return pedido
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      var j;
      try { j = JSON.parse(txt); }
      catch (e) { throw new Error('El servidor no respondió bien. Revisá que el Apps Script esté implementado y la dirección sea correcta.'); }
      if (!j || j.ok !== true) throw new Error((j && j.error) || 'Error del servidor');
      return j.data;
    })
    .catch(function (e) {
      if (e instanceof TypeError) throw new Error('No hay conexión con el servidor. Revisá internet o la dirección configurada.');
      throw e;
    });
}

/** Puente: partes del código (lecturas) llaman call('nombre', ...) como antes. */
function call(fn) {
  var a = Array.prototype.slice.call(arguments, 1);
  switch (fn) {
    case 'getBootstrap':        return api('bootstrap', {}, 'GET');
    case 'buscarProducto':      return api('buscarProducto', { codigo: a[0] }, 'GET');
    case 'anularVenta':         return api('anularVenta', { id_venta: a[0] }, 'POST');
    case 'getCaja':             return api('caja', { fecha: a[0] }, 'GET');
    case 'getCuentaCliente':    return api('cuenta', { id_cliente: a[0] }, 'GET');
    default: return Promise.reject(new Error('Función desconocida: ' + fn));
  }
}

// ============================================================
//  GUARDADO LOCAL + SINCRONIZACIÓN EN SEGUNDO PLANO
// ============================================================
// Vender, cobrar, anotar pagos, etc. se guardan PRIMERO en este teléfono
// (instantáneo, funciona sin internet) y se van mandando a la planilla de a
// poco, en segundo plano. Cobrar nunca espera a Google.

var SYNC_NORMAL = 15000; // cada cuánto reintenta si hay pendientes
var SYNC_ERROR = 25000;  // si la última vuelta dio error de red, espera más
var syncEnCurso = false;
var syncTimer = null;

function _leerJSON(clave, porDefecto) {
  try { var v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch (e) { return porDefecto; }
}
function _guardarJSON(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}

function cola() { return _leerJSON('kiosco_cola', []); }
function guardarCola(c) { _guardarJSON('kiosco_cola', c); actualizarEstadoSync(); }

function mapaIds() { var m = _leerJSON('kiosco_mapaids', null); return m && m.clientes ? m : { clientes: {} }; }
function guardarMapaIds(m) { _guardarJSON('kiosco_mapaids', m); }

function proximoIdLocal(prefijo) {
  var clave = 'kiosco_localn_' + prefijo;
  var n = (parseInt(localStorage.getItem(clave), 10) || 0) + 1;
  try { localStorage.setItem(clave, n); } catch (e) {}
  return prefijo + '-L' + n;
}

function encolar(accion, datos) {
  var c = cola();
  var op = { id: 'op_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), accion: accion, datos: datos, intentos: 0, creado: Date.now() };
  c.push(op);
  guardarCola(c);
  programarSync(400);
  return op.id;
}

function programarSync(ms) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sincronizarAhora, ms == null ? SYNC_NORMAL : ms);
}

function actualizarEstadoSync() {
  var el = $('#estadoSync');
  if (!el) return;
  if (backendVersion && backendVersion !== APP_VERSION) {
    el.textContent = '⚠ App y planilla en versiones distintas (app ' + APP_VERSION + ' · planilla ' + backendVersion + ') — tocá para ver';
    el.className = 'sync-linea sync-error';
    return;
  }
  var pend = cola();
  if (!pend.length) { el.textContent = '✓ Todo guardado en la planilla'; el.className = 'sync-linea sync-ok'; return; }
  var conError = pend.filter(function (o) { return o.intentos >= 3; }).length;
  if (!navigator.onLine) {
    el.textContent = '📴 Sin conexión — ' + pend.length + ' guardado(s) acá, se suben solos';
    el.className = 'sync-linea sync-espera';
  } else if (conError) {
    el.textContent = '⚠ ' + conError + ' con problemas para subir (tocá para ver)';
    el.className = 'sync-linea sync-error';
  } else {
    el.textContent = '⏳ Subiendo ' + pend.length + ' cambio(s) a la planilla…';
    el.className = 'sync-linea sync-espera';
  }
}

function sincronizarAhora() {
  if (syncEnCurso) return;
  var pend = cola();
  if (!pend.length) { actualizarEstadoSync(); programarSync(); return; }
  if (!navigator.onLine) { actualizarEstadoSync(); programarSync(); return; }

  syncEnCurso = true;
  actualizarEstadoSync();

  var mapa = mapaIds();
  var lote = pend.map(function (o) {
    var datos = o.datos || {};
    if (datos.id_cliente && mapa.clientes[datos.id_cliente]) {
      datos = Object.assign({}, datos, { id_cliente: mapa.clientes[datos.id_cliente] });
    }
    return { id: o.id, accion: o.accion, datos: datos };
  });

  api('sincronizar', { operaciones: lote }, 'POST').then(function (r) {
    var actuales = cola();
    var huboError = false;
    (r.resultados || []).forEach(function (res) {
      var item = actuales.find(function (o) { return o.id === res.id; });
      if (res.ok) {
        // Sacar de la cola es lo importante; si algo falla al reconciliar
        // la UI (ej. refrescar una pantalla), no debe volver a mandarse.
        actuales = actuales.filter(function (o) { return o.id !== res.id; });
        try { _onSyncOk(item, res.data); } catch (e) {}
      } else {
        huboError = true;
        if (item) { item.intentos = (item.intentos || 0) + 1; item.ultimoError = res.error; }
      }
    });
    if (r.mapaIds && Object.keys(r.mapaIds).length) {
      var m = mapaIds();
      Object.keys(r.mapaIds).forEach(function (k) { m.clientes[k] = r.mapaIds[k]; });
      guardarMapaIds(m);
    }
    guardarCola(actuales);
    syncEnCurso = false;
    actualizarEstadoSync();
    programarSync(huboError ? SYNC_ERROR : SYNC_NORMAL);
  }).catch(function () {
    syncEnCurso = false;
    actualizarEstadoSync();
    programarSync(SYNC_ERROR);
  });
}

/** Cuando una operación encolada se confirma en la planilla, reconciliar lo local. */
function _onSyncOk(item, data) {
  if (!item) return;
  if (item.accion === 'guardarCliente' && data && data.id) {
    var tempId = item.datos && item.datos.idLocal;
    if (tempId) {
      var c = DATA.clientes.find(function (x) { return x.id === tempId; });
      if (c) c.id = data.id;
      var m = mapaIds(); m.clientes[tempId] = data.id; guardarMapaIds(m);
      renderClientes();
    }
  }
  if (item.accion === 'registrarVenta' && data && data.id_venta) {
    _marcarSincronizado(item.id, data.id_venta);
  }
  if (item.accion === 'registrarPago' || item.accion === 'registrarMovimiento') {
    _marcarSincronizado(item.id, null);
  }
}

function verEstadoSync() {
  var pend = cola();
  var filas = pend.map(function (o) {
    var err = o.ultimoError ? '<br><small style="color:#d93025">' + esc(o.ultimoError) + '</small>' : '';
    return '<div class="fila-detalle"><span>' + esc(o.accion) + (o.intentos ? ' · ' + o.intentos + ' intento(s)' : '') + err + '</span>' +
      (o.intentos >= 3 ? '<button class="mini-btn" data-descartar="' + o.id + '">descartar</button>' : '') +
      '</div>';
  }).join('') || '<p>No hay cambios pendientes: todo está guardado en la planilla.</p>';
  var verInfo = '<p style="font-size:13px;color:' + (backendVersion && backendVersion !== APP_VERSION ? '#d93025;font-weight:600' : '#5f6368') + '">' +
    'Versión app: ' + esc(APP_VERSION) + ' · Versión planilla: ' + esc(backendVersion || '(sin datos todavía)') +
    (backendVersion && backendVersion !== APP_VERSION ? '<br>No coinciden: pegá el Codigo.gs más nuevo en Apps Script e Implementá una Nueva versión.' : '') +
    '</p>' +
    '<p style="font-size:12px;color:#5f6368;word-break:break-all">Servidor configurado en este teléfono:<br><b>' + esc(apiUrl() || '(ninguno)') + '</b></p>';
  abrirModal(
    '<h3>Sincronización con la planilla</h3>' + verInfo + filas +
    '<div class="fila-botones" style="margin-top:10px">' +
      '<button class="btn" id="vsCerrar">Cerrar</button>' +
      '<button class="btn primario" id="vsReintentar">Reintentar ahora</button>' +
    '</div>'
  );
  $('#vsCerrar').addEventListener('click', cerrarModal);
  $('#vsReintentar').addEventListener('click', function () { cerrarModal(); toast('Reintentando…'); programarSync(200); });
  $all('[data-descartar]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!confirm('¿Descartar este cambio pendiente?\n\nPuede quedar una diferencia entre el teléfono y la planilla. Solo hacelo si Damian te lo indica.')) return;
      guardarCola(cola().filter(function (o) { return o.id !== b.dataset.descartar; }));
      cerrarModal();
      toast('Descartado');
    });
  });
}

// ---------- Caja de HOY: guardada en este teléfono ----------
function claveLedger(fecha) { return 'kiosco_hoy_' + fecha; }
function ledgerDia(fecha) { return _leerJSON(claveLedger(fecha), []); }
function guardarLedgerDia(fecha, lista) { _guardarJSON(claveLedger(fecha), lista); }
function agregarLedger(entry) {
  var fecha = hoyISO();
  var l = ledgerDia(fecha);
  l.push(entry);
  guardarLedgerDia(fecha, l);
  return entry;
}
function _marcarSincronizado(opId, idReal) {
  var fecha = hoyISO();
  var l = ledgerDia(fecha);
  var e = l.find(function (x) { return x.opId === opId; });
  if (e) {
    e.synced = true;
    if (idReal) e.id = idReal;
    guardarLedgerDia(fecha, l);
    if (cajaActiva() && (($('#cajaFecha') && $('#cajaFecha').value) || fecha) === fecha) renderCajaLocal(fecha);
  }
}

/** Vuelve a aplicar sobre datos frescos (recién bajados o del caché) los
 *  cambios que todavía no llegaron a la planilla, para que el stock y las
 *  cuentas se vean bien aunque se recargue la página antes de sincronizar. */
function _replayPendientes() {
  var mapa = mapaIds();
  cola().forEach(function (op) {
    var d = op.datos || {};
    if (op.accion === 'registrarVenta') {
      (d.items || []).forEach(function (it) {
        var p = DATA.productos.find(function (x) { return x.codigo === it.codigo; });
        if (p) p.stock -= (numJS(it.cantidad) || 1);
      });
      if (d.forma_pago === 'cuenta' && d.id_cliente) {
        var idReal = mapa.clientes[d.id_cliente] || d.id_cliente;
        var c = DATA.clientes.find(function (x) { return x.id === idReal || x.id === d.id_cliente; });
        var totalOp = (d._totalEstimado != null) ? numJS(d._totalEstimado) : calcularVenta(d.items || []).total;
        if (c) c.saldo = round2(c.saldo + totalOp);
      }
    } else if (op.accion === 'anularVenta') {
      (d._reponer || []).forEach(function (it) {
        var p = DATA.productos.find(function (x) { return x.codigo === it.codigo; });
        if (p) p.stock += numJS(it.cantidad);
      });
      if (d._forma_pago === 'cuenta' && d._cliente_id) {
        var c2 = DATA.clientes.find(function (x) { return x.id === d._cliente_id; });
        if (c2) c2.saldo = round2(c2.saldo - numJS(d._total));
      }
    } else if (op.accion === 'registrarPago') {
      var idReal2 = mapa.clientes[d.id_cliente] || d.id_cliente;
      var c3 = DATA.clientes.find(function (x) { return x.id === idReal2 || x.id === d.id_cliente; });
      if (c3) c3.saldo = round2(c3.saldo - numJS(d.monto));
    } else if (op.accion === 'guardarProducto') {
      var idx = DATA.productos.findIndex(function (x) { return x.codigo === d.codigo; });
      var obj = { codigo: d.codigo, nombre: d.nombre, precio: numJS(d.precio), stock: numJS(d.stock), categoria: d.categoria || '', activo: d.activo !== false, porPeso: d.porPeso === true };
      if (idx >= 0) DATA.productos[idx] = obj; else DATA.productos.push(obj);
    } else if (op.accion === 'eliminarProducto') {
      DATA.productos = DATA.productos.filter(function (x) { return x.codigo !== d.codigo; });
    } else if (op.accion === 'guardarCliente' && !d.id && d.idLocal) {
      if (!DATA.clientes.find(function (x) { return x.id === d.idLocal; })) {
        DATA.clientes.push({ id: d.idLocal, nombre: d.nombre, telefono: d.telefono || '', saldo: numJS(d.saldo || 0), notas: d.notas || '' });
      }
    } else if (op.accion === 'guardarCliente' && d.id) {
      var c4 = DATA.clientes.find(function (x) { return x.id === d.id; });
      if (c4) { c4.nombre = d.nombre; c4.telefono = d.telefono || ''; c4.notas = d.notas || ''; }
    }
  });
}

/** Borra ledgers de "hoy" de hace más de 60 días para no acumular basura. */
function _limpiarLedgersViejos() {
  try {
    var limite = Date.now() - 60 * 24 * 3600 * 1000;
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var k = localStorage.key(i);
      if (k && k.indexOf('kiosco_hoy_') === 0) {
        var f = k.slice('kiosco_hoy_'.length);
        var t = Date.parse(f);
        if (!isNaN(t) && t < limite) localStorage.removeItem(k);
      }
    }
  } catch (e) {}
}

// ============================================================
//  ARRANQUE + PANTALLA DE CONFIGURACIÓN
// ============================================================
window.addEventListener('load', function () {
  // Configuración por link: .../#api=<URL>&token=<TOKEN>  (se guarda y se limpia de la barra)
  try {
    var h = (location.hash || '').replace(/^#/, '');
    if (h) {
      var pr = new URLSearchParams(h);
      if (pr.get('api')) localStorage.setItem('kiosco_api_url', pr.get('api').trim());
      if (pr.get('token')) localStorage.setItem('kiosco_token', pr.get('token').trim());
      if (pr.get('api') || pr.get('token')) history.replaceState(null, '', location.pathname);
    }
  } catch (e) {}

  $('#gateUrl').value = apiUrl();
  $('#gateToken').value = apiToken();

  $('#gateOk').addEventListener('click', function () {
    var u = ($('#gateUrl').value || '').trim();
    var t = ($('#gateToken').value || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) {
      $('#gateMsg').textContent = 'La dirección tiene que empezar con https://script.google.com/macros/s/… y terminar en /exec';
      return;
    }
    if (!t) { $('#gateMsg').textContent = 'Falta la clave (token).'; return; }
    try {
      localStorage.setItem('kiosco_api_url', u);
      localStorage.setItem('kiosco_token', t);
    } catch (e) {}
    location.reload();
  });

  if (!apiUrl() || !apiToken()) { $('#gate').classList.remove('oculto'); return; }

  $('#app').classList.remove('oculto');
  iniciarApp();
});

function aplicarDatos(d) {
  DATA = d;
  if (d.version) backendVersion = d.version;
  _replayPendientes();
  $('#kioscoNombre').textContent = d.nombre_kiosco;
  llenarVendedores();
  renderProductos();
  renderClientes();
  actualizarEstadoSync();
}

function iniciarApp() {
  $('#cajaFecha').value = hoyISO();
  _limpiarLedgersViejos();

  // Mostrar al toque lo último que se vio (así no arranca vacío mientras consulta)
  var hayCache = false;
  try {
    var c = localStorage.getItem('kiosco_cache');
    if (c) { aplicarDatos(JSON.parse(c)); hayCache = true; }
  } catch (e) {}
  if (!hayCache) $('#listaProductos').innerHTML = '<p style="color:#5f6368">Cargando productos…</p>';

  call('getBootstrap').then(function (d) {
    aplicarDatos(d);
    verCaja();
    try { localStorage.setItem('kiosco_cache', JSON.stringify(d)); } catch (e) {}
  }).catch(function (e) {
    toast(hayCache ? 'Sin conexión: mostrando datos guardados.' : ('No se pudo conectar: ' + msg(e)), true);
    verCaja();
  });

  actualizarEstadoSync();
  programarSync(1500);
  window.addEventListener('online', function () { actualizarEstadoSync(); programarSync(500); });
  window.addEventListener('offline', actualizarEstadoSync);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) programarSync(500); });
  var es = $('#estadoSync');
  if (es) es.addEventListener('click', verEstadoSync);

  $all('#tabbar .tab').forEach(function (b) {
    b.addEventListener('click', function () { mostrar(b.dataset.scr); });
  });

  $('#btnEscanear').addEventListener('click', toggleEscaner);
  $('#btnFoto').addEventListener('click', function () { $('#fotoCodigo').click(); });
  $('#fotoCodigo').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';
    escanearFoto(f);
  });
  $('#buscarProd').addEventListener('input', buscarEnVender);
  $('#btnCobrar').addEventListener('click', abrirCobro);
  $('#btnVaciar').addEventListener('click', function () {
    if (cart.length && confirm('¿Vaciar el carrito?')) { cart = []; renderCarrito(); }
  });

  $('#btnNuevoProd').addEventListener('click', function () { formProducto(null); });
  $('#filtroProd').addEventListener('input', renderProductos);

  $('#btnNuevoCli').addEventListener('click', function () { formCliente(null); });

  $('#btnVerCaja').addEventListener('click', verCaja);
  $('#btnIngreso').addEventListener('click', function () { formMovimiento('ingreso'); });
  $('#btnEgreso').addEventListener('click', function () { formMovimiento('egreso'); });
  $('#btnCajaServidor').addEventListener('click', verCajaServidor);
  $('#btnConfig').addEventListener('click', function () {
    if (confirm('¿Cambiar la conexión con el servidor? Vas a tener que pegar la dirección y la clave de nuevo.')) {
      try { localStorage.removeItem('kiosco_api_url'); localStorage.removeItem('kiosco_token'); } catch (e) {}
      location.reload();
    }
  });

  $('#overlay').addEventListener('click', function (e) { if (e.target.id === 'overlay') cerrarModal(); });
}

// ============================================================
//  NAVEGACIÓN
// ============================================================
function mostrar(scr) {
  $all('.screen').forEach(function (s) { s.classList.remove('activa'); });
  $('#scr-' + scr).classList.add('activa');
  $all('#tabbar .tab').forEach(function (t) { t.classList.toggle('activa', t.dataset.scr === scr); });
  if (scr !== 'vender' && escaneando) pararEscaner();
  window.scrollTo(0, 0);
}

// ============================================================
//  VENDEDOR
// ============================================================
function llenarVendedores() {
  var sel = $('#selVendedor');
  sel.innerHTML = '';
  DATA.vendedores.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v; o.textContent = v; sel.appendChild(o);
  });
  var guardado = '';
  try { guardado = localStorage.getItem('vendedor') || ''; } catch (e) {}
  if (guardado && DATA.vendedores.indexOf(guardado) >= 0) sel.value = guardado;
  vendedor = sel.value || DATA.vendedores[0] || '';
  if (!sel._lista) {
    sel._lista = true;
    sel.addEventListener('change', function () {
      vendedor = sel.value;
      try { localStorage.setItem('vendedor', vendedor); } catch (e) {}
    });
  }
}

// ============================================================
//  ESCÁNER DE CÓDIGO DE BARRAS
// ============================================================
function toggleEscaner() { escaneando ? pararEscaner() : iniciarEscaner(); }

function pedirPermisoCamara() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    var err = new Error('SIN_API'); err.name = 'SIN_API'; return Promise.reject(err);
  }
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
    .then(function (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      return true;
    });
}

function explicarErrorCamara(e) {
  var n = (e && (e.name || e.message)) || '';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') {
    return 'Cámara bloqueada. Tocá el candado 🔒 al lado de la dirección → Permisos → Cámara → Permitir, y recargá. Mientras tanto usá "🖼️ Foto al código".';
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') {
    return 'No se encontró cámara en este dispositivo. Probá desde el teléfono, o usá "🖼️ Foto al código".';
  }
  if (n === 'NotReadableError' || n === 'TrackStartError') {
    return 'La cámara la está usando otra app. Cerrala y volvé a intentar.';
  }
  if (n === 'SIN_API') {
    return 'Este navegador no deja usar la cámara. Abrí la app en Chrome, o usá "🖼️ Foto al código".';
  }
  return 'No se pudo abrir la cámara (' + n + '). Usá "🖼️ Foto al código".';
}

function iniciarEscaner() {
  var cont = $('#lector');
  var btn = $('#btnEscanear');
  cont.classList.remove('oculto');
  btn.textContent = '…'; btn.disabled = true;

  pedirPermisoCamara().then(function () {
    if (!scanner) scanner = new Html5Qrcode('lector', { verbose: false });
    return scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 260, height: 150 } },
      onScan,
      function () {}
    );
  }).then(function () {
    escaneando = true;
    btn.textContent = '✕ Cerrar cámara'; btn.disabled = false;
  }).catch(function (e) {
    escaneando = false;
    btn.textContent = '📷 Escanear'; btn.disabled = false;
    cont.classList.add('oculto');
    toast(explicarErrorCamara(e), true);
  });
}

function pararEscaner() {
  escaneando = false;
  $('#btnEscanear').textContent = '📷 Escanear';
  $('#lector').classList.add('oculto');
  if (scanner) { try { scanner.stop().catch(function () {}); } catch (e) {} }
}

function escanearFoto(file, cb) {
  if (!file) return;
  var s = new Html5Qrcode('lector-foto', { verbose: false });
  s.scanFile(file, false).then(function (txt) {
    beep();
    (cb || agregarPorCodigo)(String(txt).trim());
  }).catch(function () {
    toast('No se pudo leer el código de la foto. Sacala más de cerca, derecha y con buena luz.', true);
  }).then(function () { try { s.clear(); } catch (e) {} });
}

function fotoUnaVez(cb) {
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
  inp.style.display = 'none';
  document.body.appendChild(inp);
  inp.addEventListener('change', function () {
    var f = inp.files && inp.files[0];
    if (f) escanearFoto(f, cb);
    inp.remove();
  });
  inp.click();
}

function onScan(codigo) {
  var ahora = Date.now();
  if (codigo === ultimoCodigo && ahora - ultimoCodigoT < 2000) return;
  ultimoCodigo = codigo; ultimoCodigoT = ahora;
  beep();
  agregarPorCodigo(codigo);
}

// ============================================================
//  BÚSQUEDA / CARRITO
// ============================================================
function buscarEnVender() {
  var q = $('#buscarProd').value.trim().toLowerCase();
  var cont = $('#resultadosBusqueda');
  cont.innerHTML = '';
  if (!q) return;

  var res = DATA.productos.filter(function (p) {
    return p.activo && (p.nombre.toLowerCase().indexOf(q) >= 0 || p.codigo.indexOf(q) >= 0);
  }).slice(0, 8);

  if (!res.length) { cont.innerHTML = '<div class="item">Sin resultados</div>'; return; }

  res.forEach(function (p) {
    var d = document.createElement('div');
    d.className = 'item';
    d.innerHTML = '<div><b>' + esc(p.nombre) + '</b><small>' + esc(p.codigo) +
      ' · ' + (p.porPeso ? 'por peso' : 'stock ' + p.stock) + '</small></div>' +
      '<strong>' + money(p.precio) + (p.porPeso ? ' /kg' : '') + '</strong>';
    d.addEventListener('click', function () {
      agregarAlCarrito(p);
      $('#buscarProd').value = '';
      cont.innerHTML = '';
    });
    cont.appendChild(d);
  });
}

/** Todo local: no depende de la red (el catálogo ya se guarda en el teléfono). */
function agregarPorCodigo(codigo) {
  codigo = String(codigo).trim();
  var p = DATA.productos.filter(function (x) { return x.codigo === codigo; })[0];
  if (p) { agregarAlCarrito(p); return; }

  toast('Código ' + codigo + ' sin cargar.');
  if (confirm('El producto ' + codigo + ' no está cargado. ¿Cargarlo ahora?')) {
    mostrar('productos');
    formProducto({ codigo: codigo });
  }
}

function agregarAlCarrito(p) {
  if (p.porPeso) {
    pedirGramos(p, function (gramos) {
      var kilos = gramos / 1000;
      var l = cart.filter(function (x) { return x.codigo === p.codigo; })[0];
      if (l) { l.cant += kilos; l.gramos = (l.gramos || 0) + gramos; }
      else cart.push({ codigo: p.codigo, nombre: p.nombre, precio: p.precio, cant: kilos, gramos: gramos, porPeso: true });
      renderCarrito();
      toast(p.nombre + ' agregado (' + gramos + ' g)');
    });
    return;
  }
  var l = cart.filter(function (x) { return x.codigo === p.codigo; })[0];
  if (l) l.cant++;
  else cart.push({ codigo: p.codigo, nombre: p.nombre, precio: p.precio, cant: 1 });
  renderCarrito();
  toast(p.nombre + ' agregado');
}

/** Pide los gramos para un producto que se vende por peso y calcula el precio al toque. */
/** Código automático para productos por peso (no tienen código de barras real). */
function proximoCodigoGranel() {
  var n = 1;
  while (DATA.productos.some(function (x) { return x.codigo === 'GRANEL-' + n; })) n++;
  return 'GRANEL-' + n;
}

function pedirGramos(p, cb) {
  abrirModal(
    '<h3>' + esc(p.nombre) + '</h3>' +
    '<p>Precio por kilo: <b>' + money(p.precio) + '</b></p>' +
    '<div class="campo"><label>¿Cuántos gramos?</label>' +
      '<input id="gGramos" type="number" inputmode="numeric" placeholder="Ej: 250" autofocus></div>' +
    '<div class="vuelto-grande" style="margin:8px 0">Cobrar <b id="gPrecio">' + money(0) + '</b></div>' +
    '<div class="fila-botones">' +
      '<button class="btn" id="gCancelar">Cancelar</button>' +
      '<button class="btn exito" id="gAgregar">Agregar</button>' +
    '</div>'
  );
  $('#gGramos').addEventListener('input', function () {
    var g = numJS($('#gGramos').value);
    $('#gPrecio').textContent = money(round2(p.precio * g / 1000));
  });
  $('#gCancelar').addEventListener('click', cerrarModal);
  $('#gAgregar').addEventListener('click', function () {
    var g = numJS($('#gGramos').value);
    if (g <= 0) { toast('Poné los gramos.', true); return; }
    cerrarModal();
    cb(g);
  });
}

function cambiarCant(codigo, delta) {
  var l = cart.filter(function (x) { return x.codigo === codigo; })[0];
  if (!l) return;
  l.cant += delta;
  if (l.cant <= 0) cart = cart.filter(function (x) { return x.codigo !== codigo; });
  renderCarrito();
}

function quitarDelCarrito(codigo) {
  cart = cart.filter(function (x) { return x.codigo !== codigo; });
  renderCarrito();
}

function totalCarrito() {
  return cart.reduce(function (s, l) { return s + l.precio * l.cant; }, 0);
}

/** Recalcula total/detalle con los precios que tenemos guardados (sin red). */
function calcularVenta(items) {
  var total = 0;
  var detalle = [];
  items.forEach(function (it) {
    var p = DATA.productos.find(function (x) { return x.codigo === it.codigo; });
    var precio = p ? numJS(p.precio) : 0;
    var cant = numJS(it.cantidad) || 1;
    var sub = round2(precio * cant);
    total += sub;
    detalle.push({ codigo: it.codigo, cantidad: cant, nombre: p ? p.nombre : it.codigo, precio: precio, subtotal: sub });
  });
  return { total: round2(total), detalle: detalle };
}

function renderCarrito() {
  var cont = $('#carrito');
  cont.innerHTML = '';
  cart.forEach(function (l) {
    var div = document.createElement('div');
    div.className = 'linea';
    if (l.porPeso) {
      div.innerHTML =
        '<div><div class="nom">' + esc(l.nombre) + '</div><div class="pu">' + money(l.precio) + ' /kg</div></div>' +
        '<div class="sub">' + money(l.precio * l.cant) + '</div>' +
        '<div class="cant">' +
          '<span class="q">' + l.gramos + ' g</span>' +
          '<button class="btn chico" data-a="editar">✏️ Editar</button>' +
          '<button class="quitar" data-a="quitar">quitar</button>' +
        '</div>';
      div.querySelector('[data-a=editar]').addEventListener('click', function () {
        var prod = DATA.productos.find(function (x) { return x.codigo === l.codigo; });
        quitarDelCarrito(l.codigo);
        if (prod) agregarAlCarrito(prod);
      });
      div.querySelector('[data-a=quitar]').addEventListener('click', function () { quitarDelCarrito(l.codigo); });
    } else {
      div.innerHTML =
        '<div><div class="nom">' + esc(l.nombre) + '</div><div class="pu">' + money(l.precio) + ' c/u</div></div>' +
        '<div class="sub">' + money(l.precio * l.cant) + '</div>' +
        '<div class="cant">' +
          '<button data-a="menos">–</button>' +
          '<span class="q">' + l.cant + '</span>' +
          '<button data-a="mas">+</button>' +
          '<button class="quitar" data-a="quitar">quitar</button>' +
        '</div>';
      div.querySelector('[data-a=menos]').addEventListener('click', function () { cambiarCant(l.codigo, -1); });
      div.querySelector('[data-a=mas]').addEventListener('click', function () { cambiarCant(l.codigo, 1); });
      div.querySelector('[data-a=quitar]').addEventListener('click', function () { quitarDelCarrito(l.codigo); });
    }
    cont.appendChild(div);
  });

  $('#totalCarrito').textContent = money(totalCarrito());
  $('#pie-venta').classList.toggle('oculto', cart.length === 0);
}

// ============================================================
//  COBRO — guarda local YA, sincroniza después
// ============================================================
function abrirCobro() {
  if (!cart.length) return;
  if (!vendedor) { toast('Elegí quién vende (arriba a la derecha).', true); return; }
  var total = totalCarrito();
  var formaSel = 'efectivo';

  var clientesOpts = DATA.clientes.map(function (c) {
    return '<option value="' + esc(c.id) + '">' + esc(c.nombre) + (c.saldo > 0 ? ' (debe ' + money(c.saldo) + ')' : '') + '</option>';
  }).join('');

  abrirModal(
    '<h3>Cobrar ' + money(total) + '</h3>' +
    '<div class="opciones-pago">' +
      '<button id="opEfectivo" class="sel">💵 Efectivo</button>' +
      '<button id="opCuenta">📒 Fiado / cuenta</button>' +
    '</div>' +
    '<div id="bloqueEfectivo">' +
      '<div class="campo"><label>¿Con cuánto paga? (opcional)</label>' +
        '<input id="pagaCon" type="number" inputmode="numeric" placeholder="' + total + '"></div>' +
      '<div class="vuelto-grande">Vuelto <b id="vuelto">' + money(0) + '</b></div>' +
    '</div>' +
    '<div id="bloqueCuenta" class="oculto">' +
      '<div class="campo"><label>Cliente</label><select id="selCliente">' + clientesOpts + '</select></div>' +
      (clientesOpts ? '' : '<p>No hay clientes. Cargá uno en la pestaña Clientes.</p>') +
    '</div>' +
    '<div class="fila-botones">' +
      '<button class="btn" id="btnCancelarCobro">Cancelar</button>' +
      '<button class="btn exito" id="btnConfirmarCobro">Confirmar venta</button>' +
    '</div>'
  );

  function setForma(f) {
    formaSel = f;
    $('#opEfectivo').classList.toggle('sel', f === 'efectivo');
    $('#opCuenta').classList.toggle('sel', f === 'cuenta');
    $('#bloqueEfectivo').classList.toggle('oculto', f !== 'efectivo');
    $('#bloqueCuenta').classList.toggle('oculto', f !== 'cuenta');
  }
  $('#opEfectivo').addEventListener('click', function () { setForma('efectivo'); });
  $('#opCuenta').addEventListener('click', function () { setForma('cuenta'); });

  $('#pagaCon').addEventListener('input', function () {
    var pc = parseFloat($('#pagaCon').value) || 0;
    $('#vuelto').textContent = money(pc > total ? pc - total : 0);
  });

  $('#btnCancelarCobro').addEventListener('click', cerrarModal);
  $('#btnConfirmarCobro').addEventListener('click', function () {
    if (this.disabled) return; // guard anti-doble-tap
    var itemsVenta = cart.map(function (l) { return { codigo: l.codigo, cantidad: l.cant }; });
    var idCliente = formaSel === 'cuenta' ? $('#selCliente').value : '';
    if (formaSel === 'cuenta' && !idCliente) { toast('Elegí el cliente.', true); return; }
    this.disabled = true; // bloquear hasta que el modal se cierre

    var calc = calcularVenta(itemsVenta);
    var totalReal = calc.total;
    var pagaCon = formaSel === 'efectivo' ? (parseFloat($('#pagaCon').value) || 0) : 0;
    var vuelto = (pagaCon > 0 && pagaCon >= totalReal) ? round2(pagaCon - totalReal) : 0;

    // 1) Aplicar YA en este teléfono (stock, saldo)
    calc.detalle.forEach(function (l) {
      var p = DATA.productos.find(function (x) { return x.codigo === l.codigo; });
      if (p) p.stock -= l.cantidad;
    });
    var clienteNombre = '';
    if (formaSel === 'cuenta') {
      var cli = DATA.clientes.find(function (x) { return x.id === idCliente; });
      if (cli) { cli.saldo = round2(cli.saldo + totalReal); clienteNombre = cli.nombre; }
    }
    renderProductos(); renderClientes();

    // 2) Anotar en la caja de hoy (instantáneo, sin red)
    var idLocalVenta = proximoIdLocal('V');
    var opId = encolar('registrarVenta', {
      vendedor: vendedor, forma_pago: formaSel, paga_con: pagaCon,
      id_cliente: idCliente, items: itemsVenta, _totalEstimado: totalReal,
      idLocal: idLocalVenta
    });
    agregarLedger({
      tipo: 'venta', id: idLocalVenta, hora: horaAhora(), vendedor: vendedor, total: totalReal,
      forma_pago: formaSel, cliente: clienteNombre, clienteId: idCliente,
      items: itemsVenta, anulada: false, synced: false, opId: opId
    });

    // 3) Mostrar el resultado YA, sin esperar a la planilla
    cart = [];
    renderCarrito();
    if (escaneando) pararEscaner();
    mostrarComprobante({ id_venta: idLocalVenta, total: totalReal, vuelto: vuelto, forma_pago: formaSel, cliente: clienteNombre });
    if (cajaActiva()) verCaja();
  });
}

function mostrarComprobante(r) {
  var extra = r.forma_pago === 'cuenta'
    ? '<p>Anotado en la cuenta de <b>' + esc(r.cliente) + '</b>.</p>'
    : '<div class="vuelto-grande">Vuelto <b>' + money(r.vuelto) + '</b></div>';
  abrirModal(
    '<h3>✅ Venta ' + esc(r.id_venta) + '</h3>' +
    '<p style="font-size:20px">Total: <b>' + money(r.total) + '</b></p>' +
    extra +
    '<button class="btn primario grande" id="btnListo">Listo</button>'
  );
  $('#btnListo').addEventListener('click', cerrarModal);
}

// ============================================================
//  PRODUCTOS — guardado local, sincroniza después
// ============================================================
function renderProductos() {
  var q = ($('#filtroProd').value || '').trim().toLowerCase();
  var cont = $('#listaProductos');
  cont.innerHTML = '';
  var lista = DATA.productos.filter(function (p) {
    return !q || p.nombre.toLowerCase().indexOf(q) >= 0 || p.codigo.indexOf(q) >= 0;
  }).sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });

  lista.forEach(function (p) {
    var div = document.createElement('div');
    div.className = 'tarjeta';
    div.innerHTML =
      '<div class="info"><b>' + esc(p.nombre) + (p.activo ? '' : ' (inactivo)') + '</b>' +
      '<small>' + esc(p.codigo) + ' · ' + money(p.precio) +
      ' · stock <span class="' + (p.stock <= 3 ? 'stock-bajo' : '') + '">' + p.stock + '</span></small></div>' +
      '<button class="btn chico">Editar</button>';
    div.querySelector('button').addEventListener('click', function () { formProducto(p); });
    cont.appendChild(div);
  });
  if (!lista.length) cont.innerHTML = '<p style="color:#5f6368">No hay productos.</p>';
}

function formProducto(p) {
  p = p || {};
  var esNuevo = !p.nombre;
  abrirModal(
    '<h3>' + (esNuevo ? 'Nuevo producto' : 'Editar producto') + '</h3>' +
    '<div class="campo" id="campoCodigo"><label>Código de barras</label>' +
      '<input id="pCodigo" value="' + esc(p.codigo || '') + '" ' + (esNuevo ? '' : 'readonly') + '>' +
      (esNuevo ? '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button class="btn chico" id="pEscanear">📷 Escanear</button>' +
        '<button class="btn chico" id="pFoto">🖼️ Foto</button></div>' : '') +
    '</div>' +
    '<div class="campo"><label>Nombre</label><input id="pNombre" value="' + esc(p.nombre || '') + '"></div>' +
    '<div class="campo"><label><input type="checkbox" id="pPorPeso" style="width:auto" ' +
      (p.porPeso ? 'checked' : '') + '> Se vende por peso (cobra por kilo)</label></div>' +
    '<div class="campo"><label id="lblPrecio">Precio final (con IVA)</label>' +
      '<input id="pPrecio" type="number" inputmode="decimal" value="' + (p.precio || '') + '"></div>' +
    '<div class="campo" id="campoStock"><label>Stock (unidades)</label>' +
      '<input id="pStock" type="number" inputmode="numeric" value="' + (p.stock != null ? p.stock : '') + '"></div>' +
    '<div class="campo"><label>Categoría (opcional)</label><input id="pCat" value="' + esc(p.categoria || '') + '"></div>' +
    (esNuevo ? '' : '<div class="campo"><label><input type="checkbox" id="pActivo" style="width:auto" ' +
      (p.activo ? 'checked' : '') + '> Se vende (activo)</label></div>') +
    '<div class="fila-botones">' +
      '<button class="btn" id="pCancelar">Cancelar</button>' +
      '<button class="btn exito" id="pGuardar">Guardar</button>' +
    '</div>' +
    (esNuevo ? '' : '<button class="btn peligro ancho" id="pEliminar" style="margin-top:10px">🗑 Eliminar producto</button>')
  );

  function actualizarModoPeso() {
    var porPeso = $('#pPorPeso').checked;
    $('#lblPrecio').textContent = porPeso ? 'Precio por kilo (con IVA)' : 'Precio final (con IVA)';
    $('#campoStock').classList.toggle('oculto', porPeso);
    if (esNuevo) {
      // Por peso no tiene código de barras real: se genera solo, no hace falta escanear.
      $('#campoCodigo').classList.toggle('oculto', porPeso);
      if (porPeso) $('#pCodigo').value = proximoCodigoGranel();
    }
  }
  $('#pPorPeso').addEventListener('change', actualizarModoPeso);
  actualizarModoPeso();

  function ponerCodigo(cod) { $('#pCodigo').value = cod; toast('Código: ' + cod); }
  var pel = $('#pEliminar');
  if (pel) pel.addEventListener('click', function () {
    if (!confirm('¿Eliminar "' + p.nombre + '" de la lista?\n\nLas ventas viejas de este producto NO se tocan. Si solo querés dejar de venderlo, destildá "Se vende" en vez de borrarlo.')) return;
    DATA.productos = DATA.productos.filter(function (x) { return x.codigo !== p.codigo; });
    renderProductos();
    encolar('eliminarProducto', { codigo: p.codigo });
    cerrarModal();
    toast('Producto eliminado');
  });
  var pe = $('#pEscanear');
  if (pe) pe.addEventListener('click', function () { escanearUnaVez(ponerCodigo); });
  var pf = $('#pFoto');
  if (pf) pf.addEventListener('click', function () { fotoUnaVez(ponerCodigo); });

  $('#pCancelar').addEventListener('click', cerrarModal);
  $('#pGuardar').addEventListener('click', function () {
    var porPeso = $('#pPorPeso').checked;
    var obj = {
      codigo: $('#pCodigo').value.trim(),
      nombre: $('#pNombre').value.trim(),
      precio: parseFloat($('#pPrecio').value) || 0,
      stock: porPeso ? 0 : (parseFloat($('#pStock').value) || 0),
      categoria: $('#pCat').value.trim(),
      activo: $('#pActivo') ? $('#pActivo').checked : true,
      porPeso: porPeso
    };
    if (!obj.codigo) { toast('Falta el código.', true); return; }
    if (!obj.nombre) { toast('Falta el nombre.', true); return; }

    var idx = DATA.productos.findIndex(function (x) { return x.codigo === obj.codigo; });
    if (idx >= 0) DATA.productos[idx] = obj; else DATA.productos.push(obj);
    renderProductos();
    encolar('guardarProducto', obj);
    cerrarModal();
    toast('Producto guardado');
  });
}

// ============================================================
//  CLIENTES — guardado local, sincroniza después
// ============================================================
function renderClientes() {
  var cont = $('#listaClientes');
  cont.innerHTML = '';
  DATA.clientes.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre); }).forEach(function (c) {
    var div = document.createElement('div');
    div.className = 'tarjeta';
    var clase = c.saldo > 0 ? 'saldo-pos' : 'saldo-cero';
    var txt = c.saldo > 0 ? 'Debe ' + money(c.saldo) : 'Al día';
    div.innerHTML =
      '<div class="info"><b>' + esc(c.nombre) + (esIdLocal(c.id) ? ' ⏳' : '') + '</b><small>' + esc(c.telefono || '') + '</small>' +
      '<div class="' + clase + '">' + txt + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:6px">' +
        '<button class="btn chico primario" data-a="pago">Registrar pago</button>' +
        '<button class="btn chico" data-a="ver">Ver cuenta</button>' +
      '</div>';
    div.querySelector('[data-a=pago]').addEventListener('click', function () { formPago(c); });
    div.querySelector('[data-a=ver]').addEventListener('click', function () { verCuenta(c); });
    cont.appendChild(div);
  });
  if (!DATA.clientes.length) cont.innerHTML = '<p style="color:#5f6368">No hay clientes.</p>';
}

function formCliente(c) {
  c = c || {};
  abrirModal(
    '<h3>' + (c.id ? 'Editar cliente' : 'Nuevo cliente') + '</h3>' +
    '<div class="campo"><label>Nombre</label><input id="cNombre" value="' + esc(c.nombre || '') + '"></div>' +
    '<div class="campo"><label>Teléfono (opcional)</label><input id="cTel" value="' + esc(c.telefono || '') + '"></div>' +
    '<div class="campo"><label>Notas (opcional)</label><input id="cNotas" value="' + esc(c.notas || '') + '"></div>' +
    (c.id ? '' : '<div class="campo"><label>Saldo inicial que ya debe (opcional)</label>' +
      '<input id="cSaldo" type="number" inputmode="decimal" value="0"></div>') +
    '<div class="fila-botones">' +
      '<button class="btn" id="cCancelar">Cancelar</button>' +
      '<button class="btn exito" id="cGuardar">Guardar</button>' +
    '</div>'
  );
  $('#cCancelar').addEventListener('click', cerrarModal);
  $('#cGuardar').addEventListener('click', function () {
    if (this.disabled) return;
    var nombre = $('#cNombre').value.trim();
    var telefono = $('#cTel').value.trim();
    var notas = $('#cNotas').value.trim();
    if (!nombre) { toast('Falta el nombre.', true); return; }
    this.disabled = true;

    if (c.id) {
      var existente = DATA.clientes.find(function (x) { return x.id === c.id; });
      if (existente) { existente.nombre = nombre; existente.telefono = telefono; existente.notas = notas; }
      renderClientes();
      encolar('guardarCliente', { id: c.id, nombre: nombre, telefono: telefono, notas: notas, saldo: c.saldo });
    } else {
      var saldoInicial = parseFloat($('#cSaldo').value) || 0;
      var tempId = proximoIdLocal('C');
      DATA.clientes.push({ id: tempId, nombre: nombre, telefono: telefono, saldo: saldoInicial, notas: notas });
      renderClientes();
      encolar('guardarCliente', { id: '', idLocal: tempId, nombre: nombre, telefono: telefono, notas: notas, saldo: saldoInicial });
    }
    cerrarModal();
    toast('Cliente guardado');
  });
}

function formPago(c) {
  abrirModal(
    '<h3>Pago de ' + esc(c.nombre) + '</h3>' +
    '<p>Debe ahora: <b>' + money(c.saldo) + '</b></p>' +
    '<div class="campo"><label>¿Cuánto paga?</label>' +
      '<input id="mMonto" type="number" inputmode="decimal"></div>' +
    '<button class="btn chico" id="mTodo" style="margin-bottom:12px">Pagar todo (' + money(c.saldo) + ')</button>' +
    '<div class="fila-botones">' +
      '<button class="btn" id="mCancelar">Cancelar</button>' +
      '<button class="btn exito" id="mGuardar">Registrar pago</button>' +
    '</div>'
  );
  $('#mTodo').addEventListener('click', function () { $('#mMonto').value = c.saldo; });
  $('#mCancelar').addEventListener('click', cerrarModal);
  $('#mGuardar').addEventListener('click', function () {
    var monto = parseFloat($('#mMonto').value) || 0;
    if (monto <= 0) { toast('Poné un monto.', true); return; }

    c.saldo = round2(c.saldo - monto);
    renderClientes();
    var opId = encolar('registrarPago', { id_cliente: c.id, monto: monto, vendedor: vendedor });
    agregarLedger({ tipo: 'pago', id: proximoIdLocal('P'), hora: horaAhora(), cliente: c.nombre, monto: monto, vendedor: vendedor, synced: false, opId: opId });

    cerrarModal();
    toast('Pago registrado');
    if (cajaActiva()) verCaja();
  });
}

function verCuenta(c) {
  if (esIdLocal(c.id)) {
    abrirModal(
      '<h3>Cuenta de ' + esc(c.nombre) + '</h3>' +
      '<p>Este cliente se cargó hace un momento y todavía se está guardando en la planilla. Esperá unos segundos (mirá "' +
      '⏳ Subiendo…" arriba) y volvé a abrir su cuenta.</p>' +
      '<button class="btn ancho" id="vcCerrar3">Cerrar</button>'
    );
    $('#vcCerrar3').addEventListener('click', cerrarModal);
    return;
  }
  abrirModal('<h3>Cuenta de ' + esc(c.nombre) + '</h3><p>Cargando…</p>');
  call('getCuentaCliente', c.id).then(function (r) {
    var filas = r.movimientos.map(function (m) {
      var val = m.debe ? '+' + money(m.debe) : '-' + money(m.haber);
      var color = m.debe ? 'color:#d93025' : 'color:#1e8e3e';
      return '<div class="fila-detalle"><span>' + m.fecha + ' ' + m.hora + ' · ' + esc(m.detalle) +
        '</span><b style="' + color + '">' + val + '</b></div>';
    }).join('') || '<p>Sin movimientos.</p>';
    $('#modal').innerHTML =
      '<h3>Cuenta de ' + esc(r.cliente.nombre) + '</h3>' +
      '<p style="font-size:20px">Saldo: <b class="' + (r.cliente.saldo > 0 ? 'saldo-pos' : 'saldo-cero') + '">' + money(r.cliente.saldo) + '</b></p>' +
      filas +
      '<div class="fila-botones" style="margin-top:12px">' +
        '<button class="btn" id="vcCerrar">Cerrar</button>' +
        '<button class="btn" id="vcEditar">Editar datos</button>' +
      '</div>';
    $('#vcCerrar').addEventListener('click', cerrarModal);
    $('#vcEditar').addEventListener('click', function () { formCliente(c); });
  }).catch(function (e) { toast(msg(e), true); });
}

// ============================================================
//  CAJA — "hoy" sale del teléfono (instantáneo); otros días, de la planilla
// ============================================================
function verCaja() {
  var fecha = $('#cajaFecha').value || hoyISO();
  if (fecha === hoyISO()) { renderCajaLocal(fecha); return; }
  $('#cajaResumen').innerHTML = '<p>Cargando…</p>';
  $('#cajaDetalle').innerHTML = '';
  call('getCaja', fecha).then(function (r) { renderCaja(r); })
    .catch(function (e) { $('#cajaResumen').innerHTML = ''; toast(msg(e), true); });
}

function renderCajaLocal(fecha) { renderCaja(cajaDesdeLedger(fecha)); }

function cajaDesdeLedger(fecha) {
  var l = ledgerDia(fecha).filter(function (x) { return !(x.tipo === 'venta' && x.anulada); });
  var ventas = l.filter(function (x) { return x.tipo === 'venta'; });
  var pagos = l.filter(function (x) { return x.tipo === 'pago'; });
  var movs = l.filter(function (x) { return x.tipo === 'movimiento'; });

  var ventasEfectivo = 0, ventasCuenta = 0;
  var listaVentas = ventas.map(function (v) {
    if (v.forma_pago === 'cuenta') ventasCuenta += v.total; else ventasEfectivo += v.total;
    return { id_venta: v.id, hora: v.hora, vendedor: v.vendedor, total: v.total, forma_pago: v.forma_pago, cliente: v.cliente, _pendiente: !v.synced };
  });
  var cobrosCuenta = 0;
  var listaPagos = pagos.map(function (p) {
    cobrosCuenta += p.monto;
    return { hora: p.hora, cliente: p.cliente, monto: p.monto, vendedor: p.vendedor, _pendiente: !p.synced };
  });
  var ingresos = 0, egresos = 0;
  var listaMovs = movs.map(function (m) {
    if (m.tipoMov === 'egreso') egresos += m.monto; else ingresos += m.monto;
    return { hora: m.hora, tipo: m.tipoMov, concepto: m.concepto, monto: m.monto, vendedor: m.vendedor, _pendiente: !m.synced };
  });
  var efectivoEnCaja = ventasEfectivo + cobrosCuenta + ingresos - egresos;

  return {
    fecha: fecha, local: true,
    resumen: {
      cantidad_ventas: ventas.length,
      ventas_efectivo: round2(ventasEfectivo),
      ventas_cuenta: round2(ventasCuenta),
      total_vendido: round2(ventasEfectivo + ventasCuenta),
      cobros_cuenta: round2(cobrosCuenta),
      ingresos_extra: round2(ingresos),
      egresos: round2(egresos),
      efectivo_en_caja: round2(efectivoEnCaja)
    },
    ventas: listaVentas.slice().reverse(),
    pagos: listaPagos.slice().reverse(),
    movimientos: listaMovs.slice().reverse()
  };
}

function verCajaServidor() {
  var fecha = $('#cajaFecha').value || hoyISO();
  cargando(this, true, 'Consultando');
  var btn = this;
  call('getCaja', fecha).then(function (r) {
    cargando(btn, false);
    abrirModal(
      '<h3>Según la planilla</h3>' +
      '<p style="color:#5f6368;font-size:13px">Esto suma lo que ya llegó de <b>todos los teléfonos</b>. ' +
      'Puede faltar lo más reciente de este mismo teléfono si todavía se está subiendo.</p>' +
      '<div class="caja-resumen">' +
        celda('Ventas', r.resumen.cantidad_ventas + ' (' + money(r.resumen.total_vendido) + ')') +
        celda('Cobros de cuentas', money(r.resumen.cobros_cuenta)) +
        '<div class="celda destacada"><small>Efectivo en la planilla</small><b>' + money(r.resumen.efectivo_en_caja) + '</b></div>' +
      '</div>' +
      '<button class="btn ancho" id="btnCerrarServidor" style="margin-top:12px">Cerrar</button>'
    );
    $('#btnCerrarServidor').addEventListener('click', cerrarModal);
  }).catch(function (e) { cargando(btn, false); toast(msg(e), true); });
}

function renderCaja(r) {
  var s = r.resumen;
  $('#cajaResumen').innerHTML =
    celda('Ventas', s.cantidad_ventas + ' (' + money(s.total_vendido) + ')') +
    celda('Ventas en efectivo', money(s.ventas_efectivo)) +
    celda('Fiado del día', money(s.ventas_cuenta)) +
    celda('Cobros de cuentas', money(s.cobros_cuenta)) +
    celda('Ingresos extra', money(s.ingresos_extra)) +
    celda('Egresos / gastos', money(s.egresos)) +
    '<div class="celda destacada"><small>Efectivo que tiene que haber en la caja</small><b>' + money(s.efectivo_en_caja) + '</b></div>';

  var html = '';
  if (r.ventas.length) {
    html += '<h4>Ventas' + (r.local ? ' (en este teléfono)' : '') + '</h4>';
    r.ventas.forEach(function (v) {
      html += '<div class="fila-detalle">' +
        '<span>' + v.hora + (v._pendiente ? ' ⏳' : '') + ' · ' + esc(v.vendedor) + ' · ' + (v.forma_pago === 'cuenta' ? 'fiado ' + esc(v.cliente) : 'efectivo') + '</span>' +
        '<span><b>' + money(v.total) + '</b> ' +
        '<button class="mini-btn" data-anular="' + esc(v.id_venta) + '">anular</button></span>' +
      '</div>';
    });
  }
  if (r.pagos.length) {
    html += '<h4>Cobros de cuenta corriente</h4>';
    r.pagos.forEach(function (p) {
      html += '<div class="fila-detalle"><span>' + p.hora + (p._pendiente ? ' ⏳' : '') + ' · ' + esc(p.cliente) + ' · ' + esc(p.vendedor) +
        '</span><b>' + money(p.monto) + '</b></div>';
    });
  }
  if (r.movimientos.length) {
    html += '<h4>Ingresos y egresos</h4>';
    r.movimientos.forEach(function (m) {
      var signo = m.tipo === 'egreso' ? '-' : '+';
      html += '<div class="fila-detalle"><span>' + m.hora + (m._pendiente ? ' ⏳' : '') + ' · ' + esc(m.concepto || m.tipo) +
        '</span><b>' + signo + money(m.monto) + '</b></div>';
    });
  }
  if (!html) html = '<p style="color:#5f6368;margin-top:16px">Sin movimientos este día.</p>';
  $('#cajaDetalle').innerHTML = html;

  $all('[data-anular]').forEach(function (b) {
    b.addEventListener('click', function () {
      var id = b.dataset.anular;
      if (r.local) { anularVentaLocal(id); return; }
      if (!confirm('¿Anular la venta ' + id + '? Se repone el stock.')) return;
      call('anularVenta', id).then(function (rr) {
        DATA.productos = rr.productos; DATA.clientes = rr.clientes;
        renderProductos(); renderClientes();
        verCaja();
        toast('Venta anulada');
      }).catch(function (e) { toast(msg(e), true); });
    });
  });
}

/** Anula una venta de la caja de HOY. Si todavía no había llegado a la
 *  planilla, alcanza con sacarla de la cola local. Si ya estaba, se encola
 *  la anulación real para la planilla. */
function anularVentaLocal(id) {
  if (!confirm('¿Anular la venta ' + id + '? Se repone el stock.')) return;
  var fecha = hoyISO();
  var l = ledgerDia(fecha);
  var entry = l.find(function (x) { return x.tipo === 'venta' && x.id === id; });
  if (!entry || entry.anulada) return;

  (entry.items || []).forEach(function (it) {
    var p = DATA.productos.find(function (x) { return x.codigo === it.codigo; });
    if (p) p.stock += numJS(it.cantidad);
  });
  if (entry.forma_pago === 'cuenta' && entry.clienteId) {
    var c = DATA.clientes.find(function (x) { return x.id === entry.clienteId; });
    if (c) c.saldo = round2(c.saldo - entry.total);
  }
  renderProductos(); renderClientes();

  entry.anulada = true;
  if (!entry.synced) {
    guardarCola(cola().filter(function (o) { return o.id !== entry.opId; }));
  } else {
    encolar('anularVenta', {
      id_venta: entry.id,
      _reponer: entry.items, _forma_pago: entry.forma_pago,
      _cliente_id: entry.clienteId, _total: entry.total
    });
  }
  guardarLedgerDia(fecha, l);
  toast('Venta anulada');
  renderCajaLocal(fecha);
}

function celda(t, v) {
  return '<div class="celda"><small>' + t + '</small><b>' + v + '</b></div>';
}

function formMovimiento(tipo) {
  abrirModal(
    '<h3>' + (tipo === 'ingreso' ? 'Ingreso de dinero' : 'Egreso / gasto') + '</h3>' +
    '<div class="campo"><label>Concepto</label>' +
      '<input id="moConcepto" placeholder="' + (tipo === 'ingreso' ? 'Ej: aporte de caja' : 'Ej: pago al repartidor de gaseosas') + '"></div>' +
    '<div class="campo"><label>Monto</label><input id="moMonto" type="number" inputmode="decimal"></div>' +
    '<div class="fila-botones">' +
      '<button class="btn" id="moCancelar">Cancelar</button>' +
      '<button class="btn exito" id="moGuardar">Guardar</button>' +
    '</div>'
  );
  $('#moCancelar').addEventListener('click', cerrarModal);
  $('#moGuardar').addEventListener('click', function () {
    var monto = parseFloat($('#moMonto').value) || 0;
    if (monto <= 0) { toast('Poné un monto.', true); return; }
    var concepto = $('#moConcepto').value.trim();

    var opId = encolar('registrarMovimiento', { tipo: tipo, concepto: concepto, monto: monto, vendedor: vendedor });
    agregarLedger({ tipo: 'movimiento', id: proximoIdLocal('M'), hora: horaAhora(), tipoMov: tipo, concepto: concepto, monto: monto, vendedor: vendedor, synced: false, opId: opId });

    cerrarModal();
    toast('Registrado');
    verCaja();
  });
}

// ============================================================
//  ESCÁNER "UNA VEZ" (alta de producto)
// ============================================================
function escanearUnaVez(cb) {
  var wrap = document.createElement('div');
  wrap.className = 'overlay';
  wrap.innerHTML = '<div class="modal"><h3>Escaneá el código</h3><div id="lector2" style="background:#000;border-radius:12px;overflow:hidden"></div>' +
    '<button class="btn ancho" id="cerrarL2" style="margin-top:10px">Cancelar</button></div>';
  document.body.appendChild(wrap);
  var s2 = new Html5Qrcode('lector2', { verbose: false });
  var vivo = false;
  function fin() { if (vivo) { try { s2.stop().catch(function () {}); } catch (e) {} } wrap.remove(); }
  $('#cerrarL2').addEventListener('click', fin);
  pedirPermisoCamara().then(function () {
    return s2.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 260, height: 150 } },
      function (cod) { beep(); fin(); cb(String(cod).trim()); }, function () {});
  }).then(function () { vivo = true; })
    .catch(function (e) { wrap.remove(); toast(explicarErrorCamara(e), true); });
}

// ============================================================
//  MODAL / ESCAPE HTML
// ============================================================
function abrirModal(html) {
  $('#modal').innerHTML = html;
  $('#overlay').classList.remove('oculto');
}
function cerrarModal() { $('#overlay').classList.add('oculto'); $('#modal').innerHTML = ''; }

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
