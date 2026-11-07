export interface StyleRef {
  code: string;
  name: string;
}

export const styleCodeFromFileName = (fileName: string): string => {
  const base: string = fileName.replace(/\.[^.]+$/, '');
  return base.trim();
};

export const matchStyle = (
  fileName: string,
  styleList: StyleRef[],
): StyleRef | undefined => {
  const code: string = styleCodeFromFileName(fileName).toUpperCase();
  return styleList.find((style: StyleRef) => style.code.toUpperCase() === code);
};
