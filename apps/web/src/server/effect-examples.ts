import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { avatarStyles, type EffectExample } from '../lib/effect-examples';

const filenames = ['original.webp', ...avatarStyles.map(style => `${style.id}.webp`)];
const localDirectory = () => path.join(process.cwd(), '.local', 'effect-samples');

// Deliberately empty until a public sample has explicit publication rights and review.
// Future approved examples use versioned same-origin public assets; no Worker dependency.
const publishedExamples: EffectExample[] = [];

export async function getEffectExamples(): Promise<EffectExample[]> {
  if (process.env.NODE_ENV !== 'development') return publishedExamples;
  try {
    await Promise.all(filenames.map(name => access(path.join(localDirectory(), name))));
    return avatarStyles.map(style => ({
      id: style.id, toolId: 'ai_avatar', before: '/api/local-effect-samples/original.webp',
      after: `/api/local-effect-samples/${style.id}.webp`, scope: 'local-preview',
      recipeVersion: 'avatar-six-style-2026-10-21-v2',
      experimental: style.id === 'clay-felt' || style.id === 'paper-cut',
    }));
  } catch { return publishedExamples; }
}

export async function localExampleAsset(filename: string) {
  if (process.env.NODE_ENV !== 'development' || !filenames.includes(filename)) return null;
  try { return await readFile(path.join(localDirectory(), filename)); }
  catch { return null; }
}
