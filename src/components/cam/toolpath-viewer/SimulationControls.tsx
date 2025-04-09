import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, ChevronLeft, ChevronRight, FastForward } from 'react-feather';

interface SimulationControlsProps {
  isPlaying: boolean;
  playbackSpeed: number;
  currentPointIndex: number;
  totalPoints: number;
  progress: number;
  feedrates?: number[]; // Array di feedrate per ogni punto del percorso
  distances?: number[]; // Array di distanze tra punti consecutivi
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onSpeedChange: (speed: number) => void;
  onProgressChange: (percent: number) => void;
}

/**
 * Professional media-player style controls for toolpath simulation
 */
export const SimulationControls: React.FC<SimulationControlsProps> = ({
  isPlaying,
  playbackSpeed,
  currentPointIndex,
  totalPoints,
  progress,
  feedrates = [],
  distances = [],
  onPlay,
  onPause,
  onStop,
  onStepForward,
  onStepBackward,
  onSpeedChange,
  onProgressChange
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(progress);
  const progressBarRef = useRef<HTMLDivElement>(null);
  
  // Update drag progress when actual progress changes (if not dragging)
  useEffect(() => {
    if (!isDragging) {
      setDragProgress(progress);
    }
  }, [progress, isDragging]);
  
  // Format time display as MM:SS
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Calculate estimated time based on actual feedrates and distances
  const calculateEstimatedTime = useCallback(() => {
    let totalTimeSeconds = 0;
    let elapsedTimeSeconds = 0;
    
    // If we have feedrates and distances, use them for precise calculation
    if (feedrates.length > 0 && distances.length > 0 && feedrates.length === distances.length) {
      // Calculate total time by summing time for each segment
      // Time = Distance / Feedrate (converted to mm/sec)
      for (let i = 0; i < feedrates.length; i++) {
        const segmentTimeSeconds = feedrates[i] > 0 ? 
          (distances[i] / (feedrates[i] / 60)) : 0;
        
        totalTimeSeconds += segmentTimeSeconds;
        
        // Sum up elapsed time up to current point
        if (i < currentPointIndex) {
          elapsedTimeSeconds += segmentTimeSeconds;
        }
      }
    } else {
      // Fallback calculation based on average feedrate
      // Assume average feedrate of 1000 mm/min for now
      const avgFeedrate = 1000; // mm/min
      const estimatedTotalDistance = totalPoints > 0 ? totalPoints * 2 : 0; // Rough estimate
      
      totalTimeSeconds = estimatedTotalDistance / (avgFeedrate / 60);
      elapsedTimeSeconds = totalPoints > 0 ? 
        (currentPointIndex / totalPoints) * totalTimeSeconds : 0;
    }
    
    return {
      elapsed: formatTime(elapsedTimeSeconds),
      total: formatTime(totalTimeSeconds),
      elapsedRaw: elapsedTimeSeconds,
      totalRaw: totalTimeSeconds
    };
  }, [currentPointIndex, totalPoints, feedrates, distances]);
  
  const { elapsed, total } = calculateEstimatedTime();
  
  // Handle click on progress bar
  const handleProgressBarClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPosition = e.clientX - rect.left;
    const clickPercentage = Math.max(0, Math.min(100, (clickPosition / rect.width) * 100));
    
    // Update progress
    setDragProgress(clickPercentage);
    onProgressChange(clickPercentage);
  }, [onProgressChange]);
  
  // Handle mouse down on progress handle
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  
  // Handle mouse move while dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const movePosition = e.clientX - rect.left;
    const movePercentage = Math.max(0, Math.min(100, (movePosition / rect.width) * 100));
    
    setDragProgress(movePercentage);
  }, [isDragging]);
  
  // Handle mouse up after dragging
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      onProgressChange(dragProgress);
      setIsDragging(false);
    }
  }, [isDragging, dragProgress, onProgressChange]);
  
  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Funzione per gestire il click sul pulsante play/pause
  const handlePlayPauseClick = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);
  
  return (
    <div className="w-full space-y-2">
      {/* Progress Bar */}
      <div 
        ref={progressBarRef}
        className="h-2 bg-gray-700 rounded-full cursor-pointer"
        onClick={handleProgressBarClick}
      >
        <div 
          className="h-full bg-blue-500 rounded-full relative transition-all duration-100"
          style={{ width: `${isDragging ? dragProgress : progress}%` }}
        >
          <div 
            className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full border-2 border-blue-500 cursor-pointer hover:scale-125 transition-transform"
            onMouseDown={handleMouseDown}
          ></div>
        </div>
      </div>
      
      {/* Controls and info */}
      <div className="flex items-center justify-between">
        {/* Time display */}
        <div className="text-xs font-mono">
          {elapsed} / {total}
        </div>
        
        {/* Control buttons */}
        <div className="flex items-center space-x-2">
          <button
            className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={onStop}
            type="button"
            title="Go to Start"
            aria-label="Go to Start"
          >
            <SkipBack size={16} />
          </button>
          
          <button
            className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={onStepBackward}
            type="button"
            title="Step Backward"
            aria-label="Step Backward"
          >
            <ChevronLeft size={16} />
          </button>
          
          <button
            className="p-2 bg-blue-600 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            onClick={handlePlayPauseClick}
            type="button"
            title={isPlaying ? "Pause" : "Play"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          
          <button
            className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={onStepForward}
            type="button"
            title="Step Forward"
            aria-label="Step Forward"
          >
            <ChevronRight size={16} />
          </button>
          
          {/* Playback speed dropdown */}
          <div className="relative group">
            <button
              className="p-1.5 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 flex items-center"
              type="button"
              title="Playback Speed"
              aria-label="Playback Speed"
            >
              <FastForward size={16} />
              <span className="ml-1 text-xs">{playbackSpeed}×</span>
            </button>
            
            <div className="absolute hidden group-hover:block right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10 py-1">
              {[0.25, 0.5, 1, 2, 4, 8].map((speed) => (
                <button
                  key={speed}
                  className={`block w-full text-left px-4 py-1 text-xs ${
                    playbackSpeed === speed ? 'bg-blue-600' : 'hover:bg-gray-700'
                  }`}
                  onClick={() => onSpeedChange(speed)}
                  type="button"
                >
                  {speed}×
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Progress info */}
        <div className="text-xs font-mono">
          {currentPointIndex} / {totalPoints}
        </div>
      </div>
    </div>
  );
};