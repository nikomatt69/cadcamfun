import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import Head from 'next/head';
import { prisma } from 'src/lib/prisma';
import { GetServerSideProps } from 'next';

// Types for the page props
interface InvitationPageProps {
  invitation?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    organization: {
      name: string;
    };
    expiresAt: string;
  };
  error?: string;
  expired?: boolean;
}

export default function InvitationPage({ invitation, error, expired }: InvitationPageProps) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [success, setSuccess] = useState(false);

  // Determine if user is already logged in
  const isAuthenticated = status === 'authenticated';
  
  // Check if the logged-in user's email matches the invitation email
  const emailMatches = isAuthenticated && session?.user?.email === invitation?.email;

  useEffect(() => {
    // If successfully accepted, redirect to the organization page after a delay
    if (success && invitation) {
      const timer = setTimeout(() => {
        router.push(`/organizations/${invitation.organizationId}`);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, invitation, router]);

  // Handle accepting the invitation
  const handleAcceptInvitation = async () => {
    if (!invitation) return;
    
    setIsAccepting(true);
    setAcceptError('');
    
    try {
      const response = await fetch(`/api/invitations/${router.query.token}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to accept invitation');
      }
      
      setSuccess(true);
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setIsAccepting(false);
    }
  };

  // Handle login before accepting
  const handleLogin = async () => {
    if (!invitation) return;
    
    router.push({
      pathname: '/auth/signin',
      query: { email: invitation.email, redirect: window.location.pathname }
    });
  };

  // Handle registration before accepting
  const handleRegister = () => {
    if (!invitation) return;
    
    router.push({
      pathname: '/auth/signup',
      query: { email: invitation.email, redirect: window.location.pathname }
    });
  };

  // Render the appropriate content based on the state
  const renderContent = () => {
    // Error state
    if (error) {
      return (
        <div className="bg-red-50 p-6 rounded-lg shadow-sm border border-red-200">
          <h2 className="text-xl font-semibold text-red-800 mb-4">Invitation Error</h2>
          <p className="text-red-700">{error}</p>
          <button 
            onClick={() => router.push('/')}
            className="mt-6 px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-800 font-medium transition-colors"
          >
            Return to Home
          </button>
        </div>
      );
    }
    
    // Expired invitation
    if (expired) {
      return (
        <div className="bg-yellow-50 p-6 rounded-lg shadow-sm border border-yellow-200">
          <h2 className="text-xl font-semibold text-yellow-800 mb-4">Invitation Expired</h2>
          <p className="text-yellow-700">This invitation has expired. Please contact the organization admin for a new invitation.</p>
          <button 
            onClick={() => router.push('/')}
            className="mt-6 px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-gray-800 font-medium transition-colors"
          >
            Return to Home
          </button>
        </div>
      );
    }
    
    // Success state
    if (success) {
      return (
        <div className="bg-green-50 p-6 rounded-lg shadow-sm border border-green-200">
          <h2 className="text-xl font-semibold text-green-800 mb-4">Invitation Accepted!</h2>
          <p className="text-green-700">
            You have successfully joined {invitation?.organization.name}. You&apos;ll be redirected to the organization page shortly.
          </p>
        </div>
      );
    }
    
    // Regular invitation state
    return (
      <div className="bg-white p-6 md:p-8 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Organization Invitation</h2>
        
        <div className="mb-6">
          <p className="text-gray-700 mb-2">
            You&apos;ve been invited to join <span className="font-medium">{invitation?.organization.name}</span> as a <span className="font-medium lowercase">{invitation?.role}</span>.
          </p>
          <p className="text-sm text-gray-500">
            This invitation will expire on {new Date(invitation?.expiresAt || '').toLocaleDateString()}.
          </p>
        </div>
        
        {acceptError && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {acceptError}
          </div>
        )}
        
        {isAuthenticated ? (
          emailMatches ? (
            <button
              onClick={handleAcceptInvitation}
              disabled={isAccepting}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isAccepting ? 'Accepting...' : 'Accept Invitation'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-sm">
                You&apos;re currently logged in as {session?.user?.email}, but this invitation was sent to {invitation?.email}.
                Please log out and sign in with the correct account.
              </div>
              
              <button
                onClick={() => router.push('/api/auth/signout')}
                className="w-full py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-md transition-colors"
              >
                Log Out
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-gray-700 mb-2">
              Please sign in or create an account with <span className="font-medium">{invitation?.email}</span> to accept this invitation.
            </p>
            
            <button
              onClick={handleLogin}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Sign In
            </button>
            
            <button
              onClick={handleRegister}
              className="w-full py-2.5 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-md transition-colors"
            >
              Create Account
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Organization Invitation {invitation && `- ${invitation.organization.name}`}</title>
        <meta name="description" content="Accept your invitation to join an organization" />
      </Head>
      
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white shadow-sm py-4">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-xl font-bold text-gray-900">Organization Invitation</h1>
          </div>
        </header>
        
        <main className="flex-grow">
          <div className="max-w-lg mx-auto mt-10 px-4 sm:px-6 lg:px-8">
            {renderContent()}
          </div>
        </main>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { token } = context.params as { token: string };
  
  if (!token) {
    return {
      props: {
        error: 'Invalid invitation link'
      }
    };
  }
  
  try {
    // Find the invitation by token
    const invitation = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: {
        organization: {
          select: {
            name: true
          }
        }
      }
    });
    
    // Check if invitation exists
    if (!invitation) {
      return {
        props: {
          error: 'Invitation not found or has already been used'
        }
      };
    }
    
    // Check if invitation is expired
    if (new Date() > new Date(invitation.expiresAt)) {
      return {
        props: {
          expired: true,
          invitation: {
            id: invitation.id,
            email: invitation.email,
            role: invitation.role,
            organizationId: invitation.organizationId,
            organization: invitation.organization,
            expiresAt: invitation.expiresAt.toISOString()
          }
        }
      };
    }
    
    // Return invitation data
    return {
      props: {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          organizationId: invitation.organizationId,
          organization: invitation.organization,
          expiresAt: invitation.expiresAt.toISOString()
        }
      }
    };
  } catch (error) {
    console.error('Error fetching invitation:', error);
    return {
      props: {
        error: 'Failed to fetch invitation details'
      }
    };
  }
}; 