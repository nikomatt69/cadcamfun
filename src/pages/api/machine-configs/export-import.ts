// src/pages/api/machine-configs/export-import.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { 
  sendSuccessResponse, 
  sendErrorResponse, 
  handleApiError, 
  ensureAuthenticated 
} from 'src/lib/api/helpers';
import { 
  generateObjectPath, 
  uploadToBucket,
  downloadFromBucket,
  listObjectsByType
} from 'src/lib/storageService';
import JSZip from 'jszip';

// Export/Import format for machine configurations
export interface MachineConfigExportFormat {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  config: any;
  metadata: {
    exportedAt: string;
    exportedBy: string;
    version: string;
    schemaVersion: string;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Authentication check
    const { authenticated, userId } = await ensureAuthenticated(req, res, getSession);
    if (!authenticated) return;
    
    // EXPORT - GET
    if (req.method === 'GET') {
      const { ids, format = 'json' } = req.query;
      
      // If no specific IDs, list all user's machine configs
      const configIds = ids 
        ? (Array.isArray(ids) ? ids : [ids]) 
        : (await listObjectsByType('machine-config', userId!)).map(path => path.split('/')[1]);
      
      // Retrieve machine configs
      const machineConfigs = await prisma.machineConfig.findMany({
        where: {
          id: { in: configIds },
          OR: [
            { ownerId: userId! },
            { isPublic: true }
          ]
        }
      });
      
      if (machineConfigs.length === 0) {
        return sendErrorResponse(res, 'No accessible machine configurations found', 404);
      }
      
      // Format data for export
      const exportData: MachineConfigExportFormat[] = machineConfigs.map(config => ({
        id: config.id,
        name: config.name,
        description: config.description,
        type: config.type,
        config: config.config,
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: userId!,
          version: '1.0',
          schemaVersion: '1.0'
        }
      }));
      
      // Export in different formats
      switch (format) {
        case 'json':
          // Export as single JSON file
          res.setHeader('Content-Disposition', `attachment; filename="machine-configs-export-${Date.now()}.json"`);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).json(exportData);
        
        case 'zip':
          // Create ZIP with JSON for each configuration
          const zip = new JSZip();
          
          machineConfigs.forEach(config => {
            const exportFormat: MachineConfigExportFormat = {
              id: config.id,
              name: config.name,
              description: config.description,
              type: config.type,
              config: config.config,
              metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: userId!,
                version: '1.0',
                schemaVersion: '1.0'
              }
            };
            
            // Add to ZIP
            zip.file(`${config.name.replace(/[^a-z0-9]/gi, '_')}.json`, JSON.stringify(exportFormat, null, 2));
          });
          
          // Create index file
          const index = {
            exported_at: new Date().toISOString(),
            configs: machineConfigs.map(c => ({
              id: c.id,
              name: c.name,
              filename: `${c.name.replace(/[^a-z0-9]/gi, '_')}.json`
            }))
          };
          
          zip.file('index.json', JSON.stringify(index, null, 2));
          
          // Generate ZIP file
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
          
          // Send as ZIP response
          res.setHeader('Content-Disposition', `attachment; filename="machine-configs-export-${Date.now()}.zip"`);
          res.setHeader('Content-Type', 'application/zip');
          return res.status(200).send(zipContent);
        
        case 'bucket':
          // Save to bucket and return path
          const exportPath = generateObjectPath('machine-config', userId!);
          await uploadToBucket(exportPath, exportData);
          
          return sendSuccessResponse(
            res, 
            { path: exportPath }, 
            'Machine configurations exported to bucket successfully'
          );
        
        default:
          return sendErrorResponse(res, 'Unsupported export format', 400);
      }
    }
    
    // IMPORT - POST
    else if (req.method === 'POST') {
      const { 
        data, 
        path, 
        importMode = 'create',
        organizationId 
      } = req.body;
      
      // Get data to import
      let importData;
      
      if (data) {
        // Data provided directly
        importData = data;
      } 
      else if (path) {
        // Load from bucket
        importData = await downloadFromBucket(path);
      } 
      else {
        return sendErrorResponse(res, 'No import data provided', 400);
      }
      
      // Ensure data is valid
      if (!importData) {
        return sendErrorResponse(res, 'Invalid import data', 400);
      }
      
      // Ensure data is an array
      const configsToImport = Array.isArray(importData) 
        ? importData 
        : [importData];
      
      // Import results tracking
      const results = {
        created: [] as string[],
        updated: [] as string[],
        skipped: [] as string[],
        errors: [] as {id: string; error: string}[]
      };
      
      // Validate organization access if provided
      if (organizationId) {
        const userOrg = await prisma.userOrganization.findUnique({
          where: {
            userId_organizationId: {
              userId: userId!,
              organizationId
            }
          }
        });
        
        if (!userOrg) {
          return sendErrorResponse(res, 'You do not have access to this organization', 403);
        }
      }
      
      // Import each configuration
      for (const config of configsToImport) {
        try {
          // Validate config data
          if (!config.name || !config.type || !config.config) {
            results.errors.push({
              id: config.id || 'unknown',
              error: 'Missing required fields (name, type, config)'
            });
            continue;
          }
          
          // Determine import strategy based on mode
          switch (importMode) {
            case 'create':
              // Always create new configs
              const newConfig = await prisma.machineConfig.create({
                data: {
                  name: config.name,
                  description: config.description || null,
                  type: config.type,
                  config: config.config,
                  ownerId: userId!,
                 
                  isPublic: false
                }
              });
              results.created.push(newConfig.id);
              break;
            
            case 'update':
              // Update if exists, otherwise create
              if (config.id) {
                const existingConfig = await prisma.machineConfig.findUnique({
                  where: { id: config.id }
                });
                
                if (existingConfig && existingConfig.ownerId === userId) {
                  // Update existing config
                  const updatedConfig = await prisma.machineConfig.update({
                    where: { id: config.id },
                    data: {
                      name: config.name,
                      description: config.description || null,
                      type: config.type,
                      config: config.config,
                      updatedAt: new Date()
                    }
                  });
                  results.updated.push(updatedConfig.id);
                } else {
                  // Create new config if not found or not owned
                  const newConfig = await prisma.machineConfig.create({
                    data: {
                      name: config.name,
                      description: config.description || null,
                      type: config.type,
                      config: config.config,
                      ownerId: userId!,
                     
                      isPublic: false
                    }
                  });
                  results.created.push(newConfig.id);
                }
              } else {
                // No ID provided, create new
                const newConfig = await prisma.machineConfig.create({
                  data: {
                    name: config.name,
                    description: config.description || null,
                    type: config.type,
                    config: config.config,
                    ownerId: userId!,
                  
                    isPublic: false
                  }
                });
                results.created.push(newConfig.id);
              }
              break;
            
            case 'skip':
              // Skip if config with ID exists
              if (config.id) {
                const existingConfig = await prisma.machineConfig.findUnique({
                  where: { id: config.id }
                });
                
                if (existingConfig) {
                  results.skipped.push(config.id);
                } else {
                  // Create if not exists
                  const newConfig = await prisma.machineConfig.create({
                    data: {
                      name: config.name,
                      description: config.description || null,
                      type: config.type,
                      config: config.config,
                      ownerId: userId!,
                     
                      isPublic: false
                    }
                  });
                  results.created.push(newConfig.id);
                }
              } else {
                // No ID, always create
                const newConfig = await prisma.machineConfig.create({
                  data: {
                    name: config.name,
                    description: config.description || null,
                    type: config.type,
                    config: config.config,
                    ownerId: userId!,
                   
                    isPublic: false
                  }
                });
                results.created.push(newConfig.id);
              }
              break;
            
            default:
              results.errors.push({
                id: config.id || 'unknown',
                error: `Unsupported import mode: ${importMode}`
              });
          }
        } catch (error) {
          console.error('Machine configuration import error:', error);
          results.errors.push({
            id: config.id || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown import error'
          });
        }
      }
      
      // Return import results
      return sendSuccessResponse(
        res, 
        results, 
        'Machine configurations imported successfully'
      );
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}
