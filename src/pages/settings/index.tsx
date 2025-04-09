import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import toast from 'react-hot-toast';
import useUserProfileStore from 'src/store/userProfileStore';
import ImageService from 'src/lib/imageService';
import { User, Shield, Bell, Globe, Monitor, Key, Tag, HelpCircle, Cpu } from 'react-feather';
import EnhancedLayout from 'src/components/layout/Layout';
import MetaTags from 'src/components/layout/Metatags';
import { useLanguage, SUPPORTED_LANGUAGES } from '../../contexts/LanguageContext';
import { LanguageSelector } from '../../components/LanguageSelector';
import { AISettingsPanel } from '@/src/components/ai/ai-new';

export default function Settings() {
  // Funzioni per la gestione dell'immagine del profilo
  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validazione del file
    if (!file.type.match('image.*')) {
      toast.error('Per favore seleziona un file immagine valido');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('L\'immagine deve essere inferiore a 2MB');
      return;
    }

    try {
      setIsUploading(true);
      
      // Ottieni l'ID utente o email come identificatore univoco
      const userId = session?.user?.email || 'anonymous-user';
      
      // Salva l'immagine nel localStorage come Base64
      const imageBase64 = await ImageService.saveImageToLocalStorage(file, userId);
      
      setProfileImage(imageBase64);
      setStoreProfileImage(imageBase64);
      
      toast.success('Immagine caricata con successo');
    } catch (error) {
      console.error('Errore durante il caricamento:', error);
      toast.error('Errore durante il caricamento dell\'immagine');
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleRemoveImage = () => {
    // Ottieni l'ID utente o email come identificatore univoco
    const userId = session?.user?.email || 'anonymous-user';
    
    // Rimuovi l'immagine dal localStorage
    ImageService.removeImageFromLocalStorage(userId);
    
    setProfileImage(null);
    setStoreProfileImage(null);
    toast.success('Immagine rimossa');
  };
  
  
  // Funzione che simula un caricamento su server
  const simulateUpload = (file: File): Promise<void> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, 1500);
    });
  };
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('profile');
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Accesso allo store globale per la condivisione dell'immagine profilo
  const { profileImage: storeProfileImage, setProfileImage: setStoreProfileImage } = useUserProfileStore();
  
  // Inizializza l'immagine profilo dallo store o dal localStorage
  useEffect(() => {
    if (storeProfileImage) {
      setProfileImage(storeProfileImage);
    } else if (session?.user?.email) {
      // Controlla se esiste un'immagine nel localStorage
      const savedImage = ImageService.getImageFromLocalStorage(session.user.email);
      if (savedImage) {
        setProfileImage(savedImage);
        setStoreProfileImage(savedImage);
      } else if (session?.user?.image) {
        // Usa l'immagine dal profilo dell'utente se disponibile
        setProfileImage(session.user.image);
        setStoreProfileImage(session.user.image);
      }
    }
  }, [session, storeProfileImage, setStoreProfileImage]);

  // Se l'utente non è autenticato, viene reindirizzato alla pagina di login
  if (status === 'loading') {
    return (
      <EnhancedLayout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </EnhancedLayout>
    );
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signup');
    return null;
  }

  const tabs = [
    { id: 'profile', name: 'Profilo', icon: <User size={18} /> },
    { id: 'account', name: 'Account', icon: <Shield size={18} /> },
    { id: 'notifications', name: 'Notifiche', icon: <Bell size={18} /> },
    { id: 'appearance', name: 'Aspetto', icon: <Monitor size={18} /> },
    { id: 'ai', name: 'AI', icon: <Cpu size={18} /> },
    { id: 'language', name: 'Lingua', icon: <Globe size={18} /> },
    { id: 'security', name: 'Sicurezza', icon: <Key size={18} /> },
    { id: 'billing', name: 'Abbonamento', icon: <Tag size={18} /> },
    { id: 'help', name: 'Aiuto', icon: <HelpCircle size={18} /> }
  ];

  // Mobile tabs - show only the most important ones on small screens
  const mobileTabs = tabs.slice(0, 4);

  return (
    <EnhancedLayout>
      <MetaTags 
        title="CAM/CAM FUN IMPOSTAZIONI" 
      />

      <div className="px-4 sm:px-0 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Impostazioni</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Gestisci il tuo profilo, account e preferenze
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
        {/* Tabs - Desktop */}
        <div className="hidden sm:block bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="px-4 sm:px-6 lg:px-8">
            <nav className="-mb-px flex space-x-8 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm
                    ${activeTab === tab.id 
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}
                  `}
                >
                  <div className="flex items-center">
                    <span className="mr-2">{tab.icon}</span>
                    {tab.name}
                  </div>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Tabs - Mobile */}
        <div className="sm:hidden bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="px-2">
            <div className="flex justify-between overflow-x-auto py-1">
              {mobileTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex flex-col items-center py-2 px-3 text-xs font-medium
                    ${activeTab === tab.id 
                      ? 'text-blue-600 dark:text-blue-400' 
                      : 'text-gray-500 dark:text-gray-400'}
                  `}
                >
                  <span className="mb-1">{tab.icon}</span>
                  {tab.name}
                </button>
              ))}
              
              {/* Dropdown for more tabs on mobile */}
              <div className="relative group">
                <button className="flex flex-col items-center py-2 px-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                  <span className="mb-1">•••</span>
                  Altro
                </button>
                <div className="hidden group-hover:block absolute right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg z-10">
                  {tabs.slice(4).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    >
                      <span className="mr-2">{tab.icon}</span>
                      {tab.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Informazioni profilo</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Queste informazioni verranno mostrate pubblicamente, quindi fai attenzione a cosa condividi.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="col-span-full sm:col-span-4">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nome completo
                  </label>
                  <div className="mt-1">
                    <input
                      type="text"
                      name="name"
                      id="name"
                      defaultValue={session?.user?.name || ''}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md"
                    />
                  </div>
                </div>

                <div className="col-span-full sm:col-span-4">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </label>
                  <div className="mt-1">
                    <input
                      type="email"
                      name="email"
                      id="email"
                      defaultValue={session?.user?.email || ''}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md"
                      disabled
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">L&apos;email non può essere modificata</p>
                </div>

                <div className="col-span-full">
                  <label htmlFor="about" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Biografia
                  </label>
                  <div className="mt-1">
                    <textarea
                      id="about"
                      name="about"
                      rows={4}
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md"
                      placeholder="Descrivi brevemente te stesso e la tua esperienza"
                    ></textarea>
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Breve descrizione delle tue competenze e interessi.
                  </p>
                </div>

                <div className="col-span-full">
                  <label htmlFor="photo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Foto
                  </label>
                  <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center">
                    <div className="relative group">
                      <span className="h-24 w-24 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                        {isUploading ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                          </div>
                        ) : null}
                        {profileImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img 
                            src={profileImage} 
                            alt="Profile" 
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <svg className="h-full w-full text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                        )}
                      </span>
                      {/* Overlay on hover */}
                      <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                           onClick={() => fileInputRef.current?.click()}>
                        <div className="text-white text-xs font-medium">Cambia foto</div>
                      </div>
                    </div>
                    
                    <div className="mt-4 sm:mt-0 sm:ml-5 flex flex-col space-y-2">
                      <input
                        type="file"
                        id="photo-upload"
                        ref={fileInputRef}
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white dark:bg-gray-800 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto"
                      >
                        Carica nuova foto
                      </button>
                      {profileImage && (
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm leading-4 font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 w-full sm:w-auto"
                        >
                          Rimuovi foto
                        </button>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        JPG, PNG o GIF. Massimo 2MB.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-5">
                <div className="flex flex-col sm:flex-row sm:justify-end space-y-2 sm:space-y-0 sm:space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      // Resetta le modifiche
                      if (session?.user?.email) {
                        // Controlla se esiste un'immagine nel localStorage
                        const savedImage = ImageService.getImageFromLocalStorage(session.user.email);
                        if (savedImage) {
                          setProfileImage(savedImage);
                          setStoreProfileImage(savedImage);
                        } else if (session?.user?.image) {
                          setProfileImage(session.user.image);
                          setStoreProfileImage(session.user.image);
                        } else {
                          setProfileImage(null);
                          setStoreProfileImage(null);
                        }
                      } else {
                        setProfileImage(null);
                        setStoreProfileImage(null);
                      }
                      toast.success('Modifiche annullate');
                    }}
                    className="w-full sm:w-auto bg-white dark:bg-gray-800 py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      // Simula il salvataggio
                      setTimeout(() => {
                        toast.success('Modifiche salvate con successo');
                      }, 500);
                    }}
                    className="w-full sm:w-auto inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Salva
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'account' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Account</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Gestisci le impostazioni del tuo account.
                </p>
              </div>
              
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h4 className="text-base font-medium text-gray-900 dark:text-white">Eliminazione account</h4>
                <div className="mt-2">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Una volta che hai eliminato il tuo account, non potrai più tornare indietro. Per favore, sii certo.
                  </p>
                </div>
                <div className="mt-4">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center px-4 py-2 border border-transparent font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 dark:text-red-100 dark:bg-red-900/40 dark:hover:bg-red-900/60 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm"
                  >
                    Elimina account
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'language' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">
                  Impostazioni lingua
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Seleziona la lingua preferita per l&apos;interfaccia
                </p>
              </div>

              <div className="max-w-xl">
                <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                  <div className="sm:col-span-4">
                    <label htmlFor="language" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Lingua
                    </label>
                    <div className="mt-1">
                      <LanguageSelector />
                    </div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      La lingua attualmente selezionata è: {SUPPORTED_LANGUAGES['it']}
                    </p>
                  </div>
                </div>

                <div className="mt-8">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Lingue disponibili
                  </h4>
                  <div className="mt-4 space-y-4">
                    {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                      <div key={code} className="flex items-center">
                        <div className="flex-shrink-0">
                          {code === 'it' && (
                            <span className="inline-block h-2 w-2 rounded-full bg-blue-600"></span>
                          )}
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-gray-700 dark:text-gray-300">{name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {code === 'it' ? 'Lingua attuale' : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <Globe className="h-5 w-5 text-gray-400" aria-hidden="true" />
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        Informazioni sulla traduzione
                      </h4>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Le traduzioni vengono caricate automaticamente quando cambi lingua.
                        Se riscontri problemi con alcune traduzioni, contatta il supporto.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Contenuto per le altre tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">Preferenze notifiche</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Decidi come e quando ricevere aggiornamenti.
                </p>
              </div>
              
              {/* Notifiche email */}
              <div className="mt-6">
                <fieldset>
                  <legend className="text-base font-medium text-gray-900 dark:text-white">Email</legend>
                  <div className="mt-4 space-y-4">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="comments"
                          name="comments"
                          type="checkbox"
                          defaultChecked
                          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="comments" className="font-medium text-gray-700 dark:text-gray-300">Commenti</label>
                        <p className="text-gray-500 dark:text-gray-400">Ricevi notifiche quando qualcuno commenta i tuoi post.</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="mentions"
                          name="mentions"
                          type="checkbox"
                          defaultChecked
                          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="mentions" className="font-medium text-gray-700 dark:text-gray-300">Menzioni</label>
                        <p className="text-gray-500 dark:text-gray-400">Ricevi notifiche quando qualcuno ti menziona.</p>
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>
              
              {/* Notifiche push */}
              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <fieldset>
                  <legend className="text-base font-medium text-gray-900 dark:text-white">Notifiche push</legend>
                  <div className="mt-4 space-y-4">
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="push-everything"
                          name="push-notifications"
                          type="radio"
                          defaultChecked
                          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="push-everything" className="font-medium text-gray-700 dark:text-gray-300">Tutte le notifiche</label>
                        <p className="text-gray-500 dark:text-gray-400">Ricevi tutte le notifiche push.</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="push-email"
                          name="push-notifications"
                          type="radio"
                          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="push-email" className="font-medium text-gray-700 dark:text-gray-300">Solo email</label>
                        <p className="text-gray-500 dark:text-gray-400">Ricevi solo le notifiche via email.</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <div className="flex items-center h-5">
                        <input
                          id="push-nothing"
                          name="push-notifications"
                          type="radio"
                          className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label htmlFor="push-nothing" className="font-medium text-gray-700 dark:text-gray-300">Nessuna notifica</label>
                        <p className="text-gray-500 dark:text-gray-400">Non ricevere notifiche push.</p>
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>
            
          )}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">AI</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Configura le impostazioni dell&apos;AI.
                </p>
              </div>
              
              {/* Notifiche email */}
              <div className="mt-6">
                <fieldset>
                  <legend className="text-base font-medium text-gray-900 dark:text-white">AI</legend>
                  <div className="mt-4 space-y-4">
                    <AISettingsPanel />
                    
                  </div>
                </fieldset>
              </div>
            </div>
            
          )}

          {/* Tab placeholder per le altre sezioni */}
          {['appearance', 'security', 'billing', 'help'].includes(activeTab) && (
            <div className="text-center py-8 sm:py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-800/30 text-blue-600 dark:text-blue-400 mb-4">
                {tabs.find(tab => tab.id === activeTab)?.icon}
              </div>
              <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
                Impostazioni {tabs.find(tab => tab.id === activeTab)?.name}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Questa sezione è in fase di sviluppo. Torna a trovarci presto!
              </p>
            </div>
          )}
        </div>
      </div>
    </EnhancedLayout>
  );
}
