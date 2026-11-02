/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OUTLAYER_NETWORK?: string;
  readonly VITE_PROJECT_ID?: string;
  readonly VITE_SECRETS_PROFILE?: string;
  readonly VITE_PAYMENT_KEY_SEALED?: string;
}
