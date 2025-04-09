// src/components/cam/FanucPostProcessor.tsx
import React, { useState, useEffect } from 'react';
import AdvancedPostProcessorPanel from './AdvancedPostProcessorPanel';

interface FanucPostProcessorProps {
  initialGcode: string;
  onProcessedGcode: (gcode: string, stats?: any) => void;
}

const FanucPostProcessor: React.FC<FanucPostProcessorProps> = ({
  initialGcode,
  onProcessedGcode
}) => {
  const [gcode, setGcode] = useState(initialGcode);

  // Update local gcode when prop changes
  useEffect(() => {
    setGcode(initialGcode);
  }, [initialGcode]);

  // Handle processed G-code from the advanced panel
  const handleProcessedGcode = (processedGcode: string, stats?: any) => {
    setGcode(processedGcode);
    onProcessedGcode(processedGcode, stats);
  };

  return (
    <div className="rounded-lg overflow-hidden">
      <AdvancedPostProcessorPanel
        initialGcode={initialGcode}
        controllerType="fanuc"
        onProcessedGcode={handleProcessedGcode}
      />
    </div>
  );
};

export default FanucPostProcessor;