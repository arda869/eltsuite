// Versioned art directions: new content, consistent visual language.
export const STYLE_DIRECTIONS = {
 photo: 'Natural editorial photography, believable proportions, soft daylight, uncluttered composition, realistic materials. No illustration treatment.',
 bright: 'Bright classroom illustration v1. Bold rounded silhouettes, uniform dark navy outlines, flat coral, sunflower yellow, turquoise and leaf green, tiny soft shadows, expressive friendly faces, generous white space. Large clearly separated objects. No gradients or texture. Young learners.',
 storybook: 'Gentle storybook illustration v1. Rounded hand-drawn contours of even weight, warm peach, teal, ochre and sage palette, restrained pencil texture, simple expressive faces, soft off-white background. Clear readable silhouettes. Young learners.',
 editorial: 'Adult editorial illustration v1. Mature natural proportions, crisp charcoal contours, restrained muted teal and ochre accents, sparse light grey shading, white background. Strong tonal separation in grayscale. No large dark filled backgrounds, childish faces, gradients or decorative clutter.',
 ink: 'Print-friendly ink illustration v1. Pure black outlines on white, consistent medium line weight, natural adult proportions, minimal sparse hatching, no solid dark backgrounds, no colour, no grey washes. Clear silhouettes and ample white space. Economical black-and-white printing.'
};
export function styleDirection(style) {
 if (!Object.hasOwn(STYLE_DIRECTIONS, style)) throw new Error('Unknown image style');
 return STYLE_DIRECTIONS[style];
}
