import { NextApiRequest, NextApiResponse } from 'next';
import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import fs from 'fs';

// Adjust paths based on your project structure
const FONTS_PATH = path.join(process.cwd(), 'public', 'fonts');
const ASSETS_PATH = path.join(process.cwd(), 'public');

// Register fonts - make sure these files exist in your public/fonts directory
try {
  registerFont(path.join(FONTS_PATH, 'helvetica-rounded-bold-5871d05ead8de.ttf'), { family: 'Helvetica', weight: 'bold' });
  registerFont(path.join(FONTS_PATH, 'helvetica-rounded-bold-5871d05ead8de.ttf'), { family: 'Helvetica', weight: 'normal' });
} catch (error) {
  console.error('Error registering fonts for OG image:', error);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { slug } = req.query;
    const segments = Array.isArray(slug) ? slug : [slug];
    
    // Extract page type and ID if available
    const pageType = segments[0];
    const pageId = segments[1];
    
    // Get title and description from query params or set defaults
    let title = (req.query.title as string) || 'CAD/CAM FUN';
    let description = (req.query.description as string) || 'Modern CAD/CAM system for 2D/3D design';
    
    // If we have a page type, fetch data for that page
    if (pageType && ['project', 'component', 'organization'].includes(pageType)) {
      try {
        // Here you would normally fetch data from your database
        // For demo purposes, we're just modifying the title and description
        if (pageType === 'project' && pageId) {
          title = `Project: ${title}`;
        } else if (pageType === 'component' && pageId) {
          title = `Component: ${title}`;
        } else if (pageType === 'organization' && pageId) {
          title = `Organization: ${title}`;
        }
      } catch (error) {
        console.error('Error fetching data for OG image:', error);
      }
    }
    
    // Create canvas with desired dimensions (1200x630 is standard for OG images)
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Draw background
    ctx.fillStyle = '#f8fafc'; // Light background
    ctx.fillRect(0, 0, width, height);
    
    // Draw logo
    try {
      const logoPath = path.join(ASSETS_PATH, 'logo.png');
      if (fs.existsSync(logoPath)) {
        const logo = await loadImage(logoPath);
        const logoWidth = 200;
        const logoHeight = (logo.height / logo.width) * logoWidth;
        ctx.drawImage(logo, 60, 60, logoWidth, logoHeight);
      }
    } catch (error) {
      console.error('Error loading logo for OG image:', error);
    }
    
    // Draw decorative elements
    ctx.fillStyle = '#3b82f6'; // Blue accent
    ctx.fillRect(0, 0, 10, height); // Left border
    
    // Draw gradient overlay for text area
    const gradient = ctx.createLinearGradient(width / 2, 0, width, height);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.1)'); // Light blue with opacity
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(width / 2, 0, width / 2, height);
    
    // Draw title text
    ctx.font = 'bold 60px Helvetica';
    ctx.fillStyle = '#1e293b'; // Dark slate for text
    ctx.textBaseline = 'middle';
    
    // Handle long title with text wrapping
    const maxTitleWidth = width - 120; // Padding on both sides
    const titleLines = getWrappedText(ctx, title, maxTitleWidth);
    let titleY = height / 2 - ((titleLines.length - 1) * 70) / 2;
    
    titleLines.forEach((line) => {
      ctx.fillText(line, 60, titleY);
      titleY += 70;
    });
    
    // Draw description text
    ctx.font = 'normal 30px Helvetica';
    ctx.fillStyle = '#475569'; // Lighter text for description
    
    // Handle long description with text wrapping
    const maxDescWidth = width - 120; // Padding on both sides
    const descLines = getWrappedText(ctx, description, maxDescWidth);
    let descY = titleY + 40;
    
    descLines.forEach((line) => {
      ctx.fillText(line, 60, descY);
      descY += 40;
    });
    
    // Draw URL at bottom
    ctx.font = 'normal 24px Helvetica';
    ctx.fillStyle = '#64748b';
    ctx.fillText('cadcamfun.xyz', 60, height - 60);
    
    // Return the image as PNG
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    res.status(200).send(canvas.toBuffer('image/png'));
  } catch (error) {
    console.error('Error generating OG image:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
}

// Helper function to wrap text
function getWrappedText(ctx: any, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];
  
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(`${currentLine} ${word}`).width;
    
    if (width < maxWidth) {
      currentLine += ` ${word}`;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  
  lines.push(currentLine);
  return lines;
}