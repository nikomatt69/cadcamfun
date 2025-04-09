
// This script optimizes images in the public directory 
// Run with: npx ts-node scripts/optimize-images.ts

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];
const EXCLUDE_DIRS = ['node_modules', '.next', '.git', 'fonts'];
const MAX_WIDTH = 1920; // Maximum width for resizing images

// Ensure required packages are installed
async function ensurePackagesInstalled() {
  try {
    console.log('Checking if required packages are installed...');
    
    // Check if sharp and svgo are installed
    await execAsync('npm list sharp svgo --depth=0');
    console.log('✅ Required packages are installed');
  } catch (error) {
    console.log('⚠️ Required packages not found. Installing...');
    try {
      await execAsync('npm install --save-dev sharp svgo');
      console.log('✅ Packages installed successfully');
    } catch (installError) {
      console.error('❌ Failed to install packages:', installError);
      process.exit(1);
    }
  }
}

// Main optimization function
async function optimizeImages() {
  await ensurePackagesInstalled();
  
  console.log('Scanning for images in public directory...');
  const imageFiles = await getImageFiles(PUBLIC_DIR);
  
  if (imageFiles.length === 0) {
    console.log('No images found in public directory.');
    return;
  }
  
  console.log(`Found ${imageFiles.length} images to optimize.`);
  
  // Process images in batches to avoid overwhelming the system
  const BATCH_SIZE = 5;
  const batches = [];
  
  for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
    batches.push(imageFiles.slice(i, i + BATCH_SIZE));
  }
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    console.log(`Processing batch ${i + 1}/${batches.length}...`);
    
    await Promise.all(
      batch.map(async (filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        
        if (ext === '.svg') {
          await optimizeSvg(filePath);
        } else {
          await optimizeRasterImage(filePath);
        }
      })
    );
  }
  
  console.log('✅ Image optimization completed!');
}

// Run the script
optimizeImages().catch((error) => {
  console.error('❌ Error during image optimization:', error);
  process.exit(1);
});

// Get all image files recursively
async function getImageFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !EXCLUDE_DIRS.includes(file)) {
      fileList = await getImageFiles(filePath, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  
  return fileList;
}
// Optimize PNG/JPG images using Sharp
async function optimizeRasterImage(filePath) {
  try {
    const sharp = require('sharp');
    const ext = path.extname(filePath).toLowerCase();
    const fileInfo = await sharp(filePath).metadata();
    
    // Only resize if image is larger than MAX_WIDTH
    const needsResize = fileInfo.width && fileInfo.width > MAX_WIDTH;
    
    let sharpInstance = sharp(filePath);
    
    if (needsResize) {
      sharpInstance = sharpInstance.resize(MAX_WIDTH);
    }
    
    // Apply appropriate compression based on format
    if (ext === '.jpg' || ext === '.jpeg') {
      sharpInstance = sharpInstance.jpeg({ quality: 85, mozjpeg: true });
    } else if (ext === '.png') {
      sharpInstance = sharpInstance.png({ quality: 85, compressionLevel: 9 });
    } else if (ext === '.webp') {
      sharpInstance = sharpInstance.webp({ quality: 85 });
    }
    
    const tempPath = `${filePath}.temp`;
    await sharpInstance.toFile(tempPath);
    
    // Get file sizes
    const origSize = fs.statSync(filePath).size;
    const newSize = fs.statSync(tempPath).size;
    
    // Replace original only if optimized version is smaller
    if (newSize < origSize) {
      fs.unlinkSync(filePath);
      fs.renameSync(tempPath, filePath);
      console.log(`✅ Optimized ${path.basename(filePath)} - ${formatBytes(origSize)} → ${formatBytes(newSize)} (${Math.round((1 - newSize / origSize) * 100)}% reduction)`);
    } else {
      fs.unlinkSync(tempPath);
      console.log(`ℹ️ Skipped ${path.basename(filePath)} - Already optimized`);
    }
  } catch (error) {
    console.error(`❌ Failed to optimize ${filePath}:`, error);
  }
}

// Optimize SVG using SVGO
async function optimizeSvg(filePath) {
  try {
    // Create backup
    const backupPath = `${filePath}.backup`;
    fs.copyFileSync(filePath, backupPath);
    
    const { stdout, stderr } = await execAsync(`npx svgo "${filePath}" -o "${filePath}"`);
    
    // Get file sizes
    const origSize = fs.statSync(backupPath).size;
    const newSize = fs.statSync(filePath).size;
    
    // Remove backup
    fs.unlinkSync(backupPath);
    
    console.log(`✅ Optimized ${path.basename(filePath)} - ${formatBytes(origSize)} → ${formatBytes(newSize)} (${Math.round((1 - newSize / origSize) * 100)}% reduction)`);
  } catch (error) {
    console.error(`❌ Failed to optimize SVG ${filePath}:`, error);
  }
}

// Helper function to format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}