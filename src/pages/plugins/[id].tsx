import { GetServerSideProps, NextPage } from 'next';
import { useRouter } from 'next/router';
import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import PluginSettingsDialog from '@/src/components/plugins/PluginSettingsDialog';
import Layout from '@/src/components/layout/Layout';
import { useSession } from 'next-auth/react';
import { usePluginClient } from '@/src/context/PluginClientContext';
import { 
    ExternalLink, 
    CheckCircle, 
    XCircle, 
    HelpCircle, 
    Power, 
    Settings, 
    Trash2, 
    Download, 
    Info, 
    FileText
} from 'react-feather';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// --- Types (adjust based on your actual plugin manifest/API response) ---
interface PluginConfigurationProperty {
  type: string;
  default?: any;
  description?: string;
}

interface PluginContribution {
  // Define structure for commands, menus, sidebars, etc.
  [key: string]: any; // Placeholder
}

interface ConfigSchemaProperty {
  // Define structure for configuration schema properties
  [key: string]: any;
}

interface ConfigSchema {
  // Define structure for configuration schema
  [key: string]: ConfigSchemaProperty;
}

interface SettingValue {
  // Define structure for setting values
  [key: string]: any;
}

interface Plugin {
  id: string;
  manifest: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    icon?: string; 
    repository?: string;
    license?: string;
    permissions?: string[];
    dependencies?: { [pluginId: string]: string };
    configuration?: ConfigSchema;
    contributes?: PluginContribution;
    main?: string;
  };
  enabled: boolean;
  state: string;
  installedAt: string;
  updatedAt: string;
  errorCount: number;
  lastError?: string;
  config?: SettingValue;
}

// --- API Interaction (Replace with your actual API client/fetch logic) ---
async function apiRequest<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers: defaultHeaders });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      // If response is not JSON or empty
      errorData = { message: `Request failed with status ${response.status}` };
    }
    console.error(`API Error (${response.status}):`, errorData);
    throw new Error(errorData?.message || `Request failed: ${response.statusText}`);
  }

  // Handle empty response body for methods like DELETE or POST success with 204
  if (response.status === 204 || response.headers.get('Content-Length') === '0') {
    return undefined as T; // Or return a specific success indicator if needed
  }

  return response.json() as Promise<T>;
}

// --- Component Props ---
interface PluginPageProps {
  initialPluginData: Plugin | null;
  error?: string;
  pluginId: string | null;
}

// --- Helper Components ---
const DetailSection: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
    <div className={`bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 mb-6 ${className}`}>
        <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 dark:border-gray-700 pb-2 text-gray-700 dark:text-gray-200">{title}</h2>
        <div className="prose prose-sm max-w-none text-gray-600 dark:text-gray-400">{children}</div>
    </div>
);

const CodeBlock: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <pre className={`bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-x-auto text-xs text-gray-800 dark:text-gray-300 ${className}`}><code>{children}</code></pre>
);

const LoadingSpinner: React.FC = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// Status Badge Component
const StatusBadge: React.FC<{ label: string; type: 'success' | 'warning' | 'error' | 'info' }> = ({ label, type }) => {
    const colors = {
        success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
        info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[type]}`}>
            {label}
        </span>
    );
};

// --- Main Page Component ---
const PluginDetailPage: NextPage<PluginPageProps> = ({ initialPluginData, error, pluginId }) => {
  const router = useRouter();
  const [plugin, setPlugin] = useState<Plugin | null>(initialPluginData);
  const [isLoadingAction, setIsLoadingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isGeneratingReadme, setIsGeneratingReadme] = useState(false);
  const [readmeError, setReadmeError] = useState<string | null>(null);
  const [generatedReadme, setGeneratedReadme] = useState<string | null>(null);
  const [showReadmeArea, setShowReadmeArea] = useState(false);

  const { getHost, activatePlugin, deactivatePlugin, refreshPlugins } = usePluginClient();
  const isClientSideHostActive = !!getHost(plugin?.id || '');

  // --- Action Handlers (Refined) ---
  const performAction = useCallback(async (
      apiCall: () => Promise<any>,
      successCallback?: () => void | Promise<void>
  ) => {
    if (!pluginId) return;
    setIsLoadingAction(true);
    setActionError(null);
    try {
      await apiCall();
      await refreshPlugins();
      const freshData = await apiRequest<Plugin>(`/api/plugins/${pluginId}`);
      setPlugin(freshData);
      if (successCallback) await successCallback();
    } catch (err) {
      console.error("Plugin action failed:", err);
      setActionError(err instanceof Error ? err.message : 'An unknown error occurred.');
      try { await refreshPlugins(); } catch { /* ignore refresh error */ }
    } finally {
      setIsLoadingAction(false);
    }
  }, [pluginId, refreshPlugins]);

  const handleInstall = async () => {
     if (!pluginId) return;
     setIsLoadingAction(true);
     setActionError(null);
     try {
         const installedPlugin = await apiRequest<Plugin>(`/api/plugins/install`, {
             method: 'POST',
             body: JSON.stringify({ id: pluginId })
         });
         setPlugin(installedPlugin);
         await refreshPlugins();
         await activatePlugin(pluginId);
     } catch (err) {
         console.error("Install failed:", err);
         setActionError(err instanceof Error ? err.message : 'Install failed.');
     } finally {
         setIsLoadingAction(false);
     }
  };

  const handleUninstall = () => performAction(async () => {
    if (!plugin) throw new Error("Plugin data missing.");
    if (!confirm(`Uninstall ${plugin.manifest.name}? This cannot be undone.`)) throw new Error("Uninstall cancelled.");
    await deactivatePlugin(plugin.id);
    await apiRequest(`/api/plugins/${plugin.id}`, { method: 'DELETE' });
    router.push('/plugins'); 
  });

  const handleActivate = () => performAction(
      () => apiRequest(`/api/plugins/${pluginId}/enable`, { method: 'POST' }),
      async () => { await activatePlugin(pluginId!); }
  );

  const handleDeactivate = () => performAction(
      () => apiRequest(`/api/plugins/${pluginId}/disable`, { method: 'POST' }),
      async () => { await deactivatePlugin(pluginId!); }
  );

  const handleConfigure = () => {
      if (!plugin || !plugin.manifest.configuration) return;
      setShowSettings(true);
  };

  // --- README Generation Handler ---
  const handleGenerateReadme = async () => {
    if (!plugin) return;

    setIsGeneratingReadme(true);
    setReadmeError(null);
    setGeneratedReadme(null);
    setShowReadmeArea(true);

    try {
        // Extract data for the prompt
        const dataForPrompt = {
            name: plugin.manifest.name,
            version: plugin.manifest.version,
            description: plugin.manifest.description,
            author: plugin.manifest.author,
            permissions: plugin.manifest.permissions,
            configurationSchemaKeys: plugin.manifest.configuration ? Object.keys(plugin.manifest.configuration) : [],
            contributesKeys: plugin.manifest.contributes ? Object.keys(plugin.manifest.contributes) : [],
            license: plugin.manifest.license,
            repository: plugin.manifest.repository,
            // Add any other relevant fields
        };

        // Construct the prompt
        const prompt = `
            Generate a README.md file content in Markdown format for a web application plugin with the following details:

            **Name:** ${dataForPrompt.name || 'N/A'}
            **Version:** ${dataForPrompt.version || 'N/A'}
            **Author:** ${dataForPrompt.author || 'N/A'}
            **Description:** ${dataForPrompt.description || 'No description provided.'}
            ${dataForPrompt.repository ? `**Repository:** ${dataForPrompt.repository}` : ''}
            ${dataForPrompt.permissions && dataForPrompt.permissions.length > 0 ? `**Permissions Required:**\n${dataForPrompt.permissions.map((p: string) => `- \`${p}\``).join('\n')}` : ''}
            ${dataForPrompt.configurationSchemaKeys && dataForPrompt.configurationSchemaKeys.length > 0 ? `**Configuration Options:** (Provides options like: ${dataForPrompt.configurationSchemaKeys.join(', ')})` : ''}
            ${dataForPrompt.contributesKeys && dataForPrompt.contributesKeys.length > 0 ? `**Features/Contributions:** (Provides features related to: ${dataForPrompt.contributesKeys.join(', ')})` : ''}

            Please include the following sections:
            - Overview/Description (expand on the provided description)
            - Features (elaborate based on contributions)
            - Installation (Generic steps: Use 'Install Plugin' button in the app)
            - Usage (Provide a placeholder if unknown)
            - Configuration (Mention if configurable and where - e.g., Settings dialog)
            - Permissions (List required permissions)
            - Dependencies (if any)
            - Contributing (Placeholder text)
            - License (Mention ${dataForPrompt.license || 'the specified license'})

            Format the output *only* as Markdown content suitable for a README.md file. Start directly with the Markdown, do not include introductory phrases like "Here is the README...".
        `;

        console.log("[README Gen] Sending prompt to /api/ai/completion");

        // Call the existing generic completion API
        const response = await fetch('/api/ai/completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Send the prompt, potentially adjust model/params if needed
            body: JSON.stringify({ prompt: prompt, model: 'claude-3-5-sonnet-20240229' /* or your preferred model */ })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || result.error || 'Failed to generate README from API');
        }

        // Assuming the AI response structure has the content in result.response
        // Adjust this based on the actual structure returned by unifiedAIService
        const readmeContent = result?.response;

        if (!readmeContent) {
            throw new Error('AI returned an empty response.');
        }

        setGeneratedReadme(readmeContent);

    } catch (err) {
        console.error("README Generation failed:", err);
        setReadmeError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
        setIsGeneratingReadme(false);
    }
  };

  // --- Render Logic ---
  if (router.isFallback) {
    return <div className="container mx-auto p-8 text-center">Loading plugin details...</div>;
  }

  if (error) {
    return (
        <div className="container mx-auto p-4 md:p-8">
             <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Error Loading Plugin: </strong>
                <span className="block sm:inline">{error}</span>
            </div>
             <Link href="/plugins" className="text-blue-600 hover:underline mt-4 inline-block">&larr; Back to Plugins</Link>
        </div>
    );
  }

  if (!plugin) {
    // This case should ideally be handled by the 404 in getServerSideProps, but added as a fallback
     return (
        <div className="container mx-auto p-4 md:p-8">
             <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded relative" role="alert">
                <strong className="font-bold">Plugin Not Found</strong>
            </div>
             <Link href="/plugins" className="text-blue-600 hover:underline mt-4 inline-block">&larr; Back to Plugins</Link>
        </div>
    );
  }

  // --- Main Content ---
  return (
    <Layout>
    <div className="container mx-auto p-4 md:p-6 lg:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
      {/* Back Link */}
       <div className="mb-4">
           <Link href="/plugins" className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
               &larr; Back to Plugin List
           </Link>
       </div>
       
      {/* Header */} 
      <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          {plugin.manifest.icon && (
            <img
                src={plugin.manifest.icon.startsWith('http') ? plugin.manifest.icon : `/api/plugins/serve/${plugin.id}/${plugin.manifest.icon}`}
                alt={`${plugin.manifest.name} icon`}
                className="w-12 h-12 md:w-16 md:h-16 rounded-lg object-contain bg-gray-100 p-1 flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-gray-100 truncate" title={plugin.manifest.name}>{plugin.manifest.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Version {plugin.manifest.version}
              {plugin.manifest.author && ` by ${plugin.manifest.author}`}
              {plugin.manifest.license && <span className="ml-2 px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">{plugin.manifest.license}</span>}
            </p>
             <p className="text-xs text-gray-400 mt-1 truncate">ID: <code className="bg-gray-100 dark:bg-gray-800 p-0.5 rounded">{plugin.id}</code></p>
          </div>
        </div>
        {/* Action Buttons (adjusted logic) */} 
        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-start md:justify-end flex-shrink-0">
          {plugin.id && (
            <>
              <button
                onClick={handleUninstall}
                disabled={isLoadingAction}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center min-w-[100px]"
              >
                {isLoadingAction ? <><LoadingSpinner /> Uninstalling...</> : 'Uninstall'}
              </button>
              
              {plugin.enabled ? (
                 <button
                  onClick={handleDeactivate}
                  disabled={isLoadingAction}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center min-w-[100px]"
                >
                  {isLoadingAction ? <><LoadingSpinner /> Deactivating...</> : 'Deactivate'}
                </button>
              ) : (
                 <button
                  onClick={handleActivate}
                  disabled={isLoadingAction}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center justify-center min-w-[100px]"
                >
                   {isLoadingAction ? <><LoadingSpinner /> Activating...</> : 'Activate'}
                </button>
              )}
              
              {plugin.manifest.configuration && Object.keys(plugin.manifest.configuration).length > 0 && (
                  <button
                      onClick={handleConfigure}
                      disabled={isLoadingAction}
                      className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition duration-150 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                      Configure
                  </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- Add Generate README Button --- */}
       <div className="flex justify-end mb-6">
          <button
             onClick={handleGenerateReadme}
             disabled={isLoadingAction || isGeneratingReadme || !plugin}
             className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText size={16} className="mr-2"/>
            {isGeneratingReadme ? 'Generating...' : 'Generate README'}
          </button>
       </div>

       {/* --- README Generation Area --- */}
        {showReadmeArea && (
           <div className="mb-6 bg-white dark:bg-gray-800 p-4 md:p-6 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
               <h2 className="text-lg font-semibold mb-3 text-gray-700 dark:text-gray-200">Generated README Content</h2>
               {isGeneratingReadme && (
                   <div className="flex items-center justify-center py-10">
                       <LoadingSpinner /> <span className="ml-2 text-gray-500">Generating...</span>
                   </div>
               )}
               {readmeError && (
                   <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
                       <strong className="font-bold mr-2">Error:</strong>
                       <span className="block sm:inline">{readmeError}</span>
                   </div>
               )}
               {generatedReadme && !isGeneratingReadme && (
                   <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                           Copy the generated Markdown content below and add it to your plugin&apos;s <code className="bg-gray-100 dark:bg-gray-800 text-xs p-1 rounded">README.md</code> file.
                           Remember to review and edit it as needed.
                       </p>
                       <textarea
                           readOnly
                           value={generatedReadme}
                           className="w-full h-96 p-3 border border-gray-300 dark:border-gray-600 rounded-md font-mono text-xs bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-indigo-500 focus:border-indigo-500"
                           aria-label="Generated README content"
                       />
                       {/* Optional: Rendered preview */}
                       <h3 className="text-md font-semibold mt-4 mb-2 border-t pt-4">Preview:</h3>
                       <div className="prose prose-sm dark:prose-invert max-w-none p-4 border rounded">
                           <ReactMarkdown remarkPlugins={[remarkGfm]}>{generatedReadme}</ReactMarkdown>
                       </div>
                   </div>
               )}
               {/* Button to hide the area */}
               {!isGeneratingReadme && (
                  <button
                     onClick={() => setShowReadmeArea(false)}
                     className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mt-2"
                  >
                     Hide
                  </button>
               )}
           </div>
        )}

      {/* Action Error Display */}
      {actionError && (
         <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
            <strong className="font-bold">Action Failed: </strong>
            <span className="block sm:inline">{actionError}</span>
            <button onClick={() => setActionError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Close">
                <span className="text-xl" aria-hidden="true">&times;</span>
            </button>
        </div>
      )}

      {/* Details Sections */} 
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DetailSection title="Description">
            {plugin.manifest.description ? <p>{plugin.manifest.description}</p> : <p className="text-gray-400 italic">No description provided.</p>}
          </DetailSection>

          {plugin.manifest.contributes && Object.keys(plugin.manifest.contributes).length > 0 && (
            <DetailSection title="Features & Contributions">
              <CodeBlock>{JSON.stringify(plugin.manifest.contributes, null, 2)}</CodeBlock>
            </DetailSection>
          )}

          <DetailSection title="Logs">
               <p className="text-gray-400 italic">
                   Plugin-specific logging is not yet implemented. Runtime errors might appear in the browser console or server logs.
               </p>
          </DetailSection>
        </div>

        <div className="lg:col-span-1 space-y-6">
          <DetailSection title="Status & Details">
            <dl className="space-y-2">
              <div className="flex justify-between">
                  <dt className="font-medium text-gray-600 dark:text-gray-300">Status:</dt>
                  <dd>
                      {plugin.enabled 
                          ? <StatusBadge label="Enabled" type="success" /> 
                          : <StatusBadge label="Disabled" type="warning" />} 
                  </dd>
              </div>
               <div className="flex justify-between">
                  <dt className="font-medium text-gray-600 dark:text-gray-300">Client Host:</dt>
                  <dd>
                      {isClientSideHostActive 
                          ? <StatusBadge label="Active" type="success" /> 
                          : <StatusBadge label="Inactive" type="info" />} 
                  </dd>
              </div>
               {plugin.state === 'ERROR' && (
                   <div className="flex justify-between">
                      <dt className="font-medium text-red-600 dark:text-red-400">Last Error:</dt>
                      <dd className="text-red-600 dark:text-red-400 text-xs text-right">{plugin.lastError || 'Unknown error'}</dd>
                   </div>
               )}
               <div className="flex justify-between">
                  <dt className="font-medium text-gray-600 dark:text-gray-300">Version:</dt>
                  <dd>{plugin.manifest.version}</dd>
              </div>
               {plugin.manifest.author && (
                  <div className="flex justify-between">
                      <dt className="font-medium text-gray-600 dark:text-gray-300">Author:</dt>
                      <dd>{plugin.manifest.author}</dd>
                  </div>
               )}
               {plugin.manifest.license && (
                   <div className="flex justify-between">
                      <dt className="font-medium text-gray-600 dark:text-gray-300">License:</dt>
                      <dd>{plugin.manifest.license}</dd>
                   </div>
               )}
               {plugin.manifest.repository && (
                  <div className="flex justify-between items-center">
                    <dt className="font-medium text-gray-600 dark:text-gray-300">Repository:</dt>
                    <dd>
                       <a href={plugin.manifest.repository} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm inline-flex items-center">
                           View <ExternalLink size={14} className="ml-1" />
                       </a>
                     </dd>
                  </div>
               )}
                <div className="flex justify-between">
                  <dt className="font-medium text-gray-600 dark:text-gray-300">Installed:</dt>
                  <dd title={new Date(plugin.installedAt).toLocaleString()}>{new Date(plugin.installedAt).toLocaleDateString()}</dd>
              </div>
               <div className="flex justify-between">
                  <dt className="font-medium text-gray-600 dark:text-gray-300">Updated:</dt>
                  <dd title={new Date(plugin.updatedAt).toLocaleString()}>{new Date(plugin.updatedAt).toLocaleDateString()}</dd>
              </div>
             </dl>
          </DetailSection>

          {plugin.manifest.permissions && plugin.manifest.permissions.length > 0 && (
            <DetailSection title="Permissions Required">
              <ul className="list-disc list-inside space-y-1">
                {plugin.manifest.permissions.map((perm) => (
                  <li key={perm}><code className="bg-gray-100 dark:bg-gray-800 p-0.5 rounded text-xs break-all">{perm}</code></li>
                ))}
              </ul>
            </DetailSection>
          )}

          {plugin.manifest.dependencies && Object.keys(plugin.manifest.dependencies).length > 0 && (
            <DetailSection title="Dependencies">
              <ul className="list-disc list-inside space-y-1">
                {Object.entries(plugin.manifest.dependencies).map(([depId, version]) => (
                  <li key={depId}>
                    <Link href={`/plugins/${depId}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                      <code className="bg-gray-100 dark:bg-gray-800 p-0.5 rounded text-xs break-all">{depId}</code>
                    </Link>
                    <span className="text-gray-500 dark:text-gray-400 text-xs ml-1">({version})</span>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
          
           {plugin.manifest.configuration && Object.keys(plugin.manifest.configuration).length > 0 && (
            <DetailSection title="Configuration Schema">
               <CodeBlock>{JSON.stringify(plugin.manifest.configuration, null, 2)}</CodeBlock>
            </DetailSection>
          )}
        </div>
      </div>

      {/* Settings Dialog remains the same */}
      {plugin && (
        <PluginSettingsDialog
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          pluginId={plugin.id}
          pluginName={plugin.manifest.name}
          initialSettings={plugin.config}
          configSchema={plugin.manifest.configuration}
        />
      )}

    </div>
    </Layout>
  );
};

// --- Server-Side Props (Refined) ---
export const getServerSideProps: GetServerSideProps<PluginPageProps> = async (context) => {
  const { id } = context.params || {};
  const pluginId = typeof id === 'string' ? id : null;

  if (!pluginId) {
    context.res.statusCode = 400; // Bad Request
    return { props: { initialPluginData: null, error: 'Invalid plugin ID.', pluginId: null } };
  }

  try {
    // Fetch from the API endpoint that should return the combined registry data + manifest
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const apiUrl = `${baseUrl}/api/plugins/${pluginId}`;
    console.log(`[SSR Plugin ${pluginId}] Fetching from: ${apiUrl}`);

    const response = await fetch(apiUrl);

    if (!response.ok) {
        if (response.status === 404) {
            context.res.statusCode = 404;
            return { props: { initialPluginData: null, error: `Plugin with ID '${pluginId}' not found.`, pluginId } };
        }
        // For other errors, throw to be caught below
        throw new Error(`API Error (${response.status}): ${response.statusText}`);
    }

    const plugin: Plugin = await response.json();

    // Validate essential fields
    if (!plugin || !plugin.id || !plugin.manifest || !plugin.manifest.name) {
        console.error(`[SSR Plugin ${pluginId}] Received invalid plugin data from API:`, plugin);
        throw new Error('Received invalid plugin data from API.');
    }
    
    // Ensure dates are serializable (convert if needed, though usually handled by JSON)
    // plugin.installedAt = new Date(plugin.installedAt).toISOString();
    // plugin.updatedAt = new Date(plugin.updatedAt).toISOString();

    return { props: { initialPluginData: plugin, pluginId } };

  } catch (err) {
    console.error(`SSR Error fetching plugin ${pluginId}:`, err);
    context.res.statusCode = 500;
    const errorMessage = err instanceof Error ? err.message : 'Failed to load plugin details due to a server error.';
    // Avoid leaking potentially sensitive details from server-side errors to the client
    const clientErrorMessage = errorMessage.includes('API Error') ? errorMessage : 'Failed to load plugin details due to a server error.';
    return { props: { initialPluginData: null, error: clientErrorMessage, pluginId } };
  }
};

export default PluginDetailPage; 