// ============================================================
//  KIOSCO - lógica del cliente (versión GitHub Pages + API)
// ============================================================

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
  var lento = setTimeout(function () { toast('Tardando más de lo normal… esperá, no toques de nuevo.'); }, 7000);
  return pedido
    .then(function (r) { return r.text(); })
    .then(function (txt) {
      clearTimeout(lento);
      var j;
      try { j = JSON.parse(txt); }
      catch (e) { throw new Error('El servidor no respondió bien. Revisá que el Apps Script esté implementado y la dirección sea correcta.'); }
      if (!j || j.ok !== true) throw new Error((j && j.error) || 'Error del servidor');
      return j.data;
    })
    .catch(function (e) {
      clearTimeout(lento);
      if (e instanceof TypeError) throw new Error('No hay conexión con el servidor. Revisá internet o la dirección configurada.');
      throw e;
    });
}

/** Puente: el resto del código llama call('nombre', ...) como antes. */
function call(fn) {
  var a = Array.prototype.slice.call(arguments, 1);
  switch (fn) {
    case 'getBootstrap':        return api('bootstrap', {}, 'GET');
    case 'buscarProducto':      return api('buscarProducto', { codigo: a[0] }, 'GET');
    case 'guardarProducto':     return api('guardarProducto', a[0], 'POST');
    case 'eliminarProducto':    return api('eliminarProducto', { codigo: a[0] }, 'POST');
    case 'ajustarStock':        return api('ajustarStock', { codigo: a[0], delta: a[1] }, 'POST');
    case 'guardarCliente':      return api('guardarCliente', a[0], 'POST');
    case 'registrarVenta':      return api('registrarVenta', a[0], 'POST');
    case 'anularVenta':         return api('anularVenta', { id_venta: a[0] }, 'POST');
    case 'registrarPago':       return api('registrarPago', a[0], 'POST');
    case 'registrarMovimiento': return api('registrarMovimiento', a[0], 'POST');
    case 'getCaja':             return api('caja', { fecha: a[0] }, 'GET');
    case 'getCuentaCliente':    return api('cuenta', { id_cliente: a[0] }, 'GET');
    default: return Promise.reject(new Error('Función desconocida: ' + fn));
  }
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

function aplicarDatos(d, deCache) {
  DATA = d;
  $('#kioscoNombre').textContent = d.nombre_kiosco;
  llenarVendedores();
  renderProductos();
  renderClientes();
}

function iniciarApp() {
  $('#cajaFecha').value = hoyISO();

  // Mostrar al toque lo último que se vio (así no arranca vacío mientras consulta)
  var hayCache = false;
  try {
    var c = localStorage.getItem('kiosco_cache');
    if (c) { aplicarDatos(JSON.parse(c), true); hayCache = true; }
  } catch (e) {}
  if (!hayCache) $('#listaProductos').innerHTML = '<p style="color:#5f6368">Cargando productos…</p>';

  call('getBootstrap').then(function (d) {
    aplicarDatos(d, false);
    verCaja();
    try { localStorage.setItem('kiosco_cache', JSON.stringify(d)); } catch (e) {}
  }).catch(function (e) {
    toast(hayCache ? 'Sin conexión: mostrando datos guardados.' : ('No se pudo conectar: ' + msg(e)), true);
  });

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
      ' · stock ' + p.stock + '</small></div><strong>' + money(p.precio) + '</strong>';
    d.addEventListener('click', function () {
      agregarAlCarrito(p);
      $('#buscarProd').value = '';
      cont.innerHTML = '';
    });
    cont.appendChild(d);
  });
}

function agregarPorCodigo(codigo) {
  codigo = String(codigo).trim();
  var p = DATA.productos.filter(function (x) { return x.codigo === codigo; })[0];
  if (p) { agregarAlCarrito(p); return; }

  call('buscarProducto', codigo).then(function (prod) {
    if (prod) {
      DATA.productos.push(prod);
      agregarAlCarrito(prod);
    } else {
      toast('Código ' + codigo + ' sin cargar.');
      if (confirm('El producto ' + codigo + ' no está cargado. ¿Cargarlo ahora?')) {
        mostrar('productos');
        formProducto({ codigo: codigo });
      }
    }
  }).catch(function (e) { toast(msg(e), true); });
}

function agregarAlCarrito(p) {
  var l = cart.filter(function (x) { return x.codigo === p.codigo; })[0];
  if (l) l.cant++;
  else cart.push({ codigo: p.codigo, nombre: p.nombre, precio: p.precio, cant: 1 });
  renderCarrito();
  toast(p.nombre + ' agregado');
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

function renderCarrito() {
  var cont = $('#carrito');
  cont.innerHTML = '';
  cart.forEach(function (l) {
    var div = document.createElement('div');
    div.className = 'linea';
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
    cont.appendChild(div);
  });

  $('#totalCarrito').textContent = money(totalCarrito());
  $('#pie-venta').classList.toggle('oculto', cart.length === 0);
}

// ============================================================
//  COBRO
// ============================================================
function abrirCobro() {
  if (!cart.length) return;
  if (!vendedor) { toast('Elegí quién vende (arriba a la derecha).', true); return; }
  var total = totalCarrito();
  var formaSel = 'efectivo';

  var clientesOpts = DATA.clientes.map(function (c) {
    return '<option value="' + c.id + '">' + esc(c.nombre) + (c.saldo > 0 ? ' (debe ' + money(c.saldo) + ')' : '') + '</option>';
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
    var payload = {
      vendedor: vendedor,
      forma_pago: formaSel,
      paga_con: formaSel === 'efectivo' ? (parseFloat($('#pagaCon').value) || 0) : 0,
      id_cliente: formaSel === 'cuenta' ? $('#selCliente').value : '',
      items: cart.map(function (l) { return { codigo: l.codigo, cantidad: l.cant }; })
    };
    if (formaSel === 'cuenta' && !payload.id_cliente) { toast('Elegí el cliente.', true); return; }

    cargando(this, true, 'Registrando venta');
    var btn = this;
    call('registrarVenta', payload).then(function (r) {
      if (r.productos) DATA.productos = r.productos;
      if (r.clientes) DATA.clientes = r.clientes;
      cart = [];
      renderCarrito(); renderProductos(); renderClientes();
      if (escaneando) pararEscaner();
      mostrarComprobante(r);
    }).catch(function (e) { cargando(btn, false); toast(msg(e), true); });
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
//  PRODUCTOS
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
    '<div class="campo"><label>Código de barras</label>' +
      '<input id="pCodigo" value="' + esc(p.codigo || '') + '" ' + (esNuevo ? '' : 'readonly') + '>' +
      (esNuevo ? '<div style="display:flex;gap:6px;margin-top:6px">' +
        '<button class="btn chico" id="pEscanear">📷 Escanear</button>' +
        '<button class="btn chico" id="pFoto">🖼️ Foto</button></div>' : '') +
    '</div>' +
    '<div class="campo"><label>Nombre</label><input id="pNombre" value="' + esc(p.nombre || '') + '"></div>' +
    '<div class="campo"><label>Precio final (con IVA)</label>' +
      '<input id="pPrecio" type="number" inputmode="decimal" value="' + (p.precio || '') + '"></div>' +
    '<div class="campo"><label>Stock (unidades)</label>' +
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

  function ponerCodigo(cod) { $('#pCodigo').value = cod; toast('Código: ' + cod); }
  var pel = $('#pEliminar');
  if (pel) pel.addEventListener('click', function () {
    if (!confirm('¿Eliminar "' + p.nombre + '" de la lista?\n\nLas ventas viejas de este producto NO se tocan. Si solo querés dejar de venderlo, destildá "Se vende" en vez de borrarlo.')) return;
    cargando(this, true, 'Eliminando');
    var b = this;
    call('eliminarProducto', p.codigo).then(function (r) {
      if (r.productos) DATA.productos = r.productos;
      renderProductos();
      cerrarModal();
      toast('Producto eliminado');
    }).catch(function (e) { cargando(b, false); toast(msg(e), true); });
  });
  var pe = $('#pEscanear');
  if (pe) pe.addEventListener('click', function () { escanearUnaVez(ponerCodigo); });
  var pf = $('#pFoto');
  if (pf) pf.addEventListener('click', function () { fotoUnaVez(ponerCodigo); });

  $('#pCancelar').addEventListener('click', cerrarModal);
  $('#pGuardar').addEventListener('click', function () {
    var obj = {
      codigo: $('#pCodigo').value.trim(),
      nombre: $('#pNombre').value.trim(),
      precio: parseFloat($('#pPrecio').value) || 0,
      stock: parseFloat($('#pStock').value) || 0,
      categoria: $('#pCat').value.trim(),
      activo: $('#pActivo') ? $('#pActivo').checked : true
    };
    if (!obj.codigo) { toast('Falta el código.', true); return; }
    if (!obj.nombre) { toast('Falta el nombre.', true); return; }
    cargando(this, true);
    var btn = this;
    call('guardarProducto', obj).then(function (r) {
      DATA.productos = r.productos;
      renderProductos();
      cerrarModal();
      toast('Producto guardado');
    }).catch(function (e) { cargando(btn, false); toast(msg(e), true); });
  });
}

// ============================================================
//  CLIENTES
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
      '<div class="info"><b>' + esc(c.nombre) + '</b><small>' + esc(c.telefono || '') + '</small>' +
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
    var obj = {
      id: c.id || '',
      nombre: $('#cNombre').value.trim(),
      telefono: $('#cTel').value.trim(),
      notas: $('#cNotas').value.trim(),
      saldo: c.id ? c.saldo : (parseFloat($('#cSaldo').value) || 0)
    };
    if (!obj.nombre) { toast('Falta el nombre.', true); return; }
    cargando(this, true);
    var btn = this;
    call('guardarCliente', obj).then(function (r) {
      DATA.clientes = r.clientes;
      renderClientes();
      cerrarModal();
      toast('Cliente guardado');
    }).catch(function (e) { cargando(btn, false); toast(msg(e), true); });
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
    cargando(this, true);
    var btn = this;
    call('registrarPago', { id_cliente: c.id, monto: monto, vendedor: vendedor }).then(function (r) {
      DATA.clientes = r.clientes;
      renderClientes();
      cerrarModal();
      toast('Pago registrado');
      if ($('#scr-caja').classList.contains('activa')) verCaja();
    }).catch(function (e) { cargando(btn, false); toast(msg(e), true); });
  });
}

function verCuenta(c) {
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
//  CAJA
// ============================================================
function verCaja() {
  var fecha = $('#cajaFecha').value || hoyISO();
  $('#cajaResumen').innerHTML = '<p>Cargando…</p>';
  $('#cajaDetalle').innerHTML = '';
  call('getCaja', fecha).then(function (r) { renderCaja(r); })
    .catch(function (e) { $('#cajaResumen').innerHTML = ''; toast(msg(e), true); });
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
    html += '<h4>Ventas</h4>';
    r.ventas.forEach(function (v) {
      html += '<div class="fila-detalle">' +
        '<span>' + v.hora + ' · ' + esc(v.vendedor) + ' · ' + (v.forma_pago === 'cuenta' ? 'fiado ' + esc(v.cliente) : 'efectivo') + '</span>' +
        '<span><b>' + money(v.total) + '</b> ' +
        '<button class="mini-btn" data-anular="' + v.id_venta + '">anular</button></span>' +
      '</div>';
    });
  }
  if (r.pagos.length) {
    html += '<h4>Cobros de cuenta corriente</h4>';
    r.pagos.forEach(function (p) {
      html += '<div class="fila-detalle"><span>' + p.hora + ' · ' + esc(p.cliente) + ' · ' + esc(p.vendedor) +
        '</span><b>' + money(p.monto) + '</b></div>';
    });
  }
  if (r.movimientos.length) {
    html += '<h4>Ingresos y egresos</h4>';
    r.movimientos.forEach(function (m) {
      var signo = m.tipo === 'egreso' ? '-' : '+';
      html += '<div class="fila-detalle"><span>' + m.hora + ' · ' + esc(m.concepto || m.tipo) +
        '</span><b>' + signo + money(m.monto) + '</b></div>';
    });
  }
  if (!html) html = '<p style="color:#5f6368;margin-top:16px">Sin movimientos este día.</p>';
  $('#cajaDetalle').innerHTML = html;

  $all('[data-anular]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (!confirm('¿Anular la venta ' + b.dataset.anular + '? Se repone el stock.')) return;
      call('anularVenta', b.dataset.anular).then(function (rr) {
        DATA.productos = rr.productos; DATA.clientes = rr.clientes;
        renderProductos(); renderClientes();
        verCaja();
        toast('Venta anulada');
      }).catch(function (e) { toast(msg(e), true); });
    });
  });
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
    cargando(this, true);
    var btn = this;
    call('registrarMovimiento', { tipo: tipo, concepto: $('#moConcepto').value.trim(), monto: monto, vendedor: vendedor })
      .then(function () { cerrarModal(); toast('Registrado'); verCaja(); })
      .catch(function (e) { cargando(btn, false); toast(msg(e), true); });
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
