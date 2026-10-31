# Fotos de producto con IA: cómo lograr un fondo profesional sin tocar el producto

Investigación del 30 de octubre de 2026, para la pregunta abierta en [#11](https://github.com/fergutierreza123/cheke/issues/11) ("¿qué herramienta pasa la prueba de 'producto sin cambios'?"). Antes hubo una investigación en inglés sobre quitar fondos (`docs/research/background-removal-tools.md`, rama `research/background-removal-tools`, PR #7). Este documento va un paso más allá: no solo quitar el fondo, sino que la foto **se vea profesional**, con fondo blanco de tienda o con una escena que vaya con el producto.

Fuentes: documentación oficial y páginas de precios de cada empresa. El código de cheke se leyó el mismo día. No se cambió nada en el código, en Vercel ni en ninguna cuenta.

**Lo que no se pudo ver:**
- **remove.bg:** su página de precios no mostró los números a la herramienta. Los precios de remove.bg vienen de la investigación anterior (14 de octubre).
- **Claid.ai, Picsart, Pebblely y Adobe Firefly:** sus páginas de precios no mostraron las tarifas por foto, o no tienen una API pública con precio. Se mencionan, pero no se recomiendan.
- **OpenAI:** la página de precios da tarifas por "tokens" y no el precio por foto, así que no se puede calcular sin probar.
- **Photoroom y Bria** no publican tiempos de respuesta exactos para fondos con IA. Solo hay un dato de "unos 5 segundos" de Photoroom.

**Confianza:**
- **A (alta):** leído en la documentación oficial o en el código de cheke.
- **M (media):** leído en una página de la empresa, pero sin todos los detalles, o en la página de un revendedor (fal.ai).
- **B (baja):** inferencia mía, o de un sitio de terceros.

---

## Resumen

1. **Hoy cheke solo pone el producto sobre blanco puro**, y lo hace bien en lo importante: el producto queda **idéntico, píxel por píxel**, porque el proveedor solo dice "dónde está el producto" y cheke pega su propia foto encima. El código lo verifica en cada foto (A).
2. **Por qué se ve casero:** no hay sombra (el producto parece una calcomanía pegada), no se centra ni se le deja margen (queda donde estaba en la foto del teléfono), la foto no queda cuadrada, y en el Catálogo se recorta para llenar el cuadro. La luz del teléfono tampoco se corrige. Nada de esto es culpa del proveedor (A, ver la sección 1).
3. **La regla de oro para no cambiar el producto:** recortar el producto, crear el fondo o la escena alrededor, y **volver a pegar encima los píxeles originales**, más una sombra creíble. Así, aunque la IA "invente" el fondo, no puede tocar el producto.
4. **Recomendación:** **Photoroom** como proveedor principal (ya está en el código). Fondo blanco profesional por defecto, hecho en cheke a US$0.02 por foto. Escena con IA como opción, con Photoroom a US$0.10 por foto. **Respaldo para escenas: Bria** (US$0.032 por foto), que dice expresamente que no vuelve a dibujar el producto.
5. **Costo mensual estimado:** 200 fotos: **US$4** solo blanco, **US$20** si todas llevan escena. 1,000 fotos: **US$20** solo blanco, **US$100** con escena. Con Bria como respaldo para escenas: US$6.40 y US$32.
6. **No usar como primera opción** Gemini ("Nano Banana"), OpenAI ni Stability para esto. Esas herramientas **vuelven a dibujar la foto entera**, y sus propias guías dicen que no garantizan que el producto quede igual.

---

## 1. Lo que cheke usa hoy

| Qué | Cómo está | Dónde |
|---|---|---|
| Para qué sirve | Al subir una foto en el Catálogo, se pone el producto sobre blanco. Si algo falla, se guarda la foto original y se avisa "No se pudo quitar el fondo" | `src/app/(app)/inventory/actions.ts:63-78` |
| Proveedores | remove.bg (el de fábrica), Photoroom y Pixian. Se cambia con la variable `BG_REMOVAL_PROVIDER` | `src/lib/images.ts:33-34`, `:120-126` |
| Qué se le pide al proveedor | **Solo la máscara** (la silueta del producto), nunca la foto ya editada | `src/lib/images.ts:1-13`, `:61-116` |
| Cómo se arma la foto | cheke pega sus píxeles originales sobre blanco puro (`#ffffff`) con esa máscara | `src/lib/images.ts:179-194` |
| Prueba de "producto sin cambios" | Cuenta los píxeles del producto que cambiaron. Si hay uno solo, la foto se descarta | `src/lib/images.ts:196-210`, `:236-239` |
| Si no detecta el producto | Si la silueta ocupa menos del 2% de la foto, se descarta | `src/lib/images.ts:27`, `:231-234` |
| Tamaño final | Lado más largo de 2,048 px, en JPEG de calidad 90 | `src/lib/images.ts:22-25` |
| Prueba de comparación | `npm run compare-photos -- <carpeta>` corre cada proveedor y guarda el resultado junto a la original | `package.json:10`, `scripts/compare-photo-providers.mjs:1-11` |
| Aviso de privacidad | Solo menciona a remove.bg | `src/app/privacidad/page.tsx:59` |

**Por qué el resultado se ve informal (A, leído en el código):**
- **No hay sombra.** `compositeOnWhite` solo mezcla producto y blanco (`images.ts:179-194`). Un producto sin sombra parece flotar o estar recortado con tijera.
- **No se centra ni se encuadra.** La foto final tiene el mismo tamaño y la misma proporción que la del teléfono (`images.ts:229-241`). Si el producto estaba en una esquina, queda en una esquina, con mucho blanco al otro lado.
- **No es cuadrada.** Las tiendas (Meta, WhatsApp, marketplaces) muestran fotos cuadradas. En el Catálogo de cheke la foto se recorta para llenar el cuadro (`InventoryView.tsx:232`, `object-cover`), y el producto se puede cortar.
- **Blanco puro sin nada más.** El blanco 100% plano, sin un piso ni un degradado suave, se ve más "app" que "estudio" (B, criterio de diseño).
- **La luz es la del teléfono.** Si la foto salió amarilla u oscura, así queda. Esto es a propósito (corregir la luz puede cambiar el color del producto), pero se nota.
- **Bordes:** con remove.bg y la máscara cruda puede quedar un hilito del fondo viejo en bordes suaves (pelusa, tela), como ya advertía la investigación anterior (B).

Lo bueno: **la parte difícil (no tocar el producto) ya está resuelta.** Lo que falta es presentación.

---

## 2. La idea clave: "recortar, crear alrededor y volver a pegar"

Hay dos formas de que una IA cambie el fondo:

1. **Recortar y pegar.** Se recorta el producto, se crea un fondo nuevo y se pega el producto encima. El producto no se toca. Así trabajan Photoroom y Bria en sus herramientas de fondo.
2. **Volver a dibujar toda la foto.** La IA recibe la foto y una instrucción ("ponle fondo de playa") y **dibuja una foto nueva** que se parece a la original. Puede cambiar letras de la etiqueta, el logo, el color o la forma sin avisar. Así funcionan Gemini, OpenAI y, en parte, Stability.

**La forma más segura, aunque el proveedor prometa no tocar el producto:** que cheke haga un "doble seguro":

1. Pedir la silueta del producto (ya lo hacemos).
2. Pedirle al proveedor la escena o el fondo blanco con sombra, **con el producto en la misma posición y tamaño**. En Photoroom eso es `referenceBox=originalImage` ([Positioning](https://docs.photoroom.com/image-editing-api-plus-plan/positioning.md), A). En Bria es `placement_type=original` con `original_quality=true` ([Lifestyle shot by text](https://docs.bria.ai/product-shot-editing/products/product-lifestyle-shot-by-text.md), A).
3. **Volver a pegar encima los píxeles originales** con la misma máscara, y correr la misma prueba de "0 píxeles cambiados" que ya existe.

Así, la sombra y la escena vienen de la IA, pero el producto siempre es el de la foto original. Si la IA movió el producto aunque sea un poco, el doble seguro lo detecta (B, diseño propuesto; probarlo en la prueba de la sección 5).

---

## 3. Comparación de herramientas

Precios en dólares, de las páginas oficiales, leídas el 30 de octubre de 2026.

| Herramienta | ¿Toca el producto? | Fondo blanco con sombra | Escena por texto | Precio por foto | Velocidad | Licencia comercial | Esfuerzo en cheke |
|---|---|---|---|---|---|---|---|
| **Photoroom** Remove Background (Basic) | No: solo recorta. Ya se usa así | Blanco sí, sombra no | No | **US$0.02** ([precios](https://www.photoroom.com/api/pricing), A) | ~350 ms ([FAQ](https://docs.photoroom.com/getting-started/frequently-asked-questions.md), A) | Sí, y no guarda las fotos (FAQ, A) | Ya está hecho |
| **Photoroom** Image Editing (Plus) | **Recorta y pega**: el producto "se recorta de la foto y se pone sobre el fondo generado" ([AI Backgrounds](https://docs.photoroom.com/image-editing-api-plus-plan/ai-backgrounds.md), A). Fondos y sombras **no están** en su lista de funciones que alteran el producto ([FAQ](https://docs.photoroom.com/getting-started/frequently-asked-questions.md), A) | Sí: `background.color=white`, margen, centrado, sombra `ai.soft`/`ai.hard`/`ai.floating` ([AI Shadows](https://docs.photoroom.com/image-editing-api-plus-plan/ai-shadows.md), A) | Sí: por texto o con una foto de ejemplo; semilla fija para que todo el catálogo se vea parecido ([AI Backgrounds](https://docs.photoroom.com/image-editing-api-plus-plan/ai-backgrounds.md), A) | **US$0.10** ([precios](https://www.photoroom.com/api/pricing), A) | ~5 s con fondo IA (docs de Photoroom, M); el modelo "Studio" es más lento | Sí | Bajo: misma cuenta, otra dirección (`/v2/edit`) |
| **Bria** (API directa) | Escena por texto: el producto "no se vuelve a dibujar; etiquetas, texturas y logos quedan tal cual" ([buenas prácticas](https://docs.bria.ai/product-shots-best-practices.md), A). En "packshot" y "shadow" no lo dice | "Packshot" con color de fondo, 2000×2000 ([Packshot](https://docs.bria.ai/product-shot-editing/products/product-packshot.md), A) + sombra US$0.018 | Sí, también con foto de referencia | Escena **US$0.032**; packshot/recorte US$0.018; sombra US$0.018 ([precios](https://bria.ai/pricing), A) | "Unos segundos" (A); sin número exacto | Entrenado solo con imágenes con licencia; indemnización limitada en pago por uso ([precios](https://bria.ai/pricing), A) | Medio: cuenta nueva |
| **Bria vía fal.ai** | Igual que Bria | — | Sí | US$0.04 por foto ([fal product-shot](https://fal.ai/models/fal-ai/bria/product-shot), M) | — | Uso comercial (fal, M) | Medio. Más caro que ir directo a Bria |
| **remove.bg** (el de fábrica hoy) | No: solo recorta | Blanco sí, sombra no | No | ~US$0.12–0.20 (investigación anterior; hoy la página no mostró precios) | ~600 ms (investigación anterior, B) | Sí | Ya está hecho |
| **Stability** Replace Background & Relight | **Vuelve a dibujar**: tiene un control "cuánto conservar del sujeto, de 0 a 1" ([ComfyUI](https://comfyai.run/documentation/Stability%20Replace%20Background%20and%20Relight), B). No garantiza nada | Por texto | Sí | US$0.08 ([precios](https://docs.stability.ai/pricing), A) | — | Sí | Medio |
| **Gemini "Nano Banana"** (Google) | **Vuelve a dibujar.** No acepta máscara. Pedirle "no cambies nada más" es solo una petición ([guía](https://ai.google.dev/gemini-api/docs/image-generation), A). Toda imagen lleva marca de agua invisible SynthID (A) | Por texto | Sí, muy bueno con escenas | Nano Banana 2 Lite US$0.034; Nano Banana 2 US$0.067 (1K) a US$0.101 (2K); Pro US$0.134 ([precios](https://ai.google.dev/gemini-api/docs/pricing), A) | — | Sí (términos de Google) | Bajo |
| **OpenAI** gpt-image (edición) | **Vuelve a dibujar.** La máscara es "una guía, no sigue su forma exacta" y "aún puede tener problemas con texto" ([guía](https://developers.openai.com/api/docs/guides/image-generation), A) | Por texto | Sí | No publica precio por foto, solo por tokens ([precios](https://developers.openai.com/api/docs/pricing), A) | Hasta 2 minutos en pedidos complejos (guía, A) | Sí | Bajo |
| **Claid.ai** | Tiene fondos IA y sombras, pero la documentación abierta no dice si toca el producto | — | Sí | No se pudo verificar: sitios de terceros dicen entre US$0.07 y US$0.08 por crédito ([BytePlus](https://www.byteplus.com/en/topic/382217), B) | — | — | No evaluado |
| **Picsart** | "Change Background" por texto ([modelo](https://picsart.com/api-platform/models/picsart-change-bg/pricing), M); no dice si toca el producto | — | Sí | Créditos a US$0.0045–0.0075, pero no se vio cuántos créditos cuesta un fondo ([precios](https://picsart.io/pricing), M) | — | — | No evaluado |
| **Pebblely** | Pensado para usar en su app. No se encontró API pública con precio ([pebblely.com](https://www.pebblely.com/api), A) | — | En la app | No publicado | — | — | No sirve hoy |
| **Adobe Firefly Services** | "Object Composite": combina tu foto con una escena generada ([Adobe](https://developer.adobe.com/firefly-api), M) | — | Sí | Sin precio público; es para empresas grandes (M) | — | Sí | Alto |

**Lectura simple de la tabla:**
- Las únicas dos que **dicen por escrito** que el producto no se vuelve a dibujar en sus escenas son **Photoroom** y **Bria**.
- Gemini y OpenAI hacen escenas lindas, pero **son como un dibujante que copia tu producto a mano**: casi siempre queda bien, pero a veces cambia una letra o un logo. Para un catálogo real, eso no sirve, salvo que cheke vuelva a pegar el producto original encima (el doble seguro de la sección 2). Como no respetan la posición exacta, el doble seguro con ellas va a fallar seguido (B).
- Todas las de la tabla funcionan desde el servidor de cheke en Vercel con una simple llamada por internet. Nada hay que instalar.

---

## 4. Recomendación

### Herramienta principal: Photoroom

- **Ya está integrada** para el recorte (`images.ts:84-96`). La escena y la sombra son la misma cuenta, en otra dirección (`/v2/edit`).
- Es la única que tiene, en un solo pedido, **fondo blanco + margen + centrado + sombra realista + escena por texto** ([AI Shadows](https://docs.photoroom.com/image-editing-api-plus-plan/ai-shadows.md), [Positioning](https://docs.photoroom.com/image-editing-api-plus-plan/positioning.md), [AI Backgrounds](https://docs.photoroom.com/image-editing-api-plus-plan/ai-backgrounds.md), A).
- Dice por escrito que recorta y pega el producto, y que no guarda las fotos ([FAQ](https://docs.photoroom.com/getting-started/frequently-asked-questions.md), A).
- **Nunca activar** AI Relight, Despill, AI Upscale, AI Beautifier, "Edit With AI" ni similares: son las que la propia Photoroom dice que pueden cambiar el producto (FAQ, A).

### Respaldo: Bria (directo, no por fal.ai)

- Más barata para escenas (US$0.032 contra US$0.10) y dice que no vuelve a dibujar etiquetas ni logos ([buenas prácticas](https://docs.bria.ai/product-shots-best-practices.md), A).
- Pero sale en ~1 megapíxel, salvo con `placement_type=original` + `original_quality=true` (A). Hay que probar que se vea bien en el tamaño del Catálogo.
- Trae 100 pruebas gratis sin tarjeta ([precios](https://bria.ai/pricing), A).

### Cómo debería funcionar en cheke

1. **Por defecto: "Fondo blanco de estudio", hecho por cheke.** Seguimos pidiendo solo la silueta a Photoroom (US$0.02), y cheke mismo:
   - deja la foto **cuadrada**, con el producto **centrado** y ~10% de margen;
   - le pone una **sombra suave** debajo (una mancha gris difuminada que sale de la propia silueta);
   - usa blanco puro o un gris casi blanco muy suave.

   El producto sigue intacto (la prueba de 0 píxeles cambiados sigue igual). Es lo más barato y lo más seguro, y arregla la mayor parte del aspecto casero (B: es una propuesta, falta verla con fotos reales).
2. **Opción "Con escena"** (botón aparte, quizás solo en planes Plus/Pro): Photoroom `/v2/edit` con escena por texto y sombra, el producto en su posición original, y el **doble seguro**: volver a pegar los píxeles originales y verificar. Si falla, ofrecer el fondo blanco.
3. **Escenas por tipo de producto**, no texto libre del dueño: unas 6–8 escenas fijas que cheke escoge ("mesa de madera clara con luz de ventana", "mármol blanco", "cocina", "tela de lino"...), con **semilla fija** para que todo el Catálogo de una Tienda se vea parejo ([AI Backgrounds](https://docs.photoroom.com/image-editing-api-plus-plan/ai-backgrounds.md), A).
4. **Alternativa a probar:** usar Photoroom `/v2/edit` también para el blanco (sombra de IA en vez de la nuestra). Cuesta US$0.10 en lugar de US$0.02. Solo vale la pena si la prueba muestra que su sombra se ve mucho mejor.

### Costo mensual estimado

Suponiendo que cada foto se procesa una sola vez (si el dueño pide "otra escena", cuenta de nuevo).

| Fotos al mes | Solo blanco (Photoroom Basic + sombra de cheke) | Blanco con sombra IA (Photoroom Plus) | Todas con escena (Photoroom Plus) | Todas con escena (Bria) | Comparación: remove.bg hoy |
|---|---|---|---|---|---|
| 200 | **US$4** (~L104) | US$20 | US$20 (~L520) | US$6.40 (+US$4 de recorte = ~US$10) | ~US$39 |
| 1,000 | **US$20** (~L520) | US$100 | US$100 (~L2,600) | US$32 (+US$20 = ~US$52) | ~US$189 |

- Precios de Photoroom y Bria en [photoroom.com/api/pricing](https://www.photoroom.com/api/pricing) y [bria.ai/pricing](https://bria.ai/pricing) (A). remove.bg, de la investigación anterior (B). Cambio aproximado de L26 por dólar, como en `manychat.md` (B).
- Photoroom vende paquetes mensuales de fotos que **no se acumulan** de un mes a otro (investigación anterior, M). No se pudo ver el paquete mínimo del plan Plus.
- Lo realista es una mezcla: casi todo en blanco y algunas escenas. Por ejemplo, 1,000 fotos con 20% de escenas ≈ US$20 + US$20 = **US$40 al mes** (B).
- **Cambiar ya `BG_REMOVAL_PROVIDER` a `photoroom`** ahorra entre 6 y 10 veces lo que cuesta remove.bg, con el mismo resultado. Habría que actualizar el aviso de privacidad (`privacidad/page.tsx:59`), que hoy solo nombra a remove.bg.

---

## 5. Plan de prueba (para cerrar #11)

**Fotos:** 10 fotos reales de clientes o del fundador, tomadas con teléfono, sin arreglar:

1. Botella brillante con etiqueta (perfume, salsa, shampoo), para ver reflejos y letras.
2. Botella o vaso transparente, lo más difícil para recortar.
3. Ropa sobre una cama o colgada (camisa negra sobre fondo oscuro).
4. Zapatos con cordones.
5. Comida en plato (baleadas, pan, pastel), con bordes irregulares.
6. Joyería fina (cadena, aretes).
7. Empaque con mucho texto pequeño (caja de cereal, medicina, café).
8. Producto blanco sobre mesa blanca.
9. Celular o aparato con pantalla brillante.
10. Algo peludo o tejido (peluche, suéter).

**Qué correr:**
- **Lo que ya existe:** `npm run compare-photos -- ~/Desktop/fotos-prueba --provider all` compara la silueta de remove.bg, Photoroom y Pixian sobre blanco (`scripts/compare-photo-providers.mjs:8`). Sirve para escoger el recorte. Photoroom tiene modo de prueba gratis con marca de agua ([precios](https://docs.photoroom.com/getting-started/pricing.md), A).
- **Lo que falta (tarea de código, no de esta investigación):** agregar al script tres resultados más por foto:
  1. "blanco de estudio" de cheke (cuadrado, centrado, sombra);
  2. Photoroom `/v2/edit` con sombra y una escena;
  3. Bria escena por texto.

  Los tres con el doble seguro, guardando también el conteo de píxeles cambiados y el tiempo de cada uno.

**Cómo calificar cada resultado (el fundador, viendo la foto lado a lado):**
- ¿El producto es idéntico? Letras, logo, color, forma. **Si falla esto, la herramienta queda fuera.**
- ¿Los bordes se ven limpios, sin hilitos ni manchas?
- ¿La sombra se ve real?
- ¿Se ve como foto de tienda? Nota de 1 a 5.
- ¿La escena tiene sentido para el producto?
- ¿Cuántos segundos tardó?

**Para decidir:** gana la opción con más notas de 4 o 5 que **nunca** cambió el producto. Si el blanco de estudio hecho por cheke saca 4 o más en la mayoría, la escena puede esperar a después del lanzamiento.

---

## 6. Lo que no se pudo verificar

- **Si Photoroom deja el producto exactamente igual en la escena.** Dice que lo recorta y lo pega, y que "en general evita alterar productos", pero **no promete píxeles exactos** (docs de Photoroom, M). Por eso se propone el doble seguro.
- **Si Bria deja el producto igual en "packshot" y "sombra".** Solo lo dice para escenas por texto.
- **Si el doble seguro calza.** Que el producto quede en la misma posición exacta con `referenceBox=originalImage` (Photoroom) o `placement_type=original` (Bria) hay que medirlo en la prueba.
- **Tiempos reales** desde el servidor de cheke en Vercel. Solo hay "~350 ms" para recortar y "~5 s" para escenas, según Photoroom.
- **Precios actuales de remove.bg, Claid, Picsart, Pebblely, Adobe y OpenAI por foto.**
- **Tamaño máximo** de salida de Photoroom con escena IA, y paquete mínimo del plan Plus.

---

## Fuentes

Leídas en la documentación oficial (A):
- Photoroom: [precios API](https://www.photoroom.com/api/pricing) · [precios en docs](https://docs.photoroom.com/getting-started/pricing.md) · [FAQ](https://docs.photoroom.com/getting-started/frequently-asked-questions.md) · [AI Backgrounds](https://docs.photoroom.com/image-editing-api-plus-plan/ai-backgrounds.md) · [AI Shadows](https://docs.photoroom.com/image-editing-api-plus-plan/ai-shadows.md) · [AI Relight](https://docs.photoroom.com/image-editing-api-plus-plan/ai-relighting.md) · [Positioning](https://docs.photoroom.com/image-editing-api-plus-plan/positioning.md) · [Guía e-commerce](https://docs.photoroom.com/tutorials/how-to-create-e-commerce-images-with-consistent-brand-guidelines.md)
- Bria: [precios](https://bria.ai/pricing) · [resumen product shot](https://docs.bria.ai/product-shot-overview.md) · [buenas prácticas](https://docs.bria.ai/product-shots-best-practices.md) · [lifestyle shot by text](https://docs.bria.ai/product-shot-editing/products/product-lifestyle-shot-by-text.md) · [packshot](https://docs.bria.ai/product-shot-editing/products/product-packshot.md)
- Google: [precios Gemini](https://ai.google.dev/gemini-api/docs/pricing) · [guía de imágenes](https://ai.google.dev/gemini-api/docs/image-generation)
- OpenAI: [guía de imágenes](https://developers.openai.com/api/docs/guides/image-generation) · [precios](https://developers.openai.com/api/docs/pricing)
- Stability: [precios](https://docs.stability.ai/pricing)
- Pebblely: [pebblely.com/api](https://www.pebblely.com/api)

Revendedores o páginas parciales (M):
- fal.ai: [Bria product shot](https://fal.ai/models/fal-ai/bria/product-shot) · [Bria background replace](https://fal.ai/models/fal-ai/bria/background/replace)
- Picsart: [precios](https://picsart.io/pricing) · [Change Background](https://picsart.com/api-platform/models/picsart-change-bg/pricing)
- Adobe: [Firefly API](https://developer.adobe.com/firefly-api)

Terceros (B):
- [Stability Replace Background & Relight en ComfyUI](https://comfyai.run/documentation/Stability%20Replace%20Background%20and%20Relight) · [BytePlus sobre Claid](https://www.byteplus.com/en/topic/382217)

No se pudieron leer: la tabla de precios de remove.bg (`remove.bg/pricing`), la de Claid (`claid.ai/api-pricing`), la página de fondos IA de Claid (`docs.claid.ai`, "no encontrada") y `photoroom.com/api/ai-backgrounds` (error 404).

Código de cheke leído (A): `src/lib/images.ts`, `src/app/(app)/inventory/actions.ts`, `src/app/(app)/inventory/InventoryView.tsx`, `scripts/compare-photo-providers.mjs`, `package.json`, `src/app/privacidad/page.tsx`, issue #11.
