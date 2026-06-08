/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KINOPOISK_API_KEY?: string;
  readonly VITE_KINOPOISK_API_BASE_URL?: string;
  readonly VITE_ALLOHA_TOKEN?: string;
  readonly VITE_API_ALOHA_KEY?: string;
  readonly VITE_ENABLE_ALLOHA?: string;
  readonly VITE_HDVB_TOKEN?: string;
  readonly VITE_API_HDTV_KEY?: string;
  readonly VITE_PLAYER_TEMPLATES?: string;
  readonly VITE_PLAYER_EMBED_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
