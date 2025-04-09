// src/pages/api/toolpaths/export-import.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from 'src/lib/prisma';
import { 
  sendSuccessResponse, 
  sendErrorResponse, 
  handleApiError, 
  ensureAuthenticated 
} from 'src/lib/api/helpers';
import JSZip from 'jszip';
import { getSession } from 'next-auth/react';
import { 
  generateObjectPath, 
  uploadToBucket,
  downloadFromBucket,
  listObjectsByType
} from 'src/lib/storageService';

// Export/Import format for toolpaths
export interface ToolpathExportFormat {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  operationType: string;
  data: any;
  gcode: string;
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
      
      // If no specific IDs, list all user's toolpaths
      const toolpathIds = ids 
        ? (Array.isArray(ids) ? ids : [ids]) 
        : (await prisma.toolpath.findMany({
            where: { createdBy: userId! },
            select: { id: true }
          })).map(tp => tp.id);
      
      // Retrieve toolpaths
      const toolpaths = await prisma.toolpath.findMany({
        where: {
          id: { in: toolpathIds },
          OR: [
            { createdBy: userId! },
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
      
      if (toolpaths.length === 0) {
        return sendErrorResponse(res, 'No accessible toolpaths found', 404);
      }
      
      // Format data for export
      const exportData: ToolpathExportFormat[] = toolpaths.map(tp => ({
        id: tp.id,
        name: tp.name,
        description: tp.description,
        type: tp.type || 'mill',
        operationType: tp.operationType || 'contour',
        data: tp.data,
        gcode: tp.gcode || '',
        metadata: {
          exportedAt: new Date().toISOString(),
          exportedBy: userId!,
          version: '1.0',
          schemaVersion: '1.0',
          projectName: tp.project.name
        }
      }));
      
      // Export in different formats
      switch (format) {
        case 'json':
          // Export as single JSON file
          res.setHeader('Content-Disposition', `attachment; filename="toolpaths-export-${Date.now()}.json"`);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).json(exportData);
        
        case 'zip':
          // Create ZIP with JSON and G-code for each toolpath
          const zip = new JSZip();
          
          toolpaths.forEach(tp => {
            const exportFormat: ToolpathExportFormat = {
              id: tp.id,
              name: tp.name,
              description: tp.description,
              type: tp.type || 'mill',
              operationType: tp.operationType || 'contour',
              data: tp.data,
              gcode: tp.gcode || '',
              metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: userId!,
                version: '1.0',
                schemaVersion: '1.0',
                projectName: tp.project.name
              }
            };
            
            // Create a folder for each toolpath
            const folderName = tp.name.replace(/[^a-z0-9]/gi, '_');
            
            // Add JSON file with toolpath data
            zip.file(`${folderName}/toolpath.json`, JSON.stringify(exportFormat, null, 2));
            
            // Add separate G-code file
            if (tp.gcode) {
              zip.file(`${folderName}/${tp.name.replace(/[^a-z0-9]/gi, '_')}.gcode`, tp.gcode);
            }
          });
          
          // Create index file
          const index = {
            exported_at: new Date().toISOString(),
            toolpaths: toolpaths.map(tp => ({
              id: tp.id,
              name: tp.name,
              folder: tp.name.replace(/[^a-z0-9]/gi, '_')
            }))
          };
          
          zip.file('index.json', JSON.stringify(index, null, 2));
          // Generate ZIP file
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
          
          // Send as ZIP response
          res.setHeader('Content-Disposition', `attachment; filename="toolpaths-export-${Date.now()}.zip"`);
          res.setHeader('Content-Type', 'application/zip');
          return res.status(200).send(zipContent);
        
        default:
          return sendErrorResponse(res, 'Unsupported export format', 400);
      }
    }
    
    // IMPORT - POST
    else if (req.method === 'POST') {
      const { 
        projectId, 
        data, 
        gcode,
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
        // Toolpath data provided directly
        importData = data;
      } 
      else if (gcode) {
        // G-code provided directly, create minimal toolpath structure
        importData = {
          name: req.body.name || `Imported G-code ${new Date().toLocaleDateString()}`,
          type: req.body.type || 'mill',
          operationType: req.body.operationType || 'contour',
          data: req.body.settings || {},
          gcode
        };
      } 
      else {
        return sendErrorResponse(res, 'No import data or G-code provided', 400);
      }
      
      // Ensure data is valid
      if (!importData) {
        return sendErrorResponse(res, 'Invalid import data', 400);
      }
      
      // Ensure data is an array
      const toolpathsToImport = Array.isArray(importData) 
        ? importData 
        : [importData];
      
      // Import results tracking
      const results = {
        created: [] as string[],
        updated: [] as string[],
        skipped: [] as string[],
        errors: [] as {id: string; error: string}[]
      };
      
      // Import each toolpath
      for (const tp of toolpathsToImport) {
        try {
          // Validate toolpath data
          if (!tp.name) {
            results.errors.push({
              id: tp.id || 'unknown',
              error: 'Missing required field: name'
            });
            continue;
          }
          
          // Determine import strategy based on mode
          switch (importMode) {
            case 'create':
              // Always create new toolpaths
              const newToolpath = await prisma.toolpath.create({
                data: {
                  name: tp.name,
                  description: tp.description || null,
                  data: tp.data || {},
                  gcode: tp.gcode || '',
                  type: tp.type || 'mill',
                  operationType: tp.operationType || 'contour',
                  projectId: project.id,
                  createdBy: userId!,
                  isPublic: false
                }
              });
              results.created.push(newToolpath.id);
              break;
            
            case 'update':
              // Update if exists, otherwise create
              if (tp.id) {
                const existingToolpath = await prisma.toolpath.findFirst({
                  where: {
                    id: tp.id,
                    projectId: project.id
                  }
                });
                
                if (existingToolpath) {
                  // Update existing toolpath
                  await prisma.toolpath.update({
                    where: { id: tp.id },
                    data: {
                      name: tp.name,
                      description: tp.description || null,
                      data: tp.data || {},
                      gcode: tp.gcode || '',
                      type: tp.type || 'mill',
                      operationType: tp.operationType || 'contour',
                      updatedAt: new Date()
                    }
                  });
                  results.updated.push(tp.id);
                } else {
                  // Create new toolpath if not found
                  const newToolpath = await prisma.toolpath.create({
                    data: {
                      name: tp.name,
                      description: tp.description || null,
                      data: tp.data || {},
                      gcode: tp.gcode || '',
                      type: tp.type || 'mill',
                      operationType: tp.operationType || 'contour',
                      projectId: project.id,
                      createdBy: userId!,
                      isPublic: false
                    }
                  });
                  results.created.push(newToolpath.id);
                }
              } else {
                // No ID provided, create new
                const newToolpath = await prisma.toolpath.create({
                  data: {
                    name: tp.name,
                    description: tp.description || null,
                    data: tp.data || {},
                    gcode: tp.gcode || '',
                    type: tp.type || 'mill',
                    operationType: tp.operationType || 'contour',
                    projectId: project.id,
                    createdBy: userId!,
                    isPublic: false
                  }
                });
                results.created.push(newToolpath.id);
              }
              break;
            
            default:
              results.errors.push({
                id: tp.id || 'unknown',
                error: `Unsupported import mode: ${importMode}`
              });
          }
        } catch (error) {
          console.error('Toolpath import error:', error);
          results.errors.push({
            id: tp.id || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown import error'
          });
        }
      }
      
      // Return import results
      return sendSuccessResponse(
        res, 
        results, 
        'Toolpaths imported successfully'
      );
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}