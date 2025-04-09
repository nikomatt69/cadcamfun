// src/utils/browserUtils.ts
export const isMediaRecorderSupported = (): boolean => {
    return !!(navigator.mediaDevices && 
      typeof navigator.mediaDevices.getUserMedia === 'function' && 
      window.MediaRecorder);
  };