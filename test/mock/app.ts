export const initializeApp = (_c?: unknown, name = '[DEFAULT]') => ({ name });
export const deleteApp = async () => {};
export const getApp = () => ({ name: '[DEFAULT]' });
type LogEvent = {level: string; type: string; message: string};
let logListener: ((event: LogEvent) => void) | null = null;
export const onLog = (listener: ((event: LogEvent) => void) | null) => { logListener = listener; };
export const emitFirebaseLog = (event: LogEvent) => { logListener?.(event); };
