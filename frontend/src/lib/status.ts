import type { ProductStatus } from '../types';

export interface StatusMeta {
  label: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const PRODUCT_STATUS_MAP: Record<ProductStatus, StatusMeta> = {
  cho_duyet: {
    label: 'Chờ duyệt',
    bgColor: '#fef3c7',
    textColor: '#92400e',
    borderColor: '#fcd34d',
  },
  da_duyet: {
    label: 'Đã duyệt',
    bgColor: '#e0f2fe',
    textColor: '#075985',
    borderColor: '#bae6fd',
  },
  da_dang: {
    label: 'Đã đăng',
    bgColor: '#dcfce7',
    textColor: '#166534',
    borderColor: '#bbf7d0',
  },
  da_ban: {
    label: 'Đã bán',
    bgColor: '#f3f4f6',
    textColor: '#4b5563',
    borderColor: '#d1d5db',
  },
  tam_an: {
    label: 'Tạm ẩn',
    bgColor: '#fee2e2',
    textColor: '#991b1b',
    borderColor: '#fca5a5',
  },
};

export const ALL_PRODUCT_STATUSES: ProductStatus[] = [
  'cho_duyet',
  'da_duyet',
  'da_dang',
  'da_ban',
  'tam_an',
];

export function getStatusMeta(status?: ProductStatus | null): StatusMeta {
  if (status && PRODUCT_STATUS_MAP[status]) {
    return PRODUCT_STATUS_MAP[status];
  }
  return PRODUCT_STATUS_MAP.cho_duyet;
}
