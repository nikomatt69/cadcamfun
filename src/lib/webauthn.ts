import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server';
import { prisma } from './prisma';

const rpName = 'CAD/CAM FUN';
const rpID = process.env.NODE_ENV === 'development' ? 'localhost' : 'cadcamfun.xyz';
const origin = process.env.NODE_ENV === 'development'
  ? 'http://localhost:3000'
  : 'https://cadcamfun.xyz';

export async function generatePasskeyRegistration(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { authenticators: true }
  });

  if (!user) throw new Error('User not found');

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: userId,
    userName: user.email || '',
    userDisplayName: user.name || user.email || '',
    attestationType: 'none',
    excludeCredentials: user.authenticators.map(auth => ({
      id: Buffer.from(auth.credentialID, 'base64'),
      type: 'public-key' as const,
      transports: auth.transports ? JSON.parse(auth.transports) : [],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      authenticatorAttachment: 'platform',
      userVerification: 'discouraged',
    },
    supportedAlgorithmIDs: [-7, -257],
  });

  return options;
}

export async function verifyPasskeyRegistration(
  userId: string,
  response: any,
  expectedChallenge: string
) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user) throw new Error('User not found');

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (verification.verified && verification.registrationInfo) {
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    const credentialPublicKeyBytes = new Uint8Array(credentialPublicKey.length);
    credentialPublicKeyBytes.set(credentialPublicKey);

    await prisma.authenticator.create({
      data: {
        userId,
        credentialID: Buffer.from(credentialID).toString('base64'),
        credentialPublicKey: credentialPublicKeyBytes,
        counter,
        credentialDeviceType: 'unknown',
        credentialBackedUp: false,
        transports: JSON.stringify(response.response.transports || []),
      }
    });
  }

  return verification;
}

export async function generatePasskeyAuthentication(email?: string) {
  let userAuthenticators: any[] = [];

  if (email) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { authenticators: true }
    });

    if (user) {
      userAuthenticators = user.authenticators.map(auth => ({
        id: Buffer.from(auth.credentialID, 'base64'),
        type: 'public-key' as const,
        transports: auth.transports ? JSON.parse(auth.transports) : [],
      }));
    }
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: userAuthenticators.length > 0 ? userAuthenticators : undefined,
    userVerification: 'preferred',
  });

  return options;
}

export async function verifyPasskeyAuthentication(
  response: any,
  expectedChallenge: string
) {
  const authenticator = await prisma.authenticator.findUnique({
    where: { credentialID: response.id },
    include: { user: true }
  });

  if (!authenticator) throw new Error('Authenticator not found');

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    authenticator: {
      credentialID: Buffer.from(authenticator.credentialID, 'base64'),
      credentialPublicKey: authenticator.credentialPublicKey,
      counter: authenticator.counter,
    },
    requireUserVerification: false,
  });

  if (verification.verified) {
    await prisma.authenticator.update({
      where: { id: authenticator.id },
      data: { counter: verification.authenticationInfo.newCounter }
    });
  }

  return {
    verified: verification.verified,
    user: authenticator.user
  };
}
