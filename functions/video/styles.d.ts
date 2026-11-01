export const VIDEO_STYLES: {
  id: string;
  label: string;
  detail: string;
  prompt: string;
}[];
export function styleOf(id: string): (typeof VIDEO_STYLES)[number];
