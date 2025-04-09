import { ImageResponse } from '@vercel/og';
import { NextRequest } from 'next/server';

export const config = {
  runtime: 'edge',
};

export default function handler(req: NextRequest) {
  try {
    // Extract query parameters
    const { searchParams } = new URL(req.url);
    const title = searchParams.get('title') || 'CAD/CAM FUN';
    const description = searchParams.get('description') || 'Modern CAD/CAM system for 2D/3D design and CNC machining with AI capabilities';
    
    // Generate the image
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f6f6f6',
            padding: '40px',
          }}
        >
          <div
            style={{
              fontSize: 60,
              fontWeight: 'bold',
              letterSpacing: '-0.025em',
              marginBottom: 20,
              maxWidth: 900,
              textAlign: 'center',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 30,
              color: '#444',
              marginBottom: 40,
              maxWidth: 800,
              textAlign: 'center',
            }}
          >
            {description}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 26,
            }}
          >
            <img
              src="/logo.png"
              width={40}
              height={40}
              style={{ marginRight: 10 }}
            />
            cadcamfun.xyz
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e) {
    console.error(e);
    return new Response('Failed to generate image', { status: 500 });
  }
}