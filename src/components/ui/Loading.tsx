import type { FC } from 'react';
import logo from '@/images/Lenstoklogo.png';
import Image from 'next/image';

const Loading: FC = () => {
  return (
    <div className="grid h-screen place-items-center">
      
      <div className="animate-bounce">
        <img
          src={`/icon.png`}
          draggable={false}
          className="h-12 w-12 md:h-16 md:w-16"
          alt="lensshare"
        />
      </div>
    </div>
  );
};

export default Loading;
