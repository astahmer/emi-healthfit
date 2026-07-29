/// <reference types="vite/client" />
/// <reference types="@serwist/vite/typings" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_BUILD_ID: string;
  readonly VITE_APP_RELEASED_AT: string;
  readonly VITE_APP_COMMIT_ID: string;
  readonly VITE_APP_CHANGE_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
