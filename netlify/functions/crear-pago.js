/* Crea un cobro (preferencia de Checkout Pro) en Mercado Pago.
   Los montos se calculan aquí, en el servidor, con precios.js: el navegador solo envía
   qué productos y tramos eligió el cliente, nunca el precio.

   El pago llega a una de DOS cuentas de Mercado Pago según el documento:
     - Factura                → cuenta de la EMPRESA   (variable MP_ACCESS_TOKEN_EMPRESA)
     - Boleta de honorarios   → cuenta PERSONAL        (variable MP_ACCESS_TOKEN_PERSONA)

   Variables de entorno en Netlify (Site configuration → Environment variables):
     MP_ACCESS_TOKEN_EMPRESA   Access Token de la cuenta de la empresa
     MP_ACCESS_TOKEN_PERSONA   Access Token de tu cuenta personal
     PERMITIR_PRUEBA           "si" para aceptar el producto de prueba de $100 (bórrala después)
   Nunca escribas un token en este archivo. */

const PRECIOS = require("../../precios.js");

const json = (status, body) => ({
  statusCode: status,
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify(body)
});

const TOKENS = {
  EMPRESA: () => process.env.MP_ACCESS_TOKEN_EMPRESA,
  PERSONA: () => process.env.MP_ACCESS_TOKEN_PERSONA
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, {error: "Método no permitido"});

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch { return json(400, {error: "Solicitud inválida"}); }

  const {items, doc, nombre, email, comuna, rut} = data;
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) return json(400, {error: "El carrito está vacío"});
  if (!PRECIOS.documentos[doc]) return json(400, {error: "Elige un tipo de documento"});
  if (!nombre || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(400, {error: "Revisa tu nombre y correo"});
  if (doc !== "BOLETA_PN" && !String(rut || "").trim()) return json(400, {error: "Ingresa el RUT y la razón social"});

  // Cuenta de Mercado Pago que recibe el pago
  const cuenta = PRECIOS.cuentaPorDocumento[doc];
  const token = TOKENS[cuenta]();
  if (!token) return json(500, {error: "El pago en línea aún no está configurado para este tipo de documento."});

  // Precio de cada ítem según el catálogo (solo tramos de precio fijo se pagan en línea)
  const lineas = [];
  for (const it of items) {
    if (it.id === PRECIOS.prueba.id) {
      if (String(process.env.PERMITIR_PRUEBA || "").toLowerCase() !== "si") return json(400, {error: "El pago de prueba no está habilitado."});
      lineas.push({id: "TEST", title: `${PRECIOS.prueba.name} · Sur Estructural`, quantity: 1, currency_id: "CLP", unit_price: PRECIOS.prueba.price});
      continue;
    }
    const p = PRECIOS.productos.find(x => x.id === it.id);
    const t = p && p.tiers && p.tiers[it.tier];
    if (!t) return json(400, {error: "Hay un proyecto que se cotiza antes de pagar"});
    lineas.push({
      id: `${p.id}-${it.tier}`,
      title: `Cálculo estructural · ${p.name} · ${PRECIOS.tierLabel(p, it.tier).toLowerCase()}`,
      quantity: 1,
      currency_id: "CLP",
      unit_price: t.price
    });
  }

  const neto = lineas.reduce((s, l) => s + l.unit_price, 0);
  const c = PRECIOS.calcular(neto, doc);
  if (c.extra > 0) {
    lineas.push({id: doc, title: c.extraLabel, quantity: 1, currency_id: "CLP", unit_price: c.extra});
  }

  const sitio = process.env.URL || "https://www.surestructural.cl";
  const ref = "SE-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const [first, ...rest] = String(nombre).trim().split(/\s+/);

  const preferencia = {
    items: lineas,
    payer: {name: first, surname: rest.join(" "), email},
    external_reference: ref,
    statement_descriptor: "SURESTRUCTURAL",
    back_urls: {
      success: `${sitio}/gracias.html`,
      pending: `${sitio}/gracias.html`,
      failure: `${sitio}/gracias.html`
    },
    auto_return: "approved",
    metadata: {
      documento: PRECIOS.documentos[doc],
      cuenta: cuenta,
      rut_razon_social: rut || "",
      comuna: comuna || "",
      neto,
      bruto_boleta: c.bruto || null,
      retencion: c.retencion || null,
      iva: c.iva || null
    }
  };

  try {
    const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {"Authorization": `Bearer ${token}`, "Content-Type": "application/json"},
      body: JSON.stringify(preferencia)
    });
    const out = await r.json();
    if (!r.ok || !out.init_point) {
      console.error("Mercado Pago respondió", cuenta, r.status, JSON.stringify(out));
      return json(502, {error: "Mercado Pago no pudo crear el cobro. Intenta de nuevo o escríbenos por WhatsApp."});
    }
    return json(200, {url: out.init_point, referencia: ref, total: c.pagar});
  } catch (e) {
    console.error(e);
    return json(502, {error: "No pudimos conectar con Mercado Pago. Intenta de nuevo en unos minutos."});
  }
};
