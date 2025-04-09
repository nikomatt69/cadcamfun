// src/pages/api/auth/[...nextauth].ts

import NextAuth from 'next-auth';
import { nextAuthConfig } from '@/src/lib/nextAuthConfig';

export default NextAuth(nextAuthConfig);