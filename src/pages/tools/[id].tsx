import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { Save, ArrowLeft, Trash2, Tool } from 'react-feather';
import { fetchToolById, updateTool, deleteTool } from '@/src/lib/api/tools';
import Loading from '@/src/components/ui/Loading';
import { Tool as ToolType } from '@prisma/client';
import Metatags from '@/src/components/layout/Metatags';
import { useLocalToolsLibraryStore } from '@/src/store/localToolsLibraryStore';

export default function ToolDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { id } = router.query;
  
  // State for tool data and UI
  const [tool, setTool] = useState<ToolType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  
  // Local library store
  const { addTool } = useLocalToolsLibraryStore();
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    type: 'endmill',
    diameter: 6,
    material: 'HSS',
    numberOfFlutes: 2,
    maxRPM: 10000,
    coolantType: 'none',
    cuttingLength: 0,
    totalLength: 0,
    shankDiameter: 0,
    notes: ''
  });

  // Fetch tool data when component mounts or id changes
  useEffect(() => {
    if (id && typeof id === 'string') {
      fetchTool(id);
    }
  }, [status, id]);

  const fetchTool = async (toolId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await fetchToolById(toolId);
      setTool(data);
      
      setFormData({
        name: data.name,
        type: data.type,
        diameter: data.diameter,
        material: data.material,
        numberOfFlutes: data.numberOfFlutes || 2,
        maxRPM: data.maxRPM || 10000,
        coolantType: data.coolantType || 'none',
        cuttingLength: data.cuttingLength || 0,
        totalLength: data.totalLength || 0,
        shankDiameter: data.shankDiameter || 0,
        notes: data.notes || ''
      });
    } catch (err) {
      console.error('Error fetching tool:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      
      // If tool not found, redirect to tools list
      if (err instanceof Error && err.message.includes('not found')) {
        router.push('/tools');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!tool) return;
    
    setIsSaving(true);
    setMessage(null);
    
    try {
      // Update tool
      const updatedTool = await updateTool({
        id: tool.id,
        name: formData.name,
        type: formData.type,
        diameter: parseFloat(formData.diameter.toString()),
        material: formData.material,
        numberOfFlutes: parseInt(formData.numberOfFlutes.toString()),
        maxRPM: parseInt(formData.maxRPM.toString()),
        coolantType: formData.coolantType,
        cuttingLength: parseFloat(formData.cuttingLength.toString()),
        totalLength: parseFloat(formData.totalLength.toString()),
        shankDiameter: parseFloat(formData.shankDiameter.toString()),
        notes: formData.notes
      });
      
      setTool(updatedTool);
      setMessage({ type: 'success', text: 'Tool saved successfully' });
    } catch (err) {
      console.error('Error updating tool:', err);
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to update tool'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tool || !confirm('Are you sure you want to delete this tool?')) return;
    
    setIsLoading(true);
    setMessage(null);
    
    try {
      await deleteTool(tool.id);
      setMessage({ type: 'success', text: 'Tool deleted successfully' });
      
      // Redirect to tools list after a short delay
      setTimeout(() => {
        router.push('/tools');
      }, 1500);
    } catch (err) {
      console.error('Error deleting tool:', err);
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to delete tool'
      });
      setIsLoading(false);
    }
  };
  
  const handleSaveToLocalLibrary = () => {
    if (!tool) return;
    
    try {
      // Convert the tool to local library format
      const localTool = {
        name: tool.name,
        type: tool.type,
        diameter: tool.diameter,
        material: tool.material,
        
        numberOfFlutes: tool.numberOfFlutes || 2,
        maxRPM: tool.maxRPM || 10000,
        coolantType: tool.coolantType || 'none',
        cuttingLength: tool.cuttingLength || 0,
        totalLength: tool.totalLength || 0,
        shankDiameter: tool.shankDiameter || 0,
        notes: tool.notes || '',
        tags: []
      };
      
      // Save to local library
      addTool(localTool);
      
      // Show success message
      setMessage({ type: 'success', text: 'Tool saved to local library successfully' });
    } catch (err) {
      console.error('Failed to save to local library:', err);
      setMessage({ 
        type: 'error', 
        text: err instanceof Error ? err.message : 'Failed to save to local library'
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBack = () => {
    router.push('/tools');
  };

  if (status === 'loading' || (isLoading && !error)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  // Tool icon based on type
  const getToolIcon = (type: string) => {
    switch (type) {
      case 'endmill': return '🔄';
      case 'ballendmill': return '🔵';
      case 'drillbit': return '🔨';
      case 'chamfermill': return '🔺';
      case 'facemill': return '⬛';
      case 'engraver': return '✏️';
      case 'turningTool': return '⚙️';
      case 'threadingTool': return '🔩';
      default: return '🧩';
    }
  };
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }
  return (
    <>
      <Metatags title={tool ? `${tool.name} | Tool Editor` : 'Tool Editor'} />
      
      <Layout>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <button
                  onClick={handleBack}
                  className="mr-4 text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft size={20} />
                </button>
                <div className="flex items-center">
                  {tool && (
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-3">
                      <span className="text-xl">{getToolIcon(tool.type)}</span>
                    </div>
                  )}
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">
                      {tool ? tool.name : 'Tool not found'}
                    </h1>
                    <p className="text-sm text-gray-500">
                      {tool ? 'Edit tool properties' : 'Tool may have been deleted or does not exist'}
                    </p>
                  </div>
                </div>
              </div>
              {tool && (
                <div className="flex space-x-3">
                  <button
                    onClick={handleSaveToLocalLibrary}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center"
                  >
                    <Save size={18} className="mr-2" />
                    Save to Library
                  </button>
                  <button
                    onClick={handleDelete}
                    className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 flex items-center"
                    disabled={isSaving || isLoading}
                  >
                    <Trash2 size={18} className="mr-2" />
                    Delete
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isLoading}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 flex items-center"
                  >
                    <Save size={18} className="mr-2" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Display messages */}
          {message && (
            <div className={`mx-6 mt-4 p-4 rounded-md ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}
          
          {/* Display error */}
          {error && !tool && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-red-500 text-lg mb-4">{error}</div>
                <button
                  onClick={handleBack}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Return to Tools List
                </button>
              </div>
            </div>
          )}
          
          {/* Tool form */}
          {tool && (
            <div className="flex-1 overflow-auto p-6">
              <div className="max-w-3xl mx-auto">
                <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow rounded-lg overflow-hidden">
                  <div className="p-6">
                    <div className="mb-4">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                        Tool Name
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.name}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                        Tool Type
                      </label>
                      <select
                        id="type"
                        name="type"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.type}
                        onChange={handleChange}
                        required
                      >
                        <option value="endmill">End Mill</option>
                        <option value="ballendmill">Ball End Mill</option>
                        <option value="drillbit">Drill Bit</option>
                        <option value="chamfermill">Chamfer Mill</option>
                        <option value="facemill">Face Mill</option>
                        <option value="engraver">Engraver</option>
                        <option value="turningTool">Turning Tool</option>
                        <option value="threadingTool">Threading Tool</option>
                        <option value="insertTool">Insert Tool</option>
                        <option value="tslotcutter">T-Slot Cutter</option>
                      </select>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="diameter" className="block text-sm font-medium text-gray-700 mb-1">
                        Diameter (mm)
                      </label>
                      <input
                        type="number"
                        id="diameter"
                        name="diameter"
                        step="0.1"
                        min="0.1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.diameter}
                        onChange={handleChange}
                        required
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="material" className="block text-sm font-medium text-gray-700 mb-1">
                        Material
                      </label>
                      <select
                        id="material"
                        name="material"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.material}
                        onChange={handleChange}
                        required
                      >
                        <option value="HSS">HSS</option>
                        <option value="Carbide">Carbide</option>
                        <option value="Cobalt">Cobalt</option>
                        <option value="Diamond">Diamond</option>
                        <option value="Ceramic">Ceramic</option>
                        <option value="Custom">Custom</option>
                      </select>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="numberOfFlutes" className="block text-sm font-medium text-gray-700 mb-1">
                        Number of Flutes
                      </label>
                      <input
                        type="number"
                        id="numberOfFlutes"
                        name="numberOfFlutes"
                        min="1"
                        max="12"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.numberOfFlutes}
                        onChange={handleChange}
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="maxRPM" className="block text-sm font-medium text-gray-700 mb-1">
                        Max RPM
                      </label>
                      <input
                        type="number"
                        id="maxRPM"
                        name="maxRPM"
                        min="1000"
                        step="1000"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.maxRPM}
                        onChange={handleChange}
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="coolantType" className="block text-sm font-medium text-gray-700 mb-1">
                        Coolant Type
                      </label>
                      <select
                        id="coolantType"
                        name="coolantType"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.coolantType}
                        onChange={handleChange}
                      >
                        <option value="none">No Coolant</option>
                        <option value="flood">Flood Coolant</option>
                        <option value="mist">Mist Coolant</option>
                        <option value="air">Air Blast</option>
                        <option value="through">Through Tool</option>
                      </select>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="mb-4">
                        <label htmlFor="cuttingLength" className="block text-sm font-medium text-gray-700 mb-1">
                          Cutting Length (mm)
                        </label>
                        <input
                          type="number"
                          id="cuttingLength"
                          name="cuttingLength"
                          step="0.1"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.cuttingLength}
                          onChange={handleChange}
                        />
                      </div>
                      
                      <div className="mb-4">
                        <label htmlFor="totalLength" className="block text-sm font-medium text-gray-700 mb-1">
                          Total Length (mm)
                        </label>
                        <input
                          type="number"
                          id="totalLength"
                          name="totalLength"
                          step="0.1"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                          value={formData.totalLength}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="shankDiameter" className="block text-sm font-medium text-gray-700 mb-1">
                        Shank Diameter (mm)
                      </label>
                      <input
                        type="number"
                        id="shankDiameter"
                        name="shankDiameter"
                        step="0.1"
                        min="0"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.shankDiameter}
                        onChange={handleChange}
                      />
                    </div>
                    
                    <div className="mb-4">
                      <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                        Notes
                      </label>
                      <textarea
                        id="notes"
                        name="notes"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.notes}
                        onChange={handleChange}
                      ></textarea>
                    </div>
                    
                    <div className="mt-6 pt-6 border-t border-gray-200">
                      <h3 className="text-sm font-medium text-gray-700 mb-3">Tool Info</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="block text-gray-500">ID</span>
                          <span className="font-mono">{tool.id}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500">Created</span>
                          <span>{new Date(tool.createdAt).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="block text-gray-500">Updated</span>
                          <span>{new Date(tool.updatedAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
}