// src/pages/drawing-instruments/index.tsx

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { Edit, Trash2, Plus, Settings, Grid, Box, Circle, Square, Move, RotateCcw } from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import MetaTags from '@/src/components/layout/Metatags';

interface DrawingInstrument {
  id: string;
  name: string;
  type: 'line' | 'rectangle' | 'circle' | 'arc' | 'ellipse' | 'polygon' | 'spline' | 'text' | 'dimension';
  settings: Record<string, any>;
  icon: string;
  shortcut?: string;
  isCustom: boolean;
}

export default function DrawingInstrumentsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [instruments, setInstruments] = useState<DrawingInstrument[]>([
    {
      id: 'line',
      name: 'Line',
      type: 'line',
      settings: { snapping: true, defaultColor: '#000000', defaultLineWidth: 1 },
      icon: 'line',
      shortcut: 'L',
      isCustom: false
    },
    {
      id: 'rectangle',
      name: 'Rectangle',
      type: 'rectangle',
      settings: { snapping: true, defaultColor: '#000000', defaultLineWidth: 1 },
      icon: 'rectangle',
      shortcut: 'R',
      isCustom: false
    },
    {
      id: 'circle',
      name: 'Circle',
      type: 'circle',
      settings: { snapping: true, defaultColor: '#000000', defaultLineWidth: 1 },
      icon: 'circle',
      shortcut: 'C',
      isCustom: false
    },
    {
      id: 'arc',
      name: 'Arc',
      type: 'arc',
      settings: { snapping: true, defaultColor: '#000000', defaultLineWidth: 1 },
      icon: 'arc',
      shortcut: 'A',
      isCustom: false
    },
    {
      id: 'polygon',
      name: 'Polygon',
      type: 'polygon',
      settings: { snapping: true, defaultColor: '#000000', defaultLineWidth: 1, defaultSides: 6 },
      icon: 'polygon',
      shortcut: 'P',
      isCustom: false
    },
  ]);
  const [selectedInstrument, setSelectedInstrument] = useState<DrawingInstrument | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'line',
    defaultColor: '#000000',
    defaultLineWidth: 1,
    snapping: true,
    defaultSides: 6,
    shortcut: ''
  });

  const handleEditInstrument = (instrument: DrawingInstrument) => {
    if (!instrument.isCustom) {
      alert('Default instruments cannot be edited.');
      return;
    }
    
    setSelectedInstrument(instrument);
    setFormData({
      name: instrument.name,
      type: instrument.type,
      defaultColor: instrument.settings.defaultColor || '#000000',
      defaultLineWidth: instrument.settings.defaultLineWidth || 1,
      snapping: instrument.settings.snapping !== false,
      defaultSides: instrument.settings.defaultSides || 6,
      shortcut: instrument.shortcut || ''
    });
    setShowModal(true);
  };

  const handleDeleteInstrument = (id: string) => {
    const instrument = instruments.find(i => i.id === id);
    
    if (!instrument || !instrument.isCustom) {
      alert('Default instruments cannot be deleted.');
      return;
    }
    
    if (!confirm('Are you sure you want to delete this drawing instrument?')) return;
    
    setInstruments(prev => prev.filter(i => i.id !== id));
  };

  const handleAddInstrument = () => {
    setSelectedInstrument(null);
    setFormData({
      name: '',
      type: 'line',
      defaultColor: '#000000',
      defaultLineWidth: 1,
      snapping: true,
      defaultSides: 6,
      shortcut: ''
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const settings = {
      defaultColor: formData.defaultColor,
      defaultLineWidth: formData.defaultLineWidth,
      snapping: formData.snapping
    };
    if (formData.type === 'polygon') {
      (settings as any).defaultSides = formData.defaultSides;
    }
    
    if (selectedInstrument) {
      // Update existing instrument
      setInstruments(prev => prev.map(i => 
        i.id === selectedInstrument.id 
          ? { 
              ...i, 
              name: formData.name,
              type: formData.type as any,
              settings,
              shortcut: formData.shortcut || undefined
            } 
          : i
      ));
    } else {
      // Create new instrument
      const newInstrument: DrawingInstrument = {
        id: `custom-${Date.now()}`,
        name: formData.name,
        type: formData.type as any,
        settings,
        icon: formData.type,
        shortcut: formData.shortcut || undefined,
        isCustom: true
      };
      
      setInstruments(prev => [...prev, newInstrument]);
    }
    
    setShowModal(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        [name]: checked
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const getInstrumentIcon = (type: string) => {
    switch (type) {
      case 'line':
        return <div className="transform rotate-45"><Square size={20} /></div>;
      case 'rectangle':
        return <Square size={20} />;
      case 'circle':
        return <Circle size={20} />;
      case 'arc':
        return <RotateCcw size={20} />;
      case 'ellipse':
        return <Circle size={20} className="transform scale-x-75" />;
      case 'polygon':
        return <Box size={20} />;
      case 'spline':
        return <div className="transform rotate-45"><Move size={20} /></div>;
      case 'text':
        return <span className="text-lg font-bold">T</span>;
      case 'dimension':
        return <Square size={20} />;
      default:
        return <Grid size={20} />;
    }
  };
  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loading/>
      </div>
    );
  }
  

  return (
    <>
       <MetaTags 
        title="CAM/CAM FUN DRAWING INSTRUMENTS" 
     
      />
      <DynamicLayout>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Drawing Instruments</h1>
            <button
              onClick={handleAddInstrument}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 flex items-center"
            >
              <Plus size={20} className="mr-2" />
              Create Instrument
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {instruments.map((instrument) => (
              <div key={instrument.id} className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-lg overflow-hidden">
                <div className="p-6">
                  <div className="flex items-center mb-4">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mr-3">
                      {getInstrumentIcon(instrument.type)}
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-gray-900">
                        {instrument.name}
                        {instrument.isCustom && (
                          <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            Custom
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 capitalize">{instrument.type}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                    {instrument.shortcut && (
                      <div className="col-span-2 mb-1">
                        <span className="text-gray-500">Shortcut: </span>
                        <span className="font-medium px-2 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">
                          {instrument.shortcut}
                        </span>
                      </div>
                    )}
                    
                    <div>
                      <span className="text-gray-500">Line Color:</span>
                      <div className="flex items-center mt-1">
                        <div 
                          className="w-4 h-4 rounded mr-2" 
                          style={{ backgroundColor: instrument.settings.defaultColor }}
                        ></div>
                        <span className="font-mono text-xs">
                          {instrument.settings.defaultColor}
                        </span>
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-gray-500">Line Width:</span>
                      <span className="font-medium block mt-1">
                        {instrument.settings.defaultLineWidth}px
                      </span>
                    </div>
                    
                    <div className="col-span-2">
                      <span className="text-gray-500">Snapping:</span>
                      <span className="font-medium block mt-1">
                        {instrument.settings.snapping !== false ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    
                    {instrument.type === 'polygon' && instrument.settings.defaultSides && (
                      <div>
                        <span className="text-gray-500">Default Sides:</span>
                        <span className="font-medium block mt-1">
                          {instrument.settings.defaultSides}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex justify-end space-x-2">
                  <button 
                    onClick={() => handleEditInstrument(instrument)}
                    className={`p-2 ${instrument.isCustom ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 cursor-not-allowed'} rounded`}
                    disabled={!instrument.isCustom}
                  >
                    <Edit size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteInstrument(instrument.id)}
                    className={`p-2 ${instrument.isCustom ? 'text-red-600 hover:bg-red-50' : 'text-gray-400 cursor-not-allowed'} rounded`}
                    disabled={!instrument.isCustom}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Drawing Instrument Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-xl max-w-md w-full">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedInstrument ? 'Edit Drawing Instrument' : 'Create Drawing Instrument'}
                </h3>
              </div>
              
              <form onSubmit={handleSubmit}>
                <div className="px-6 py-4">
                  <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                      Instrument Name
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
                      Instrument Type
                    </label>
                    <select
                      id="type"
                      name="type"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.type}
                      onChange={handleChange}
                      required
                    >
                      <option value="line">Line</option>
                      <option value="rectangle">Rectangle</option>
                      <option value="circle">Circle</option>
                      <option value="arc">Arc</option>
                      <option value="ellipse">Ellipse</option>
                      <option value="polygon">Polygon</option>
                      <option value="spline">Spline</option>
                      <option value="text">Text</option>
                      <option value="dimension">Dimension</option>
                    </select>
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="shortcut" className="block text-sm font-medium text-gray-700 mb-1">
                      Keyboard Shortcut (optional)
                    </label>
                    <input
                      // Continuing src/pages/drawing-instruments/index.tsx
                      type="text"
                      id="shortcut"
                      name="shortcut"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.shortcut}
                      onChange={handleChange}
                      maxLength={1}
                      placeholder="Single key (e.g. L)"
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="defaultColor" className="block text-sm font-medium text-gray-700 mb-1">
                      Default Color
                    </label>
                    <input
                      type="color"
                      id="defaultColor"
                      name="defaultColor"
                      className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.defaultColor}
                      onChange={handleChange}
                    />
                  </div>
                  
                  <div className="mb-4">
                    <label htmlFor="defaultLineWidth" className="block text-sm font-medium text-gray-700 mb-1">
                      Default Line Width (px)
                    </label>
                    <input
                      type="number"
                      id="defaultLineWidth"
                      name="defaultLineWidth"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      value={formData.defaultLineWidth}
                      onChange={handleChange}
                      min={1}
                      max={10}
                      required
                    />
                  </div>
                  
                  {formData.type === 'polygon' && (
                    <div className="mb-4">
                      <label htmlFor="defaultSides" className="block text-sm font-medium text-gray-700 mb-1">
                        Default Number of Sides
                      </label>
                      <input
                        type="number"
                        id="defaultSides"
                        name="defaultSides"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={formData.defaultSides}
                        onChange={handleChange}
                        min={3}
                        max={20}
                        required
                      />
                    </div>
                  )}
                  
                  <div className="mb-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="snapping"
                        name="snapping"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        checked={formData.snapping}
                        onChange={handleChange}
                      />
                      <label htmlFor="snapping" className="ml-2 block text-sm text-gray-900">
                        Enable Snapping
                      </label>
                    </div>
                  </div>
                </div>
                
                <div className="px-6 py-4 bg-gray-50 flex justify-end space-x-3 rounded-b-lg">
                  <button
                    type="button"
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    onClick={() => setShowModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                  >
                    {selectedInstrument ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </DynamicLayout>
    </>
  );
}