# Which background-removal tool keeps the product exactly as photographed?

Research for issue #7. Researched 2026-10-14. Blocks #11, the founder's side-by-side test on real photos.

**The rule being tested:** the product must not be altered. That means no generative re-rendering of color, texture, logos, text, or shape. Only the background is removed or replaced with plain white.

## TL;DR

1. **Every API compared here does segmentation, not generation, in its plain "remove background" mode.** Each one predicts an alpha matte. None of them re-draws the product. Generative features are separate endpoints or flags (Photoroom Plus "AI" features, Bria `prompt`, Cloudinary `e_gen_*`), and we simply don't call them.
2. **Even plain removal changes pixels at the edges.** remove.bg says outright that its colour output "differs from the input image due to edge color corrections". BiRefNet on fal applies `refine_foreground=true` by default, and rembg has opt-in colour decontamination. Photoroom applies "matting" to the cutout. So the only way to *guarantee* "product unchanged" is to **take only the mask from the vendor and composite our own original pixels onto white in code** (see the [Guaranteeing "product unchanged" in code](#guaranteeing-product-unchanged-in-code) section). That also makes the vendor easy to swap.
3. **Shortlist for #11:** **Photoroom Remove Background** ($0.02/img, a drop-in replacement for the remove.bg API), **Pixian.ai** (about $0.002–$0.01/img depending on megapixels, and its `delta_png` output preserves original pixels by design), and **Bria RMBG 2.0 via the Bria API or fal** ($0.018/img, commercially licensed, with open weights as a later self-host path). Keep **remove.bg** (the current tool, about $0.12–$0.20/img) in the test as the control.

## Comparison table

Prices are USD per month, from the vendors' public pricing pages (fetched 2026-10-14).

| Tool | Segmentation or generative | 100 img/mo | 1,000 img/mo | 5,000 img/mo | Runs from a Vercel function? | Outputs | Max resolution | Retention |
|---|---|---|---|---|---|---|---|---|
| **remove.bg** (current) | Segmentation. Edge colours "corrected" | $39 (200-credit plan) | $189 (1,200-credit plan) | $589 (5,000-credit plan) → $0.118/img | Yes (HTTP API) | PNG/JPG/WebP/ZIP (color.jpg + alpha.png), `bg_color` | 25 MP (`auto`), 50 MP (`50MP`; PNG 10 MP) | "typically within 60 minutes" (blog, not ToS) |
| **Photoroom Remove Background** (`/v1/segment`) | Segmentation. Matting on the cutout; `channels=alpha` returns the raw mask | ≈$2 (if sold in that size; page example is 1,000/$20) | $20 | $100 | Yes (HTTP API) | PNG/JPG/WebP, `bg_color`, `crop`, `size` up to `full` (36 MP), mask via `channels=alpha` | 6,000 px longest side, 50 MB | FAQ: "doesn't save the images" |
| Photoroom Image Editing (Plus, `/v2/edit`) | Segmentation by default. **Optional generative features** (AI Relight, Beautifier, Upscale, Edit With AI, Ironing, Ghost Mannequin, and others) | $0.10/img | $100 | $500 | Yes | Many | — | Same as above |
| **Pixian.ai** | Segmentation. `delta_png` returns original pixels for the opaque foreground | ≈$5 minimum pack (lasts >1 month) | ≈$2–10 | ≈$10–50 | Yes (HTTP API, basic auth) | PNG/JPEG/`delta_png`, `background.color`, crop/margin/target size | 25 MP processed (32 MP upload) | Not stated on a page I could fetch (unverified) |
| **Bria RMBG 2.0** (Bria API / fal / Replicate) | Segmentation (256-level alpha). `prompt` option ("guided") costs more and is slower | $1.80 | $18 | $90 | Yes (HTTP API) | RGBA PNG URL (take its alpha) | Bria page doesn't say. fal says "preserves input dimensions" but also "up to 1024x1024" | Bria: result URLs expire after 3 days; inputs "not retained beyond what's needed". Replicate: deleted after 1 h |
| RMBG 2.0 weights, self-hosted | Segmentation | **CC BY-NC 4.0, so commercial use needs a paid Bria agreement** | | | No. Needs a GPU host | Mask | 1024² inference, mask upscaled | Our own |
| **BiRefNet** (MIT) via fal / Replicate | Segmentation. fal's default `refine_foreground=true` alters edge colours; use `output_mask`/`mask_only` | fal: per compute-second (price not shown); Replicate community build ≈$0.0014/run on A100 | ≈$1.40 | ≈$7 | Yes via hosted API. Self-host needs a GPU | PNG/WebP + optional mask | 1024², 2048², 2304² (Dynamic) | fal `sync_mode` keeps it out of history. Replicate: 1 h |
| rembg (MIT wrapper) | Segmentation. Default model is now `bria-rmbg` (NC licence!). Also `birefnet-*`, `isnet`, `u2net`. `-dc`/`-a`/`-vm` alter edge colours | Self-host only | | | No in practice (1 GB model, CPU-slow). Needs a container/GPU host | PNG/mask | Model-dependent | Our own |
| BEN2 (base MIT) | Segmentation + refiner ("Confidence Guided Matting") | Full model / API: contact sales | | | Self-host GPU, or their API | Mask | "4K" claimed for the full model | — |
| **Cloudinary** `e_background_removal` | Segmentation (generative replace is a separate `e_gen_*` effect) | Free plan: 25 credits ≈ 333 removals/mo if nothing else is used | Plus $99/mo (225 credits) | Plus/Advanced | Yes (URL transformation) | Transparent PNG; compose with an underlay/background | 6,144 × 6,144 (larger is downscaled) | Hosted asset (it's a DAM) |
| imgix `bg-remove=true` | Segmentation (Background Replacement is a separate AI feature) | "Premium render" credits; price not published on the docs page | | | Yes (URL param) | Transparent, or `bg=` solid colour | Output capped at 10 MP | Cached CDN derivative |
| Clipdrop (Jasper) | Segmentation | 100 free dev credits; more only via contacting Jasper | | | Yes (HTTP API) | PNG/WebP/JPG, no `bg_color` | 25 MP, 30 MB | Not stated |

Volume maths:
- remove.bg plans are $9/40, $39/200, $89/500, $189/1,200, $389/2,800, $589/5,000 per month. Pay-as-you-go packs run from $3/3 credits to $1,699/8,000.
- Cloudinary background removal counts as 75 transformations, i.e. 0.075 credit. One credit is 1,000 transformations, so on Plus that is about $0.033 per image.
- Pixian's price is per megapixel: 0.25 MP is 0.05 credit and 25 MP is 1 credit. With the smallest pack that is $0.0023 at 2 MP and $0.0100 at 12 MP. The 5,000-credit pack ($85) brings that to $0.0020 at 2 MP.

## Per-tool notes

### remove.bg (current, `src/lib/images.ts`)
- Pricing comes from the plan JSON embedded in https://www.remove.bg/pricing: "Removing the background from 1 image requires 1 credit". The API's first 50 calls a month are free (https://www.remove.bg/api).
- Limits (https://www.remove.bg/api changelog): `size=auto` supports up to 25 MP. `50MP` allows up to 50 MP as JPG/ZIP but only 10 MP as PNG. Rate limit is 500 images/min (resolution-dependent).
- **Does not leave product pixels untouched.** The ZIP format docs say `color.jpg` "differs from the input image due to edge color corrections". `alpha.png` is a separate matte, which is the part we'd want.
- Privacy: the remove.bg security blog says "uploaded images are deleted typically within 60 minutes" (https://www.remove.bg/b/prioritizing-security-and-privacy-at-remove-bg). That is not contractual. Enterprise page: GDPR, processed in the EU.
- Verdict: good quality and the most expensive option here, by 6× to 100×.

### Photoroom
- Pricing (https://www.photoroom.com/api/pricing, https://docs.photoroom.com/getting-started/pricing.md):
  - Remove Background API (Basic) is $0.02/image, sold as monthly image amounts (e.g. 1,000 for $20) that don't roll over.
  - Image Editing API (Plus) is $0.10. One Plus call counts as 5 Basic images.
  - Failed calls aren't billed. Free watermarked Sandbox mode is available.
- **Drop-in for remove.bg:** same parameter names (`bg_color`, `size`, `crop`, `format`). Only the URL (`https://sdk.photoroom.com/v1/segment`) and the key change (https://docs.photoroom.com/remove-background-api-basic-plan/remove.bg-compatibility.md).
- Limits: 6,000 px longest side, 50 MB, 25 MP recommended. `size` is preview/medium/hd/full, where full is 36 MP and the default (…/file-size-resolution-and-format.md, …/background-color-size-and-crop.md).
- Mask: `channels=alpha` returns the grayscale matte. **Caveat from the docs:** the matting step is *not* applied to the mask, so the mask has less precise edges than the cutout. Alternative: request the RGBA cutout and use only its alpha channel (…/download-the-segmentation-mask.md).
- **Product-alteration list (official):** the FAQ says the default pipeline "simply" cannot alter logos or brand names. It gives an "exhaustive list" of features that can alter the product (https://docs.photoroom.com/getting-started/frequently-asked-questions.md). Never enable these:
  - AI Relight
  - **Green Screen Despill** (on the Basic endpoint, `despill=true`; it recolours green clothing)
  - AI Text Removal
  - AI Uncrop/Expand
  - AI Upscale
  - AI Beautifier
  - Edit With AI
  - AI Ironing, Virtual Model, Try-On, Flat Lay, Ghost Mannequin
- Latency: median 350 ms (FAQ). About 450 ms vs remove.bg's about 600 ms in Photoroom's own benchmark, which is vendor-run, so discount it. Rate limit is 60 images/min.
- Privacy: "Photoroom doesn't save the images that are processed through the Photoroom API" (FAQ). SOC 2 Type 2 and GDPR claims are on https://www.photoroom.com/api.

### Pixian.ai
- Pricing (https://pixian.ai/pricing): credit packs that don't expire (as long as you made a purchase in the last 2 years), from $5 for 250 credits. Cost is per megapixel, using the formula published on that page. No monthly fee. Free watermarked `test=true` calls.
- API (https://pixian.ai/api):
  - `background.color` (e.g. `#FFFFFF`), crop-to-foreground, margin, target size.
  - Input up to 32 MP, processed at `max_pixels` of 25 MP or less.
  - Clients should allow a 180 s idle timeout during load spikes.
- **`delta_png` is the most "product-unchanged" output of any vendor.** Background is encoded as transparent black and foreground as transparent white, and "partially transparent pixels have their actual color values. Together with the input image you can use this to reconstruct the full result." So fully opaque product pixels come from *our* original by construction. Only edge pixels carry vendor colour.
- Unknowns: retention/privacy terms (the privacy page didn't load for me, so this is unverified). The model isn't named. No independent quality benchmark.

### Bria RMBG 2.0
- Model card (https://huggingface.co/briaai/RMBG-2.0):
  - Built on BiRefNet and trained on more than 15,000 manually labelled, fully licensed images.
  - Weights are **CC BY-NC 4.0**, gated. "Commercial use requires a commercial agreement with BRIA."
  - The hosted Bria API includes commercial licensing.
  - The same applies to RMBG-1.4 (`bria-rmbg-1.4` licence), and that matters because rembg's *default* model is now `bria-rmbg`.
- Bria API (https://bria.ai/pricing, https://docs.bria.ai/image-editing/v2-endpoints/background-remove):
  - $0.018/image pay-as-you-go, 100 free calls, 60 requests/min.
  - Sync or async. Returns an RGBA image URL with soft alpha.
  - Optional `prompt` (guided removal) takes about 15–20 s. **Leave it off.**
  - Result URLs expire after 3 days. Inputs are "not retained beyond what's needed to process the request" (https://docs.bria.ai/getting-started/asset-retention.md).
- fal (https://fal.ai/models/fal-ai/bria/background/remove): $0.018/image without a prompt and $0.03 with one, the same at any resolution.
- Replicate (https://replicate.com/bria/remove-background): $0.018 per output image. Data deleted after 1 h (https://replicate.com/docs/topics/predictions/data-retention).

### BiRefNet / rembg / BEN2 (open models)
- BiRefNet: code is MIT (https://github.com/ZhengPeng7/BiRefNet).
  - Variants: general, lite-2K, HR (2048²), HR-matting, dynamic (256–2304²), and portrait.
  - Standard model at 1024² runs about 17 FPS in FP16 on an RTX 4090 with 3.45 GB VRAM (README).
  - SOTA claims are on academic DIS/HRSOD/COD benchmarks, not e-commerce product photos.
  - **Licence caveat:** the training datasets (DIS5K, etc.) have their own terms, which I didn't check.
- Hosted BiRefNet on fal (https://fal.ai/models/fal-ai/birefnet/v2):
  - Billed per compute-second (no price shown).
  - Options: `operating_resolution` 1024/2048/2304, `output_mask`, `mask_only`.
  - **`refine_foreground` defaults to true**, which re-estimates foreground colour. Turn it off, or use only the mask.
- Replicate community build `men1scus/birefnet`: about $0.0014/run on A100 (Replicate page). Community models can cold-start.
- rembg (MIT, https://github.com/danielgatis/rembg): a wrapper. The default model `bria-rmbg` (1.02 GB) carries the NC licence. Its README documents three options that each **rewrite edge colours**:
  - colour decontamination `-dc`
  - closed-form alpha matting `-a`
  - ViTMatte `-vm`

  For hard-edged products the README recommends the default naive mode.
- BEN2 (https://huggingface.co/PramaLLC/BEN2): base model is MIT. The full model and API are via sales. The model card has no numeric benchmarks.
- **Vercel fit:** Vercel Functions are CPU-only. Limits: 2 GB/1 vCPU (Hobby), 4 GB/2 vCPU (Pro), 250 MB bundle (5 GB "large functions" beta), **4.5 MB request/response body** (https://vercel.com/docs/functions/limitations).
  - A 0.2–1 GB segmentation model on 1–2 vCPUs would be slow and memory-tight. My estimate is several seconds to tens of seconds per image; I didn't measure it.
  - So self-hosting realistically means a GPU host (Replicate/fal/Modal/RunPod). That isn't worth it below roughly tens of thousands of images a month, given that Pixian and Bria are already about $0.002–$0.018.

### Cloudinary / imgix / Clipdrop
- Cloudinary (https://cloudinary.com/documentation/background_removal, …/transformation_counts, https://cloudinary.com/pricing):
  - `e_background_removal` (optionally `:fineedges_y`) costs 75 transformations. The free plan has 25 credits, so about 333 removals a month at no cost.
  - Max input 6,144²; larger images are downscaled, which changes output dimensions.
  - The docs warn that glass/transparent objects "may not work well", reflections on shiny objects "may be removed as background", and "results can change over time as the models are retrained".
  - The add-on is deprecated for accounts created after 1 Feb 2026; the transformation replaces it.
  - Only attractive if we moved image hosting to Cloudinary.
- imgix (https://docs.imgix.com/en-US/apis/rendering/background-removal/bg-remove):
  - URL param `bg-remove=true` + `bg=FFFFFF`. Output capped at 10 MP.
  - **Silently serves the original if removal fails**, unless `bg-remove-fallback=false` is set.
  - Credit price not published on the docs page.
- Clipdrop (https://clipdrop.co/apis/docs/remove-background): 1 credit per call, 100 free dev credits, then "contact Jasper.ai". No `bg_color`. Up to 25 MP. Photoroom's benchmark measured about 2 s. No public price, so it's not worth pursuing.

## Quality on hair, fabric and transparent objects: what the evidence does and doesn't say
- No independent, product-photo-specific benchmark covers all of these vendors. Photoroom publishes a side-by-side against remove.bg, Clipdrop, SAM and Azure (https://docs.photoroom.com/resources/remove-background-competitors-benchmark-remove.bg-clipdrop-sam-azure.md), but it is vendor-run. BiRefNet/RMBG claims come from academic DIS benchmarks.
- Soft, partially transparent matting (256 alpha levels) is supported by RMBG 2.0, BiRefNet-matting/HR-matting and Photoroom's cutout. remove.bg has a `semitransparency` parameter (check its docs for which `type`s it applies to). Cloudinary explicitly warns about glass.
- Conclusion: **#11's test on our own photos is the real benchmark.** Suggested hard cases:
  - black clothing on a dark background
  - white product on a white table
  - glossy cosmetics with reflections
  - a transparent perfume bottle
  - shoe laces
  - thin jewellery chains
  - fuzzy knitwear
  - a phone with a reflective screen
  - a product with small printed text or a logo

## Guaranteeing "product unchanged" in code
Treat the vendor as a **mask provider only**, and composite our own pixels:

1. **Normalize once.** `sharp(input).rotate()` applies the EXIF orientation. The resulting decoded RGB buffer is "the original" from here on. Handle colour profiles deliberately: iPhone photos are often Display P3. Either convert to sRGB with the embedded profile (what sharp does on output) or keep the ICC profile, and check on test photos that colours don't shift.
2. **Send a downscaled copy.** For example, 2,048 px on the long side as JPEG q≈90. This keeps the request under Vercel's 4.5 MB body limit (phone originals often exceed it), and it lowers Pixian's per-MP price. Only the *mask* is computed at that size; the product pixels stay at full resolution.
3. **Get only the alpha matte:**
   - Photoroom: alpha of the RGBA cutout, or `channels=alpha`
   - remove.bg: `format=zip` → `alpha.png`
   - Pixian: `delta_png`, alpha only
   - Bria: alpha of the returned PNG
   - fal BiRefNet: `mask_only=true` (and `refine_foreground=false`)
4. **Upscale the mask** to the original's width and height (`sharp(mask).resize(w, h, { fit: "fill", kernel: "lanczos3" })`), then blend per pixel: `out = (orig·a + 255·(255−a)) / 255`. Where `a == 255`, `out == orig` exactly.
5. **Assert it.** After blending, count pixels with `a == 255 && out != orig`. It must be 0, or the function errors. Also flag images where the mask covers less than about 2% or more than about 98% of the frame (segmentation failure) for manual review instead of sending them. Photoroom also returns an "uncertainty score" for this.
6. **Encode carefully.** PNG is lossless. JPEG/WebP at q ≥ 90 adds compression noise but no content change. WhatsApp will recompress anyway, so "unchanged" means unchanged content, not unchanged bytes.

Trade-off to decide in #11: pure original-pixel compositing can leave a faint fringe of the old background colour on soft edges (hair, fuzz, fabric fibres). This is the "halo" that vendor edge correction and decontamination remove. A middle policy is: **opaque pixels always original; vendor colour allowed only where 0 < a < 255**. Pixian's `delta_png` implements exactly this policy natively. This doesn't need much code. sharp is pulled in today only as an *optional* dependency of `next` (`package-lock.json`: `sharp ^0.35.4`). Add it as a direct dependency before relying on it. It runs on Vercel Node functions.

## Shortlist for #11 (plus control)
1. **Photoroom Remove Background.** 10× cheaper than remove.bg, a two-line migration, 350 ms median latency, documented no-alteration policy. Free sandbox for testing (watermarked).
2. **Pixian.ai.** The cheapest reliable hosted option (about $0.002/img at 2 MP), and the only vendor with a pixel-preserving output format. Watermarked `test=true` for free trials. Its privacy terms need verifying before production.
3. **Bria RMBG 2.0 (Bria API or fal).** $0.018 with commercial licensing included and strong soft-alpha matting. It's an open-weights model, which gives a self-host path at high volume (with a paid licence). 100 free calls.
- **Control:** remove.bg (current). Reuse the existing integration with 50 free calls a month.
- Not shortlisted:
  - Self-hosted BiRefNet/rembg/BEN2: needs a GPU host, and rembg's default model is NC-licensed.
  - Cloudinary/imgix: tied to moving image hosting.
  - Clipdrop: no public pricing.

## Open questions / not verified
- Pixian's retention/privacy terms, and its max output size with `background.color`.
- Bria API max input resolution (fal's page contradicts itself on whether output is native-size or 1024²).
- fal BiRefNet per-second price, and imgix credit price.
- Real latency from Vercel's `iad1` region (or whichever region we pick) to each vendor. Measure it during #11.
