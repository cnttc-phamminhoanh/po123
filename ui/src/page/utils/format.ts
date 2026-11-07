export const round2 = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const money = (value: number, digits = 2): string =>
  `$${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;

export const num = (value: number): string =>
  Number(value).toLocaleString('en-US');

export const pct1 = (value: number): string =>
  `${(Math.round(Number(value) * 10) / 10).toFixed(1)}%`;

export const fixed1 = (value: number): string => Number(value).toFixed(1);

/** COMMON-999 nghĩa là không chia size; hiển thị bằng nhãn đã dịch. */
export const SIZE_GROUP_COMMON = 'COMMON-999';

export const sizeGroupLabel = (value: string, commonLabel: string): string =>
  value === SIZE_GROUP_COMMON ? commonLabel : value;
