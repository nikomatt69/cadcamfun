/* eslint-disable react/jsx-no-useless-fragment */
import type { FC, ReactNode } from 'react';
import React from 'react';
import { useEffect, useState } from 'react';
interface HydraProps {
  children: ReactNode;
}
const HydrationZustand: FC<HydraProps> = ({ children }) => {
  const [isHydrated, setIsHydrated] = useState(false);

  // Wait till Next.js rehydration completes
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return <>{isHydrated ? children : null}</>;
};

export default HydrationZustand;
