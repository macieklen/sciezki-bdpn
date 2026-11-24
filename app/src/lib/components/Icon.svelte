<script lang="ts" module>
  // Ikony liniowe w stylu interfejsu (stroke = currentColor).
  const paths = {
    back: 'M15 5l-7 7 7 7',
    chevron: 'M9 5l7 7-7 7',
    down: 'M6 9l6 6 6-6',
    globe: 'M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9zM12 3a9 9 0 110 18 9 9 0 010-18z',
    headphones: 'M4 14v-2a8 8 0 0116 0v2M3 14h4v6H4.5A1.5 1.5 0 013 18.5zM21 14h-4v6h1.5a1.5 1.5 0 001.5-1.5z',
    walk: 'M13 2.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 21l2-6-3-3 2-5 4 4h3M8 12l-2 3',
    rewind: 'M4 12a8 8 0 108-8H8M10 1L7 4l3 3',
    arrow: 'M4 12h14M13 6l6 6-6 6',
    branch: 'M6 3v12M18 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM18 9a9 9 0 01-9 9',
    image: 'M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM21 16l-5-5-9 8M9 8.4a1.6 1.6 0 110 3.2 1.6 1.6 0 010-3.2z',
  } as const;
  export type IconName = keyof typeof paths;
</script>

<script lang="ts">
  let { name, size = 24, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number } = $props();
</script>

<svg
  aria-hidden="true"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"><path d={paths[name]} /></svg>
