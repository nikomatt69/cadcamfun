// src/pages/profile/index.tsx

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { User, Mail, MapPin, Calendar, Edit, GitHub, Globe, Settings, Layout } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import MetaTags from '@/src/components/layout/Metatags';
import ImageService from '@/src/lib/imageService';
import useUserProfileStore from '@/src/store/userProfileStore';
import Image from 'next/image';

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  github: string | null;
  createdAt: string;
  organizations: {
    id: string;
    name: string;
    role: string;
  }[];
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Component {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

interface Toolpath {
  id: string;
  name: string;
  description: string | null;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  projectId: string;
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { username } = router.query; // For viewing other profiles
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [toolpaths, setToolpaths] = useState<Toolpath[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'projects' | 'components' | 'toolpaths'>('projects');
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);

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
  useEffect(() => {
    if (status === 'authenticated') {
      // Determine if viewing own profile or someone else's
      if (!username || username === session?.user?.id) {
        setIsOwnProfile(true);
        fetchOwnProfile();
      } else {
        setIsOwnProfile(false);
        fetchUserProfile(username as string);
      }
    } else if (status === 'unauthenticated' && !username) {
      router.push('/auth/signup');
    }
  }, [status, username, session]);

  const fetchOwnProfile = async () => {
    setIsLoading(true);
    try {
      // Fetch profile data
      const profileRes = await fetch('/api/user/profile');
      if (!profileRes.ok) throw new Error('Failed to fetch profile');
      const profileData = await profileRes.json();
      setProfile(profileData);
      
      // Fetch projects
      const projectsRes = await fetch('/api/user/projects');
      if (!projectsRes.ok) throw new Error('Failed to fetch projects');
      const projectsData = await projectsRes.json();
      setProjects(projectsData);
      
      // Fetch components
      const componentsRes = await fetch('/api/user/components');
      if (!componentsRes.ok) throw new Error('Failed to fetch components');
      const componentsData = await componentsRes.json();
      setComponents(componentsData);

      // Fetch toolpaths
      const toolpathsRes = await fetch('/api/user/toolpaths');
      if (!toolpathsRes.ok) throw new Error('Failed to fetch toolpaths');
      const toolpathsData = await toolpathsRes.json();
      setToolpaths(toolpathsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUserProfile = async (userId: string) => {
    setIsLoading(true);
    try {
      // Fetch public profile data
      const profileRes = await fetch(`/api/users/${userId}`);
      if (!profileRes.ok) throw new Error('Failed to fetch profile');
      const profileData = await profileRes.json();
      setProfile(profileData);
      
      // Fetch public projects
      const projectsRes = await fetch(`/api/users/${userId}/projects`);
      if (!projectsRes.ok) throw new Error('Failed to fetch projects');
      const projectsData = await projectsRes.json();
      setProjects(projectsData);
      
      // Fetch public components
      const componentsRes = await fetch(`/api/users/${userId}/components`);
      if (!componentsRes.ok) throw new Error('Failed to fetch components');
      const componentsData = await componentsRes.json();
      setComponents(componentsData);

      // Fetch public toolpaths
      const toolpathsRes = await fetch(`/api/users/${userId}/toolpaths`);
      if (!toolpathsRes.ok) throw new Error('Failed to fetch toolpaths');
      const toolpathsData = await toolpathsRes.json();
      setToolpaths(toolpathsData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long'
    });
  };

  if (status === 'loading' || isLoading) {
    return <div className="flex h-screen items-center justify-center"><Loading/></div>;
  }

  if (!profile) {
    return (
      <Layout>
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">User not found</h1>
          <p className="text-gray-600 mb-4">The profile you are looking for doesnt exist or isnt available.</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800">
            Return to homepage
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <>
      <MetaTags 
        title={`${profile.name || 'User'} | Profile`}
        description={`View ${profile.name || 'User'}'s profile, projects and components.`}
      />
      <DynamicLayout>
        {/* Profile Header */}
        <div className="bg-[#F8FBFF] border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="md:flex md:items-center md:justify-between">
              <div className="flex items-center space-x-5">
                <div className="flex-shrink-0">
                {profileImage ? (
                          <img
                            src={profileImage} 
                            alt="Profile" 
                            className="h-24 w-24 rounded-full object-cover"
                          />
                        ) : (
                          <svg className="h-20 w-20 rounded-full text-gray-300 dark:text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                        )}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 sm:truncate">
                    {profile.name || 'User'}
                  </h1>
                  <div className="mt-1 flex flex-col sm:flex-row sm:flex-wrap sm:mt-0 sm:space-x-6">
                    {profile.email && (
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <Mail className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        {profile.email}
                      </div>
                    )}
                    {profile.location && (
                      <div className="mt-2 flex items-center text-sm text-gray-500">
                        <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                        {profile.location}
                      </div>
                    )}
                    <div className="mt-2 flex items-center text-sm text-gray-500">
                      <Calendar className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                      Joined {formatDate(profile.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex flex-col-reverse justify-stretch space-y-4 space-y-reverse sm:flex-row-reverse sm:justify-end sm:space-x-3 sm:space-y-0 sm:space-x-reverse md:mt-0 md:flex-row md:space-x-3">
                {isOwnProfile && (
                  <Link href="/profile/settings" className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <Settings className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Link>
                )}
                {profile.github && (
                  <a href={profile.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <GitHub className="h-4 w-4 mr-2" />
                    GitHub
                  </a>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <Globe className="h-4 w-4 mr-2" />
                    Website
                  </a>
                )}
              </div>
            </div>
            
            {profile.bio && (
              <div className="mt-6 max-w-3xl">
                <p className="text-gray-700">{profile.bio}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Stats Bar */}
        <div className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex overflow-x-auto py-4 space-x-8">
              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="px-4 py-2 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{projects.length}</div>
                    <div className="text-sm font-medium text-gray-500">Projects</div>
                  </div>
                  <div className="px-4 py-2 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{components.length}</div>
                    <div className="text-sm font-medium text-gray-500">Components</div>
                  </div>
                  <div className="px-4 py-2 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{toolpaths.length}</div>
                    <div className="text-sm font-medium text-gray-500">Toolpaths</div>
                  </div>
                  <div className="px-4 py-2 text-center">
                    <div className="text-2xl font-semibold text-gray-900">{profile.organizations?.length || 0}</div>
                    <div className="text-sm font-medium text-gray-500">Organizations</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Content Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('projects')}
                className={`${
                  activeTab === 'projects'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Projects
              </button>
              <button
                onClick={() => setActiveTab('components')}
                className={`${
                  activeTab === 'components'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Components
              </button>
              <button
                onClick={() => setActiveTab('toolpaths')}
                className={`${
                  activeTab === 'toolpaths'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
              >
                Toolpaths
              </button>
            </nav>
          </div>
          
          {/* Content Grid */}
          <div className="mt-6">
            {activeTab === 'projects' && (
              <>
                {projects.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((project) => (
                      <div key={project.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow duration-300">
                        <Link href={`/projects/${project.id}`}>
                          <div className="h-48 bg-gray-200 relative">
                            {project.thumbnail ? (
                              <img 
                                src={project.thumbnail} 
                                alt={project.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-gray-400 text-lg">No thumbnail</span>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-1">{project.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-2">{project.description}</p>
                            
                            <div className="flex justify-between items-center text-sm text-gray-500">
                              <span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {isOwnProfile ? 'Get started by creating a new project.' : 'This user has no public projects yet.'}
                    </p>
                    {isOwnProfile && (
                      <div className="mt-6">
                        <Link href="/projects" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                          <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                          </svg>
                          New Project
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            
            {activeTab === 'components' && (
              <>
                {components.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {components.map((component) => (
                      <div key={component.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow duration-300">
                        <Link href={`/components/${component.id}`}>
                          <div className="h-48 bg-gray-200 relative">
                            {component.thumbnail ? (
                              <img
                                src={component.thumbnail} 
                                alt={component.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-gray-400 text-lg">No thumbnail</span>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-1">{component.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-2">{component.description}</p>
                            
                            <div className="flex justify-between items-center text-sm text-gray-500">
                              <span>Updated {new Date(component.updatedAt).toLocaleDateString()}</span>
                              <Link href={`/projects/${component.projectId}`} className="text-blue-600 hover:text-blue-800">
                                View Project
                              </Link>
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No components</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {isOwnProfile ? 'Get started by creating a new component.' : 'This user has no public components yet.'}
                    </p>
                    {isOwnProfile && (
                      <div className="mt-6">
                        <Link href="/components/new" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                          <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                          </svg>
                          New Component
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'toolpaths' && (
              <>
                {toolpaths.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {toolpaths.map((toolpath) => (
                      <div key={toolpath.id} className="bg-white rounded-lg shadow overflow-hidden hover:shadow-md transition-shadow duration-300">
                        <Link href={`/toolpaths/${toolpath.id}`}>
                          <div className="h-48 bg-gray-200 relative">
                            {toolpath.thumbnail ? (
                              <img
                                src={toolpath.thumbnail} 
                                alt={toolpath.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-gray-400 text-lg">No thumbnail</span>
                              </div>
                            )}
                          </div>
                          <div className="p-4">
                            <h3 className="text-lg font-medium text-gray-900 mb-1">{toolpath.name}</h3>
                            <p className="text-sm text-gray-500 line-clamp-2 h-10 mb-2">{toolpath.description}</p>
                            
                            <div className="flex justify-between items-center text-sm text-gray-500">
                              <span>Updated {new Date(toolpath.updatedAt).toLocaleDateString()}</span>
                              <Link href={`/projects/${toolpath.projectId}`} className="text-blue-600 hover:text-blue-800">
                                View Project
                              </Link>
                            </div>
                          </div>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V7a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No toolpaths</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {isOwnProfile ? 'Get started by creating a new toolpath.' : 'This user has no public toolpaths yet.'}
                    </p>
                    {isOwnProfile && (
                      <div className="mt-6">
                        <Link href="/toolpaths/new" className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                          <svg className="-ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                          </svg>
                          New Toolpath
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DynamicLayout>
    </>
  );
}