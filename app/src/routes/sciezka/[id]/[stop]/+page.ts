import { error } from '@sveltejs/kit';
import { loadTrail } from '$lib/content';

export async function load({ params }) {
  let trail;
  try {
    trail = await loadTrail(params.id);
  } catch (e) {
    error(404, (e as Error).message);
  }
  const stop = trail.stops.find((s) => s.id === params.stop);
  if (!stop) error(404, `Nie ma przystanku "${params.stop}"`);
  return { trail, stop };
}
