// src/pages/toolpaths/[id].tsx
import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { 
  Save, 
  ArrowLeft, 
  Code, 
  Trash2, 
  AlertCircle, 
  Check, 
  Cpu, 
  ExternalLink,
  Download,
  Layers,
  MessageCircle,
  Edit,
  Calendar,
  Clock,
  Share2
} from 'react-feather';
import { fetchToolpathById, updateToolpath, deleteToolpath, ToolpathData } from '@/src/lib/api/toolpaths';
import { fetchToolpathVersions, createToolpathVersion, restoreToolpathVersion } from 'src/lib/api/toolpathVersions';
import { fetchToolpathComments, createToolpathComment, deleteToolpathComment } from 'src/lib/api/toolpathComments';
import Loading from '@/src/components/ui/Loading';
import Metatags from '@/src/components/layout/Metatags';
import { motion } from 'framer-motion';
import { cn } from '@/src/lib/utils';
import toast from 'react-hot-toast';
import Split from 'react-split';
import { format } from 'date-fns';
import { useDebounce } from 'use-debounce';
import ReactMarkdown from 'react-markdown';

export default function ToolpathDetail() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  
  // State for toolpath data
  const [toolpath, setToolpath] = useState<ToolpathData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for editing
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: '',
    operationType: '',
    isPublic: false,
    gcode: '',
    data: {}
  });
  
  // State for tabs
  const [activeTab, setActiveTab] = useState<'details' | 'gcode' | 'versions' | 'comments'>('details');
  
  // State for versions and comments
  const [versions, setVersions] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');
  
  // Refs
  const gcodeRef = useRef<HTMLTextAreaElement>(null);
  
  // Debounce for auto-save
  const [debouncedFormData] = useDebounce(formData, 2000);
  
  // Load toolpath data
  useEffect(() => {
    if (id && status === 'authenticated') {
      fetchToolpathData();
    }
  }, [id, status]);
  
  // Auto-save functionality
  useEffect(() => {
    if (isEditing && toolpath && debouncedFormData.name) {
      handleAutoSave();
    }
  }, [debouncedFormData]);
  
  // Prepare form data when toolpath is loaded
  useEffect(() => {
    if (toolpath) {
      setFormData({
        name: toolpath.name || '',
        description: toolpath.description || '',
        type: toolpath.type || 'mill',
        operationType: toolpath.operationType || 'contour',
        isPublic: toolpath.isPublic || false,
        gcode: toolpath.gcode || '',
        data: toolpath.data || {}
      });
    }
  }, [toolpath]);
  
  // Fetch toolpath data and related information
  const fetchToolpathData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch toolpath details
      const toolpathData = await fetchToolpathById(id as string);
      setToolpath(toolpathData);
      
      // Fetch versions if on versions tab
      if (activeTab === 'versions') {
        await fetchVersionsData();
      }
      
      // Fetch comments if on comments tab
      if (activeTab === 'comments') {
        await fetchCommentsData();
      }
    } catch (err) {
      console.error('Error fetching toolpath:', err);
      setError(err instanceof Error ? err.message : 'An error occurred while fetching the toolpath');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch versions data
  const fetchVersionsData = async () => {
    try {
      const versionsData = await fetchToolpathVersions(id as string);
      setVersions(versionsData);
    } catch (err) {
      console.error('Error fetching versions:', err);
      toast.error('Failed to load version history');
    }
  };
  
  // Fetch comments data
  const fetchCommentsData = async () => {
    try {
      const commentsData = await fetchToolpathComments(id as string);
      setComments(Array.isArray(commentsData) ? commentsData : []);
    } catch (err) {
      console.error('Error fetching comments:', err);
      toast.error('Failed to load comments');
      setComments([]);
    }
  };
  
  // Handle tab change
  const handleTabChange = async (tab: 'details' | 'gcode' | 'versions' | 'comments') => {
    setActiveTab(tab);
    
    // Load data for the selected tab if not already loaded
    if (tab === 'versions' && versions.length === 0) {
      await fetchVersionsData();
    } else if (tab === 'comments' && comments.length === 0) {
      await fetchCommentsData();
    }
  };
  
  // Handle form field changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  // Handle G-code changes
  const handleGcodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, gcode: e.target.value }));
  };
  
  // Handle auto-save
  const handleAutoSave = async () => {
    if (!toolpath || !toolpath.id) return;
    
    try {
      const updatedToolpath = await updateToolpath({
        id: toolpath.id,
        name: formData.name,
        description: formData.description,
        type: formData.type,
        operationType: formData.operationType,
        isPublic: formData.isPublic,
        gcode: formData.gcode,
        data: formData.data
      });
      
      toast.success('Changes auto-saved', { 
        id: 'autosave',
        duration: 2000 
      });
      
      // Update local state with the latest data
      setToolpath(updatedToolpath);
    } catch (err) {
      console.error('Error auto-saving:', err);
      toast.error('Failed to auto-save changes', {
        id: 'autosave-error'
      });
    }
  };
  
  // Save changes manually
  const handleSave = async () => {
    if (!toolpath || !toolpath.id) return;
    
    setIsLoading(true);
    
    try {
      const updatedToolpath = await updateToolpath({
        id: toolpath.id,
        name: formData.name,
        description: formData.description,
        type: formData.type,
        operationType: formData.operationType,
        isPublic: formData.isPublic,
        gcode: formData.gcode,
        data: formData.data
      });
      
      // Create a new version
      await createToolpathVersion({
        toolpathId: toolpath.id,
        data: formData.data,
        gcode: formData.gcode,
        changeMessage: `Manual save on ${new Date().toLocaleDateString()}`
      });
      
      toast.success('Toolpath saved successfully');
      
      // Update local state
      setToolpath(updatedToolpath);
      setIsEditing(false);
      
      // Refresh versions if on versions tab
      if (activeTab === 'versions') {
        await fetchVersionsData();
      }
    } catch (err) {
      console.error('Error saving toolpath:', err);
      toast.error('Failed to save toolpath');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle toolpath deletion
  const handleDelete = async () => {
    if (!toolpath || !toolpath.id) return;
    
    if (!confirm('Are you sure you want to delete this toolpath? This action cannot be undone.')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      await deleteToolpath(toolpath.id);
      toast.success('Toolpath deleted successfully');
      router.push('/toolpaths');
    } catch (err) {
      console.error('Error deleting toolpath:', err);
      toast.error('Failed to delete toolpath');
      setIsLoading(false);
    }
  };
  
  const handleRestoreVersion = async (versionId: string) => {
    if (!toolpath || !toolpath.id) return;
    
    if (!confirm('Are you sure you want to restore this version? Current changes will be saved as a backup version.')) {
      return;
    }
    
    setIsLoading(true);
    
    try {
      await restoreToolpathVersion({
        id: toolpath.id,
        versionId
      });
      
      // Fetch the updated toolpath
      const result = await fetchToolpathById(toolpath.id);
      
      toast.success('Version restored successfully');
      
      // Update local state
      setToolpath(result);
      setFormData({
        name: result.name || '',
        description: result.description || '',
        type: result.type || 'mill',
        operationType: result.operationType || 'contour',
        isPublic: result.isPublic || false,
        gcode: result.gcode || '',
        data: result.data || {}
      });
      
      // Refresh versions
      await fetchVersionsData();
    } catch (err) {
      console.error('Error restoring version:', err);
      toast.error('Failed to restore version');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle adding a comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!toolpath || !toolpath.id || !newComment.trim()) return;
    
    if (!session?.user?.id) {
      toast.error('You must be logged in to comment');
      return;
    }
    
    try {
      await createToolpathComment({
        toolpathId: toolpath.id,
        content: newComment,
        createdBy: session.user.id
      });
      
      toast.success('Comment added successfully');
      setNewComment('');
      
      // Refresh comments
      await fetchCommentsData();
    } catch (err) {
      console.error('Error adding comment:', err);
      toast.error('Failed to add comment');
    }
  };
  
  // Handle deleting a comment
  const handleDeleteComment = async (commentId: string) => {
    if (!toolpath || !toolpath.id) return;
    
    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }
    
    try {
      await deleteToolpathComment(toolpath.id, commentId);
      toast.success('Comment deleted successfully');
      
      // Refresh comments
      await fetchCommentsData();
    } catch (err) {
      console.error('Error deleting comment:', err);
      toast.error('Failed to delete comment');
    }
  };
  
  // Handle downloading G-code
  const handleDownloadGcode = () => {
    if (!toolpath || !toolpath.gcode) {
      toast.error('No G-code available for download');
      return;
    }
    
    const blob = new Blob([toolpath.gcode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${toolpath.name.replace(/[^a-z0-9]/gi, '_')}.gcode`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Handle sending to CAM
  const handleSendToCAM = () => {
    if (!toolpath || !toolpath.id) {
      toast.error('Cannot use in CAM: Toolpath data is missing');
      return;
    }
    
    // Save to localStorage for CAM to pick up
    localStorage.setItem('toolpathToLoadInCAM', JSON.stringify({
      id: toolpath.id,
      name: toolpath.name,
      data: toolpath.data,
      gcode: toolpath.gcode
    }));
    
    // Redirect to CAM editor
    router.push({
      pathname: '/cam',
      query: { loadToolpath: toolpath.id }
    });
    
    toast.success(`Opening ${toolpath.name} in CAM editor`);
  };
  
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }
  
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  
  return (
    <>
      <Metatags title={toolpath?.name || 'Toolpath Details'} />
      
      <Layout>
        <div className="p-4 md:p-6">
          {/* Top navigation bar */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/toolpaths')}
                className="mr-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                <ArrowLeft size={20} />
              </button>
              
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate max-w-lg">
                {isLoading ? <Loading/> : toolpath?.name || 'Toolpath Details'}
              </h1>
            </div>
            
            <div className="flex space-x-2">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                    disabled={isLoading}
                  >
                    <Edit size={16} className="mr-2" />
                    Edit
                  </button>
                  <button
                    onClick={handleDownloadGcode}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center"
                    disabled={isLoading || !toolpath?.gcode}
                  >
                    <Download size={16} className="mr-2" />
                    Download G-code
                  </button>
                  <button
                    onClick={handleSendToCAM}
                    className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center"
                    disabled={isLoading}
                  >
                    <Cpu size={16} className="mr-2" />
                    Use in CAM
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
                    disabled={isLoading}
                  >
                    <Trash2 size={16} className="mr-2" />
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSave}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                    disabled={isLoading}
                  >
                    <Save size={16} className="mr-2" />
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      // Reset form data to current toolpath data
                      if (toolpath) {
                        setFormData({
                          name: toolpath.name || '',
                          description: toolpath.description || '',
                          type: toolpath.type || 'mill',
                          operationType: toolpath.operationType || 'contour',
                          isPublic: toolpath.isPublic || false,
                          gcode: toolpath.gcode || '',
                          data: toolpath.data || {}
                        });
                      }
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center"
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md text-red-800 dark:text-red-200 flex items-start">
              <AlertCircle size={20} className="mr-2 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}
          
          {isLoading && !toolpath ? (
            <div className="flex h-64 items-center justify-center">
              <Loading />
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
                <nav className="flex space-x-8">
                  <button
                    onClick={() => handleTabChange('details')}
                    className={cn(
                      "py-4 px-1 font-medium text-sm border-b-2 focus:outline-none",
                      activeTab === 'details' 
                        ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                    )}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => handleTabChange('gcode')}
                    className={cn(
                      "py-4 px-1 font-medium text-sm border-b-2 focus:outline-none",
                      activeTab === 'gcode' 
                        ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                    )}
                  >
                    G-code
                  </button>
                  <button
                    onClick={() => handleTabChange('versions')}
                    className={cn(
                      "py-4 px-1 font-medium text-sm border-b-2 focus:outline-none flex items-center",
                      activeTab === 'versions' 
                        ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                    )}
                  >
                    <Layers size={16} className="mr-2" />
                    Versions
                  </button>
                  <button
                    onClick={() => handleTabChange('comments')}
                    className={cn(
                      "py-4 px-1 font-medium text-sm border-b-2 focus:outline-none flex items-center",
                      activeTab === 'comments' 
                        ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                    )}
                  >
                    <MessageCircle size={16} className="mr-2" />
                    Comments
                  </button>
                </nav>
              </div>
              
              {/* Details tab content */}
              {activeTab === 'details' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
                      {isEditing ? (
                        /* Edit form */
                        <div className="space-y-4">
                          <div>
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Toolpath Name
                            </label>
                            <input
                              type="text"
                              id="name"
                              name="name"
                              value={formData.name}
                              onChange={handleChange}
                              required
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          
                          <div>
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Description
                            </label>
                            <textarea
                              id="description"
                              name="description"
                              rows={4}
                              value={formData.description}
                              onChange={handleChange}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            ></textarea>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label htmlFor="type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Machine Type
                              </label>
                              <select
                                id="type"
                                name="type"
                                value={formData.type}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="mill">Mill</option>
                                <option value="lathe">Lathe</option>
                                <option value="3dprinter">3D Printer</option>
                              </select>
                            </div>
                            
                            <div>
                              <label htmlFor="operationType" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Operation Type
                              </label>
                              <select
                                id="operationType"
                                name="operationType"
                                value={formData.operationType}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                              >
                                {formData.type === 'mill' && (
                                  <>
                                    <option value="contour">Contour</option>
                                    <option value="pocket">Pocket</option>
                                    <option value="drill">Drill</option>
                                    <option value="engrave">Engrave</option>
                                    <option value="profile">3D Profile</option>
                                    <option value="threading">Threading</option>
                                  </>
                                )}
                                {formData.type === 'lathe' && (
                                  <>
                                    <option value="turning">Turning</option>
                                    <option value="facing">Facing</option>
                                    <option value="boring">Boring</option>
                                    <option value="threading">Threading</option>
                                    <option value="grooving">Grooving</option>
                                    <option value="parting">Parting</option>
                                  </>
                                )}
                                {formData.type === '3dprinter' && (
                                  <>
                                    <option value="standard">Standard Print</option>
                                    <option value="vase">Vase Mode</option>
                                    <option value="support">Support</option>
                                    <option value="infill">Infill</option>
                                    <option value="raft">Raft</option>
                                    <option value="brim">Brim</option>
                                  </>
                                )}
                              </select>
                            </div>
                          </div>
                          
                          <div className="flex items-center mt-4">
                            <input
                              type="checkbox"
                              id="isPublic"
                              name="isPublic"
                              checked={formData.isPublic}
                              onChange={(e) => setFormData(prev => ({...prev, isPublic: e.target.checked}))}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-700 rounded"
                            />
                            <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-900 dark:text-gray-300">
                              Make toolpath public (visible to all users)
                            </label>
                          </div>
                        </div>
                      ) : (
                        /* View details */
                        <div>
                          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            {toolpath?.name}
                          </h2>
                          
                          {toolpath?.description ? (
                            <div className="prose prose-sm max-w-none dark:prose-dark mb-6">
                              <ReactMarkdown>
                                {toolpath.description}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-gray-500 dark:text-gray-400 italic mb-6">
                              No description provided
                            </p>
                          )}
                          
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Machine Type
                              </h3>
                              <p className="text-base font-medium text-gray-900 dark:text-white">
                                {toolpath?.type === 'mill' ? 'Mill' : 
                                 toolpath?.type === 'lathe' ? 'Lathe' : 
                                 toolpath?.type === '3dprinter' ? '3D Printer' : 
                                 toolpath?.type || 'Unknown'}
                              </p>
                            </div>
                            
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-md">
                              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Operation Type
                              </h3>
                              <p className="text-base font-medium text-gray-900 dark:text-white">
                                {toolpath?.operationType || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          
                          {/* Settings visualization (from toolpath.data) */}
                          {toolpath?.data && Object.keys(toolpath.data).length > 0 && (
                            <div className="mt-6">
                              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">
                                Toolpath Settings
                              </h3>
                              
                              <div className="bg-gray-50 dark:bg-gray-900 rounded-md p-4 overflow-auto max-h-80">
                                <pre className="text-xs font-mono text-gray-800 dark:text-gray-200">
                                  {JSON.stringify(toolpath.data, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                        Toolpath Information
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Created</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {toolpath?.createdAt ? format(new Date(toolpath.createdAt), 'PP') : '-'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Last Updated</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {toolpath?.updatedAt ? format(new Date(toolpath.updatedAt), 'PP') : '-'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">ID</span>
                          <span className="text-sm font-mono text-gray-900 dark:text-white">
                            {toolpath?.id ? toolpath.id.substring(0, 8) + '...' : '-'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">Visibility</span>
                          <span className={`text-sm font-medium ${toolpath?.isPublic ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                            {toolpath?.isPublic ? 'Public' : 'Private'}
                          </span>
                        </div>
                        
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500 dark:text-gray-400">G-code Size</span>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {toolpath?.gcode ? `${Math.ceil(toolpath.gcode.length / 1024)} KB` : 'No G-code'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="mt-6 space-y-3">
                        <button
                          onClick={handleDownloadGcode}
                          className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center"
                          disabled={!toolpath?.gcode}
                        >
                          <Download size={16} className="mr-2" />
                          Download G-code
                        </button>
                        
                        <button
                          onClick={handleSendToCAM}
                          className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center justify-center"
                        >
                          <Cpu size={16} className="mr-2" />
                          Use in CAM
                        </button>
                        
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(window.location.href);
                            toast.success('Link copied to clipboard');
                          }}
                          className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 flex items-center justify-center"
                        >
                          <Share2 size={16} className="mr-2" />
                          Share Toolpath
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* G-code tab content */}
              {activeTab === 'gcode' && (
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                      G-code
                    </h3>
                    
                    <div className="flex space-x-2">
                      <button
                        onClick={handleDownloadGcode}
                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center text-sm"
                        disabled={!toolpath?.gcode}
                      >
                        <Download size={14} className="mr-1" />
                        Download
                      </button>
                    </div>
                  </div>
                  
                  {isEditing ? (
                    <textarea
                      ref={gcodeRef}
                      value={formData.gcode}
                      onChange={handleGcodeChange}
                      className="w-full h-[60vh] px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                      placeholder="; Enter G-code here"
                    ></textarea>
                  ) : (
                    <div className="border border-gray-300 dark:border-gray-700 rounded-md h-[60vh] overflow-auto bg-gray-50 dark:bg-gray-900">
                      {toolpath?.gcode ? (
                        <pre className="p-4 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre leading-relaxed">
                          {toolpath.gcode}
                        </pre>
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <p className="text-gray-500 dark:text-gray-400">No G-code available</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Versions tab content */}
              {activeTab === 'versions' && (
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Version History
                  </h3>
                  
                  {versions.length === 0 ? (
                    <div className="text-center py-8">
                      <Layers size={36} className="mx-auto mb-2 text-gray-400 dark:text-gray-600" />
                      <p className="text-gray-500 dark:text-gray-400">No version history available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {versions.map((version) => (
                        <div 
                          key={version.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-md p-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center mb-1">
                                <Calendar size={14} className="text-gray-500 dark:text-gray-400 mr-1" />
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                  {format(new Date(version.createdAt), 'PPpp')}
                                </span>
                              </div>
                              
                              <div className="font-medium text-gray-900 dark:text-white">
                                {version.changeMessage || 'No description'}
                              </div>
                            </div>
                            
                            <button
                              onClick={() => handleRestoreVersion(version.id)}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                            >
                              Restore
                            </button>
                          </div>
                          
                          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center">
                            <Clock size={12} className="mr-1" />
                            <span>
                              Created by {version.user?.name || 'Unknown user'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Comments tab content */}
              {activeTab === 'comments' && (
                <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Comments
                  </h3>
                  
                  <form onSubmit={handleAddComment} className="mb-6">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Add a comment..."
                      rows={3}
                      required
                    ></textarea>
                    
                    <div className="mt-2 flex justify-end">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        disabled={!newComment.trim()}
                      >
                        Post Comment
                      </button>
                    </div>
                  </form>
                  
                  <div className="space-y-6">
                    {!Array.isArray(comments) || comments.length === 0 ? (
                      <div className="text-center py-8">
                        <MessageCircle size={36} className="mx-auto mb-2 text-gray-400 dark:text-gray-600" />
                        <p className="text-gray-500 dark:text-gray-400">No comments yet</p>
                      </div>
                    ) : (
                      comments.map((comment) => (
                        <div 
                          key={comment.id}
                          className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <div className="flex">
                              <div className="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden mr-3 flex-shrink-0">
                                {comment.user?.image ? (
                                  <img src={comment.user.image} alt={comment.user.name} className="h-full w-full object-cover" />
                                ) : (
                                  <span className="text-gray-600 dark:text-gray-400 text-sm font-medium">
                                    {comment.user?.name?.charAt(0) || "?"}
                                  </span>
                                )}
                              </div>
                              
                              <div>
                                <div className="flex items-center mb-1">
                                  <span className="font-medium text-gray-900 dark:text-white mr-2">
                                    {comment.user?.name || "Unknown user"}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {format(new Date(comment.createdAt), 'PPp')}
                                  </span>
                                </div>
                                
                                <div className="text-gray-800 dark:text-gray-200">
                                  {comment.content}
                                </div>
                              </div>
                            </div>
                            
                            {comment.userId === session?.user?.id && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1"
                                title="Delete comment"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Layout>
    </>
  );
}