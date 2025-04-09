// src/components/chat/NewConversation.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Search, User, Check, X, Users } from 'react-feather';
import useChatStore from '@/src/store/chatStore';
import Image from 'next/image';

interface Member {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  role: string;
}

interface NewConversationProps {
  organizationId: string;
  isGroupChat?: boolean;
  onBack?: () => void;
}

const NewConversation: React.FC<NewConversationProps> = ({ 
  organizationId, 
  isGroupChat = false,
  onBack
}) => {
  const router = useRouter();
  const { data: session } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [groupName, setGroupName] = useState('');
  const { createConversation } = useChatStore();
  
  useEffect(() => {
    fetchMembers();
  }, [organizationId]);
  
  const fetchMembers = async (query?: string) => {
    setIsLoading(true);
    try {
      let url = `/api/organizations/${organizationId}/members`;
      if (query) {
        url += `?search=${encodeURIComponent(query)}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }
      const data = await response.json();
      console.log('Fetched members:', data); // Debug log
      setMembers(data);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    // If query is empty, fetch all members
    if (!query.trim()) {
      fetchMembers();
      return;
    }
    
    // Search for members matching the query
    fetchMembers(query);
  };
  
  const filteredMembers = members.filter(member => {
    // Skip already selected members
    return !selectedMembers.some(selected => selected.user.id === member.user.id);
  });
  
  const handleSelectMember = (member: Member) => {
    setSelectedMembers([...selectedMembers, member]);
    setSearchQuery('');
  };
  
  const handleRemoveMember = (memberId: string) => {
    setSelectedMembers(selectedMembers.filter(member => member.user.id !== memberId));
  };
  
  const handleCreateConversation = async () => {
    if (selectedMembers.length === 0) return;
    
    const participantIds = selectedMembers.map(member => member.user.id);
    const name = isGroupChat 
      ? groupName || `Group with ${selectedMembers.map(m => m.user.name || 'User').join(', ')}` 
      : selectedMembers[0].user.name || selectedMembers[0].user.email || 'Unnamed User';
    
    const conversation = await createConversation(
      organizationId,
      participantIds,
      name,
      isGroupChat
    );
    
    if (conversation) {
      router.push(`/organizations/${organizationId}/chat/${conversation.id}`);
    }
  };
  
  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center">
        <button
          onClick={onBack}
          className="mr-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        
        <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          {isGroupChat ? 'Nuova chat di gruppo' : 'Nuovo messaggio diretto'}
        </h2>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isGroupChat && (
          <div className="mb-4">
            <label htmlFor="groupName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome del gruppo
            </label>
            <input
              type="text"
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Inserisci il nome del gruppo"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        )}
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {isGroupChat ? 'Aggiungi membri al gruppo' : 'Seleziona un membro'}
          </label>
          
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Cerca per nome o email..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          </div>
        </div>
        
        {selectedMembers.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {isGroupChat ? 'Membri selezionati' : 'Destinatario'}
            </label>
            
            <div className="flex flex-wrap gap-2">
              {selectedMembers.map(member => (
                <div
                  key={member.user.id}
                  className="inline-flex items-center px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300"
                >
                  <span className="text-sm font-medium">{member.user.name || member.user.email}</span>
                  <button
                    onClick={() => handleRemoveMember(member.user.id)}
                    className="ml-1 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {filteredMembers.length > 0 ? 'Membri dell\'organizzazione' : 'Nessun membro trovato'}
            </h3>
            
            {filteredMembers.map(member => (
              <button
                key={member.id}
                className="w-full flex items-center p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                onClick={() => handleSelectMember(member)}
              >
                <div className="flex-shrink-0">
                  {member.user.image ? (
                    <Image
                      src={member.user.image}
                      alt={member.user.name || 'User'}
                      width={40}
                      height={40}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                      <User className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    </div>
                  )}
                </div>
                
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {member.user.name || 'Unnamed User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {member.user.email || 'No email'} • {member.role}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleCreateConversation}
          disabled={selectedMembers.length === 0}
          className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none"
        >
          <Check className="h-4 w-4 mr-2" />
          {isGroupChat ? 'Crea gruppo' : 'Avvia conversazione'}
        </button>
      </div>
    </div>
  );
};

export default NewConversation;