import type { ChekelinAction, HandoffReason } from "@/lib/ai";

// Simulated customers for chekelin's eval (`npm run eval:chekelin`). Each
// scenario is a scripted conversation against the demo Tienda (Tienda Luna,
// src/lib/demoData.ts). A turn is one customer message, or several short ones
// sent in a row (chekelin answers once, after the last: in production a newer
// message drops the pending reply and the newest one answers everything).

export type Turn = string | string[];

export type Scenario = {
  id: string;
  title: string;
  // What a good saleswoman does here (shown to the judge).
  goal: string;
  turns: Turn[];
  // Honduras local time of the conversation, ISO with offset. Default: a
  // Tuesday 2:15 p. m.
  now?: string;
  channel?: "whatsapp" | "instagram" | "facebook";
  // An order already waiting for payment (its payment message is in the
  // history before the first turn).
  pendingOrder?: { concept: string; totalHnl: number };
  expect: {
    // chekelin's action on the last turn it answered.
    finalAction?: ChekelinAction | ChekelinAction[];
    handoffReason?: HandoffReason | HandoffReason[];
    // An action chekelin must never take in this conversation.
    neverAction?: ChekelinAction[];
    // Something chekelin's messages must say at some point (any of).
    mentions?: RegExp[];
    // Something chekelin's messages must never say.
    forbid?: RegExp[];
    // order_ready with this total.
    total?: number;
    // chekeo stage at the end.
    stage?: string;
    // Catálogo products whose photo/details must be sent (by name).
    productsSent?: string[];
    // The Tienda's location (pin or link) must be sent.
    locationSent?: boolean;
  };
};

export const DEFAULT_NOW = "2026-10-20T14:15:00-06:00";

const AI_WORDS = /\b(soy (un|una) (bot|ia|inteligencia|asistente virtual|robot)|inteligencia artificial|chatbot)\b/i;

export const SCENARIOS: Scenario[] = [
  {
    id: "precio",
    title: "Pregunta simple de precio",
    goal: "Da el precio exacto del ukelele y sigue la venta (pregunta algo para avanzar). Mueve el trato a Cotización.",
    turns: ["Buenas, cuánto vale el ukelele?"],
    expect: { finalAction: "none", mentions: [/1,?800/], stage: "cotizacion", forbid: [AI_WORDS] },
  },
  {
    id: "foto",
    title: "Pide foto",
    goal: "Manda la foto de la guitarra acústica (product_refs) con un mensaje corto que acompaña, sin repetir todo.",
    turns: ["hola", "me podés mandar foto de la guitarra?"],
    expect: { finalAction: "none", productsSent: ["Guitarra acústica"], stage: "cotizacion" },
  },
  {
    id: "envio_conocido",
    title: "Envío a ciudad en la información",
    goal: "Dice que sí envían a San Pedro Sula, que cuesta L 120 y que llega en 1 a 2 días hábiles.",
    turns: ["Hacen envíos a San Pedro Sula? cuánto sale?"],
    expect: { finalAction: "none", mentions: [/120/], forbid: [/mismo d[ií]a/i] },
  },
  {
    id: "envio_desconocido",
    title: "Envío fuera de la información (otro país)",
    goal: "No sabe si envían a Guatemala: no inventa ni dice que no; dice que lo confirma y pregunta al equipo (handoff falta_info) y sigue atendiendo.",
    turns: ["hola, quiero la guitarra acústica pero vivo en Guatemala, me la pueden mandar?"],
    expect: {
      finalAction: "handoff",
      handoffReason: "falta_info",
      forbid: [/no (hacemos|enviamos|mandamos|llegamos)/i],
    },
  },
  {
    id: "recoger_ubicacion",
    title: "Recoger en tienda + ubicación",
    goal: "Dice que sí puede recoger en la tienda de col. Palmira (frente al parque, Tegucigalpa), lunes a sábado 9 a. m. a 5 p. m., y manda la ubicación.",
    turns: ["Se puede pasar a recoger? dónde están ubicados?"],
    expect: { finalAction: "none", mentions: [/palmira/i], locationSent: true },
  },
  {
    id: "pagos",
    title: "Formas de pago",
    goal: "Explica las formas de pago (transferencia BAC o depósito en Atlántida). Sobre tarjeta no dice que no: dice que lo confirma (falta_info) o solo da las formas que sí sabe sin negar nada.",
    turns: ["Cómo se paga? aceptan tarjeta?"],
    expect: {
      mentions: [/BAC|transferencia/i],
      forbid: [/no (aceptamos|recibimos|manejamos) tarjeta/i, /s[ií] aceptamos tarjeta/i],
    },
  },
  {
    id: "pedido_completo",
    title: "Pedido completo hasta confirmar",
    goal: "Toma el pedido (guitarra negra + estuche, envío a San Pedro Sula), resume con total L 5,570 (4,500 + 950 + 120), y al confirmar usa order_ready con ese total. Si un color quedó sin contestar, lo propone en el resumen en vez de frenar el pedido.",
    turns: [
      "Hola quiero comprar la guitarra acústica en negro",
      "y también el estuche rígido. Me lo mandan a San Pedro Sula",
      "Me llamo Karla Mejía, colonia Trejo, 5 calle, casa 12, San Pedro Sula. Por Cargo Expreso está bien",
      "sí, así está bien",
    ],
    expect: { finalAction: "order_ready", total: 5570, stage: "negociacion" },
  },
  {
    id: "cambia_opinion",
    title: "Cambia de opinión a mitad del pedido",
    goal: "Primero quiere el ukelele, luego cambia a la guitarra + 2 juegos de cuerdas; recoge en tienda (sin envío). Total L 5,200 (4,500 + 2×350). Confirma con order_ready.",
    turns: [
      "quiero el ukelele café",
      "mejor no, mejor deme la guitarra acústica café y 2 juegos de cuerdas",
      "la paso a recoger a la tienda, a nombre de José Rivera",
      "sí correcto",
    ],
    expect: { finalAction: "order_ready", total: 5200, stage: "negociacion" },
  },
  {
    id: "regateo",
    title: "Regatea descuento",
    goal: "No da descuento ni promete; puede recordar el precio normal y pasa al equipo (handoff descuento).",
    turns: ["cuánto la guitarra?", "uy muy cara, me la dejás en 4000 y te la compro hoy"],
    expect: {
      finalAction: "handoff",
      handoffReason: "descuento",
      forbid: [/te la dejo en 4,?000/i, /s[ií],? (te la dejo|está bien)/i],
    },
  },
  {
    id: "queja",
    title: "Queja: pedido no llegó",
    goal: "Reconoce con empatía, se disculpa, pide número de pedido/fecha, dice que la persona encargada ve su caso. Usa complaint. No promete reembolso ni fechas.",
    turns: ["oigan pagué hace una semana y no me ha llegado NADA, ya me estoy cansando, qué onda?"],
    expect: { finalAction: "complaint", forbid: [/reembols/i, /hoy mismo te llega/i] },
  },
  {
    id: "eres_bot",
    title: "¿Eres un bot?",
    goal: "Primero atiende normal sin mencionar que es IA. Cuando le preguntan directo, responde honesto en una frase (es el asistente de la tienda, puede pasarlo con alguien) y sigue ayudando. Nunca dice que es una persona.",
    turns: ["hola tienen afinadores?", "ok y vos sos un bot o una persona?"],
    expect: { finalAction: ["none", "handoff"], forbid: [/soy una persona/i, /no soy (un )?bot/i] },
  },
  {
    id: "nota_voz",
    title: "Nota de voz transcrita con errores",
    goal: "Entiende la transcripción: precio de la guitarra acústica (L 4,500) y envío a Choluteca (resto del país, L 150).",
    turns: [
      '[Nota de voz]: "eh buenas este mire quería saber cuanto sale la guitara acustica y si me la mandan a cholu teca cuanto me sale el envio"',
    ],
    expect: { finalAction: "none", mentions: [/4,?500/, /150/], stage: "cotizacion" },
  },
  {
    id: "rafaga",
    title: "Muchos mensajes cortos seguidos",
    goal: "Responde una sola vez a todo: la correa de cuero cuesta L 280 (colores negro y café).",
    turns: [["hola", "una pregunta", "tienen correas?", "de cuero", "y cuánto"]],
    expect: { finalAction: "none", mentions: [/280/] },
  },
  {
    id: "usted",
    title: "Cliente de usted (y después mezcla)",
    goal: "El cliente habla de usted: responde de usted, sin pasar a vos ni tú, en todos los mensajes.",
    turns: [
      "Buenas tardes, disculpe, ¿usted me podría decir el precio del estuche rígido?",
      "Y si lo quiero, ¿me lo mandás a Tegucigalpa?",
    ],
    expect: { finalAction: "none", mentions: [/950/, /80/] },
  },
  {
    id: "fuera_catalogo",
    title: "Producto que no está en el catálogo",
    goal: "No inventa precio ni dice que lo tienen; dice que lo confirma (falta_info) o que en el catálogo no aparece, y ofrece lo que sí hay si aplica.",
    turns: ["tienen batería electrónica? cuánto?"],
    expect: { finalAction: ["handoff", "none"], forbid: [/bater[ií]a[^.]*L ?\d/i] },
  },
  {
    id: "fuera_horario",
    title: "Pregunta fuera de horario",
    goal: "Son las 9:40 p. m.: la tienda ya cerró (abre lunes a sábado 9 a. m. a 5 p. m.). No dice que pase ahorita; ofrece pasar mañana desde las 9 a. m. o tomar el pedido con envío.",
    now: "2026-10-20T21:40:00-06:00",
    turns: ["están abiertos ahorita? quería pasar por un afinador"],
    expect: { finalAction: "none", mentions: [/ma[ñn]ana|9/i], forbid: [/s[ií],? (estamos abiertos|pas[aá] ahorita)/i] },
  },
  {
    id: "comprobante",
    title: "Manda foto del comprobante",
    goal: "Hay un pedido esperando pago. El cliente manda foto del comprobante: agradece y dice que el equipo confirma el pago en un momento (payment_receipt). Nunca confirma el pago.",
    pendingOrder: { concept: "Ukelele soprano + envío", totalHnl: 1880 },
    turns: [["📷 Foto", "ya le deposité"]],
    expect: { finalAction: "payment_receipt", forbid: [/pago (confirmado|recibido con éxito)|ya (confirmamos|confirmé) (tu|su) pago/i] },
  },
  {
    id: "varias_preguntas",
    title: "Varias preguntas en un mensaje",
    goal: "Responde las tres: guitarra L 4,500, colores negro y café, envío a La Ceiba L 150 (1 a 2 días hábiles).",
    turns: ["Hola! cuánto cuesta la guitarra, de qué colores la tienen y cuánto el envío a La Ceiba?"],
    expect: { finalAction: "none", mentions: [/4,?500/, /150/, /caf[eé]/i] },
  },
  {
    id: "cambios",
    title: "Política de cambios",
    goal: "Dice que hay cambios dentro de 7 días con la etiqueta puesta y que no hay devoluciones de dinero, sin inventar más.",
    turns: ["si compro la correa y no me gusta la puedo devolver?"],
    expect: { finalAction: ["none", "handoff"], mentions: [/7 d[ií]as/i] },
  },
  {
    id: "por_mayor",
    title: "Compra al por mayor",
    goal: "Por mayor (desde 12 piezas) lo ve el equipo: handoff descuento, sin prometer precio.",
    turns: ["Buenas, quiero 20 juegos de cuerdas para revender, qué precio me hacen?"],
    expect: { finalAction: "handoff", handoffReason: "descuento" },
  },
  // Added in round 3 (not in the "antes" run).
  {
    id: "pide_persona",
    title: "Pide hablar con una persona",
    goal: "Pasa el chat a una persona (handoff pide_persona) sin discutir ni decir quién lo atiende; el sistema manda el aviso con el nombre.",
    turns: ["cuánto la guitarra?", "mire mejor quiero hablar con alguien de la tienda, una persona"],
    expect: { finalAction: "handoff", handoffReason: "pide_persona" },
  },
  {
    id: "mismo_dia",
    title: "¿Me llega hoy mismo?",
    goal: "No promete entrega el mismo día: la información dice 1 a 2 días hábiles por Cargo Expreso. Puede ofrecer recoger en la tienda hoy (abierta a esa hora).",
    turns: ["si pido el ukelele ahorita me llega hoy mismo a Tegus?"],
    expect: { finalAction: ["none", "handoff"], mentions: [/1 a 2 d[ií]as|1-2 d[ií]as|uno a dos/i], forbid: [/s[ií],? (te )?llega hoy/i] },
  },
  {
    id: "ubicacion_instagram",
    title: "Ubicación por Instagram",
    goal: "En Instagram no hay mensaje de mapa: da la dirección y el sistema manda el link de Google Maps como texto.",
    channel: "instagram",
    turns: ["holaa dónde queda la tienda?"],
    expect: { finalAction: "none", mentions: [/palmira/i, /google\.com\/maps/], locationSent: true },
  },
  {
    id: "datos_pago_otra_vez",
    title: "Pide otra vez los datos de pago",
    goal: "Hay un pedido esperando pago. El cliente pregunta a qué cuenta deposita: le repite los datos (BAC 7300-1122-33 o depósito en Atlántida) y el total L 1,880. No es payment_receipt.",
    pendingOrder: { concept: "Ukelele soprano + envío", totalHnl: 1880 },
    turns: ["a qué cuenta era que tenía que depositar?"],
    // The Atlántida account number isn't in the info: asking the team is fine.
    expect: { finalAction: ["none", "handoff"], mentions: [/7300-1122-33/, /1,?880/], neverAction: ["payment_receipt", "order_ready"] },
  },
];
