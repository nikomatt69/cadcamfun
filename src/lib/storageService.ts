// src/lib/services/storageService.ts

import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand, 
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListObjectsV2CommandOutput,
  DeleteObjectsCommandOutput,
  _Object as S3Object
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

export const EVER_API = 'https://endpoint.4everland.co';
// Configuration for S3 Client
const s3Client = new S3Client({
  endpoint: EVER_API,
  region: process.env.AWS_REGION || 'us-west-1',
  credentials: {
    accessKeyId: process.env.EVER_API_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.EVER_API_KEY_SECRET || process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true
});

// Bucket name
const bucketName = process.env.EVER_BUCKET_NAME || process.env.S3_BUCKET_NAME || 'cadcamfun';

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
 * @param data Data to upload (string, Buffer, or ReadableStream)
 * @param contentType Optional content type
 * @returns Path of the uploaded object
 */
export async function uploadToBucket(
  path: string, 
  data: string | Buffer | Readable | ReadableStream,
  contentType?: string
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: path,
      Body: data,
      ContentType: contentType,
    });
    await s3Client.send(command);
    return path;
  } catch (error) {
    console.error(`[StorageService] Error uploading ${path} to bucket:`, error);
    throw new Error(`Failed to upload data to storage: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Download an object from S3 bucket as a Buffer
 * @param path Path of the object in the bucket
 * @returns Downloaded data as Buffer or null if not found
 */
export async function downloadFromBucket(path: string): Promise<Buffer | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: path,
    });
    const response = await s3Client.send(command);
    
    if (!response.Body) {
        console.warn(`[StorageService] No response body for path: ${path}`);
        return null;
    }
    
    if (response.Body instanceof Readable) {
       const streamToBuffer = (stream: Readable): Promise<Buffer> =>
         new Promise((resolve, reject) => {
           const chunks: Buffer[] = [];
           stream.on('data', (chunk: Buffer) => chunks.push(chunk));
           stream.on('error', reject);
           stream.on('end', () => resolve(Buffer.concat(chunks)));
         });
       return await streamToBuffer(response.Body);
    } else {
        console.error(`[StorageService] Unhandled response body type for path: ${path}. Expected Node.js Readable stream.`);
        return null;
    }

  } catch (error) {
     if ((error as any).name === 'NoSuchKey') {
         console.warn(`[StorageService] Object not found at path: ${path}`);
         return null;
      }
    console.error(`[StorageService] Error downloading from bucket for path ${path}:`, error);
    throw new Error(`Failed to download data from storage: ${error instanceof Error ? error.message : String(error)}`);
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
    console.log(`[StorageService] Deleted object: ${path}`);
  } catch (error) {
    if ((error as any).name !== 'NoSuchKey') {
        console.error(`[StorageService] Error deleting ${path} from bucket:`, error);
        throw new Error(`Failed to delete data from storage: ${error instanceof Error ? error.message : String(error)}`);
    }
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

/**
 * List all object keys under a specific prefix.
 * Handles pagination automatically.
 * @param prefix The prefix to search for (e.g., 'plugins/my-plugin/')
 * @returns Array of object keys
 */
export async function listObjectKeysByPrefix(prefix: string): Promise<string[]> {
  console.log(`[StorageService] Listing objects with prefix: ${prefix}`);
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  try {
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response: ListObjectsV2CommandOutput = await s3Client.send(command);
      
      if (response.Contents) {
        response.Contents.forEach((item: S3Object) => {
          if (item.Key) {
            keys.push(item.Key);
          }
        });
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log(`[StorageService] Found ${keys.length} objects with prefix ${prefix}`);
    return keys;
  } catch (error) {
    console.error(`[StorageService] Error listing objects by prefix ${prefix}:`, error);
    throw new Error(`Failed to list objects by prefix: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Delete multiple objects from the S3 bucket in batches.
 * @param keys Array of object keys to delete
 */
export async function deleteMultipleObjects(keys: string[]): Promise<void> {
  if (!keys || keys.length === 0) {
    console.log('[StorageService] No keys provided for multiple delete.');
    return;
  }
  console.log(`[StorageService] Attempting to delete ${keys.length} objects...`);
  const batchSize = 1000;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batchKeys = keys.slice(i, i + batchSize);
    const deleteParams = {
      Bucket: bucketName,
      Delete: {
        Objects: batchKeys.map(key => ({ Key: key })),
        Quiet: false,
      },
    };

    try {
      const command = new DeleteObjectsCommand(deleteParams);
      const output: DeleteObjectsCommandOutput = await s3Client.send(command);
      
      console.log(`[StorageService] Batch delete processed for ${batchKeys.length} keys.`);
      
      if (output.Errors && output.Errors.length > 0) {
        console.error('[StorageService] Errors occurred during batch delete:');
        output.Errors.forEach(err => {
          console.error(`  - Key: ${err.Key}, Code: ${err.Code}, Message: ${err.Message}`);
        });
      }
    } catch (error) {
      console.error(`[StorageService] Error during batch delete operation (batch starting index ${i}):`, error);
      throw new Error(`Failed during batch delete: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`[StorageService] Finished deleting ${keys.length} objects.`);
}

/**
 * Get an object stream from S3 bucket
 * @param path Path of the object in the bucket
 * @returns ReadableStream | null
 */
export async function downloadStreamFromBucket(path: string): Promise<Readable | ReadableStream | null> {
   try {
     const command = new GetObjectCommand({
       Bucket: bucketName,
       Key: path,
     });
     const response = await s3Client.send(command);
     return response.Body ? (response.Body as Readable | ReadableStream) : null;
   } catch (error) {
      if ((error as any).name === 'NoSuchKey') {
         console.warn(`[StorageService] Object not found at path: ${path}`);
         return null;
      }
     console.error(`[StorageService] Error downloading stream from bucket for path ${path}:`, error);
     return null; 
   }
 }