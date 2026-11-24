<script lang="ts">
  import { i18n, LANGUAGES, setLang, t, type Lang } from '$lib/i18n.svelte';
  import Icon from './Icon.svelte';
</script>

<label class="lang">
  <Icon name="globe" size={18} />
  <span class="visually-hidden">{t().language}</span>
  <select value={i18n.lang} onchange={(e) => setLang(e.currentTarget.value as Lang)}>
    {#each LANGUAGES as l (l.code)}
      <option value={l.code}>{l.code.toUpperCase()}</option>
    {/each}
  </select>
</label>

<style>
  .lang {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 44px;
    padding: 0 12px;
    border: 1px solid var(--grey-light);
    border-radius: 22px;
    background: var(--surface);
    color: var(--brown);
    font-weight: 700;
    font-size: 14px;
  }
  select {
    appearance: none;
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  select::after {
    content: '';
  }
  .lang:focus-within {
    outline: 3px solid var(--sand);
  }
  select:focus-visible {
    outline: none;
  }
</style>
