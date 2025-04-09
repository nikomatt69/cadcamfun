// src/pages/api/upload.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from 'src/lib/api/auth';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { prisma } from 'src/lib/prisma';

// Configura il client S3 per 4everland
const s3Client = new S3Client({
  region: 'us-west-2', // Regione specifica per 4everland
  endpoint: process.env.EVER_API_URL || 'https://endpoint.4everland.co', // Assicurati che questo endpoint sia corretto
  credentials: {
    accessKeyId: process.env.EVER_API_KEY_ID || '',
    secretAccessKey: process.env.EVER_API_KEY_SECRET || ''
  },
  forcePathStyle: true // Importante per alcuni servizi compatibili con S3
});

// Fix per gestire le risposte vuote da 4everland
s3Client.middlewareStack.addRelativeTo(
  (next: any) => async (args: any) => {
    try {
      const result = await next(args);
      if (result.response && result.response.body == null) {
        result.response.body = new Uint8Array();
      }
      return result;
    } catch (error) {
      console.error('S3 middleware error:', error);
      throw error;
    }
  },
  {
    name: 'nullFetchResponseBodyMiddleware',
    toMiddleware: 'deserializerMiddleware',
    relation: 'after',
    override: true
  }
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }
  
  try {
    console.log('Upload request received:', req.body);
    const { fileName, fileType, organizationId, conversationId, fileSize } = req.body;
    
    if (!fileName || !fileType || !organizationId || !conversationId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Verifica che l'utente faccia parte dell'organizzazione
    const userOrganization = await prisma.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId
        }
      }
    });
    
    if (!userOrganization) {
      return res.status(403).json({ message: 'Not a member of this organization' });
    }
    
    // Verifica che l'utente sia un partecipante della conversazione
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId
        }
      }
    });
    
    if (!participant) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }
    
    // Generate a unique file name
    const fileExtension = fileName.split('.').pop();
    const uniqueFileName = `${crypto.randomUUID()}.${fileExtension}`;
    const key = `conversations/${organizationId}/${conversationId}/${uniqueFileName}`;
    
    // Bucket name - usa una variabile d'ambiente specifica per 4everland
    const bucketName = process.env.EVER_BUCKET_NAME || 'lensshare';
    
    console.log('Creating file upload record...');
    
    // Create a database record for the file
    const fileUpload = await prisma.fileUpload.create({
      data: {
        fileName: fileName,
        s3Key: key,
        s3Bucket: bucketName,
        s3ContentType: fileType,
        s3Size: fileSize || 0,
        objectId: conversationId,
        objectType: 'CONVERSATION',
        ownerId: userId,
        organizationId
      }
    });
    
    console.log('File upload record created:', fileUpload.id);
    
    // Generate a signed URL for direct upload
    const putObjectParams = {
      Bucket: bucketName,
      Key: key,
      ContentType: fileType
    };
    
    console.log('Generating signed URL...');
    
    try {
      const command = new PutObjectCommand(putObjectParams);
      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // URL valido per 5 minuti
      
      console.log('Signed URL generated successfully');
      
      // Build the public URL for the file
      const publicUrl = `https://${bucketName}.4everland.store/${key}`;
      
      return res.status(200).json({ 
        upload: {
          ...fileUpload,
          publicUrl
        },
        uploadUrl: signedUrl
      });
    } catch (signedUrlError) {
      console.error('Error generating signed URL:', signedUrlError);
      return res.status(500).json({ message: 'Error generating signed URL for 4everland' });
    }
  } catch (error) {
    console.error('Failed to process upload request:', error);
    return res.status(500).json({ message: 'Failed to process upload request' });
  }
}