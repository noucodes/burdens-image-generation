import { ImageSlot } from './types';
import { loadSettings, AppSettings } from './settings';

interface PromptContext {
  productTitle: string;
  productType: string;
  vendor: string;
}

function interpolate(template: string, ctx: PromptContext): string {
  return template
    .replace(/\{\{productTitle\}\}/g, ctx.productTitle)
    .replace(/\{\{productType\}\}/g, ctx.productType)
    .replace(/\{\{vendor\}\}/g, ctx.vendor);
}

function customTemplate(key: keyof AppSettings, ctx: PromptContext): string | null {
  const tpl = loadSettings()[key];
  return tpl ? interpolate(tpl, ctx) : null;
}

const QUALITY_INSTRUCTION = `
Output: a single high-resolution square photograph (1:1 aspect, 2000x2000px
equivalent quality). Photorealistic, sharp focus, no watermarks, no text overlays,
no logos other than what is genuinely present on the product itself.
`.trim();

function detailSceneDescription(): string {
  return `
Style: clean catalog studio shot. White seamless
background. Soft, even studio lighting from above and slightly to one side,
no harsh shadows. Frame the product tightly to highlight its material finish,
threads, mouldings, edges, fasteners, or surface texture. Shallow depth of
field with the key feature in razor-sharp focus.

Composition: product centred, occupying 70-80% of the frame, slight angled
perspective (3/4 view) to show form rather than flat-on.
`.trim();
}

export function buildDetailPrompt(ctx: PromptContext, hasStyleRef: boolean): string {
  const key: keyof AppSettings = hasStyleRef ? 'PROMPT_DETAIL_STYLE_REF' : 'PROMPT_DETAIL';
  const custom = customTemplate(key, ctx);
  if (custom) return custom;

  if (hasStyleRef) {
    return `
You are generating a close-up DETAIL product photograph for a trade plumbing
supplier's e-commerce listing.

You are given two images:
  • Image 1: THE PRODUCT to feature in the output. Preserve it exactly — same
    shape, proportions, material finish, colour, threads, fittings, and surface
    detail. The product in the output must be photorealistic and identical to
    Image 1.
  • Image 2: A STYLE REFERENCE. Match its lighting, background, framing, and
    overall aesthetic. Do NOT copy any product or object from Image 2 into the
    output — use it for style guidance only.

Product: ${ctx.productTitle}
Category: ${ctx.productType}

${detailSceneDescription()}

${QUALITY_INSTRUCTION}
`.trim();
  }

  return `
You are generating a close-up DETAIL product photograph for a trade plumbing
supplier's e-commerce listing.

Product: ${ctx.productTitle}
Category: ${ctx.productType}

${detailSceneDescription()}

CRITICAL: Preserve the product from the reference image exactly as shown.
Do not alter its shape, proportions, material finish, colour, threads, or any
structural detail. The product must be photorealistic and identical to the
reference — only the lighting and background should be newly composed.

${QUALITY_INSTRUCTION}
`.trim();
}

function lifestyleSceneDescription(ctx: PromptContext): string {
  const scene = inferInstallScene(ctx.productType, ctx.productTitle);
  return `
Scene: ${scene}

General aesthetic:
  • Realistic working trade context, not glamour styling
  • Natural daylight or warm worksite lighting
  • Clean but not sterile — recognisable as real plumbing work
  • Camera angle chosen to clearly show the product installed and in context
  • No people in frame unless their hands are part of demonstrating use
  • No distracting branded tools, packaging, or signage
  • No bathroom fixtures (taps, toilets, vanities) unless the product is
    literally a hose connecting to one
`.trim();
}

export function buildLifestylePrompt(ctx: PromptContext, hasStyleRef: boolean): string {
  const key: keyof AppSettings = hasStyleRef ? 'PROMPT_LIFESTYLE_STYLE_REF' : 'PROMPT_LIFESTYLE';
  const custom = customTemplate(key, ctx);
  if (custom) return custom;

  if (hasStyleRef) {
    return `
You are generating a LIFESTYLE / IN-USE photograph for a trade plumbing
supplier's e-commerce listing. The image should feel authentic to an
Australian plumbing job site or trade installation.

You are given two images:
  • Image 1: THE PRODUCT to feature in the output. Preserve it exactly — same
    shape, proportions, material finish, colour, dimensions, threads, fittings,
    and structural detail. The product in the output must be photorealistic and
    identical to Image 1.
  • Image 2: A STYLE REFERENCE. Match its lighting, composition, framing,
    background style, colour grading, and overall aesthetic feel. Do NOT copy
    any product or object from Image 2 into the output — use it for style and
    scene-mood guidance only.

Product: ${ctx.productTitle}
Category: ${ctx.productType}

${lifestyleSceneDescription(ctx)}

${QUALITY_INSTRUCTION}
`.trim();
  }

  return `
You are generating a LIFESTYLE / IN-USE photograph for a trade plumbing
supplier's e-commerce listing. The image should feel authentic to an
Australian plumbing job site or trade installation, not a styled bathroom.

Product: ${ctx.productTitle}
Category: ${ctx.productType}

${lifestyleSceneDescription(ctx)}

CRITICAL: Preserve the product from the reference image exactly as shown.
Do not alter its shape, proportions, material finish, colour, dimensions,
threads, fittings, or any structural detail. The product must be photorealistic
and identical to the reference — only the surrounding environment, lighting,
and camera framing should be newly composed.

${QUALITY_INSTRUCTION}
`.trim();
}

function inferInstallScene(productType: string, title: string): string {
  const t = `${productType} ${title}`.toLowerCase();

  if (/\bnut clip\b|\bsaddle\b|\bclip\b|\bbracket\b/.test(t)) {
    const pipeMaterial =
      /copper/.test(t) ? 'a clean copper pipe' :
      /galvani[sz]ed/.test(t) ? 'a galvanised steel pipe' :
      /\bpvc\b/.test(t) ? 'a white PVC pipe' :
      /\bhdpe\b/.test(t) ? 'a black HDPE pipe' :
      'a pipe matching the clip type';

    return `The clip is fastened to a timber stud or wall framing in a typical
Australian residential rough-in installation, supporting ${pipeMaterial} that
runs vertically or horizontally through the frame. Visible nut and washer
where applicable. Background shows pine framing timber, plasterboard edge, or
a section of subfloor — work-in-progress construction, not a finished room.
Camera framed close to the clip itself at a slight angle, showing how it
secures the pipe. Natural daylight from a nearby window or work light.`;
  }

  if (/flex(ible)?\s*hose|braided|connector|gas\s+\d+mm|water\s+\d+mm/.test(t)) {
    const isGas = /\bgas\b/.test(t);
    const fitting = isGas
      ? 'a gas appliance connection point (e.g. behind a stove or hot water unit)'
      : 'an under-sink or behind-cistern water connection point';

    return `The flexible hose is connected and in service, running between
${fitting} and an isolation valve or pipe stub. Show the hose's natural
curve under installation, both threaded fittings clearly visible and engaged.
Background is a realistic confined service space — under a kitchen sink, behind
a toilet cistern, or in an appliance cavity — with a hint of timber cabinetry,
copper stub-out, or wall plate for context. Camera close, slight angle, natural
or warm interior light.${isGas ? ' Avoid showing any open flame or gas leak indicators.' : ''}`;
  }

  return `The product is shown installed and in service in a realistic
Australian trade plumbing context appropriate to its function. Show it
fitted as it would be on a real job, with surrounding pipework, framing,
or fixtures only as needed for context. Camera framed close, slight angle,
natural daylight or warm work light.`;
}

export function getPromptForSlot(
  slot: ImageSlot,
  ctx: PromptContext,
  hasStyleRef: boolean = false
): string {
  switch (slot) {
    case 2: return buildDetailPrompt(ctx, hasStyleRef);
    case 3: return buildLifestylePrompt(ctx, hasStyleRef);
    case 1:
    case 4:
      throw new Error(`Slot ${slot} is not supported for AI generation.`);
    default:
      throw new Error(`Unknown slot: ${slot}`);
  }
}

export function buildRefinePrompt(
  slot: 'lifestyle' | 'detail',
  family: string,
  note?: string,
  hasAnchor?: boolean
): string {
  const slotDesc = slot === 'lifestyle'
    ? `LIFESTYLE / IN-USE scene for an Australian trade plumbing installation.
The image should show a realistic job-site context: timber framing, under-sink,
appliance cavity, or similar. Natural daylight or warm work lighting.
No people required. Clean but authentic trade environment.`
    : `DETAIL / STUDIO shot for a trade plumbing product.
Neutral soft-grey seamless background. Soft studio lighting. Clean, crisp.
No product needed — show the ideal empty-scene composition and lighting setup
that a product photo would be placed into, or show a generic plumbing fitting
in the ideal studio style.`;

  const noteClause = note ? `\n\nAdditional direction: ${note}` : '';
  const anchorClause = hasAnchor
    ? `\n\nYou are given a reference image as a visual starting point. Build on it —
keep what works, adjust the scene, lighting, or composition as directed.`
    : '';

  return `Generate a STYLE REFERENCE photograph for ${family} product images.

This image will be used as a visual style guide for AI-generated product photos
in a Burdens trade plumbing e-commerce catalogue.

Target: ${slotDesc}${anchorClause}${noteClause}

Quality: photorealistic, 2000x2000px equivalent, square crop, no watermarks,
no text overlays. The image must look like a real photograph, not a render.
`.trim();
}
