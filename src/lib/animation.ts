// src/lib/animation.ts
export const fadeIn = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 }
  };
  
  export const slideIn = {
    hidden: { x: -50, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };
  
  export const staggerContainer = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };
  
  export const transition = {
    type: "spring",
    duration: 0.5
  };