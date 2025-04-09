// src/pages/api/components/export-import.ts

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

// Export/Import format for components
export interface ComponentExportFormat {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  data: any;
  metadata: {
    exportedAt: string;
    exportedBy: string;
    version: string;
    schemaVersion: string;
    projectName?: string;
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
      
      // If no specific IDs, list all user's components
      const componentIds = ids 
        ? (Array.isArray(ids) ? ids : [ids]) 
        : (await listObjectsByType('component', userId!)).map((path: string) => path.split('/')[1]);
      
      // Retrieve components
      const components = await prisma.component.findMany({
        where: {
          id: { in: componentIds },
          OR: [
            { project: { ownerId: userId! } },
            { 
              project: { 
                organization: { 
                  users: { 
                    some: { userId: userId! } 
                  } 
                } 
              } 
            }
          ]
        },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
      
      if (components.length === 0) {
        return sendErrorResponse(res, 'No accessible components found', 404);
      }
      
      // Format data for export
      const exportData: ComponentExportFormat[] = components.map(comp => ({
        id: comp.id,
        name: comp.name,
        description: comp.description,
        type: comp.data && typeof comp.data === 'object' 
          ? (comp.data as any).type || 'unknown' 
          : 'unknown',
        data: comp.data,
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: userId!,
          version: '1.0',
          schemaVersion: '1.0',
          projectName: comp.project.name
        }
      }));
      
      // Export in different formats
      switch (format) {
        case 'json':
          // Export as single JSON file
          res.setHeader('Content-Disposition', `attachment; filename="components-export-${Date.now()}.json"`);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).json(exportData);
        
        case 'zip':
          // Create ZIP with JSON for each component
          const zip = new JSZip();
          
          components.forEach(comp => {
            const exportFormat: ComponentExportFormat = {
              id: comp.id,
              name: comp.name,
              description: comp.description,
              type: comp.data && typeof comp.data === 'object' 
                ? (comp.data as any).type || 'unknown' 
                : 'unknown',
              data: comp.data,
              metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: userId!,
                version: '1.0',
                schemaVersion: '1.0',
                projectName: comp.project.name
              }
            };
            
            // Add to ZIP
            zip.file(`${comp.name.replace(/[^a-z0-9]/gi, '_')}.json`, JSON.stringify(exportFormat, null, 2));
          });
          
          // Create index file
          const index = {
            exported_at: new Date().toISOString(),
            components: components.map(c => ({
              id: c.id,
              name: c.name,
              filename: `${c.name.replace(/[^a-z0-9]/gi, '_')}.json`
            }))
          };
          
          zip.file('index.json', JSON.stringify(index, null, 2));
          
          // Generate ZIP file
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
          
          // Send as ZIP response
          res.setHeader('Content-Disposition', `attachment; filename="components-export-${Date.now()}.zip"`);
          res.setHeader('Content-Type', 'application/zip');
          return res.status(200).send(zipContent);
        
        case 'bucket':
          // Save to bucket and return path
          const exportPath = generateObjectPath('component', userId!);
          await uploadToBucket(exportPath, exportData);
          
          return sendSuccessResponse(
            res, 
            { path: exportPath }, 
            'Components exported to bucket successfully'
          );
        
        default:
          return sendErrorResponse(res, 'Unsupported export format', 400);
      }
    }
    
    // IMPORT - POST
    else if (req.method === 'POST') {
      const { 
        projectId, 
        data, 
        path, 
        importMode = 'create',
        overwriteExisting = false 
      } = req.body;
      
      // Verify project exists and user has access
      if (!projectId) {
        return sendErrorResponse(res, 'Project ID is required', 400);
      }
      
      const project = await prisma.project.findFirst({
        where: {
          id: projectId,
          OR: [
            { ownerId: userId! },
            { 
              organization: { 
                users: { 
                  some: { userId: userId! } 
                } 
              } 
            }
          ]
        }
      });
      
      if (!project) {
        return sendErrorResponse(res, 'Project not found or access denied', 404);
      }
      
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
      const componentsToImport = Array.isArray(importData) 
        ? importData 
        : [importData];
      
      // Import results tracking
      const results = {
        created: [] as string[],
        updated: [] as string[],
        skipped: [] as string[],
        errors: [] as {id: string; error: string}[]
      };
      
      // Import each component
      for (const comp of componentsToImport) {
        try {
          // Validate component data
          if (!comp.name || !comp.data) {
            results.errors.push({
              id: comp.id || 'unknown',
              error: 'Missing required fields (name, data)'
            });
            continue;
          }
          
          // Determine import strategy based on mode
          switch (importMode) {
            case 'create':
              // Always create new components
              const newComponent = await prisma.component.create({
                data: {
                  name: comp.name,
                  description: comp.description || null,
                  data: comp.data,
                  projectId: project.id
                }
              });
              results.created.push(newComponent.id);
              break;
            
            case 'update':
              // Update if exists, otherwise create
              if (comp.id) {
                const existingComponent = await prisma.component.findFirst({
                  where: {
                    id: comp.id,
                    projectId: project.id
                  }
                });
                
                if (existingComponent) {
                  // Update existing component
                  await prisma.component.update({
                    where: { id: comp.id },
                    data: {
                      name: comp.name,
                      description: comp.description || null,
                      data: comp.data,
                      updatedAt: new Date()
                    }
                  });
                  results.updated.push(comp.id);
                } else {
                  // Create new component if not found
                  const newComponent = await prisma.component.create({
                    data: {
                      name: comp.name,
                      description: comp.description || null,
                      data: comp.data,
                      projectId: project.id
                    }
                  });
                  results.created.push(newComponent.id);
                }
              } else {
                // No ID provided, create new
                const newComponent = await prisma.component.create({
                  data: {
                    name: comp.name,
                    description: comp.description || null,
                    data: comp.data,
                    projectId: project.id
                  }
                });
                results.created.push(newComponent.id);
              }
              break;
            
            case 'skip':
              // Skip if component with ID exists
              if (comp.id) {
                const existingComponent = await prisma.component.findFirst({
                  where: {
                    id: comp.id,
                    projectId: project.id
                  }
                });
                
                if (existingComponent) {
                  results.skipped.push(comp.id);
                } else {
                  // Create if not exists
                  const newComponent = await prisma.component.create({
                    data: {
                      name: comp.name,
                      description: comp.description || null,
                      data: comp.data,
                      projectId: project.id
                    }
                  });
                  results.created.push(newComponent.id);
                }
              } else {
                // No ID, always create
                const newComponent = await prisma.component.create({
                  data: {
                    name: comp.name,
                    description: comp.description || null,
                    data: comp.data,
                    projectId: project.id
                  }
                });
                results.created.push(newComponent.id);
              }
              break;
            
            default:
              results.errors.push({
                id: comp.id || 'unknown',
                error: `Unsupported import mode: ${importMode}`
              });
          }
        } catch (error) {
          console.error('Component import error:', error);
          results.errors.push({
            id: comp.id || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown import error'
          });
        }
      }
      
      // Return import results
      return sendSuccessResponse(
        res, 
        results, 
        'Components imported successfully'
      );
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}