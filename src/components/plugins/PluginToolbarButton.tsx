// src/components/plugins/PluginToolbarButton.tsx
import React from 'react';
import { Tooltip } from '../../components/ui/Tooltip';
import { usePluginRegistry } from '../../hooks/usePluginRegistry';

interface PluginToolbarButtonProps {
  pluginId: string;
  commandId: string;
  className?: string;
}

const PluginToolbarButton: React.FC<PluginToolbarButtonProps> = ({
  pluginId,
  commandId,
  className = ''
}) => {
  const { plugins, registry } = usePluginRegistry();
  
  // Find the plugin and command
  const plugin = plugins?.find(p => p.id === pluginId);
  const command = plugin?.manifest.contributes?.commands?.find((cmd: { id: string; }) => cmd.id === commandId);
  
  if (!plugin || !command) return null;
  
  // Extract icon information
  const iconUrl = command.icon 
    ? `/plugins/${pluginId}/${command.icon}`
    : undefined;
  
  const handleClick = async () => {
    if (!registry) return;
    
    try {
      // Get the plugin bridge from the registry and call the command
      const lifecycle = registry.getLifecycle();
      const pluginHost = await registry.getPluginHost(pluginId);
      
      if (pluginHost) {
        const bridge = pluginHost.getBridge();
        await bridge.call('commands.execute', { commandId });
      }
    } catch (error) {
      console.error(`Error executing command ${commandId}:`, error);
    }
  };
  
  return (
    <Tooltip content={command.title}>
      <button
        onClick={handleClick}
        className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${className}`}
        aria-label={command.title}
      >
        {iconUrl ? (
          <img 
            src={iconUrl} 
            alt={command.title} 
            className="w-5 h-5" 
          />
        ) : (
          <span className="text-sm font-medium">{command.title}</span>
        )}
      </button>
    </Tooltip>
  );
};

export default PluginToolbarButton;