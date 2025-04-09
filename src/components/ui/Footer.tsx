
import Link from 'next/link';
import type { FC } from 'react';
import urlcat from 'urlcat';

const Footer: FC = () => {
  return (
    <footer className={`'top-20' sticky text-sm leading-7`}>
      <div className="my-3 mt-4 flex flex-wrap gap-x-[12px] px-3 lg:px-0">
        <span className="lt-text-gray-500 font-bold">
          &copy; {new Date().getFullYear()} MyCrumbs
        </span>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        
      </div>
      <div className="mt-2">
        <Link
          className="hover:font-bold"
          href={urlcat('https://vercel.com', {
            
            utm_campaign: 'oss'
          })}
          target="_blank"
          rel="noreferrer noopener"
        >
          ▲ Powered by Vercel
        </Link>
      </div>
    </footer>
  );
};

export default Footer;
