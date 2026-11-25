import { error } from '@sveltejs/kit';

export async function load({ params, parent }) {
  const { trail } = await parent();
  const stop = trail.stops.find((s) => s.id === params.stop);
  if (!stop) error(404, `Nie ma przystanku "${params.stop}"`);
  return { stop };
}
