// src/pages/organizations/[id].tsx
import Image from 'next/image';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { 
  Users, Settings, Plus, UserPlus, Edit, Trash2, 
  Mail, Shield, CheckCircle, XCircle 
} from 'react-feather';
import Metatags from '@/src/components/layout/Metatags';
import Loading from '@/src/components/ui/Loading';

interface Organization {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MANAGER' | 'MEMBER';
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
  joinedAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
  };
}

export default function OrganizationDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'projects' | 'settings'|'chat'>('overview');
  const [userRole, setUserRole] = useState<'ADMIN' | 'MANAGER' | 'MEMBER' | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'ADMIN' | 'MANAGER' | 'MEMBER'>('MEMBER');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && id && typeof id === 'string') {
      fetchOrganizationData(id);
    }
  }, [status, id]);

  const fetchOrganizationData = async (orgId: string) => {
    setIsLoading(true);
    try {
      // Fetch organization details
      const response = await fetch(`/api/organizations/${orgId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch organization');
      }
      const data = await response.json();
      setOrganization(data);
      
      // Fetch organization members
      const membersResponse = await fetch(`/api/organizations/${orgId}/members`);
      if (membersResponse.ok) {
        const membersData = await membersResponse.json();
        setMembers(membersData);
        
        // Determine current user's role
        const currentUserMember = membersData.find(
          (member: Member) => member.user.id === session?.user.id
        );
        if (currentUserMember) {
          setUserRole(currentUserMember.role);
        }
      }
      
      // Fetch organization projects
      const projectsResponse = await fetch(`/api/organizations/${orgId}/projects`);
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        setProjects(projectsData);
      }
    } catch (error) {
      console.error('Error fetching organization data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/organizations/${organization?.id}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.user.id || '' }`,
          'Accept': 'application/json',
          
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send invitation');
      }
      
      // Handle success
      setInviteEmail('');
      setInviteRole('MEMBER');
      setShowInviteModal(false);
      
      // Refresh members list
      if (organization) {
        const membersResponse = await fetch(`/api/organizations/${organization.id}/members`);
        if (membersResponse.ok) {
          const membersData = await membersResponse.json();
          setMembers(membersData);
        }
      }
    } catch (error) {
      console.error('Error inviting member:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateProject = () => {
    router.push(`/projects/create?organizationId=${organization?.id}`);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-red-100 text-red-800';
      case 'MANAGER':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const canManageMembers = userRole === 'ADMIN' || userRole === 'MANAGER';
  const canManageSettings = userRole === 'ADMIN';

  if (status === 'loading' || isLoading) {
    return <Loading/>;
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  if (!organization) {
    return (
      <DynamicLayout>
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Organizzazione non trovata</h1>
          <p className="text-gray-600 mb-6">L&apos;organizzazione che stai cercando non esiste o non hai accesso a essa.</p>
          <button
            onClick={() => router.push('/profile')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Back to Profile
          </button>
        </div>
      </DynamicLayout>
    );
  }

  return (
    <>
      <Metatags title={organization.name}
      description={organization.description|| ''}
      ogImage={`/api/og-image/organization/${organization.id}?title=${encodeURIComponent(organization.name)}`} />
      <DynamicLayout>
        <div className="p-6">
          {/* Organization header */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg p-6 mb-6">
            <div>
              <div className="flex items-center">
                <div className="mr-4 h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{organization.name}</h1>
                  {organization.description && (
                    <p className="text-gray-600 mt-1">{organization.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-500">
                <span className="mr-3">Created: {formatDate(organization.createdAt)}</span>
                <span>Members: {members.length}</span>
              </div>
            </div>
            
            <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
              <button
                onClick={handleCreateProject}
                className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center"
              >
                <Plus size={16} className="mr-1" />
                New Project
              </button>
              {canManageMembers && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="bg-green-600 text-white px-3 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center"
                >
                  <UserPlus size={16} className="mr-1" />
                  Invite Member
                </button>
              )}
            </div>
          </div>
          
          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                className={`px-1 py-4 border-b-2 font-medium text-sm ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              <button
                 className={`px-1 py-4 border-b-2 font-medium text-sm ${
                 activeTab === 'chat'
                 ? 'border-blue-500 text-blue-600'
                 : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                 }`}
                 onClick={() => router.push(`/organizations/${organization.id}/chat`)}
                >
                 Chat
              </button>
              <button
                className={`px-1 py-4 border-b-2 font-medium text-sm ${
                  activeTab === 'members'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('members')}
              >
                Members
              </button>
              <button
                className={`px-1 py-4 border-b-2 font-medium text-sm ${
                  activeTab === 'projects'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => setActiveTab('projects')}
              >
                Projects
              </button>
              {canManageSettings && (
                <button
                  className={`px-1 py-4 border-b-2 font-medium text-sm ${
                    activeTab === 'settings'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('settings')}
                >
                  Settings
                </button>
              )}
            </nav>
          </div>
          
          {/* Tab content */}
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg">
            {/* Overview */}
            {activeTab === 'overview' && (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900 mb-4">About</h2>
                    <p className="text-gray-600">
                      {organization.description || 'No description available.'}
                    </p>
                    
                    <h3 className="text-md font-medium text-gray-900 mt-6 mb-2">Details</h3>
                    <div className="bg-gray-50 rounded-md p-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="block text-gray-500">Created</span>
                          <span>{formatDate(organization.createdAt)}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500">Updated</span>
                          <span>{formatDate(organization.updatedAt)}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500">Members</span>
                          <span>{members.length}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500">Projects</span>
                          <span>{projects.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Activity</h2>
                    <div className="border rounded-md divide-y">
                      {/* Activity items would go here */}
                      <div className="p-4 text-center text-gray-500">
                        No recent activity to display.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Members */}
            {activeTab === 'members' && (
              <div>
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900">Organization Members</h2>
                  {canManageMembers && (
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center text-sm"
                    >
                      <UserPlus size={16} className="mr-1" />
                      Invite
                    </button>
                  )}
                </div>
                <div className="p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Member
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Role
                          </th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Joined
                          </th>
                          {canManageMembers && (
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white divide-y divide-gray-200">
                        {members.map((member) => (
                          <tr key={member.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  {member.user.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img 
                                      className="h-10 w-10 rounded-full" 
                                      src={member.user.image} 
                                      alt={member.user.name || 'User'} 
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                      <User className="h-6 w-6 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900">
                                    {member.user.name || 'Unnamed User'}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    {member.user.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(member.role)}`}>
                                {member.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(member.joinedAt)}
                            </td>
                            {canManageMembers && (
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button className="text-blue-600 hover:text-blue-900 mr-3">
                                  Edit
                                </button>
                                <button className="text-red-600 hover:text-red-900">
                                  Remove
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            
            {/* Projects */}
            {activeTab === 'projects' && (
              <div>
                <div className="p-6 border-b border-gray-200 flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900">Organization Projects</h2>
                  <button
                    onClick={handleCreateProject}
                    className="bg-blue-600 text-white px-3 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center text-sm"
                  >
                    <Plus size={16} className="mr-1" />
                    New Project
                  </button>
                </div>
                <div className="p-6">
                  {projects.length === 0 ? (
                    <div className="text-center py-12">
                      <svg 
                        className="mx-auto h-12 w-12 text-gray-400" 
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m-6-8h6M9 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-4m-7 9.5V4.7c0-1 .573-1.902 1.465-2.332A2.066 2.066 0 0111.535 2c.365 0 .72.13 1 .366.28.236.47.56.535.92L14 8"
                        />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">No projects</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Get started by creating a new project.
                      </p>
                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={handleCreateProject}
// src/pages/organizations/[id].tsx (continued)
                          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Create Project
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className="border rounded-md shadow-sm hover:shadow-md transition-shadow bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white overflow-hidden cursor-pointer"
                          onClick={() => router.push(`/projects/${project.id}`)}
                        >
                          <div className="p-4">
                            <h3 className="text-lg font-medium text-gray-900">{project.name}</h3>
                            {project.description && (
                              <p className="mt-1 text-sm text-gray-600 line-clamp-2">{project.description}</p>
                            )}
                            <div className="mt-3 flex items-center text-sm text-gray-500">
                              <User className="flex-shrink-0 mr-1.5 h-4 w-4" />
                              <span>Owner: {project.owner.name || 'Unknown'}</span>
                            </div>
                            <div className="mt-1 text-sm text-gray-500">
                              Created: {formatDate(project.createdAt)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Settings */}
            {activeTab === 'settings' && canManageSettings && (
              <div>
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-medium text-gray-900">Organization Settings</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Manage organization information and preferences.
                  </p>
                </div>
                <div className="p-6">
                  <form className="space-y-6">
                    <div>
                      <label htmlFor="orgName" className="block text-sm font-medium text-gray-700">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        name="orgName"
                        id="orgName"
                        className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                        defaultValue={organization.name}
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                        Description
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={3}
                        className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                        defaultValue={organization.description || ''}
                      ></textarea>
                    </div>
                    
                    <div>
                      <button
                        type="submit"
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Save Changes
                      </button>
                    </div>
                  </form>
                  
                  <div className="mt-10 pt-10 border-t border-gray-200">
                    <h3 className="text-lg font-medium text-red-700">Danger Zone</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Once you delete an organization, there is no going back. Please be certain.
                    </p>
                    <div className="mt-3">
                      <button
                        type="button"
                        className="inline-flex justify-center py-2 px-4 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Delete Organization
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Invite Member Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={() => setShowInviteModal(false)}></div>
              
              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
              
              <div className="inline-block align-bottom bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <form onSubmit={handleInviteMember}>
                  <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div className="sm:flex sm:items-start">
                      <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                        <Mail className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                        <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                          Invite Team Member
                        </h3>
                        <div className="mt-2">
                          <p className="text-sm text-gray-500">
                            Send an invitation email to add a new member to this organization.
                          </p>
                        </div>
                        
                        <div className="mt-4">
                          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                            Email Address
                          </label>
                          <input
                            type="email"
                            name="email"
                            id="email"
                            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                            placeholder="colleague@example.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="mt-4">
                          <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                            Role
                          </label>
                          <select
                            id="role"
                            name="role"
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as 'ADMIN' | 'MANAGER' | 'MEMBER')}
                          >
                            <option value="MEMBER">Member (Can view and edit)</option>
                            <option value="MANAGER">Manager (Can add/remove members)</option>
                            {userRole === 'ADMIN' && (
                              <option value="ADMIN">Admin (Full control)</option>
                            )}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                      {isSubmitting ? 'Sending...' : 'Send Invitation'}
                    </button>
                    <button
                      type="button"
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                      onClick={() => setShowInviteModal(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </DynamicLayout>
    </>
  );
}

// For the missing User component
const User = ({ className = "", ...props }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={`feather feather-user ${className}`}
    {...props}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);