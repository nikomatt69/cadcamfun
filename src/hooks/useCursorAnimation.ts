import { useCallback, useRef, useEffect } from "react";

interface AnimationFrame {
  id: string;
  frame: number;
  totalFrames: number;
  duration: number;
}

export function useCursorAnimation() {
  const activeAnimations = useRef<Map<string, AnimationFrame>>(new Map());
  const animationRefs = useRef<Map<string, number>>(new Map());

  const startAnimation = useCallback(
    (
      elementId: string,
      animationType: "processing" | "calculating" | "simulating" | "loading",
      options?: {
        fps?: number;
        totalFrames?: number;
        element?: HTMLElement;
      }
    ) => {
      const fps = options?.fps || 8;
      const totalFrames = options?.totalFrames || 8;
      const element = options?.element || document.documentElement;

      // Stop existing animation if any
      stopAnimation(elementId);

      const animation: AnimationFrame = {
        id: elementId,
        frame: 0,
        totalFrames,
        duration: 1000 / fps,
      };

      activeAnimations.current.set(elementId, animation);

      const animate = () => {
        const currentAnimation = activeAnimations.current.get(elementId);
        if (!currentAnimation) return;

        // Update cursor with current frame
        const cursorUrl = `/cursors/animations/${animationType}/frame-${currentAnimation.frame}.svg`;
        element.style.cursor = `url('${cursorUrl}') 12 12, progress`;

        // Update frame
        currentAnimation.frame =
          (currentAnimation.frame + 1) % currentAnimation.totalFrames;

        // Schedule next frame
        const timeoutId = setTimeout(animate, currentAnimation.duration);
        animationRefs.current.set(elementId, timeoutId as any);
      };

      // Start animation
      animate();

      return () => stopAnimation(elementId);
    },
    []
  );

  const stopAnimation = useCallback((elementId: string) => {
    const timeoutId = animationRefs.current.get(elementId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      animationRefs.current.delete(elementId);
    }

    activeAnimations.current.delete(elementId);
  }, []);

  const stopAllAnimations = useCallback(() => {
    activeAnimations.current.forEach((_, id) => stopAnimation(id));
  }, [stopAnimation]);

  // Cleanup on unmount
  useEffect(() => {
    return stopAllAnimations;
  }, [stopAllAnimations]);

  return {
    startAnimation,
    stopAnimation,
    stopAllAnimations,
    isAnimating: (elementId: string) => activeAnimations.current.has(elementId),
  };
}
