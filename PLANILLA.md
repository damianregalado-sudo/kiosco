# Planilla modelo — estructura y datos de ejemplo

La función `setup()` de `Code.gs` crea todo esto automáticamente. Este documento
es la referencia de qué significa cada hoja y cada columna, por si querés mirar o
corregir datos a mano en Google Sheets.

> **Regla de oro:** no cambies los **nombres de las hojas** ni los **títulos de la
> fila 1**. El resto se puede editar.

---

## Hoja `Productos`

Un renglón por producto.

| Columna | Qué va | Ejemplo | Notas |
|---|---|---|---|
| `codigo` | Código de barras de fábrica | `7790895000133` | Texto. Se completa escaneando o a mano. Único. |
| `nombre` | Nombre del producto | `Coca-Cola 500ml` | |
| `precio` | Precio final de venta (IVA incluido) | `1200` | Solo el número, sin `$`. |
| `stock` | Unidades disponibles | `24` | Baja solo con cada venta. |
| `categoria` | Rubro (opcional) | `Bebidas` | Sirve para ordenar/buscar. |
| `activo` | `SI` / `NO` | `SI` | `NO` = deja de aparecer para vender pero no se borra. |

### Datos de ejemplo cargados

| codigo | nombre | precio | stock | categoria | activo |
|---|---|---|---|---|---|
| 7790895000133 | Coca-Cola 500ml | 1200 | 24 | Bebidas | SI |
| 7790895001114 | Agua mineral 500ml | 800 | 30 | Bebidas | SI |
| 7790070410733 | Alfajor Jorgito | 650 | 40 | Golosinas | SI |
| 7622300740290 | Chocolate Milka 100g | 2500 | 12 | Golosinas | SI |
| 7791293034125 | Papas fritas Lays 75g | 1900 | 15 | Snacks | SI |
| 7790040991309 | Galletitas Oreo 118g | 1400 | 18 | Galletitas | SI |
| 7790387012354 | Cigarrillos Marlboro box | 3200 | 20 | Cigarrillos | SI |
| 7791234567890 | Chicle Beldent | 400 | 50 | Golosinas | SI |
| 7790010000010 | Yerba Playadito 1kg | 3800 | 8 | Almacén | SI |
| 7790001112223 | Pan de mesa Bimbo | 2600 | 6 | Panificados | SI |

> Los códigos de barra son de ejemplo con formato real (EAN-13). Al cargar tus
> productos, escaneá el código verdadero de cada uno.

---

## Hoja `Clientes`

Un renglón por cliente de cuenta corriente ("fiado").

| Columna | Qué va | Ejemplo | Notas |
|---|---|---|---|
| `id` | Identificador | `C001` | Lo genera la app (`C003`, `C004`…). No lo cambies. |
| `nombre` | Nombre y apellido | `Juan Pérez` | |
| `telefono` | Teléfono (opcional) | `11-5555-1234` | |
| `saldo` | Cuánto debe hoy | `0` | **Positivo = debe.** La app lo actualiza sola con cada venta fiada y cada pago. |
| `notas` | Aclaración libre | `Vecino del 3° B` | |

### Datos de ejemplo cargados

| id | nombre | telefono | saldo | notas |
|---|---|---|---|---|
| C001 | Juan Pérez | 11-5555-1234 | 0 | Vecino del 3° B |
| C002 | Marta Gómez | 11-4444-9876 | 0 | Paga los viernes |

---

## Hoja `Ventas`

Un renglón por venta (la cabecera). El detalle de productos va en `Ventas_Items`.
**La app escribe acá sola. No cargar a mano.**

| Columna | Qué es |
|---|---|
| `id_venta` | `V00001`, `V00002`… |
| `fecha` | `2026-09-08` (aaaa-mm-dd) |
| `hora` | `14:35` |
| `vendedor` | Nombre elegido en la app |
| `total` | Total cobrado |
| `forma_pago` | `efectivo` o `cuenta` |
| `paga_con` | Con cuánto pagó (si se cargó) |
| `vuelto` | Vuelto entregado |
| `cliente` | Nombre del cliente (si fue fiado) |
| `anulada` | `NO` normal · `SI` si se anuló |
| `notas` | Libre |

---

## Hoja `Ventas_Items`

Un renglón por producto dentro de cada venta. **La app escribe acá sola.**

| Columna | Qué es |
|---|---|
| `id_venta` | A qué venta pertenece (`V00001`) |
| `codigo` | Código del producto |
| `nombre` | Nombre en el momento de la venta |
| `cantidad` | Unidades |
| `precio_unit` | Precio unitario cobrado |
| `subtotal` | `cantidad × precio_unit` |

---

## Hoja `Pagos`

Un renglón por pago que hace un cliente a su cuenta corriente. **La app escribe acá sola.**

| Columna | Qué es |
|---|---|
| `id_pago` | `P00001`… |
| `fecha` / `hora` | Cuándo |
| `id_cliente` | `C001` |
| `cliente` | Nombre |
| `monto` | Cuánto pagó |
| `vendedor` | Quién lo cobró |
| `notas` | Libre |

---

## Hoja `Movimientos`

Ingresos o egresos de caja que **no** son ventas (pago a un repartidor, retiro de
plata, aporte de cambio, etc.). Se cargan desde la pestaña **Caja** de la app.

| Columna | Qué es |
|---|---|
| `id_mov` | `M00001`… |
| `fecha` / `hora` | Cuándo |
| `tipo` | `ingreso` o `egreso` |
| `concepto` | Descripción (ej: "pago gaseosas") |
| `monto` | Importe (siempre positivo; el tipo dice si suma o resta) |
| `vendedor` | Quién lo cargó |

---

## Hoja `Config`

Ajustes de la app. Editá solo la columna `valor`.

| clave | valor de ejemplo | Para qué |
|---|---|---|
| `nombre_kiosco` | `Kiosco de la esquina` | Título que se ve arriba en la app. |
| `moneda` | `$` | Símbolo delante de los precios. |
| `vendedores` | `María, Ana` | Nombres del selector "Vende", separados por coma. |
| `contador_venta` | `0` | Último número de venta usado. **No tocar.** |
| `contador_cliente` | `2` | Último número de cliente. **No tocar.** |
| `contador_pago` | `0` | **No tocar.** |
| `contador_mov` | `0` | **No tocar.** |

---

## Cómo se calcula la "caja del día"

```
Efectivo que tiene que haber en la caja =
      ventas en efectivo del día
    + cobros de cuenta corriente del día
    + ingresos extra (hoja Movimientos, tipo ingreso)
    - egresos / gastos (hoja Movimientos, tipo egreso)
```

Las **ventas fiadas** no suman efectivo (el cliente no pagó todavía): se ven aparte
como "Fiado del día".
