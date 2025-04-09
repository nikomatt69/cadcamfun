// src/pages/api/tools/export-import.ts

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

// Export/Import format for tools
export interface ToolExportFormat {
  id: string;
  name: string;
  type: string;
  diameter: number;
  material: string;
  numberOfFlutes?: number | null;
  maxRPM?: number | null;
  coolantType?: string | null;
  cuttingLength?: number | null;
  totalLength?: number | null;
  shankDiameter?: number | null;
  notes?: string | null;
  metadata: {
    exportedAt: string;
    exportedBy: string;
    version: string;
    schemaVersion: string;
  };
}

// Helper function to validate tool import data
function validateToolData(tool: any): string[] {
  const errors: string[] = [];
  
  if (!tool.name) errors.push('Name is required');
  if (!tool.type) errors.push('Type is required');
  if (!tool.diameter) errors.push('Diameter is required');
  if (!tool.material) errors.push('Material is required');
  
  return errors;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Authentication check
    const { authenticated, userId } = await ensureAuthenticated(req, res, getSession);
    if (!authenticated) return;
    
    // EXPORT - GET
    if (req.method === 'GET') {
      const { ids, format = 'json' } = req.query;
      
      // If no specific IDs, list all user's tools
      const toolIds = ids 
        ? (Array.isArray(ids) ? ids : [ids]) 
        : (await listObjectsByType('tool', userId!)).map(path => path.split('/')[1]);
      
      // Retrieve tools
      const tools = await prisma.tool.findMany({
        where: {
          id: { in: toolIds }
        }
      });
      
      if (tools.length === 0) {
        return sendErrorResponse(res, 'No accessible tools found', 404);
      }
      
      // Format data for export
      const exportData: ToolExportFormat[] = tools.map(tool => ({
        id: tool.id,
        name: tool.name,
        type: tool.type,
        diameter: tool.diameter,
        material: tool.material,
        numberOfFlutes: tool.numberOfFlutes,
        maxRPM: tool.maxRPM,
        coolantType: tool.coolantType,
        cuttingLength: tool.cuttingLength,
        totalLength: tool.totalLength,
        shankDiameter: tool.shankDiameter,
        notes: tool.notes,
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
          res.setHeader('Content-Disposition', `attachment; filename="tools-export-${Date.now()}.json"`);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).json(exportData);
        
        case 'zip':
          // Create ZIP with JSON for each tool
          const zip = new JSZip();
          
          tools.forEach(tool => {
            const exportFormat: ToolExportFormat = {
              id: tool.id,
              name: tool.name,
              type: tool.type,
              diameter: tool.diameter,
              material: tool.material,
              numberOfFlutes: tool.numberOfFlutes,
              maxRPM: tool.maxRPM,
              coolantType: tool.coolantType,
              cuttingLength: tool.cuttingLength,
              totalLength: tool.totalLength,
              shankDiameter: tool.shankDiameter,
              notes: tool.notes,
              metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: userId!,
                version: '1.0',
                schemaVersion: '1.0'
              }
            };
            
            // Add to ZIP
            zip.file(`${tool.name.replace(/[^a-z0-9]/gi, '_')}.json`, JSON.stringify(exportFormat, null, 2));
          });
          
          // Create index file
          const index = {
            exported_at: new Date().toISOString(),
            tools: tools.map(t => ({
              id: t.id,
              name: t.name,
              filename: `${t.name.replace(/[^a-z0-9]/gi, '_')}.json`
            }))
          };
          
          zip.file('index.json', JSON.stringify(index, null, 2));
          
          // Generate ZIP file
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
          
          // Send as ZIP response
          res.setHeader('Content-Disposition', `attachment; filename="tools-export-${Date.now()}.zip"`);
          res.setHeader('Content-Type', 'application/zip');
          return res.status(200).send(zipContent);
        
        case 'bucket':
          // Save to bucket and return path
          const exportPath = generateObjectPath('tool', userId!);
          await uploadToBucket(exportPath, exportData);
          
          return sendSuccessResponse(
            res, 
            { path: exportPath }, 
            'Tools exported to bucket successfully'
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
      const toolsToImport = Array.isArray(importData) 
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
      
      // Import each tool
      for (const tool of toolsToImport) {
        try {
          // Validate tool data
          const validationErrors = validateToolData(tool);
          if (validationErrors.length > 0) {
            results.errors.push({
              id: tool.id || 'unknown',
              error: validationErrors.join(', ')
            });
            continue;
          }
          
          // Determine import strategy based on mode
          switch (importMode) {
            case 'create':
              // Always create new tools
              const newTool = await prisma.tool.create({
                data: {
                  name: tool.name,
                  type: tool.type,
                  diameter: parseFloat(tool.diameter),
                  material: tool.material,
                  numberOfFlutes: tool.numberOfFlutes ? parseInt(tool.numberOfFlutes) : undefined,
                  maxRPM: tool.maxRPM ? parseInt(tool.maxRPM) : undefined,
                  coolantType: tool.coolantType || null,
                  cuttingLength: tool.cuttingLength ? parseFloat(tool.cuttingLength) : undefined,
                  totalLength: tool.totalLength ? parseFloat(tool.totalLength) : undefined,
                  shankDiameter: tool.shankDiameter ? parseFloat(tool.shankDiameter) : undefined,
                  notes: tool.notes || null,
                }
              });
              results.created.push(newTool.id);
              break;
            
            case 'update':
              // Update if exists, otherwise create
              if (tool.id) {
                const existingTool = await prisma.tool.findUnique({
                  where: { id: tool.id }
                });
                
                if (existingTool) {
                  // Update existing tool
                  const updatedTool = await prisma.tool.update({
                    where: { id: tool.id },
                    data: {
                      name: tool.name,
                      type: tool.type,
                      diameter: parseFloat(tool.diameter),
                      material: tool.material,
                      numberOfFlutes: tool.numberOfFlutes ? parseInt(tool.numberOfFlutes) : undefined,
                      maxRPM: tool.maxRPM ? parseInt(tool.maxRPM) : undefined,
                      coolantType: tool.coolantType || null,
                      cuttingLength: tool.cuttingLength ? parseFloat(tool.cuttingLength) : undefined,
                      totalLength: tool.totalLength ? parseFloat(tool.totalLength) : undefined,
                      shankDiameter: tool.shankDiameter ? parseFloat(tool.shankDiameter) : undefined,
                      notes: tool.notes || null,
                      updatedAt: new Date()
                    }
                  });
                  results.updated.push(updatedTool.id);
                } else {
                  // Create new tool if not found
                  const newTool = await prisma.tool.create({
                    data: {
                      name: tool.name,
                      type: tool.type,
                      diameter: parseFloat(tool.diameter),
                      material: tool.material,
                      numberOfFlutes: tool.numberOfFlutes ? parseInt(tool.numberOfFlutes) : undefined,
                      maxRPM: tool.maxRPM ? parseInt(tool.maxRPM) : undefined,
                      coolantType: tool.coolantType || null,
                      cuttingLength: tool.cuttingLength ? parseFloat(tool.cuttingLength) : undefined,
                      totalLength: tool.totalLength ? parseFloat(tool.totalLength) : undefined,
                      shankDiameter: tool.shankDiameter ? parseFloat(tool.shankDiameter) : undefined,
                      notes: tool.notes || null,
                    }
                  });
                  results.created.push(newTool.id);
                }
              } else {
                // No ID provided, create new
                const newTool = await prisma.tool.create({
                  data: {
                    name: tool.name,
                    type: tool.type,
                    diameter: parseFloat(tool.diameter),
                    material: tool.material,
                    numberOfFlutes: tool.numberOfFlutes ? parseInt(tool.numberOfFlutes) : undefined,
                    maxRPM: tool.maxRPM ? parseInt(tool.maxRPM) : undefined,
                    coolantType: tool.coolantType || null,
                    cuttingLength: tool.cuttingLength ? parseFloat(tool.cuttingLength) : undefined,
                    totalLength: tool.totalLength ? parseFloat(tool.totalLength) : undefined,
                    shankDiameter: tool.shankDiameter ? parseFloat(tool.shankDiameter) : undefined,
                    notes: tool.notes || null,
                  }
                });
                results.created.push(newTool.id);
              }
              break;
            
            case 'skip':
              // Skip if tool with ID exists
              if (tool.id) {
                const existingTool = await prisma.tool.findUnique({
                  where: { id: tool.id }
                });
                
                if (existingTool) {
                  results.skipped.push(tool.id);
                } else {
                  // Create if not exists
                  const newTool = await prisma.tool.create({
                    data: {
                      name: tool.name,
                      type: tool.type,
                      diameter: parseFloat(tool.diameter),
                      material: tool.material,
                      numberOfFlutes: tool.numberOfFlutes ? parseInt(tool.numberOfFlutes) : undefined,
                      maxRPM: tool.maxRPM ? parseInt(tool.maxRPM) : undefined,
                      coolantType: tool.coolantType || null,
                      cuttingLength: tool.cuttingLength ? parseFloat(tool.cuttingLength) : undefined,
                      totalLength: tool.totalLength ? parseFloat(tool.totalLength) : undefined,
                      shankDiameter: tool.shankDiameter ? parseFloat(tool.shankDiameter) : undefined,
                      notes: tool.notes || null,
                    }
                  });
                  results.created.push(newTool.id);
                }
              } else {
                // No ID, always create
                const newTool = await prisma.tool.create({
                  data: {
                    name: tool.name,
                    type: tool.type,
                    diameter: parseFloat(tool.diameter),
                    material: tool.material,
                    numberOfFlutes: tool.numberOfFlutes ? parseInt(tool.numberOfFlutes) : undefined,
                    maxRPM: tool.maxRPM ? parseInt(tool.maxRPM) : undefined,
                    coolantType: tool.coolantType || null,
                    cuttingLength: tool.cuttingLength ? parseFloat(tool.cuttingLength) : undefined,
                    totalLength: tool.totalLength ? parseFloat(tool.totalLength) : undefined,
                    shankDiameter: tool.shankDiameter ? parseFloat(tool.shankDiameter) : undefined,
                    notes: tool.notes || null,
                  }
                });
                results.created.push(newTool.id);
              }
              break;
            
            default:
              results.errors.push({
                id: tool.id || 'unknown',
                error: `Unsupported import mode: ${importMode}`
              });
          }
        } catch (error) {
          console.error('Tool import error:', error);
          results.errors.push({
            id: tool.id || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown import error'
          });
        }
      }
      
      // Return import results
      return sendSuccessResponse(
        res, 
        results, 
        'Tools imported successfully'
      );
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}