import type { ScriptLine } from '../lib/archive';

// The offline file contains its full JSON payload. Hidden and After listening
// scripts therefore cannot be packaged in a learner-facing standalone HTML file.
export function offlineLearnerScript(mode: string, script: ScriptLine[]): ScriptLine[] {
  return mode === 'karaoke' || mode === 'button' ? script : [];
}
