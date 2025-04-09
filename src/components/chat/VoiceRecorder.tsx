// src/components/chat/VoiceRecorder.tsx
import { isMediaRecorderSupported } from '@/src/lib/utils/browserUtils';
import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, X } from 'react-feather';

interface VoiceRecorderProps {
  onVoiceRecorded: (audioBlob: Blob, duration: number) => void;
  conversationId: string;
  organizationId: string;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ 
  onVoiceRecorded, 
  conversationId, 
  organizationId 
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // All'interno del componente VoiceRecorder
useEffect(() => {
    if (!isMediaRecorderSupported()) {
      setPermissionDenied(true);
    }
  }, []);
  // Funzione per formattare il tempo di registrazione
  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  // Avvia la registrazione
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        
        // Ferma i tracciamenti dello stream audio
        stream.getTracks().forEach(track => track.stop());
      };
      
      // Avvia registrazione
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Avvia timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      setPermissionDenied(true);
    }
  };
  
  // Interrompi la registrazione
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Ferma il timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };
  
  // Cancella la registrazione
  const cancelRecording = () => {
    stopRecording();
    setAudioBlob(null);
    audioChunksRef.current = [];
  };
  
  // Invia la registrazione
  const sendRecording = () => {
    if (audioBlob) {
      onVoiceRecorded(audioBlob, recordingTime);
      setAudioBlob(null);
    }
  };
  
  // Pulisci timer quando il componente viene smontato
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, [isRecording]);
  
  if (permissionDenied) {
    return (
      <div className="text-red-500 text-xs">
        Microphone permission denied. Enable microphone access in your browser settings.
      </div>
    );
  }
  return (
    <div className="flex items-center">
      {!isRecording && !audioBlob ? (
        <button
          type="button"
          onClick={startRecording}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          title="Registra messaggio vocale"
        >
          <Mic className="h-5 w-5" />
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          {isRecording ? (
            <>
              <div className="text-red-500 animate-pulse">●</div>
              <span className="text-sm">{formatTime(recordingTime)}</span>
              <button
                type="button"
                onClick={stopRecording}
                className="p-1 bg-red-500 text-white rounded-md"
                title="Ferma registrazione"
              >
                <Square className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="p-1 text-red-500"
                title="Annulla registrazione"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : audioBlob ? (
            <>
              <div className="text-gray-500">{formatTime(recordingTime)}</div>
              <audio
                src={URL.createObjectURL(audioBlob)}
                controls
                className="h-8"
              />
              <button
                type="button"
                onClick={sendRecording}
                className="p-1 text-blue-500"
                title="Invia registrazione"
              >
                <Send className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={cancelRecording}
                className="p-1 text-red-500"
                title="Annulla registrazione"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;