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
cheKe's AI assistant that answers customers from the Tienda's own catalog and templates until a person replies.
_Avoid_: Bot, chatbot

**Traspaso**:
The moment chekelin hands a Conversación to a person, telling the customer who will help them.
_Avoid_: Handoff, escalamiento, transferencia

**Asignación**:
Which person is responsible for a Conversación right now. Only shown when a Negocio has two or more people.
_Avoid_: Ticket owner, dueño de la conversación

**Ausente**:
A person who receives no new Conversaciones for now (day off, vacation). Everyone is available unless marked Ausente.
_Avoid_: Offline, desconectado, no disponible

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
