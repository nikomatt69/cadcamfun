// src/lib/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET non configurato');
}

export const generateJWT = (userId: string) => {
  return jwt.sign(
    {
      sub: userId
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

export const verifyJWT = (token: string): Promise<jwt.JwtPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded as jwt.JwtPayload);
      }
    });
  });
};