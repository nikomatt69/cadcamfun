// src/components/chat/FileUploader.tsx
import React, { useState, useRef } from 'react';
import { Paperclip, Image, X, Upload, File } from 'react-feather';

interface FileUploaderProps {
  onFileUpload: (fileId: string, fileUrl: string, fileName: string, fileType: string) => void;
  organizationId: string;
  conversationId: string;
}

const FileUploader: React.FC<FileUploaderProps> = ({ 
  onFileUpload, 
  organizationId, 
  conversationId 
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limite
        setError('Il file è troppo grande. Il limite è 10MB.');
        return;
      }
      
      setSelectedFile(file);
      setError(null);
    }
  };
  
  const cancelUpload = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const uploadFile = async () => {
    if (!selectedFile) return;
    
    setIsUploading(true);
    setError(null);
    
    try {
      console.log('Preparando caricamento file:', selectedFile.name);
      
      // Ottieni URL firmato per il caricamento
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileType: selectedFile.type,
          fileSize: selectedFile.size,
          organizationId,
          conversationId
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        console.error('Errore risposta API:', data);
        throw new Error(data.message || 'Errore durante il caricamento');
      }
      
      const { upload, uploadUrl } = await response.json();
      console.log('URL di caricamento ottenuto:', { uploadId: upload.id, uploadUrl });
      
      // Carica il file su 4everland
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', selectedFile.type);
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentage = Math.round((e.loaded / e.total) * 100);
          setUploadProgress(percentage);
          console.log(`Progresso caricamento: ${percentage}%`);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('Caricamento completato con successo!');
          
          // Costruisci l'URL pubblico per il file caricato
          // Utilizzare l'URL pubblico fornito dall'API o costruirlo
          const fileUrl = upload.publicUrl || `https://${upload.s3Bucket}.4everland.store/${upload.s3Key}`;
          
          console.log('URL pubblico del file:', fileUrl);
          onFileUpload(upload.id, fileUrl, upload.fileName, upload.s3ContentType);
          cancelUpload();
        } else {
          console.error('Errore durante il caricamento del file:', xhr.statusText);
          setError(`Errore durante il caricamento: ${xhr.status} ${xhr.statusText}`);
        }
        setIsUploading(false);
      };
      
      xhr.onerror = () => {
        console.error('Errore di rete durante il caricamento');
        setError('Errore di rete durante il caricamento');
        setIsUploading(false);
      };
      
      console.log('Avvio caricamento file...');
      xhr.send(selectedFile);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError(error instanceof Error ? error.message : 'Errore durante il caricamento');
      setIsUploading(false);
    }
  };
  
  const getFileIcon = () => {
    if (!selectedFile) return <Paperclip />;
    
    if (selectedFile.type.startsWith('image/')) {
      return <Image />;
    }
    
    return <File />;
  };
  
  return (
    <div className="flex items-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
      />
      
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        title="Allega file"
      >
        <Paperclip className="h-5 w-5" />
      </button>
      
      {selectedFile && (
        <div className="ml-2 flex items-center bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1 text-sm">
          {getFileIcon()}
          <span className="ml-2 mr-1 truncate max-w-[150px]">{selectedFile.name}</span>
          
          {isUploading ? (
            <div className="w-16 h-4 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden ml-1">
              <div 
                className="h-full bg-blue-500" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          ) : (
            <>
              <button
                onClick={uploadFile}
                className="ml-2 p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300"
                title="Invia"
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                onClick={cancelUpload}
                className="ml-1 p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                title="Cancella"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}
      
      {error && (
        <div className="ml-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUploader;