# cheKe

cheKe is an omnichannel inbox for Honduran businesses that sell through WhatsApp, Instagram and Facebook: every customer conversation in one place, so no sale gets missed.

## Tenancy

**Negocio**:
The top-level customer of cheKe: what is created, owns the plan and is billed. Contains one or more Tiendas.
_Avoid_: Empresa, organización, cuenta, business (in UI copy)

**Tienda**:
One branch of a Negocio, with its own channels, catalog, chekeo and analytics. A Negocio with a single Tienda never sees the word.
_Avoid_: Sucursal, local, store (in UI copy)

## People

**Dueño**:
A person with full access to a Negocio, every Tienda and billing. A Negocio can have several and always has at least one.
_Avoid_: Owner, admin

**Gerente**:
A person who administers the Tiendas assigned to them (channels, catalog, team), without billing.
_Avoid_: Manager, supervisor

**Agente**:
A person who answers conversations and moves deals in the Tiendas assigned to them.
_Avoid_: Vendedor, empleado, user

**Contacto**:
A customer of a Negocio, shared by all its Tiendas. Two contacts are the same person only when a phone number, Instagram account or Facebook account matches, or when merged by hand.
_Avoid_: Cliente (ambiguous with cheKe's own customers), lead

**Invitación**:
A single-use link that lets a person join a Negocio with a given role in given Tiendas.
_Avoid_: Código, invite code

**Tienda archivada**:
A closed Tienda: hidden from daily use, its history kept and reopenable.
_Avoid_: Tienda eliminada, borrada

## Selling

**Canal**:
One connected messaging account of a Tienda: a WhatsApp number, an Instagram account or a Facebook Page.
_Avoid_: Integración, red

**Conversación**:
The thread between one Contacto and one Canal. It belongs to that Canal's Tienda and is visible only to that Tienda's people and the Dueños.
_Avoid_: Chat (fine as the screen name), ticket

**chekeo**:
The sales board where each Conversación sits in a stage, from nuevo to ganado or perdido.
_Avoid_: Pipeline, CRM

**chekelin**:
cheKe's AI assistant that answers customers and sells on its own (photos, order, payment details, receipt) from what the Tienda gave it, and hands the chat to a person when it should.
_Avoid_: Bot, chatbot

**Lo que chekelin sabe**:
A Tienda's short answers that chekelin uses to sell: Formas de pago, Envíos, Horario de entregas, Cambios y devoluciones, Otras preguntas frecuentes, how it addresses customers (tú, vos, usted), and the Tienda's Ubicación (address and Google Maps pin: chekelin gives the address and sends the map when a customer asks; people send it from Chat). Edited by the Dueño or the Tienda's Gerente.
_Avoid_: Base de conocimiento, FAQ (as the page name)

**Queja**:
A customer complaint in a Conversación. It gets a red tag, alerts the Tienda's Gerente (or the Dueño), and keeps chekelin silent until a person marks it resolved.
_Avoid_: Reclamo, ticket, incidencia

**Confirmar pago**:
A person checking that a customer's payment arrived; it moves the deal to Ganado. chekelin can't see bank accounts, so it never confirms a payment itself.
_Avoid_: Marcar pagado, validar pago

**Traspaso**:
The moment chekelin hands a Conversación to a person, telling the customer who will help them.
_Avoid_: Handoff, escalamiento, transferencia

**Asignación**:
Which person is responsible for a Conversación right now. Only shown when a Negocio has two or more people.
_Avoid_: Ticket owner, dueño de la conversación

**Ausente**:
A person who receives no new Conversaciones for now (day off, vacation). Everyone is available unless marked Ausente.
_Avoid_: Offline, desconectado, no disponible

**Respuesta rápida**:
A saved reply of the Negocio that a person inserts in Chat by typing `/` and its atajo (e.g. `/horario`); `{nombre}` becomes the Contacto's name. Everyone uses them; Gerentes and Dueños edit them. Unlike a Plantilla, it is plain text the person can edit before sending, and it can't be sent outside the reply window.
_Avoid_: Atajo (that's only the `/word`), mensaje guardado, macro

**Plantilla de WhatsApp**:
A message Meta approved for a WhatsApp number, the only thing WhatsApp lets a business send once 24 hours passed since the customer's last message ("Enviar plantilla" in Chat). Its {{1}}, {{2}}… data are filled when sending. Created from a Plantilla with "Enviar a aprobación de WhatsApp"; type Utilidad or Promoción.
_Avoid_: Template (in UI copy), mensaje aprobado

**Sugerencia de chekelin**:
A Plantilla that chekelin proposes from questions the team keeps answering. It only becomes a Plantilla when a Gerente or Dueño approves it.
_Avoid_: Plantilla automática

**Coexistencia**:
A WhatsApp number connected to cheKe while the Negocio keeps using it in the WhatsApp Business app on its phone.
_Avoid_: Migración del número

## Plans

**Plan**:
What a Negocio pays for: cheKe, cheKe Plus or cheKe Pro.
_Avoid_: Suscripción (fine for billing), tier, paquete
