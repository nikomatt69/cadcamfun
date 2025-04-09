// src/pages/api/components/[id]/analysis.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from 'next-auth/react';
import { prisma } from 'src/lib/prisma';
import { sendErrorResponse, sendSuccessResponse, handleApiError } from 'src/lib/api/helpers';
import { requireAuth } from '@/src/lib/api/auth';
import { Component } from '@prisma/client';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Ensure user is authenticated
    const userId = await requireAuth(req, res);
    if (!userId) return;
    
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ message: 'Component ID is required' });
    }
    
    // Fetch component to ensure access
    const component = await prisma.component.findFirst({
      where: {
        id,
        OR: [
          { project: { ownerId: userId } },
          { project: { organization: { users: { some: { userId } } } } },
          { isPublic: true }
        ]
      }
    });
    
    if (!component) {
      return sendErrorResponse(res, 'Component not found or access denied', 404);
    }
    
    // Handle GET request - Get component analysis
    if (req.method === 'GET') {
      // Analyze component data
      const analysis = await analyzeComponent(component);
      
      return sendSuccessResponse(res, analysis);
    }
    
    // Handle unsupported methods
    return sendErrorResponse(res, 'Method not allowed', 405);
  } catch (error) {
    return handleApiError(error, res);
  }
}

async function analyzeComponent(component:  Component) {
  // Extract data for analysis
  const data = component.data || {};
  
  // Calculate complexity
  const complexity = calculateComplexity(data);
  
  // Calculate performance metrics
  const performance = estimatePerformance(data, component.type || '');
  
  // Check compatibility
  const compatibility = checkCompatibility(data, component.type || '' );
  
  // Get usage statistics
  const usage = await getUsageStatistics(component.id);
  
  return {
    complexity,
    performance,
    compatibility,
    usage
  };
}

function calculateComplexity(data: any) {
  // Count nesting depth
  const nestingDepth = calculateNestingDepth(data);
  
  // Count properties
  const propertyCount = countProperties(data);
  
  // Count potential dependencies
  const dependencies = (data.references || []).length;
  
  // Calculate complexity score (example algorithm)
  const score = Math.max(0, 100 - 5 * (
    Math.max(0, nestingDepth - 3) + 
    Math.max(0, (propertyCount - 10) / 5) + 
    Math.max(0, dependencies - 2)
  ));
  
  return {
    score: Math.round(score),
    factors: [
      { name: 'Nesting Depth', value: nestingDepth, benchmark: 3 },
      { name: 'Property Count', value: propertyCount, benchmark: 15 },
      { name: 'Dependencies', value: dependencies, benchmark: 2 }
    ]
  };
}

function calculateNestingDepth(obj: any, currentDepth = 0) {
  if (!obj || typeof obj !== 'object') return currentDepth;
  
  let maxDepth = currentDepth;
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
      const depth = calculateNestingDepth(obj[key], currentDepth + 1);
      maxDepth = Math.max(maxDepth, depth);
    }
  }
  
  return maxDepth;
}

function countProperties(obj: any) {
  if (!obj || typeof obj !== 'object') return 0;
  
  let count = 0;
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      count++;
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        count += countProperties(obj[key]);
      }
    }
  }
  
  return count;
}

function estimatePerformance(data: any, type: string) {
  // These would be based on actual measurements in a production system
  // Here we're just using heuristics for demonstration
  
  // Estimate memory usage based on data complexity
  const jsonSize = JSON.stringify(data).length;
  const memoryUsage = Math.round(jsonSize * 1.2); // Rough estimate, KB
  
  // Estimate render time based on component type and complexity
  let renderTime = 10; // Base render time in ms
  if (type === 'mechanical' || type === 'structural') {
    renderTime += jsonSize / 100; // More complex mechanical parts take longer
  }
  
  // Estimate load time
  const loadTime = 20 + renderTime / 2;
  
  // Calculate performance score
  const score = Math.max(0, 100 - (
    (memoryUsage > 300 ? 5 : 0) +
    (renderTime > 20 ? 10 : 0) +
    (loadTime > 50 ? 5 : 0)
  ));
  
  return {
    score: Math.round(score),
    metrics: [
      { name: 'Memory Usage', value: memoryUsage, unit: 'KB', benchmark: 300 },
      { name: 'Render Time', value: Math.round(renderTime), unit: 'ms', benchmark: 20 },
      { name: 'Load Time', value: Math.round(loadTime), unit: 'ms', benchmark: 50 }
    ]
  };
}

function checkCompatibility(data: any, type: string) {
  // This would involve actual testing in a production system
  // Here we're using type-based heuristics
  
  let webCompatible = true;
  let mobileCompatible = true;
  let desktopCompatible = true;
  
  // Check specific incompatibility signals
  // Example: extremely large components might be incompatible with mobile
  const jsonSize = JSON.stringify(data).length;
  if (jsonSize > 100000) {
    mobileCompatible = false;
  }
  
  // Some types might have specific compatibility concerns
  if (type === 'electronic' && data.requiresSpecialHardware) {
    webCompatible = false;
  }
  
  // Calculate compatibility score
  const compatibleCount = [webCompatible, mobileCompatible, desktopCompatible].filter(Boolean).length;
  const score = Math.round((compatibleCount / 3) * 100);
  
  return {
    score,
    platforms: [
      { name: 'Web', compatible: webCompatible },
      { name: 'Mobile', compatible: mobileCompatible },
      { name: 'Desktop', compatible: desktopCompatible }
    ]
  };
}

async function getUsageStatistics(componentId: string | null) {
  if (!componentId) return { references: 0, lastUsed: new Date().toISOString().split('T')[0], projects: [] };

  // Count references in other components
  const referencingComponents = await prisma.component.findMany({
    where: {
      data: {
        path: ['references'],
        array_contains: componentId
      }
    },
    select: {
      id: true,
      name: true,
      projectId: true,
      updatedAt: true
    }
  });
  
  // Get list of projects using this component
  const projectUsage = referencingComponents.reduce((acc: Record<string, { id: string; name: string; usageCount: number }>, comp) => {
    if (!acc[comp.projectId]) {
      acc[comp.projectId] = {
        id: comp.projectId,
        name: 'Project ' + comp.projectId.substring(0, 6), // This would be replaced with actual project names
        usageCount: 0
      };
    }
    acc[comp.projectId].usageCount++;
    return acc;
  }, {});
  
  // Find the most recent usage date
  const lastUsed = referencingComponents.length > 0
    ? new Date(Math.max(...referencingComponents.map(c => new Date(c.updatedAt).getTime())))
    : new Date(); // Default to current date if no references
  
  return {
    references: referencingComponents.length,
    lastUsed: lastUsed.toISOString().split('T')[0],
    projects: Object.values(projectUsage)
  };
}