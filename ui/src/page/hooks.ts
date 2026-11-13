import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LatestStyle,
  PoCostDetail,
  StyleDetail,
  UpdatePoCostRequest,
} from '../types';
import { ApiError } from '../lib/http';
import {
  fetchLatestStyle,
  fetchStyle,
  patchPoCost,
} from './api';

export const styleListKey = ['bom', 'styles'] as const;
export const latestStyleKey = ['bom', 'latest-style'] as const;
export const styleDetailKey = (code: string, season: string, sizeGroup: string) =>
  ['bom', 'style', code, season, sizeGroup] as const;

/** Lỗi mạng / 5xx lúc API vừa khởi động thì thử lại; lỗi 4xx thì dừng ngay. */
const retryTransient = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 3) return false;
  return !(error instanceof ApiError) || error.status >= 500;
};

/** Mã hàng mới nhất — dùng làm giá trị mở màn, không tải cả danh sách. */
export const useLatestStyle = () =>
  useQuery<LatestStyle>({
    queryKey: latestStyleKey,
    queryFn: fetchLatestStyle,
    retry: retryTransient,
    staleTime: Infinity,
  });

export const useStyleDetail = (code: string, season: string, sizeGroup: string) =>
  useQuery<StyleDetail>({
    queryKey: styleDetailKey(code, season, sizeGroup),
    queryFn: () => fetchStyle(code, season || undefined, sizeGroup || undefined),
    enabled: Boolean(code),
    // Giữ dữ liệu đang xem trong lúc tải style/mùa mới để tránh nháy trắng.
    placeholderData: (previousData) => previousData,
    retry: retryTransient,
  });

interface UpdatePoCostVars {
  poNo: string;
  body: UpdatePoCostRequest;
}

export const useUpdatePoCost = (code: string, season: string) => {
  const queryClient = useQueryClient();
  return useMutation<PoCostDetail, unknown, UpdatePoCostVars>({
    mutationFn: (vars: UpdatePoCostVars) =>
      patchPoCost(code, vars.poNo, vars.body, season || undefined),
    retry: false,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['bom', 'style', code],
      });
      void queryClient.invalidateQueries({ queryKey: styleListKey });
    },
  });
};
