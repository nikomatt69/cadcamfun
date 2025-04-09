// src/services/fanucOptimizer.ts

interface OptimizationResult {
    code: string;
    improvements: string[];
    stats: {
      originalLines: number;
      optimizedLines: number;
      reductionPercent: number;
      estimatedTimeReduction: number;
    };
  }
  
  /**
   * Service to optimize Fanuc G-code
   */
  export const fanucOptimizer = {
    /**
     * Optimize Fanuc G-code using AI techniques
     * @param code The original G-code to optimize
     * @returns Optimized code and statistics about the improvements
     */
    optimizeCode: async (code: string): Promise<OptimizationResult> => {
      try {
        // Here we would typically send the code to an API for optimization
        // For now, we'll implement basic optimization rules locally
        
        // Split the code into lines for processing
        const lines = code.split('\n').filter(line => line.trim());
        let optimizedLines: string[] = [];
        const improvements: string[] = [];
  
        // Track current state
        let currentX: number | null = null;
        let currentY: number | null = null;
        let currentZ: number | null = null;
        let currentF: number | null = null;
        let currentS: number | null = null;
        let consecutiveRapidMoves = 0;
        let consecutiveLinearMoves = 0;
        
        // Optimization: Remove redundant position commands
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          
          // Skip comments entirely
          if (line.startsWith(';') || line.startsWith('(')) {
            optimizedLines.push(line);
            continue;
          }
          
          // Check for G0/G00 or G1/G01 commands
          const isRapidMove = line.includes('G0') || line.includes('G00');
          const isLinearMove = line.includes('G1') || line.includes('G01');
          
          // Extract coordinates if present
          const xMatch = line.match(/X([-\d.]+)/);
          const yMatch = line.match(/Y([-\d.]+)/);
          const zMatch = line.match(/Z([-\d.]+)/);
          const fMatch = line.match(/F([\d.]+)/);
          const sMatch = line.match(/S([\d.]+)/);
          
          const newX = xMatch ? parseFloat(xMatch[1]) : null;
          const newY = yMatch ? parseFloat(yMatch[1]) : null;
          const newZ = zMatch ? parseFloat(zMatch[1]) : null;
          const newF = fMatch ? parseFloat(fMatch[1]) : null;
          const newS = sMatch ? parseFloat(sMatch[1]) : null;
          
          // Check for redundant moves (same position)
          if (isRapidMove || isLinearMove) {
            const hasNoChange = 
              (newX === null || newX === currentX) && 
              (newY === null || newY === currentY) && 
              (newZ === null || newZ === currentZ);
            
            if (hasNoChange && ((isRapidMove && consecutiveRapidMoves > 0) || (isLinearMove && consecutiveLinearMoves > 0))) {
              // Skip redundant move
              if (!improvements.includes('Removed redundant position commands')) {
                improvements.push('Removed redundant position commands');
              }
              continue;
            }
            
            // Update counters
            if (isRapidMove) {
              consecutiveRapidMoves++;
              consecutiveLinearMoves = 0;
            } else if (isLinearMove) {
              consecutiveLinearMoves++;
              consecutiveRapidMoves = 0;
            }
          }
          
          // Optimize feed rates - don't repeat the same F value
          let modifiedLine = line;
          if (fMatch && newF === currentF) {
            modifiedLine = modifiedLine.replace(/F[\d.]+/, '');
            if (!improvements.includes('Removed redundant feed rate commands')) {
              improvements.push('Removed redundant feed rate commands');
            }
          }
          
          // Optimize spindle speed - don't repeat the same S value
          if (sMatch && newS === currentS) {
            modifiedLine = modifiedLine.replace(/S[\d.]+/, '');
            if (!improvements.includes('Removed redundant spindle speed commands')) {
              improvements.push('Removed redundant spindle speed commands');
            }
          }
          
          // Update our current position tracking
          if (newX !== null) currentX = newX;
          if (newY !== null) currentY = newY;
          if (newZ !== null) currentZ = newZ;
          if (newF !== null) currentF = newF;
          if (newS !== null) currentS = newS;
          
          // Consolidate consecutive G0 moves
          if (isRapidMove && i < lines.length - 1) {
            const nextLine = lines[i + 1].trim();
            const nextIsRapid = nextLine.includes('G0') || nextLine.includes('G00');
            
            if (nextIsRapid && !nextLine.includes('Z') && modifiedLine.includes('Z') && !nextLine.startsWith(';')) {
              // Combine Z movement with XY movement for better efficiency
              const nextX = nextLine.match(/X([-\d.]+)/);
              const nextY = nextLine.match(/Y([-\d.]+)/);
              
              if (nextX || nextY) {
                modifiedLine = modifiedLine.replace(/G0+/, 'G0');
                if (nextX) modifiedLine += ` X${nextX[1]}`;
                if (nextY) modifiedLine += ` Y${nextY[1]}`;
                
                // Skip the next line since we consolidated it
                i++;
                
                if (!improvements.includes('Consolidated consecutive rapid moves')) {
                  improvements.push('Consolidated consecutive rapid moves');
                }
              }
            }
          }
          
          // Clean up any double spaces created during modifications
          modifiedLine = modifiedLine.replace(/\s+/g, ' ').trim();
          
          // Add the line if it still has content
          if (modifiedLine) {
            optimizedLines.push(modifiedLine);
          }
        }
  
        // Add more Fanuc-specific optimizations
        optimizedLines = optimizeForFanuc(optimizedLines, improvements);
        
        // Calculate statistics
        const originalLineCount = lines.length;
        const optimizedLineCount = optimizedLines.length;
        const reductionPercent = ((originalLineCount - optimizedLineCount) / originalLineCount * 100).toFixed(2);
        const estimatedTimeReduction = (originalLineCount - optimizedLineCount) * 0.01; // Simple estimate
        
        if (improvements.length === 0) {
          improvements.push('Code is already well optimized');
        }
        
        return {
          code: optimizedLines.join('\n'),
          improvements,
          stats: {
            originalLines: originalLineCount,
            optimizedLines: optimizedLineCount,
            reductionPercent: parseFloat(reductionPercent),
            estimatedTimeReduction
          }
        };
      } catch (error) {
        console.error('Error optimizing G-code:', error);
        throw new Error('Failed to optimize G-code');
      }
    }
  };
  
  /**
   * Applies Fanuc-specific optimizations to G-code
   */
  function optimizeForFanuc(lines: string[], improvements: string[]): string[] {
    const optimizedLines: string[] = [];
    
    // Optimize modal G-codes (G codes that stay active until changed)
    let currentModal = {
      movement: '',
      plane: '',
      units: '',
      cutter: '',
      feedMode: ''
    };
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Check for modal G-codes
      const movementMatch = line.match(/G0+|G1+|G2+|G3+/);
      const planeMatch = line.match(/G1[7-9]/);
      const unitsMatch = line.match(/G20|G21/);
      const cutterMatch = line.match(/G4[0-9]/);
      const feedMatch = line.match(/G9[4-5]/);
      
      // Remove redundant modal commands
      if (movementMatch && movementMatch[0] === currentModal.movement) {
        line = line.replace(movementMatch[0], '');
        if (!improvements.includes('Removed redundant modal G-codes')) {
          improvements.push('Removed redundant modal G-codes');
        }
      } else if (movementMatch) {
        currentModal.movement = movementMatch[0];
      }
      
      if (planeMatch && planeMatch[0] === currentModal.plane) {
        line = line.replace(planeMatch[0], '');
      } else if (planeMatch) {
        currentModal.plane = planeMatch[0];
      }
      
      if (unitsMatch && unitsMatch[0] === currentModal.units) {
        line = line.replace(unitsMatch[0], '');
      } else if (unitsMatch) {
        currentModal.units = unitsMatch[0];
      }
      
      if (cutterMatch && cutterMatch[0] === currentModal.cutter) {
        line = line.replace(cutterMatch[0], '');
      } else if (cutterMatch) {
        currentModal.cutter = cutterMatch[0];
      }
      
      if (feedMatch && feedMatch[0] === currentModal.feedMode) {
        line = line.replace(feedMatch[0], '');
      } else if (feedMatch) {
        currentModal.feedMode = feedMatch[0];
      }
      
      // Replace G00 with G0, G01 with G1, etc. for brevity
      line = line.replace(/G00/g, 'G0')
                 .replace(/G01/g, 'G1')
                 .replace(/G02/g, 'G2')
                 .replace(/G03/g, 'G3');
      
      // Clean up any double spaces or spaces at the start
      line = line.replace(/\s+/g, ' ').trim();
      
      // Add the line if it still has content
      if (line) {
        optimizedLines.push(line);
      }
    }
    
    return optimizedLines;
  }
  
  export default fanucOptimizer;