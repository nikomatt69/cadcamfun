import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { forgetPassword } from '@/src/lib/auth-client';

export default function ForgotPassword() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const emailValue = formData.get('email') as string;
    setEmail(emailValue);

    try {
      await forgetPassword(emailValue, '/auth/reset-password');
      setSuccess('Password reset link sent to your email!');
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="text-3xl font-bold text-center">Forgot Password?</h2>
          <p className="mt-2 text-center text-gray-600">
            Enter your email address and we'll send you a link to reset your password
          </p>
        </div>

        {!success ? (
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Enter your email"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isLoading ? 'Sending reset link...' : 'Send Reset Link'}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              {success}
              <div className="mt-2 text-sm">
                <p>Check your email and click the reset link to continue.</p>
                <p>The link will expire in 15 minutes for security.</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="text-sm text-blue-700">
                <h3 className="font-medium mb-2">Next steps:</h3>
                <div className="space-y-1">
                  <p>1. Check your inbox for an email from us</p>
                  <p>2. Click the "Reset Password" link in the email</p>
                  <p>3. Create a new password</p>
                  <p>4. Sign in with your new password</p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600 mb-4">
                Didn't receive the email? Check your spam folder or try again.
              </p>
              <button
                onClick={() => {
                  setSuccess(null);
                  setError(null);
                }}
                className="text-blue-600 hover:underline"
              >
                Try again with different email
              </button>
            </div>
          </div>
        )}

        <div className="text-center space-y-2">
          <Link href="/auth/signin" className="text-blue-600 hover:underline block">
            Back to sign in
          </Link>
          <Link href="/auth/signup" className="text-blue-600 hover:underline block">
            Don't have an account? Sign up
          </Link>
        </div>
      </div>
    </div>
  );
} 