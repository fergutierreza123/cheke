# respond.io por dentro: cómo se ve y cómo se usa, y qué ajustar en cheke

Investigación del 27 de octubre de 2026. `respond-io-gap.md` responde **qué funciones** tiene respond.io. Este documento responde **cómo se ven y cómo se usan**: qué hay en pantalla, cuántos toques lleva cada cosa y qué palabras usan. Al final hay una lista de ajustes a la pantalla de cheke, ordenada por prioridad.

Fuentes: solo páginas de respond.io. Se leyeron su centro de ayuda (`respond.io/help`, en la versión `.md` de cada artículo), sus páginas de producto, su changelog (`roadmap.respond.io`) y su canal de YouTube (@respondio). El código de cheke se leyó en `main` después del PR #99.

**Lo que no se pudo ver:**
- **Capturas.** Los artículos de ayuda traen capturas, pero solo se leyó el texto y el texto alternativo de las imágenes. Lo de diseño (colores, posiciones) sale de lo que dice ese texto, no de mirar la pantalla.
- **YouTube.** Se leyeron los títulos, las descripciones y los capítulos de los videos. Las transcripciones no se pudieron bajar porque YouTube las bloquea sin sesión iniciada.
- **LinkedIn.** No se pudo leer sin sesión. No se usa como fuente.

**Confianza:**
- **A (alta):** está en un artículo de ayuda de respond.io o en el código de cheke.
- **M (media):** viene de una página de producto, del changelog o de la descripción de un video (es material de venta).
- **B (baja):** es una inferencia mía.

---

## Resumen

1. **La bandeja de respond.io tiene 3 columnas.** A la izquierda, un panel con bandejas: **All, Mine, Unassigned** y **Collaborations**, más bandejas de equipo y personalizadas. En el centro está la lista de chats con un filtro **Open/Closed/Snoozed** y un interruptor **Unreplied**. A la derecha, una barra con pestañas: **Contact details, Activities, Attachments**. Por defecto la lista abre en "All", con lo más nuevo arriba (A).
2. **Las notas internas se llaman "Comments"** y van **dentro del hilo**, en orden con los mensajes. También salen en la pestaña Activities. Se escriben con **"Add comment"** debajo del cuadro de texto, con @mención y adjuntos. En el teléfono es un **ícono amarillo** que cambia entre escribirle al cliente y escribirle al equipo (A).
3. **Cuando el agente de IA pasa el chat a una persona, no se genera una nota sola.** El dueño tiene que pedirle al agente, en sus instrucciones, que deje un comentario. respond.io recomienda que sea **"corto y fácil de leer: qué quiere el cliente, el contexto y el siguiente paso"**, con @mención a una persona concreta. El tope es de 2,000 caracteres (A).
4. **"Cerrar" es el centro del flujo.** Cada chat está **abierto, cerrado o pospuesto**. Al cerrarlo se puede dejar una "Closing Note" con categoría y resumen, que la IA puede llenar. También se puede cerrar solo después de 24 h sin respuesta del cliente (A). **Esto es lo que más le falta a cheke** para que la lista no crezca sin fin.
5. **Para cheke:** copiar cuatro cosas: las bandejas *Míos / Sin asignar*, el filtro *Sin responder*, un *Listo* (cerrar) muy simple y una nota de Traspaso con *siguiente paso*. No copiar colaboradores, bandejas personalizadas, categorías de cierre, posponer ni la paleta de comandos.

---

## 1. Bandeja: lista de chats

| Qué | Cómo lo hace respond.io | Fuente |
|---|---|---|
| Bandejas (panel izquierdo) | La bandeja estándar tiene **All**, **Mine** y **Unassigned**, más **Collaborations** (solo para ti). También hay *Team Inbox*, *Custom Inbox* (filtros guardados) y *Blocked Contacts*. Un Agente con acceso limitado solo ve Mine y Collaborations | [Getting Started with Inbox](https://respond.io/help/inbox/getting-started-with-inbox) (A) |
| Punto de "nuevo" | Un **punto azul** en la bandeja que cuenta **chats, no mensajes**. Sale en una sola bandeja, con este orden de prioridad: **Mine > Team > Unassigned > All**. Se quita al abrir la bandeja. También muestra cuántos chats abiertos hay | ídem (A) |
| Filtro y orden | Un menú con **All / Open / Closed / Snoozed** y el orden **Newest / Oldest / Longest / Shortest**. Hay "Advanced filters" que se pueden guardar como bandeja propia | [Filtering and Sorting](https://respond.io/help/inbox/filtering-and-sorting-conversations-in-inbox) (A) |
| **Unreplied** | Un **interruptor junto al filtro**: muestra los chats cuyo último mensaje es del cliente. **Los mensajes automáticos cuentan como respuesta; las difusiones no.** En el teléfono es un botón abajo a la derecha | ídem (A); [Messaging from your mobile](https://respond.io/help/mobile-app/messaging-from-your-mobile) (A) |
| Qué trae cada chat de la lista | Estado (**Closed** o **Snoozed** abajo a la izquierda; si está abierto no lleva etiqueta), **ícono del canal sobre la foto**, **número de no leídos en un círculo azul** a la derecha, último mensaje con hora (o fecha si es viejo) y **una flecha según quién escribió: azul hacia arriba si fue el equipo, naranja hacia abajo si fue el cliente**. El chat elegido se pinta de azul | [Managing Conversations](https://respond.io/help/inbox/managing-conversations-in-inbox) (A) |
| Acciones rápidas | Un menú en cada chat: **Close, Close with notes, Snooze, Shortcuts, Assign, Collaborators, Lifecycle**. En el teléfono se desliza el chat: **a la izquierda para Close y a la derecha para Snooze** | ídem (A); [mobile](https://respond.io/help/mobile-app/messaging-from-your-mobile) (A) |
| No leídos | El número desaparece después de 90 días sin actividad. Es "un indicador útil, no un registro permanente" | [Managing Conversations](https://respond.io/help/inbox/managing-conversations-in-inbox) (A) |
| Escribiendo… | El cliente ve "escribiendo…" en WhatsApp, TikTok y Telegram. **Los compañeros ven quién más está escribiendo**, para no responder dos veces | ídem (A) |

**cheke hoy** (`ChatView.tsx:1286-1410`): buscador, chips de canal (Todos, WhatsApp, Instagram, Facebook), chip **No leídos** con contador y filtro de Tienda. Cada chat de la lista muestra iniciales con el ícono del canal, nombre, hora, último mensaje, etiqueta de Queja, Tienda y el número de no leídos en menta. **No hay** Míos ni Sin asignar, **no se sabe quién escribió el último mensaje** y **no se ve quién atiende** cada chat desde la lista.

---

## 2. Notas internas y traspaso de la IA a una persona

### Cómo se ven las notas (Comments)

- **Dónde:** dentro del hilo, en orden con los mensajes, junto con los **eventos del chat**: "User Assigned by AI Agent", "Conversation Closed (AI Agent)", "Lifecycle Stage added by AI Agent", etc. También se listan en la pestaña **Activities**, de lo más nuevo a lo más viejo, con filtro por fecha. Ni las notas ni los eventos los ve el cliente ([Collaborating](https://respond.io/help/inbox/collaborating-with-your-team-in-inbox), [Activities](https://respond.io/help/contacts/activities), A).
- **Cómo se escriben:** 1) abrir el chat; 2) tocar **"Add comment"** debajo del cuadro de texto; 3) escribir; 4) teclear **@** y elegir al compañero; 5) adjuntar si hace falta (hasta 50 archivos). En el teléfono: **"toca el ícono amarillo de comentario… y vuelve al chat con el ícono azul"** ([mobile](https://respond.io/help/mobile-app/messaging-from-your-mobile), A). **Así separan las notas de los mensajes: el modo nota tiene otro color (amarillo).**
- **@mención:** avisa a la persona. Si la opción está encendida, también **la agrega como colaboradora** del chat. La persona mencionada puede tocar **Reply** en la nota ([Conversations settings](https://respond.io/help/workspace-settings/conversations), [Activities](https://respond.io/help/contacts/activities), A).
- **Resumir:** el botón **Summarize**, abajo a la derecha del cuadro de texto, arma un **borrador de nota** con el resumen. La persona lo revisa y lo publica. El changelog dice que el resumen sale **"en viñetas"** y **"con un clic"**. Lee hasta 100 mensajes ([Collaborating](https://respond.io/help/inbox/collaborating-with-your-team-in-inbox), A; [changelog](https://roadmap.respond.io/changelog/summarize-conversations-instantly), M).
- **Buscar:** el buscador de la bandeja tiene los botones **Contacts / Message / Comment**, así que se puede buscar dentro de las notas ([Managing Contacts in Inbox](https://respond.io/help/inbox/managing-contacts-in-inbox), A).

### Qué ve la persona cuando la IA le pasa el chat

- **La nota de traspaso no es automática.** Es una acción opcional del agente de IA, "Add comments", que el dueño tiene que pedir en las instrucciones. Por ejemplo: *"If you escalate to a human agent, add an internal comment summarizing the issue, what's been done, and tag @Jane Doe. Then assign the conversation to @Support Team."* ([AI Agent Action: Add comments](https://respond.io/help/ai-skills/ai-agent-action-add-comments), A).
- **Formato que recomiendan:** *"Keep comments short and scannable (e.g., intent + context + recommended next step)"*. El tope es de **2,000 caracteres**. La IA solo puede @mencionar a personas, no a equipos (ídem, A). En sus plantillas de agente aparece "assign to @Sales Team **with a 1-sentence summary**" ([Getting started with AI Agents](https://respond.io/help/ai-agents/getting-started-with-ai-agents), A).
- **Lo que siempre aparece:** el evento **"User Assigned by AI Agent"** en el hilo (A). El video oficial dice que el traspaso lleva "quién es, qué quiere y qué se ha dicho" ([YouTube OdkLv8r_3aM](https://www.youtube.com/watch?v=OdkLv8r_3aM), solo descripción, M).
- **Takeover:** mientras la IA atiende, el cuadro de texto queda **bloqueado para las personas** y en su lugar aparece un aviso **"Takeover"**. Un clic detiene a la IA y te asigna el chat ([Getting started with AI Agents](https://respond.io/help/ai-agents/getting-started-with-ai-agents), [limitaciones](https://respond.io/help/ai-agents/ai-agents-known-limitations-and-workarounds), A).
- **La IA no lee las notas internas.** Solo ve los últimos 20 mensajes ([limitaciones](https://respond.io/help/ai-agents/ai-agents-known-limitations-and-workarounds), A).

**cheke hoy:**
- `NoteStrip.tsx`: **una sola línea arriba del hilo** con quién escribió y la nota cortada, un "+N" y un "@" si te mencionan. Al tocarla se abre una hoja con todas las notas, de la más nueva a la más vieja.
- chekelin escribe `team_summary`: **1 oración de 120 letras como máximo** (`src/lib/ai.ts:205,305`). El motivo del traspaso va aparte (`bot.ts:352-358`, `HANDOFF_REASON_LABEL`) y **solo se ve dentro de la hoja**, debajo del texto.
- Las personas escriben con "Nota para el equipo" y su barra "· el cliente no la ve" (`NoteComposerBar`). La @mención avisa por push (PR #89).
- **Lo que cheke hace mejor:** la nota la escribe chekelin solo, sin que el dueño configure nada, y no ensucia el hilo.
- **Lo que le falta:** en la línea se lee "chekelin: …" pero **no el motivo** ("Pidió descuento"); la nota **no dice qué hacer después**; **no menciona a la persona asignada**; y el hilo **no marca en qué momento** pasó el traspaso.

---

## 3. Panel del contacto (derecha)

| respond.io | Fuente |
|---|---|
| Se abre con el ícono de detalles o tocando la foto. Arriba: nombre (con lápiz para editar) e ID | [Contact Details](https://respond.io/help/contacts/contact-details) (A) |
| Campos fijos: nombre, apellido, país, idioma, correo, teléfono, **Assigned To**, **Conversation Status**, y después los campos personalizados | ídem (A) |
| **Etiquetas al final del panel**, con un "+" para agregar | ídem (A) |
| Pestaña **Channels**: canales activos, inactivos ("Send first message") y no disponibles. Tarjeta de **Merge suggestions** si hay contactos repetidos | ídem (A) |
| Pestañas **Activities** (notas y eventos), **Attachments** (todos los archivos del chat) y Call activities | [Getting Started with Inbox](https://respond.io/help/inbox/getting-started-with-inbox) (A) |
| Si el cliente vino de un anuncio: un evento con el enlace al anuncio y una **tarjeta "Ad Summary"** que se puede abrir | [Activities](https://respond.io/help/contacts/activities) (A) |
| La etapa (Lifecycle) se cambia desde el menú de acciones rápidas | [Managing Conversations](https://respond.io/help/inbox/managing-conversations-in-inbox) (A) |

**cheke hoy** (`ChatView.tsx:2396-2475`): un panel que se abre con el botón (i). Muestra iniciales, nombre, teléfono o usuario, "Conversación desde…", "Vino de un anuncio" (con enlace), **Etiquetas** editables y **Notas** del contacto (solo para leer). El **Estado de venta** ya está arriba del hilo, a un toque, y eso es mejor que respond.io. **Le falta:** quién lo atiende, sus **compras anteriores** y, si escribió por varios canales, los otros chats.

---

## 4. Asignación, traspaso y cierre

- **Asignar:** con el menú **Assignment** arriba a la derecha (con fotos y buscador) o con el botón **"Unassigned"**. **El primero que le responde a un chat sin asignar se queda con él.** Los agentes de IA aparecen en la misma lista ([Assigning and Closing](https://respond.io/help/inbox/assigning-and-closing-a-conversation), [Collaborating](https://respond.io/help/inbox/collaborating-with-your-team-in-inbox), A). La asignación automática se arma con Workflows ([Responding to messages](https://respond.io/help/quick-start/responding-to-messages), A).
- **Cerrar:** el botón **Close** está junto al de asignar. La flecha a su lado abre **Closing Notes** (categoría y resumen, con el ícono **Summarize**). El dueño elige si es *opcional*, si pide *categoría* o si pide *categoría y resumen*. Las categorías por defecto son General Inquiry, Sales Inquiry, Payment Issue y Others. **La persona sigue asignada después de cerrar.** Si el cliente vuelve a escribir, el chat se reabre ([Assigning and Closing](https://respond.io/help/inbox/assigning-and-closing-a-conversation), [Conversations settings](https://respond.io/help/workspace-settings/conversations), A).
- **Cierre automático:** viene apagado. Por defecto cierra **24 h** después del último mensaje de una persona sin respuesta del cliente (se puede poner entre 30 min y 14 días). Los mensajes de la IA, de los flujos y de las difusiones no cuentan para el reloj. **En cada chat se ve a qué hora se va a cerrar.** Al cerrar puede agregar un "sentimiento" (positivo, neutral o negativo) con una frase que lo explica (ídem, A).
- **La IA cierra chats** con la acción "Close conversation", que **"cierra con un resumen corto"** y elige la categoría ([Getting started with AI Agents](https://respond.io/help/ai-agents/getting-started-with-ai-agents), [Responding to messages](https://respond.io/help/quick-start/responding-to-messages), A).

**cheke hoy:**
- `routeConversation()` asigna sola (al Agente con menos carga, luego al Gerente, luego al Dueño). La barra "Lo atiende [menú]" se muestra **solo si hay 2+ personas**, con "Esperando respuesta desde…" en rojo.
- Responder te asigna el chat y pausa a chekelin (`ChatView.tsx:952,990`), igual que el "primero que responde" de respond.io.
- **No hay "cerrar"**: la columna `conversations.status` existe en el modelo, pero no hay botón para usarla. El fin de una venta es Ganado o Perdido en Estado de venta.

---

## 5. Respuestas guardadas, difusiones e IA al escribir

| | respond.io | cheke hoy |
|---|---|---|
| Respuestas guardadas | **Snippets**: se teclea `/` + el nombre, se elige y se edita antes de enviar. Llevan variables ($), **temas** y **archivos** (fotos y PDF). En el teléfono se mantiene presionado para ver la respuesta completa. Solo los Dueños y Gerentes las crean ([Snippets](https://respond.io/help/workspace-settings/snippets), [mobile](https://respond.io/help/mobile-app/messaging-from-your-mobile), A) | Lo mismo con `/`, flechas, Enter o Tab y `{nombre}` (`QuickReplyPicker.tsx`). **Solo texto, sin foto** |
| Borrador con IA | **AI Assist**: un botón en el cuadro de texto escribe una respuesta a lo último que dijo el cliente, con 👍/👎. **Se desactiva si ya hay algo escrito** o si la ventana venció. También está en el menú de cada mensaje: **"Reply with AI Assist"** ([Using AI Assist](https://respond.io/help/inbox/using-ai-assist), A) | No hay. chekelin responde solo o se calla |
| Mejorar el texto | **AI Prompts**: Change Tone, Translate, Fix Spelling & Grammar, Simplify y 4 a la medida. Reemplazan el texto (se deshace con Ctrl+Z). Funcionan también en notas y notas de cierre ([AI Prompts](https://respond.io/help/inbox/interacting-with-ai-prompts), A) | No hay |
| Difusión | **13 pasos**: Broadcasts → **+ Add Broadcast** → nombre y etiquetas → Segment → tipo de canal → canal → contenido (en WhatsApp solo plantillas) → vista previa → **envío de prueba** → **Target Audience** ("Sending a total of 20 messages to 10 recipients", con quiénes quedan fuera y por qué) → ahora o programada → velocidad (extra pagado) → **Send Broadcast** ([Sending a simple broadcast](https://respond.io/help/broadcasts/sending-a-simple-broadcast), A) | Una sola pantalla: plantilla → etiquetas → datos → "La reciben N clientes", quiénes quedan fuera, **costo en US$ y Lempiras**, consentimiento → **"Enviar a N clientes"**. Está dentro de Plantillas (`templates/difusion/BroadcastView.tsx`). **Ya es más simple que respond.io.** Le falta enviarse una prueba y programar la hora |

---

## 6. App móvil

- Abajo hay pestañas: **Inbox, Calls, Notifications, Settings**. Las bandejas (**All, Mine, Unassigned**…) se eligen con el **menú de hamburguesa** arriba a la izquierda. Hay buscador con Contacts, Messages y Comments ([Mobile App Overview](https://respond.io/help/mobile-app/mobile-app-overview), [mobile](https://respond.io/help/mobile-app/messaging-from-your-mobile), A).
- **Se desliza el chat a la izquierda para cerrar y a la derecha para posponer.** "Unreplied" es un botón abajo a la derecha. Los no leídos son un número azul (ídem, A).
- En el cuadro de texto: AI Assist, AI Prompts, Snippets, **comentarios con el ícono amarillo** y resumen con IA (ídem, A).
- **En el teléfono no se ven** la pestaña Activities del contacto, los filtros avanzados ni los agentes de IA. Su propia explicación: el teléfono es para "mensajes rápidos en la calle", así que hay que pasar entre el chat y los detalles del contacto ([Mobile App Overview](https://respond.io/help/mobile-app/mobile-app-overview), A).
- Los mensajes que se mandan sin internet **quedan en cola** ("Pending") y salen solos cuando vuelve la conexión ([mobile](https://respond.io/help/mobile-app/messaging-from-your-mobile), A). En la tienda de apps tienen 4.8 en iPhone y 4.5 en Android ([página del producto](https://respond.io/mobile-app), M).

**cheke hoy:** la barra de abajo tiene Chat, chekeo, Contactos, Catálogo y "Más" (`MobileNav.tsx:15`). Hay push nativo. En la lista no se puede deslizar nada.

---

## 7. Ajustes a cheke, en orden

Criterio: un ajuste sube si lo nota una tienda con 2 o 3 personas en la primera semana. Que respond.io lo tenga no basta. Tamaño: **S** (1–3 días), **M** (1–2 semanas), **L** (más). Todo se puede hacer con datos que ya existen, salvo donde se indica.

| # | Qué cambiar | Por qué (respond.io → cheke) | Tamaño |
|---|---|---|---|
| 1 | **Mostrar el motivo del Traspaso en la línea de notas.** Hoy dice "chekelin: Quiere la blusa roja talla M…". Cambiarlo por **"Pidió descuento · Quiere la blusa roja talla M…"**. Usar el `reason` que ya existe en vez de "chekelin" cuando la nota es de traspaso | La persona sabe **por qué** le llegó el chat sin abrir la hoja. respond.io pide "intención + contexto" en la nota | S |
| 2 | **Agregar "Míos" a los chips de la lista**, junto a No leídos: `Míos` (asignados a mí). Solo se muestra con 2+ personas. A un Agente se le abre ya marcado | Es la bandeja de todos los días en respond.io (Mine). Hoy un Agente ve los chats de todos y no sabe cuáles son suyos | S |
| 3 | **Chip "Sin responder"** (el último mensaje es del cliente y nadie le contestó). Como en respond.io, lo que manda chekelin cuenta como respuesta, salvo en un chat traspasado | "No leídos" se apaga apenas alguien abre el chat, aunque no le conteste. "Sin responder" es lo que de verdad pierde ventas. Ya existe `awaiting_since` | S |
| 4 | **Ver en la lista quién escribió el último mensaje**: anteponer "Tú:", "chekelin:" o el nombre del compañero, como WhatsApp, en lugar de las flechas de colores de respond.io. Agregar las **iniciales de quien atiende** en una esquina (con 2+ personas) | respond.io marca quién escribió con flechas. Para alguien que no es técnico, el "Tú:" de WhatsApp se entiende sin explicación | S |
| 5 | **Nota de Traspaso con siguiente paso y mención**: que chekelin llene `team_summary` como *"Qué quiere · Qué falta"* (2 frases cortas, máximo unas 200 letras) y que la nota **@mencione a la persona asignada**, con su push "te mencionaron" | Es la recomendación literal de respond.io ("intent + context + recommended next step", y etiquetar a una persona). Hoy la nota tiene 1 frase de 120 letras sin siguiente paso | S |
| 6 | **Marcar el momento del traspaso en el hilo**: una línea gris centrada, sin burbuja, como "chekelin le pasó el chat a Ana · 3:42 p. m.". Solo para Traspaso y Queja; las notas siguen en la línea de arriba | respond.io muestra los eventos dentro del hilo ("User Assigned by AI Agent"). Así se ve **qué dijo el cliente justo antes** sin llenar el hilo de notas | M |
| 7 | **Botón "Listo" para sacar el chat de la lista** (y que vuelva solo si el cliente escribe). Sin categorías y sin nota obligatoria. Opcional: "se quita solo después de 3 días sin respuesta". Usa `conversations.status`, que ya existe | En respond.io, Close y Auto-close son lo que mantiene limpia la bandeja. En cheke la lista solo crece, y Ganado/Perdido no sirve para chats que no eran ventas | M |
| 8 | **Más datos en el panel del contacto**: "Lo atiende", **compras anteriores** (de `orders`, con total en Lempiras) y un acceso a "Notas del equipo" | respond.io muestra la persona asignada y el estado en el panel, y la actividad en su propia pestaña. A una tienda le importan más las compras que los campos | S |
| 9 | **"Resumir" dentro de la hoja de notas**: un botón crea una nota borrador con 2 o 3 viñetas sobre los últimos mensajes, que la persona revisa y guarda | respond.io: Summarize con un clic, en viñetas, como borrador de nota. Sirve cuando una persona le pasa el chat a otra (chekelin ya resume solo sus traspasos) | M |
| 10 | **"Sugerir respuesta" en el cuadro de texto** cuando chekelin está en silencio o pausado y el cuadro está vacío. Escribe un borrador con lo que chekelin sabe, la persona lo edita y lo envía | Es AI Assist. Se esconde si ya hay texto escrito, igual que en respond.io | M |
| 11 | **Difusión: "Enviarme una prueba" y "Programar"**, y sacarla de Plantillas a su propia entrada (**Campañas**, como ya dice el modelo de datos en `CLAUDE.md`) | respond.io tiene envío de prueba y hora programada. La pantalla de cheke ya es más clara (3 pasos y costo en Lempiras), pero está escondida | S–M |
| 12 | **Foto en Respuestas rápidas** (1 foto por respuesta) | Los Snippets de respond.io llevan archivos. "/precios" con la foto del catálogo es un uso típico de una tienda | M |
| 13 | **Deslizar un chat en el teléfono**: a la izquierda "Listo", a la derecha "No leído". Solo después del #7 | Es el gesto de la app de respond.io y el mismo de WhatsApp (archivar o marcar como no leído) | S (después del #7) |

### Lo que NO hay que copiar

- **Collaborations, Team Inbox, Custom Inbox ni filtros avanzados.** Para 2 a 5 personas alcanza con *Todos / Míos / No leídos / Sin responder*.
- **Categorías de cierre, nota de cierre obligatoria, sentimiento** y sus reportes. Son trabajo extra en cada chat. Un "Listo" de un toque basta.
- **Posponer (Snooze).** Necesita entender "vuelve a aparecer el jueves". Si se pide, primero probar con "Listo".
- **Cuadro bloqueado durante la IA y botón Takeover.** En cheke, responder ya pausa a chekelin. Eso es más simple y no requiere aprender nada.
- **Notas mezcladas con los mensajes en el hilo.** cheke ya decidió en el PR #99 dejarlas en una línea. Al hilo solo deben entrar los eventos de Traspaso y Queja (#6).
- **AI Prompts** (cambiar el tono o traducir), la paleta de comandos (Ctrl+K) y los atajos de teclado: el Dueño hondureño trabaja desde el teléfono.

---

## Fuentes

Centro de ayuda (A):
- https://respond.io/help/inbox/getting-started-with-inbox
- https://respond.io/help/inbox/filtering-and-sorting-conversations-in-inbox
- https://respond.io/help/inbox/managing-conversations-in-inbox
- https://respond.io/help/inbox/managing-contacts-in-inbox
- https://respond.io/help/inbox/collaborating-with-your-team-in-inbox
- https://respond.io/help/inbox/assigning-and-closing-a-conversation
- https://respond.io/help/inbox/using-ai-assist
- https://respond.io/help/inbox/interacting-with-ai-prompts
- https://respond.io/help/quick-start/responding-to-messages
- https://respond.io/help/quick-start/glossary-of-terms
- https://respond.io/help/workspace-settings/conversations
- https://respond.io/help/workspace-settings/snippets
- https://respond.io/help/contacts/contact-details
- https://respond.io/help/contacts/activities
- https://respond.io/help/ai-agents/getting-started-with-ai-agents
- https://respond.io/help/ai-agents/ai-agents-known-limitations-and-workarounds
- https://respond.io/help/ai-skills/ai-agent-action-add-comments
- https://respond.io/help/broadcasts/sending-a-simple-broadcast
- https://respond.io/help/mobile-app/mobile-app-overview
- https://respond.io/help/mobile-app/messaging-from-your-mobile

Producto, changelog y video (M; de los videos solo se leyó la descripción):
- https://respond.io/ai-agents · https://respond.io/mobile-app
- https://roadmap.respond.io/changelog/summarize-conversations-instantly
- https://www.youtube.com/watch?v=-5C9R07eToc (Respond.io Explained, 2026) · https://www.youtube.com/watch?v=EgKaq4LvUGs (versión en español)
- https://www.youtube.com/watch?v=DTGG6VqbYF4 (AI Agents Explained) · https://www.youtube.com/watch?v=OdkLv8r_3aM (AI Agents That Qualify and Route Conversations)
