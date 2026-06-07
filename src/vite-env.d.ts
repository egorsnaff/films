/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KINOPOISK_API_KEY?: string;
  readonly VITE_KINOPOISK_API_BASE_URL?: string;
  readonly VITE_PLAYER_TEMPLATES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
