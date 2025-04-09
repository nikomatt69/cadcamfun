import allowCors from '@/src/lib/allowCors';
import type { NextApiRequest, NextApiResponse } from 'next';


const handler = (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    res.status(200).json({
      message: 'CadCamFun API ✨'
    });
  } catch {
    res.status(500).json({ success: false });
  }
};

export default allowCors(handler);
