import { createCanvas, loadImage, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';

async function generateOGImage() {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Register fonts
  try {
    registerFont(path.join(process.cwd(), 'public', 'fonts', 'helvetica-rounded-bold-5871d05ead8de.ttf'), { family: 'Helvetica', weight: 'bold' });
    registerFont(path.join(process.cwd(), 'public', 'fonts', 'helvetica-rounded-bold-5871d05ead8de.ttf'), { family: 'Helvetica', weight: 'normal' });
  } catch (error) {
    console.error('Error registering fonts:', error);
    console.log('Using system fonts instead');
  }

  // Background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1e40af'); // Dark blue
  gradient.addColorStop(1, '#3b82f6'); // Lighter blue
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Draw pattern or texture
  for (let i = 0; i < width; i += 40) {
    for (let j = 0; j < height; j += 40) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fillRect(i, j, 20, 20);
    }
  }

  // Draw logo if available
  try {
    const logo = await loadImage(path.join(process.cwd(), 'public', 'logo.png'));
    const logoWidth = 250;
    const logoHeight = (logo.height / logo.width) * logoWidth;
    ctx.drawImage(logo, 100, 100, logoWidth, logoHeight);
  } catch (error) {
    console.error('Error loading logo:', error);
    
    // Draw placeholder text instead
    ctx.font = 'bold 80px Helvetica';
    ctx.fillStyle = 'white';
    ctx.fillText('CAD/CAM', 100, 160);
    ctx.fillText('FUN', 100, 240);
  }

  // Draw title
  ctx.font = 'bold 72px Helvetica';
  ctx.fillStyle = 'white';
  ctx.fillText('Modern CAD/CAM System', 100, 350);

  // Draw subtitle
  ctx.font = '32px Helvetica';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.fillText('Design • Model • Manufacture • Collaborate', 100, 410);

  // Draw features
  ctx.font = 'bold 28px Helvetica';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  const features = ['2D/3D Design', 'CNC Machining', 'AI-Powered Tools', 'Cloud Collaboration'];
  features.forEach((feature, index) => {
    ctx.fillText(`• ${feature}`, 100, 480 + index * 35);
  });

  // Draw URL
  ctx.font = 'normal 24px Helvetica';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText('cadcamfun.xyz', width - 200, height - 40);

  // Save the image
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(process.cwd(), 'public', 'og-image.png'), buffer);
  console.log('✅ OG image generated and saved to public/og-image.png');
}

generateOGImage().catch(console.error);