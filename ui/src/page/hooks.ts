import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BindStylePhotosResponse,
  LatestStyle,
  PoCostDetail,
  StyleDetail,
  StylePhotoInput,
  UpdatePoCostRequest,
} from '../types';
import {
  bindStylePhotos,
  fetchLatestStyle,
  fetchStyle,
  patchPoCost,
} from './api';

export const styleListKey = ['bom', 'styles'] as const;
export const latestStyleKey = ['bom', 'latest-style'] as const;
export const styleDetailKey = (code: string, season: string, sizeGroup: string) =>
  ['bom', 'style', code, season, sizeGroup] as const;

/** Mã hàng mới nhất — dùng làm giá trị mở màn, không tải cả danh sách. */
export const useLatestStyle = () =>
  useQuery<LatestStyle>({
    queryKey: latestStyleKey,
    queryFn: fetchLatestStyle,
    retry: false,
    staleTime: Infinity,
  });

export const useStyleDetail = (code: string, season: string, sizeGroup: string) =>
  useQuery<StyleDetail>({
    queryKey: styleDetailKey(code, season, sizeGroup),
    queryFn: () => fetchStyle(code, season || undefined, sizeGroup || undefined),
    enabled: Boolean(code),
    // Giữ dữ liệu đang xem trong lúc tải style/mùa mới để tránh nháy trắng.
    placeholderData: (previousData) => previousData,
    retry: false,
  });

export const useBindStylePhotos = () => {
  const queryClient = useQueryClient();
  return useMutation<BindStylePhotosResponse, unknown, StylePhotoInput[]>({
    mutationFn: (items: StylePhotoInput[]) => bindStylePhotos(items),
    retry: false,
    onSuccess: (result: BindStylePhotosResponse) => {
      void queryClient.invalidateQueries({ queryKey: styleListKey });
      result.bound.forEach((binding: { styleCode: string }) => {
        void queryClient.invalidateQueries({
          queryKey: ['bom', 'style', binding.styleCode],
        });
      });
    },
  });
};

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
