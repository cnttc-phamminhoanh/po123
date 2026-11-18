import type {
  LatestStyle,
  PoCostDetail,
  StyleDetail,
  UpdatePoCostRequest,
} from '../types';
import { apiRequest } from '../lib/http';
import { logger } from '../lib/logger';

const baseUrl = '/bom';

const seasonQuery = (season?: string): string =>
  season ? `?season=${encodeURIComponent(season)}` : '';

const detailQuery = (
  season?: string,
  sizeGroup?: string,
  soSeason?: string,
): string => {
  const params = new URLSearchParams();
  if (season) params.set('season', season);
  if (sizeGroup) params.set('sizeGroup', sizeGroup);
  if (soSeason) params.set('soSeason', soSeason);
  const text = params.toString();
  return text ? `?${text}` : '';
};

export const fetchLatestStyle = async (): Promise<LatestStyle> => {
  try {
    return await apiRequest<LatestStyle>(`${baseUrl}/latest-style`);
  } catch (error) {
    logger.error('Failed to load latest style', error);
    throw error;
  }
};

export const fetchStyle = async (
  code: string,
  season?: string,
  sizeGroup?: string,
  soSeason?: string,
): Promise<StyleDetail> => {
  try {
    return await apiRequest<StyleDetail>(
      `${baseUrl}/styles/${encodeURIComponent(code)}${detailQuery(season, sizeGroup, soSeason)}`,
    );
  } catch (error) {
    logger.error('Failed to load style detail', error);
    throw error;
  }
};

export const patchPoCost = async (
  code: string,
  poNo: string,
  body: UpdatePoCostRequest,
  season?: string,
): Promise<PoCostDetail> => {
  try {
    return await apiRequest<PoCostDetail>(
      `${baseUrl}/styles/${encodeURIComponent(code)}/pos/${encodeURIComponent(poNo)}${seasonQuery(season)}`,
      { method: 'PATCH', body },
    );
  } catch (error) {
    logger.error('Failed to update PO cost', error);
    throw error;
  }
};
