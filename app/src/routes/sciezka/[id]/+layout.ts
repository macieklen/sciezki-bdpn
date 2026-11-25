import { error } from '@sveltejs/kit';
import { loadTrail } from '$lib/content';

export async function load({ params }) {
  try {
    return { trail: await loadTrail(params.id) };
  } catch (e) {
    error(404, (e as Error).message);
  }
}
