type LogArgs = unknown[];

const emit = (level: 'info' | 'warn' | 'error', message: unknown, args: LogArgs) => {
  const prefix: string = `[po-cost] ${level}`;
  if (level === 'error') {
    console.error(prefix, message, ...args);
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, message, ...args);
    return;
  }
  console.info(prefix, message, ...args);
};

export const logger = {
  info: (message: unknown, ...args: LogArgs) => emit('info', message, args),
  warn: (message: unknown, ...args: LogArgs) => emit('warn', message, args),
  error: (message: unknown, ...args: LogArgs) => emit('error', message, args),
};
