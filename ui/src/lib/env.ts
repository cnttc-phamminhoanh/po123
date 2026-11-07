declare global {
  interface ImportMetaEnv {
    readonly [key: string]: string | undefined;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export const envValue = (key: string): string => {
  const value: string | undefined = import.meta.env[key];
  return typeof value === 'string' ? value : '';
};
