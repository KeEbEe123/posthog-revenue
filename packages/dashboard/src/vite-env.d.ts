/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_POSTHOG_PROJECT_ID?: string;
  readonly VITE_POSTHOG_PERSONAL_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
