export const VIDEO_STYLES = [
  {
    id: "3d-cartoon",
    label: "3D cartoon",
    detail: "Rounded, expressive characters with colourful cinematic lighting.",
    prompt:
      "Friendly stylised 3D cartoon, rounded expressive characters, colourful appealing sets, clear silhouettes, gentle cinematic lighting.",
  },
  {
    id: "2d-cartoon",
    label: "2D cartoon",
    detail: "Clean outlines, flat colours and uncluttered backgrounds.",
    prompt:
      "Clean 2D cartoon, clear outlines, flat colours, expressive faces, simple uncluttered backgrounds.",
  },
  {
    id: "storybook",
    label: "Illustrated storybook",
    detail: "Soft painted textures and a picture-book feel.",
    prompt:
      "Illustrated picture-book aesthetic, soft painted textures, warm colours, readable shapes, gentle expressive characters.",
  },
  {
    id: "clay",
    label: "Clay animation",
    detail: "Handmade-looking characters and miniature sets.",
    prompt:
      "Handmade clay stop-motion aesthetic, tactile sculpted characters, miniature sets, soft studio lighting.",
  },
  {
    id: "paper",
    label: "Paper cut-out",
    detail: "Layered paper shapes with a colourful collage look.",
    prompt:
      "Layered paper cut-out collage aesthetic, tactile paper textures, distinct shapes, colourful simple compositions.",
  },
  {
    id: "realistic",
    label: "Realistic video",
    detail: "People, objects and places that look filmed.",
    prompt:
      "Photorealistic live-action appearance, natural lighting, real materials, believable settings, no drawn or cartoon appearance.",
  },
];
export const styleOf = (id) =>
  VIDEO_STYLES.find((s) => s.id === id) || VIDEO_STYLES[0];
