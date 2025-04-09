import { useEffect, type FC } from 'react';


const SW: FC = () => {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      (navigator.serviceWorker as ServiceWorkerContainer)
        .register('/service-worker.js', { scope: '/' })
        .catch(console.error);
    }
  }, []);

 

 

  return null;
};

export default SW;
