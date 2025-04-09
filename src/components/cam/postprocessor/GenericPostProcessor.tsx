// src/components/cam/GenericPostProcessor.tsx
import React, { useState, useEffect } from 'react';
import AdvancedPostProcessorPanel from './AdvancedPostProcessorPanel';
import { ControllerType } from 'src/lib/advanced-post-processor';

interface GenericPostProcessorProps {
  initialGcode: string;
  controllerType: ControllerType;
  onProcessedGcode: (gcode: string, stats?: any) => void;
}

const GenericPostProcessor: React.FC<GenericPostProcessorProps> = ({
  initialGcode,
  controllerType,
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
        controllerType={controllerType}
        onProcessedGcode={handleProcessedGcode}
      />
    </div>
  );
};

export default GenericPostProcessor;