// src/lib/services/storageService.ts

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
export const EVER_API = 'https://endpoint.4everland.co';
// Configuration for S3 Client
const s3Client = new S3Client({
  endpoint: EVER_API,
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string || '',
  },
});

// Bucket name
const bucketName = process.env.S3_BUCKET_NAME as string || 'cadcamfun';

/**
 * Generate a unique path for an object in the bucket
 * @param type Type of object (component, tool, material)
 * @param id Unique identifier of the object
 * @param version Optional version identifier
 * @returns Unique path in the bucket
 */
export function generateObjectPath(
  type: 'component' | 'tool' | 'material'|'machine-config', 
  id: string, 
  version?: string
): string {
  const timestamp = Date.now();
  const versionSuffix = version ? `-${version}` : '';
  return `${type}s/${id}${versionSuffix}-${timestamp}.json`;
}

/**
 * Upload an object to S3 bucket
 * @param path Unique path in the bucket
 * @param data Data to upload
 * @param contentType Optional content type (defaults to JSON)
 * @returns Path of the uploaded object
 */
export async function uploadToBucket(
  path: string, 
  data: any, 
  contentType = 'application/json'
): Promise<string> {
  try {
    const content = typeof data === 'string' 
      ? data 
      : JSON.stringify(data, null, 2);
    
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: path,
        Body: content,
        ContentType: contentType,
      })
    );
    
    return path;
  } catch (error) {
    console.error('Error uploading to bucket:', error);
    throw new Error(`Failed to upload data to storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Download an object from S3 bucket
 * @param path Path of the object in the bucket
 * @returns Downloaded data
 */
export async function downloadFromBucket(path: string): Promise<any> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: path,
      })
    );
    
    // Convert stream to string
    const streamToString = (stream : any): Promise<string> =>
      new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk:any) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      });
    
    const bodyContents = await streamToString(response.Body);
    
    // Try to parse JSON, otherwise return string
    try {
      return JSON.parse(bodyContents);
    } catch (e) {
      return bodyContents;
    }
  } catch (error) {
    console.error('Error downloading from bucket:', error);
    throw new Error(`Failed to download data from storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete an object from S3 bucket
 * @param path Path of the object to delete
 */
export async function deleteFromBucket(path: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: path,
      })
    );
  } catch (error) {
    console.error('Error deleting from bucket:', error);
    throw new Error(`Failed to delete data from storage: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a signed URL for temporary access to an object
 * @param path Path of the object
 * @param expiresIn URL expiration time in seconds (default 1 hour)
 * @returns Signed URL
 */
export async function generateSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: path,
    });
    
    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * List objects in the bucket for a specific type and user
 * @param type Type of object
 * @param userId User ID
 * @param prefix Optional prefix to filter objects
 * @returns List of object paths
 */
export async function listObjectsByType(
  type: 'component' | 'tool' | 'material'|'machine-config', 
  userId: string,
  prefix?: string
): Promise<string[]> {
  try {
    const searchPrefix = prefix || `${type}s/${userId}/`;
    
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: searchPrefix
    });
    
    const response = await s3Client.send(command);
    
    return response.Contents?.map(obj => obj.Key || '') || [];
  } catch (error) {
    console.error('Error listing objects:', error);
    throw new Error(`Failed to list objects: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}