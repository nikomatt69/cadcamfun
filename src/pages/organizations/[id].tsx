// src/pages/organizations/[id].tsx
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";

import { useRouter } from "next/router";
import { DynamicLayout } from "src/components/dynamic-imports";
import { Users, Settings, Plus, UserPlus, Edit, Trash2, Mail, Shield, CheckCircle, XCircle } from "react-feather";
import Metatags from "@/src/components/layout/Metatags";
import Loading from "@/src/components/ui/Loading";
import MetaTags from "@/src/components/layout/Metatags";
import { useSession } from "@/src/lib/auth-client";
// Animation variants
const pageVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.1, 0.25, 1.0],
      staggerChildren: 0.1
    }
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 0.1, 0.25, 1.0]
    }
  }
};

const buttonVariants: Variants = {
  hover: {
    scale: 1.05,
    y: -2,
    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 10
    }
  },
  tap: {
    scale: 0.95
  }
};

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
  role: "ADMIN" | "MANAGER" | "MEMBER";
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

  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "projects" | "settings" | "chat">("overview");
  const [userRole, setUserRole] = useState<"ADMIN" | "MANAGER" | "MEMBER" | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MANAGER" | "MEMBER">("MEMBER");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (session && id && typeof id === "string") {
      fetchOrganizationData(id);
    }
  }, [session, id]);

  const fetchOrganizationData = async (orgId: string) => {
    setIsLoading(true);
    try {
      // Fetch organization details
      const response = await fetch(`/api/organizations/${orgId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch organization");
      }
      const data = await response.json();
      setOrganization(data);

      // Fetch organization members
      const membersResponse = await fetch(`/api/organizations/${orgId}/members`);
      if (membersResponse.ok) {
        const membersData = await membersResponse.json();
        setMembers(membersData);

        // Determine current user's role
        const currentUserMember = membersData.find((member: Member) => member.user.id === session?.user.id);
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
      console.error("Error fetching organization data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/organizations/${organization?.id}/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.user.id || ""}`,
          "Accept": "application/json"
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });

      if (!response.ok) {
        throw new Error("Failed to send invitation");
      }

      // Handle success
      setInviteEmail("");
      setInviteRole("MEMBER");
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
      console.error("Error inviting member:", error);
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
      case "ADMIN":
        return "bg-red-100 text-red-800";
      case "MANAGER":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const canManageMembers = userRole === "ADMIN" || userRole === "MANAGER";
  const canManageSettings = userRole === "ADMIN";

  if (status === "loading" || isLoading) {
    return <Loading />;
  }

  if (status === "unauthenticated") {
    router.push("/waitlist");
    return null;
  }

  if (!organization) {
    return (
      <DynamicLayout>
        <div className="p-6 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Organization not found</h1>
          <p className="text-gray-600 mb-6">
            The organization you are looking for does not exist or you do not have access to it.
          </p>
          <button
            onClick={() => router.push("/profile")}
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
      <MetaTags
        description={organization.description || ""}
        ogImage={`/api/og-image/organization/${organization.id}?title=${encodeURIComponent(organization.name)}`}
      />
      <DynamicLayout>
        <motion.div
          className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={pageVariants}
        >
          <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
            {/* Header Section */}
            <motion.div
              className="bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl shadow-lg rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 mb-8"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="flex items-center">
                  <div className="mr-4 h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <Users className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      {organization.name}
                    </h1>
                    {organization.description && (
                      <p className="mt-2 text-gray-600 dark:text-gray-400">{organization.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span>Created: {formatDate(organization.createdAt)}</span>
                      <span>•</span>
                      <span>{members.length} Members</span>
                      <span>•</span>
                      <span>{projects.length} Projects</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <motion.button
                    onClick={handleCreateProject}
                    className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-lg shadow-blue-500/25 transition-all"
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                  >
                    <Plus size={18} className="mr-2" />
                    New Project
                  </motion.button>
                  {canManageMembers && (
                    <motion.button
                      onClick={() => setShowInviteModal(true)}
                      className="inline-flex items-center px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl hover:from-green-600 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 shadow-lg shadow-green-500/25 transition-all"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <UserPlus size={18} className="mr-2" />
                      Invite Member
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Tabs - Apply dark mode hover styles */}
          <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
            <nav className="-mb-px flex space-x-4">
              <button
                className={`whitespace-nowrap px-3 py-2  font-medium text-sm rounded-md ${activeTab === "overview"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                  }`}
                onClick={() => setActiveTab("overview")}
              >
                Overview
              </button>
              <button
                className={`whitespace-nowrap px-3 py-2  font-medium text-sm rounded-md ${activeTab === "chat"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                  }`}
                onClick={() => router.push(`/organizations/${organization.id}/chat`)}
              >
                Chat
              </button>
              <button
                className={`whitespace-nowrap px-3 py-2  font-medium text-sm rounded-md ${activeTab === "members"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                  }`}
                onClick={() => setActiveTab("members")}
              >
                Members
              </button>
              <button
                className={`whitespace-nowrap px-3 py-2 font-medium text-sm rounded-md ${activeTab === "projects"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                  }`}
                onClick={() => setActiveTab("projects")}
              >
                Projects
              </button>
              {canManageSettings && (
                <button
                  className={`whitespace-nowrap px-3 py-2 font-medium text-sm rounded-md ${activeTab === "settings"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:border-gray-600 dark:hover:bg-gray-700"
                    }`}
                  onClick={() => setActiveTab("settings")}
                >
                  Settings
                </button>
              )}
            </nav>
          </div>

          {/* Tab content - Apply dark mode container */}
          <div className="bg-[#F8FBFF] dark:bg-gray-800 shadow-md rounded-lg">
            {/* Overview - Apply dark mode */}
            {activeTab === "overview" && (
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h2 className="text-lg font-medium text-gray-900 dark:text-blue-400 mb-4">About</h2>
                    <p className="text-gray-600 dark:text-gray-400">
                      {organization.description || "No description available."}
                    </p>

                    <h3 className="text-md font-medium text-gray-900 dark:text-blue-400 mt-6 mb-2">Details</h3>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="block text-gray-500 dark:text-gray-400">Created</span>
                          <span className="dark:text-gray-300">{formatDate(organization.createdAt)}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 dark:text-gray-400">Updated</span>
                          <span className="dark:text-gray-300">{formatDate(organization.updatedAt)}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 dark:text-gray-400">Members</span>
                          <span className="dark:text-gray-300">{members.length}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500 dark:text-gray-400">Projects</span>
                          <span className="dark:text-gray-300">{projects.length}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-medium text-gray-900 dark:text-blue-400 mb-4">Recent Activity</h2>
                    <div className="border dark:border-gray-700 rounded-md divide-y dark:divide-gray-700">
                      {/* Activity items would go here */}
                      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                        No recent activity to display.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Members - Apply dark mode */}
            {activeTab === "members" && (
              <div>
                <div className="p-6  border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-blue-400">Organization Members</h2>
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
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Member
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Role
                          </th>
                          <th
                            scope="col"
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            Joined
                          </th>
                          {canManageMembers && (
                            <th
                              scope="col"
                              className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                            >
                              Actions
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-[#F8FBFF] dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {members.map(member => (
                          <tr key={member.id}>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-10 w-10">
                                  {member.user.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      className="h-10 w-10 rounded-full"
                                      src={member.user.image}
                                      alt={member.user.name || "User"}
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                                      <User className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                                    </div>
                                  )}
                                </div>
                                <div className="ml-4">
                                  <div className="text-sm font-medium text-gray-900 dark:text-blue-400">
                                    {member.user.name || "Unnamed User"}
                                  </div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">{member.user.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadgeColor(member.role)} dark:text-gray-900`}
                              >
                                {member.role}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                              {formatDate(member.joinedAt)}
                            </td>
                            {canManageMembers && (
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-3">
                                  Edit
                                </button>
                                <button className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
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

            {/* Projects - Apply dark mode */}
            {activeTab === "projects" && (
              <div>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-blue-400">Organization Projects</h2>
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
                        className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
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
                      <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-blue-400">No projects</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Get started by creating a new project.
                      </p>
                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={handleCreateProject}
                          className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Create Project
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {projects.map(project => (
                        <div
                          key={project.id}
                          className="border dark:border-gray-700 rounded-md shadow-sm hover:shadow-md transition-shadow bg-[#F8FBFF] dark:bg-gray-900 overflow-hidden cursor-pointer"
                          onClick={() => router.push(`/projects/${project.id}`)}
                        >
                          <div className="p-4">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-blue-400">{project.name}</h3>
                            {project.description && (
                              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                {project.description}
                              </p>
                            )}
                            <div className="mt-3 flex items-center text-sm text-gray-500 dark:text-gray-400">
                              <User className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
                              <span>Owner: {project.owner.name || "Unknown"}</span>
                            </div>
                            <div className="mt-1 text-sm text-gray-500 dark:text-gray-500">
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

            {/* Settings - Apply dark mode */}
            {activeTab === "settings" && canManageSettings && (
              <div>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-blue-400">Organization Settings</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Manage organization information and preferences.
                  </p>
                </div>
                <div className="p-6">
                  <form className="space-y-6">
                    <div>
                      <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Organization Name
                      </label>
                      <input
                        type="text"
                        name="orgName"
                        id="orgName"
                        className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                        defaultValue={organization.name}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="description"
                        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        Description
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        rows={3}
                        className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                        defaultValue={organization.description || ""}
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

                  <div className="mt-10 pt-10 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-red-700 dark:text-red-500">Danger Zone</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Once you delete an organization, there is no going back. Please be certain.
                    </p>
                    <div className="mt-3">
                      <button
                        type="button"
                        className="inline-flex justify-center py-2 px-4 border border-red-300 dark:border-red-600 shadow-sm text-sm font-medium rounded-md text-red-700 dark:text-red-400 bg-[#F8FBFF] dark:bg-red-900/20 hover:bg-red-50 dark:hover:bg-red-800/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Delete Organization
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </motion.div>

        {/* Invite Member Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
            <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
                aria-hidden="true"
                onClick={() => setShowInviteModal(false)}
              ></div>

              <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
                &#8203;
              </span>

              <div className="inline-block align-bottom bg-[#F8FBFF] dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <form onSubmit={handleInviteMember}>
                  <div className="bg-[#F8FBFF] dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                    <div className="sm:flex sm:items-start">
                      <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 dark:bg-gray-700 sm:mx-0 sm:h-10 sm:w-10">
                        <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                        <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-blue-400" id="modal-title">
                          Invite Team Member
                        </h3>
                        <div className="mt-2">
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Send an invitation email to add a new member to this organization.
                          </p>
                        </div>

                        <div className="mt-4">
                          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Email Address
                          </label>
                          <input
                            type="email"
                            name="email"
                            id="email"
                            className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                            placeholder="colleague@example.com"
                            value={inviteEmail}
                            onChange={e => setInviteEmail(e.target.value)}
                            required
                          />
                        </div>

                        <div className="mt-4">
                          <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Role
                          </label>
                          <select
                            id="role"
                            name="role"
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            value={inviteRole}
                            onChange={e => setInviteRole(e.target.value as "ADMIN" | "MANAGER" | "MEMBER")}
                          >
                            <option value="MEMBER">Member (Can view and edit)</option>
                            <option value="MANAGER">Manager (Can add/remove members)</option>
                            {userRole === "ADMIN" && <option value="ADMIN">Admin (Full control)</option>}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                      {isSubmitting ? "Sending..." : "Send Invitation"}
                    </button>
                    <button
                      type="button"
                      className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-[#F8FBFF] dark:bg-gray-700 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
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
