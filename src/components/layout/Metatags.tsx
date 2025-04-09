// src/components/layout/EnhancedMetatags.tsx

import Head from 'next/head';
import { useRouter } from 'next/router';

interface MetaTagsProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  noindex?: boolean;
  canonicalUrl?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  locale?: string;
  themeColor?: string;
  // Structured data props
  structuredData?: {
    type: 'Organization' | 'Product' | 'Article' | 'WebPage' | 'SoftwareApplication';
    data: Record<string, any>;
  };
}

export default function MetaTags({
  title = 'CAD/CAM FUN',
  description = 'Modern CAD/CAM system for 2D/3D design and CNC machining with AI capabilities',
  keywords = 'CAD, CAM, CNC, design, machining, 3D modeling, manufacturing',
  ogImage = '/og-image.png',
  ogType = 'website',
  twitterCard = 'summary_large_image',
  noindex = false,
  canonicalUrl,
  author = 'CAD/CAM FUN Team',
  publishedTime,
  modifiedTime,
  locale = 'en_US',
  themeColor = '#fff',
  structuredData,
}: MetaTagsProps) {
  const router = useRouter();
  const siteUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const currentPath = router.asPath;
  const fullUrl = canonicalUrl || `${siteUrl}${currentPath}`;
  const fullTitle = `${title}${title === 'CAD/CAM FUN' ? '' : ' | CAD/CAM FUN'}`;
  const imageUrl = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;

  // Generate JSON-LD structured data
  let jsonLd = null;
  if (structuredData) {
    switch (structuredData.type) {
      case 'Organization':
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'CAD/CAM FUN',
          url: siteUrl,
          logo: `${siteUrl}/logo.png`,
          sameAs: [
            'https://twitter.com/cadcamfun',
            'https://linkedin.com/company/cadcamfun',
            'https://github.com/cadcamfun',
          ],
          ...structuredData.data,
        };
        break;
      case 'Product':
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: title,
          applicationCategory: 'DesignApplication',
          operatingSystem: 'Web',
          offers: {
            '@type': 'Offer',
            price: '0',
            priceCurrency: 'USD',
          },
          ...structuredData.data,
        };
        break;
      case 'Article':
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: title,
          image: imageUrl,
          author: {
            '@type': 'Person',
            name: author,
          },
          publisher: {
            '@type': 'Organization',
            name: 'CAD/CAM FUN',
            logo: {
              '@type': 'ImageObject',
              url: `${siteUrl}/logo.png`,
            },
          },
          datePublished: publishedTime || new Date().toISOString(),
          dateModified: modifiedTime || new Date().toISOString(),
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': fullUrl,
          },
          ...structuredData.data,
        };
        break;
      case 'WebPage':
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description: description,
          url: fullUrl,
          ...structuredData.data,
        };
        break;
      default:
        jsonLd = {
          '@context': 'https://schema.org',
          '@type': structuredData.type,
          ...structuredData.data,
        };
    }
  }

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="viewport" content="width=device-width, initial-scale=0.8, maximum-scale=1" />
      <meta name="author" content={author} />
      <meta name="application-name" content="CAD/CAM FUN" />
      
      {/* Canonical Link */}
      <link rel="canonical" href={fullUrl} />
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:alt" content={title} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="CAD/CAM FUN" />
      <meta property="og:locale" content={locale} />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:site" content="@cadcamfun" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      
      {/* Article Specific Meta Tags */}
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      
      {/* Robots Meta Tag */}
      {noindex ? (
        <meta name="robots" content="noindex,nofollow" />
      ) : (
        <meta name="robots" content="index,follow" />
      )}
      
      {/* Favicon */}
      <link rel="icon" href="/favicon.ico" sizes="any" />
      <link rel="icon" href="/icon.png" type="image/png" />
      <link rel="apple-touch-icon" href="/icon.png" />
      
      {/* PWA related */}
      <meta name="theme-color" content={themeColor} />
      <link rel="manifest" href="/manifest.json" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      
      {/* OpenSearch */}
      <link 
        rel="search" 
        type="application/opensearchdescription+xml" 
        title="CAD/CAM FUN Search" 
        href={`${siteUrl}/opensearch.xml`} 
      />
      
      {/* JSON-LD Structured Data */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
    </Head>
  );
}