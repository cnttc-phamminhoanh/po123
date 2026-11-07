interface ApiErrorBody {
  error?: {
    message?: string;
    fieldErrors?: Record<string, string[]>;
  };
}

export const errorMessage = (error: unknown, fallback: string): string => {
  const body = (error as { response?: { data?: ApiErrorBody } })?.response?.data;
  const message = body?.error?.message;
  if (typeof message === 'string' && message.length > 0) {
    return message;
  }
  const fieldErrors = body?.error?.fieldErrors;
  if (fieldErrors) {
    const first = Object.values(fieldErrors).flat()[0];
    if (typeof first === 'string' && first.length > 0) {
      return first;
    }
  }
  return fallback;
};

export const storageErrorText = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object') {
    const record = error as { message?: unknown; error_msg?: unknown };
    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message;
    }
    if (typeof record.error_msg === 'string' && record.error_msg.length > 0) {
      return record.error_msg;
    }
  }
  return fallback;
};
