/* =====================================================================
   PRECIOS E IMPUESTOS DE SUR ESTRUCTURAL
   Este archivo lo usan la página (index.html) y el cobro con Mercado Pago
   (netlify/functions/crear-pago.js). Si cambias un precio aquí, cambia en ambos.

   - Todos los precios son NETOS, en pesos chilenos.
   - tiers: tramos por superficie ("max" = hasta cuántos m²; sin "max" = sin límite).
   - desde: precio "desde" (no se paga en línea; se cotiza antes).
   ===================================================================== */
var PRECIOS = {
  iva: 0.19,          // IVA para factura
  retencion: 0.1525,  // retención boletas de honorarios 2026 (2027: 0.16 · 2028: 0.17)

  productos: [
    {id:"VIV", code:"E-VIV", img:"vivienda", alt:"Casa de dos pisos en estructura de madera con andamios",
     name:"Casas y ampliaciones", desc:"Casas de 1 o 2 pisos, ampliaciones y regularizaciones en madera, albañilería, acero u hormigón.",
     inc:["Memoria de cálculo","Planos de fundaciones y estructura","Especificaciones técnicas","Respuesta a observaciones DOM"],
     tiers:[{max:60, price:390000},{max:140, price:500000},{max:500, price:700000}],
     over:"Más de 500 m²"},
    {id:"GAL", code:"E-GAL", img:"galpon", alt:"Estructura de acero de un galpón en montaje con grúa",
     name:"Galpones", desc:"Galpones industriales, agrícolas y bodegas en acero o madera laminada (NCh2369).",
     inc:["Diseño de marcos y arriostramientos","Placas base y fundaciones","Cubicación de acero","Respuesta a observaciones DOM"],
     tiers:[{max:2000, price:600000},{max:5000, price:900000},{price:1800000}],
     note:"Valores para galpones de planta rectangular. Otras geometrías se cotizan aparte."},
    {id:"MEN", code:"E-MEN", img:"obras-menores", alt:"Muro de contención de bloques de hormigón",
     name:"Obras menores", desc:"Muros de contención, piscinas, escaleras, losas, cobertizos, estanques y estructuras de soporte.",
     inc:["Memoria de cálculo","Plano de detalle","Firma del ingeniero"], desde:390000},
    {id:"REV", code:"E-REV", img:"revision", alt:"Edificio de hormigón con daños estructurales",
     name:"Informes y revisiones estructurales", desc:"Inspección de daños post-sismo, revisión de proyectos de terceros o informe estructural para banco.",
     inc:["Revisión de antecedentes o visita técnica","Informe con fotografías","Recomendaciones de refuerzo"], desde:390000}
  ],

  /* Producto de PRUEBA para hacer pagos reales con montos pequeños.
     Solo aparece abriendo la página con ?prueba al final de la dirección
     (ej.: https://www.surestructural.cl/?prueba) y solo se puede pagar si en Netlify
     existe la variable PERMITIR_PRUEBA = si. Bórrala al terminar las pruebas. */
  prueba: {id:"TEST", name:"Pago de prueba", price:100},

  /* Tipos de documento tributario */
  documentos: {
    FACTURA:   "Factura (+ IVA 19 %)",
    BOLETA_PN: "Boleta de honorarios · persona natural",
    BOLETA_EM: "Boleta de honorarios · empresa (retiene 15,25 %)"
  },

  /* A qué cuenta de Mercado Pago llega cada pago:
     EMPRESA = cuenta de la empresa (factura) · PERSONA = cuenta personal (boleta de honorarios) */
  cuentaPorDocumento: {
    FACTURA:   "EMPRESA",
    BOLETA_PN: "PERSONA",
    BOLETA_EM: "PERSONA"
  },

  tierLabel: function (p, i) {
    var t = p.tiers[i], prev = p.tiers[i - 1];
    var m2 = function (n) { return n.toLocaleString("es-CL") + " m²"; };
    return t.max ? "Hasta " + m2(t.max) : "Sobre " + m2(prev.max);
  },

  /* Calcula lo que paga el cliente a partir del total NETO y el documento.
     Boleta de honorarios: el monto bruto se obtiene DIVIDIENDO el neto por (1 - 0,1525),
     no multiplicando por 1,1525 (ese es el error común: deja al ingeniero recibiendo menos).
       bruto = neto / 0,8475  →  retención = bruto × 0,1525  →  bruto − retención = neto
     - Persona natural: no retiene; paga el bruto y el ingeniero entera la retención al SII.
     - Empresa: paga el neto (líquido) y ella retiene el 15,25 % y lo declara en su F29. */
  calcular: function (neto, doc) {
    var r = this.retencion;
    if (doc === "FACTURA") {
      var iva = Math.round(neto * this.iva);
      return {neto: neto, iva: iva, pagar: neto + iva, extra: iva, extraLabel: "IVA 19 %"};
    }
    // menor bruto entero cuyo líquido (bruto − retención redondeada) alcanza el neto
    var bruto = Math.floor(neto / (1 - r));
    while (bruto - Math.round(bruto * r) < neto) bruto++;
    var ret = Math.round(bruto * r);
    if (doc === "BOLETA_EM") {
      return {neto: neto, bruto: bruto, retencion: ret, pagar: neto, extra: 0,
              extraLabel: "Retención 15,25 % (la paga tu empresa al SII)"};
    }
    return {neto: neto, bruto: bruto, retencion: ret, pagar: bruto, extra: bruto - neto,
            extraLabel: "Retención boleta de honorarios 15,25 %"};
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = PRECIOS;
