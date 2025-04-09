// pages/sitemap.xml.tsx
import { GetServerSideProps } from 'next';
import { prisma } from 'src/lib/prisma'; // Adjust this import based on your Prisma setup

const Sitemap = () => {
  // This component doesn't render anything
  return null;
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const baseUrl = process.env.NEXTAUTH_URL || 'https://localhost:3000';
  
  // Define static routes
  const staticPages = [
    '',
    '/projects',
    '/components',
    '/organizations',
    '/analytics',
    '/pricing',
    '/cad',
    '/cam',
    '/terms',
    '/privacy',
  ];
  // Get dynamic routes - you can add more based on your application
  let projects: { id: string; updatedAt: Date }[] = [];
  let components: { id: string; updatedAt: Date }[] = [];
  let organizations: { id: string; updatedAt: Date }[] = [];
  
  try {
    // Fetch public projects
    projects = await prisma.project.findMany({
      where: { isPublic: true },
      select: { id: true, updatedAt: true },
    });
    
    // Fetch public components
    components = await prisma.component.findMany({
      where: { isPublic: true },
      select: { id: true, updatedAt: true },
    });
    
    // Fetch all organizations
    organizations = await prisma.organization.findMany({
      select: { id: true, updatedAt: true },
    });
  } catch (error) {
    console.error('Error fetching data for sitemap:', error);
    // Continue with static routes if database is unavailable
  }

  // Create XML sitemap
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${staticPages
        .map((page) => {
          return `
            <url>
              <loc>${baseUrl}${page}</loc>
              <lastmod>${new Date().toISOString()}</lastmod>
              <changefreq>weekly</changefreq>
              <priority>${page === '' ? '1.0' : '0.8'}</priority>
            </url>
          `;
        })
        .join('')}
      ${projects
        .map(({ id, updatedAt }) => {
          return `
            <url>
              <loc>${baseUrl}/projects/${id}</loc>
              <lastmod>${new Date(updatedAt).toISOString()}</lastmod>
              <changefreq>weekly</changefreq>
              <priority>0.7</priority>
            </url>
          `;
        })
        .join('')}
      ${components
        .map(({ id, updatedAt }) => {
          return `
            <url>
              <loc>${baseUrl}/components/${id}</loc>
              <lastmod>${new Date(updatedAt).toISOString()}</lastmod>
              <changefreq>monthly</changefreq>
              <priority>0.6</priority>
            </url>
          `;
        })
        .join('')}
      ${organizations
        .map(({ id, updatedAt }) => {
          return `
            <url>
              <loc>${baseUrl}/organizations/${id}</loc>
              <lastmod>${new Date(updatedAt).toISOString()}</lastmod>
              <changefreq>monthly</changefreq>
              <priority>0.6</priority>
            </url>
          `;
        })
        .join('')}
    </urlset>
  `;

  res.setHeader('Content-Type', 'text/xml');
  res.write(sitemap);
  res.end();

  return {
    props: {},
  };
};

export default Sitemap;
