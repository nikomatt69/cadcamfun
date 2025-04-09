// src/components/chat/ConversationDetail.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Info, User, Users, Send, MoreVertical, Volume, VolumeX, Mic } from 'react-feather';
import useChatStore, { Message } from '@/src/store/chatStore';
import { formatDistanceToNow, format } from 'date-fns';
import Image from 'next/image';
import { NotificationService } from '@/src/lib/notificationService';
import { SoundEffects } from '@/src/lib/soundEffects';
import FileUploader from './FileUploader';
import VoiceRecorder from './VoiceRecorder';

interface ConversationDetailProps {
  conversationId: string;
  organizationId: string;
  onBack?: () => void;
}

const ConversationDetail: React.FC<ConversationDetailProps> = ({ 
  conversationId, 
  organizationId,
  onBack 
}) => {
  const { data: session } = useSession();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState('');
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [forceUpdate, setForceUpdate] = useState(0); // Per forzare il re-render
  
  const { 
    activeConversation,
    messages,
    isLoadingMessages,
    hasMoreMessages,
    nextCursor,
    isSending,
    typingUsers,
    fetchConversation,
    fetchMessages,
    sendMessage,
    markAsRead,
    setTyping,
    sendFileMessage
  } = useChatStore();
  
  useEffect(() => {
    if (conversationId) {
      fetchConversation(conversationId);
    }
    
    // Mark as read when component mounts
    if (conversationId) {
      markAsRead(conversationId);
    }
  }, [conversationId, fetchConversation, markAsRead]);
  
  useEffect(() => {
    // Scroll to bottom when messages change, if not scrolled up
    if (messagesEndRef.current && !isScrolledUp) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isScrolledUp]);
  
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      // Check if scrolled up
      setIsScrolledUp(scrollTop < scrollHeight - clientHeight - 10);
      
      // Check if scrolled to top to load more messages
      if (scrollTop === 0 && hasMoreMessages && nextCursor) {
        fetchMessages(conversationId, nextCursor);
      }
    }
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (messageInput.trim() && conversationId) {
      try {
        console.log('Starting to send message:', messageInput);
        console.log('Conversation ID:', conversationId);
        console.log('Organization ID:', organizationId);
        
        // Invio del messaggio
        await sendMessage(conversationId, messageInput.trim());
        console.log('Message sent successfully!');
        
        // Reset del form
        setMessageInput('');
        setIsScrolledUp(false);
      } catch (error) {
        console.error('Error in handleSendMessage:', error);
        alert('Failed to send message. Please try again.');
      }
    } else {
      console.log('Cannot send empty message or missing conversation ID');
      if (!messageInput.trim()) console.log('Empty message');
      if (!conversationId) console.log('Missing conversation ID:', conversationId);
    }
  };
  
  const handleMessageInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageInput(e.target.value);
    
    // Invia lo stato "sta scrivendo" quando l'utente digita
    if (conversationId && e.target.value.trim() !== '') {
      setTyping(conversationId, true);
    } else if (conversationId) {
      setTyping(conversationId, false);
    }
  };

  const handleVoiceRecorded = async (audioBlob: Blob, duration: number) => {
    try {
      // Create File object from Blob
      const fileName = `voice-message-${new Date().getTime()}.webm`;
      const audioFile = new Blob([audioBlob], { type: 'audio/webm' });
      
      // Get signed URL for upload
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName: fileName,
          fileType: 'audio/webm',
          fileSize: audioBlob.size,
          organizationId,
          conversationId
        })
      });
      
      if (!response.ok) {
        throw new Error('Error uploading voice message');
      }
      
      const { upload, uploadUrl } = await response.json();
      
      // Upload the audio file
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: audioBlob,
        headers: {
          'Content-Type': 'audio/webm'
        }
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Error uploading audio file');
      }
      
      // Build the public URL
      const audioUrl = upload.publicUrl || `https://${upload.s3Bucket}.4everland.store/${upload.s3Key}`;
      
      // Create a message with the audio file
      const durationText = duration > 59 ? 
        `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : 
        `0:${duration.toString().padStart(2, '0')}`;
      
      const content = `Sent a voice message: [${durationText}]`;
      
      // Send the message
      await sendMessage(conversationId, content, upload.id, audioUrl);
      
    } catch (error) {
      console.error('Error sending voice message:', error);
      alert('Unable to send voice message. Please try again later.');
    }
  };
  
  // Gestisce il caricamento di file
  const handleFileUpload = async (fileId: string, fileUrl: string, fileName: string, fileType: string) => {
    if (!conversationId) return;
    
    try {
      await sendFileMessage(conversationId, fileId, fileUrl, fileName, fileType);
      setIsScrolledUp(false);
    } catch (error) {
      console.error('Error sending file message:', error);
    }
  };
  
  // Filtra e ottieni gli utenti che stanno scrivendo in questa conversazione
  const currentTypingUsers = (typingUsers && conversationId && typingUsers[conversationId]) || {};
  const typingUsersList = Object.values(currentTypingUsers)
    .filter(user => user && user.timestamp > Date.now() - 5000) // Solo utenti che hanno digitato negli ultimi 5 secondi
    .map(user => user?.name || 'Unknown User');
  
  // Rimuovi automaticamente gli utenti che stanno digitando dopo un certo periodo
  useEffect(() => {
    const interval = setInterval(() => {
      const currentTime = Date.now();
      
      // Controlla se ci sono utenti che stanno digitando che devono essere rimossi
      if (Object.keys(currentTypingUsers).length > 0) {
        const hasExpired = Object.values(currentTypingUsers).some(
          user => user && user.timestamp < currentTime - 5000
        );
        
        if (hasExpired) {
          // Forza un re-render che rimuoverà gli utenti scaduti
          setForceUpdate(prev => prev + 1);
        }
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [currentTypingUsers]);
  
  const formatMessageTime = (timestamp: string) => {
    if (!timestamp) return '';
    
    try {
      const date = new Date(timestamp);
      const today = new Date();
      const isToday = date.toDateString() === today.toDateString();
      
      return isToday 
        ? format(date, 'HH:mm') 
        : format(date, 'dd/MM/yyyy HH:mm');
    } catch (error) {
      console.error('Error formatting message time:', error);
      return '';
    }
  };
  
  const toggleSound = () => {
    const isEnabled = SoundEffects.getInstance().toggleSounds();
    setSoundEnabled(isEnabled);
  };
  
  const renderMessageBubble = (message: Message, isCurrentUser: boolean) => {
    if (!message) return null;
    
    // Check if the message contains a file
    const hasFile = message.content.includes('Sent a file:');
    const hasVoice = message.content.includes('Sent a voice message:');
    
    return (
      <div
        className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}
        key={message.id}
      >
        {!isCurrentUser && (
          <div className="flex-shrink-0 mr-2">
            {message.sender?.image ? (
              <Image
                src={message.sender.image}
                alt={message.sender?.name || 'User'}
                width={36}
                height={36}
                className="rounded-full"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              </div>
            )}
          </div>
        )}
        
        <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
          <div className="flex items-end">
            {!isCurrentUser && (
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
                {message.sender?.name || 'Unknown User'}
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {formatMessageTime(message.createdAt)}
            </span>
          </div>
          
          <div
            className={`mt-1 px-4 py-2 rounded-xl max-w-xs sm:max-w-md break-words ${
              isCurrentUser
                ? 'bg-blue-600 text-white dark:bg-blue-700 rounded-br-none'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100 rounded-bl-none'
            }`}
          >
            {hasFile ? (
              <div className="flex items-center">
                <File className="h-5 w-5 mr-2" />
                <span>{message.content.replace('Sent a file: ', '')}</span>
              </div>
            ) : hasVoice && message.fileUrl ? (
              <div className="flex flex-col">
                <div className="flex items-center">
                  <Mic className="h-5 w-5 mr-2" />
                  <span>Voice message {message.content.match(/\[(.*?)\]/)?.[1]}</span>
                </div>
                <audio 
                  controls 
                  src={message.fileUrl} 
                  className="mt-2 max-w-full h-8" 
                />
              </div>
            ) : (
              message.content
            )}
          </div>
        </div>
        
        {isCurrentUser && (
          <div className="flex-shrink-0 ml-2">
            {session?.user?.image ? (
              <Image
                src={session.user.image}
                alt={session?.user?.name || 'You'}
                width={36}
                height={36}
                className="rounded-full"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
                <User className="h-5 w-5 text-blue-600 dark:text-blue-300" />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };
  
  // Mostra loader o nessuna conversazione selezionata
  if (!activeConversation && isLoadingMessages) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (!activeConversation) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
        <MessageCircle className="h-16 w-16 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Seleziona una conversazione</h2>
        <p className="text-sm">Scegli una chat esistente o iniziane una nuova</p>
      </div>
    );
  }
  
  // Verifica se la struttura di activeConversation è completa
  if (!activeConversation.participants) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  const conversationName = activeConversation.name || 
    activeConversation.participants
      .filter((p: { id: string }) => p?.id !== session?.user?.id)
      .map((p: { name: string }) => p?.name || 'Unnamed User')
      .join(', ');
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <button
          onClick={onBack}
          className="md:hidden mr-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        
        <div className="flex-shrink-0">
          {activeConversation.isGroupChat ? (
            <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
          ) : (
            <div className="h-9 w-9 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </div>
          )}
        </div>
        
        <div className="ml-3 flex-1 min-w-0">
          <h2 className="text-base font-medium text-gray-900 dark:text-gray-100 truncate">
            {conversationName}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {activeConversation.participants?.length || 0} partecipanti
          </p>
        </div>
        
        <button 
          onClick={toggleSound}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title={soundEnabled ? "Disattiva suoni" : "Attiva suoni"}
        >
          {soundEnabled ? <Volume className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        
        <button 
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
          title="Informazioni"
        >
          <Info className="h-5 w-5" />
        </button>
      </div>
      
      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto p-4"
        onScroll={handleScroll}
      >
        {hasMoreMessages && (
          <div className="flex justify-center my-2">
            <button
              onClick={() => nextCursor && fetchMessages(conversationId, nextCursor)}
              className="text-blue-600 dark:text-blue-400 text-sm hover:underline"
            >
              Carica messaggi precedenti
            </button>
          </div>
        )}
        
        {isLoadingMessages && !messages?.length ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : !messages?.length ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <MessageSquare className="h-12 w-12 mb-3" />
            <p className="text-center">
              No messages yet. <br />
              Send the first message!
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              message && renderMessageBubble(message, message.senderId === session?.user?.id)
            ))}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Typing indicator */}
      {typingUsersList.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-500 animate-pulse">
          {typingUsersList.length === 1 
            ? `${typingUsersList[0]} is typing...` 
            : `${typingUsersList.join(', ')} are typing...`}
        </div>
      )}
      
      {/* Message input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
  <form onSubmit={handleSendMessage} className="flex flex-col">
    <div className="flex items-end">
      <div className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 focus-within:border-blue-500 dark:focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 bg-white dark:bg-gray-700 overflow-hidden">
        <textarea
          value={messageInput}
          onChange={handleMessageInputChange}
          placeholder="Scrivi un messaggio..."
          className="block w-full p-3 border-0 focus:ring-0 resize-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (messageInput.trim()) {
                handleSendMessage(e);
              }
            }
          }}
        />
      </div>
      
      <div className="flex items-center">
        <FileUploader 
          onFileUpload={handleFileUpload}
          organizationId={organizationId}
          conversationId={conversationId}
        />
        
        <VoiceRecorder
          onVoiceRecorded={handleVoiceRecorded}
          conversationId={conversationId}
          organizationId={organizationId}
        />
        
        <button
          type="submit"
          disabled={!messageInput.trim() || isSending}
          className="ml-2 p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </div>
  </form>
</div>
    </div>
  );
};

export default ConversationDetail;

// Add missing icons
const MessageCircle = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const MessageSquare = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const File = (props: any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);