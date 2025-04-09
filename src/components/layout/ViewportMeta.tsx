// src/components/layout/ViewportMeta.tsx
import Head from 'next/head';

interface ViewportMetaProps {
  initialScale?: string;
  maximumScale?: string;
  userScalable?: boolean;
}

const ViewportMeta: React.FC<ViewportMetaProps> = ({
  initialScale = '0.8',
  maximumScale = '1.0',
  userScalable = true
}) => {
  const viewportContent = `width=device-width, initial-scale=${initialScale}, maximum-scale=${maximumScale}${userScalable ? '' : ', user-scalable=no'}`;
  
  return (
    <Head>
      <meta name="viewport" content={viewportContent} />
      {/* Additional mobile-specific meta tags */}
      <meta name="format-detection" content="telephone=no" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      <meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#1f2937" media="(prefers-color-scheme: dark)" />
    </Head>
  );
};

export default ViewportMeta;