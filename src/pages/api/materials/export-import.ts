// src/pages/api/materials/export-import.ts

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

// Export/Import format for materials
export interface MaterialExportFormat {
  id: string;
  name: string;
  description?: string | null;
  properties: any;
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
      
      // If no specific IDs, list all user's materials
      const materialIds = ids 
        ? (Array.isArray(ids) ? ids : [ids]) 
        : (await listObjectsByType('material', userId!)).map(path => path.split('/')[1]);
      
      // Retrieve materials
      const materials = await prisma.material.findMany({
        where: {
          id: { in: materialIds }
        }
      });
      
      if (materials.length === 0) {
        return sendErrorResponse(res, 'No accessible materials found', 404);
      }
      
      // Format data for export
      const exportData: MaterialExportFormat[] = materials.map(material => ({
        id: material.id,
        name: material.name,
        description: material.description,
        properties: material.properties || {},
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
          res.setHeader('Content-Disposition', `attachment; filename="materials-export-${Date.now()}.json"`);
          res.setHeader('Content-Type', 'application/json');
          return res.status(200).json(exportData);
        
        case 'zip':
          // Create ZIP with JSON for each material
          const zip = new JSZip();
          
          materials.forEach(material => {
            const exportFormat: MaterialExportFormat = {
              id: material.id,
              name: material.name,
              description: material.description,
              properties: material.properties || {},
              metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: userId!,
                version: '1.0',
                schemaVersion: '1.0'
              }
            };
            
            // Add to ZIP
            zip.file(`${material.name.replace(/[^a-z0-9]/gi, '_')}.json`, JSON.stringify(exportFormat, null, 2));
          });
          
          // Create index file
          const index = {
            exported_at: new Date().toISOString(),
            materials: materials.map(m => ({
              id: m.id,
              name: m.name,
              filename: `${m.name.replace(/[^a-z0-9]/gi, '_')}.json`
            }))
          };
          
          zip.file('index.json', JSON.stringify(index, null, 2));
          
          // Generate ZIP file
          const zipContent = await zip.generateAsync({ type: 'nodebuffer' });
          
          // Send as ZIP response
          res.setHeader('Content-Disposition', `attachment; filename="materials-export-${Date.now()}.zip"`);
          res.setHeader('Content-Type', 'application/zip');
          return res.status(200).send(zipContent);
        
        case 'bucket':
          // Save to bucket and return path
          const exportPath = generateObjectPath('material', userId!);
          await uploadToBucket(exportPath, JSON.stringify(exportData, null, 2));
          
          return sendSuccessResponse(
            res, 
            { path: exportPath }, 
            'Materials exported to bucket successfully'
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
      const materialsToImport = Array.isArray(importData) 
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
      
      // Import each material
      for (const material of materialsToImport) {
        try {
          // Validate material data
          if (!material.name) {
            results.errors.push({
              id: material.id || 'unknown',
              error: 'Missing required field (name)'
            });
            continue;
          }
          
          // Determine import strategy based on mode
          switch (importMode) {
            case 'create':
              // Always create new materials
              const newMaterial = await prisma.material.create({
                data: {
                  name: material.name,
                  description: material.description || null,
                  properties: material.properties || {}
                }
              });
              results.created.push(newMaterial.id);
              break;
            
            case 'update':
              // Update if exists, otherwise create
              if (material.id) {
                const existingMaterial = await prisma.material.findUnique({
                  where: { id: material.id }
                });
                
                if (existingMaterial) {
                  // Update existing material
                  const updatedMaterial = await prisma.material.update({
                    where: { id: material.id },
                    data: {
                      name: material.name,
                      description: material.description || null,
                      properties: material.properties || {},
                      updatedAt: new Date()
                    }
                  });
                  results.updated.push(updatedMaterial.id);
                } else {
                  // Create new material if not found
                  const newMaterial = await prisma.material.create({
                    data: {
                      name: material.name,
                      description: material.description || null,
                      properties: material.properties || {}
                    }
                  });
                  results.created.push(newMaterial.id);
                }
              } else {
                // No ID provided, create new
                const newMaterial = await prisma.material.create({
                  data: {
                    name: material.name,
                    description: material.description || null,
                    properties: material.properties || {}
                  }
                });
                results.created.push(newMaterial.id);
              }
              break;
            
            case 'skip':
              // Skip if material with ID exists
              if (material.id) {
                const existingMaterial = await prisma.material.findUnique({
                  where: { id: material.id }
                });
                
                if (existingMaterial) {
                  results.skipped.push(material.id);
                } else {
                  // Create if not exists
                  const newMaterial = await prisma.material.create({
                    data: {
                      name: material.name,
                      description: material.description || null,
                      properties: material.properties || {}
                    }
                  });
                  results.created.push(newMaterial.id);
                }
              } else {
                // No ID, always create
                const newMaterial = await prisma.material.create({
                  data: {
                    name: material.name,
                    description: material.description || null,
                    properties: material.properties || {}
                  }
                });
                results.created.push(newMaterial.id);
              }
              break;
            
            default:
              results.errors.push({
                id: material.id || 'unknown',
                error: `Unsupported import mode: ${importMode}`
              });
          }
        } catch (error) {
          console.error('Material import error:', error);
          results.errors.push({
            id: material.id || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown import error'
          });
        }
      }
      
      // Return import results
      return sendSuccessResponse(
        res, 
        results, 
        'Materials imported successfully'
      );
    }
    else {
      return sendErrorResponse(res, 'Method not allowed', 405);
    }
  } catch (error) {
    return handleApiError(error, res);
  }
}