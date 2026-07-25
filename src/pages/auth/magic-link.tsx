import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { sendMagicLink } from '@/src/lib/auth-client';

export default function MagicLink() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [emailSent, setEmailSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const email = formData.get('email') as string;

        try {
            await sendMagicLink(email, '/');
            setEmailSent(true);
        } catch (err: any) {
            setError(err.message || 'Failed to send magic link');
        } finally {
            setIsLoading(false);
        }
    };

    if (emailSent) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="max-w-md w-full space-y-8 text-center">
                    <div>
                        <h2 className="text-3xl font-bold">Check your email</h2>
                        <p className="mt-4 text-gray-600">
                            We've sent a magic link to your email address. Click the link to sign in.
                        </p>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="flex">
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-green-800">
                                    Magic link sent!
                                </h3>
                                <div className="mt-2 text-sm text-green-700">
                                    <p>The link will expire in 5 minutes for security.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="text-center">
                        <Link href="/auth/signin" className="text-blue-600 hover:underline">
                            Back to sign in
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="text-3xl font-bold text-center">Magic Link Sign In</h2>
                    <p className="mt-2 text-center text-gray-600">
                        Enter your email and we'll send you a magic link to sign in
                    </p>
                </div>

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
                        className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50"
                    >
                        {isLoading ? 'Sending magic link...' : 'Send magic link'}
                    </button>
                </form>

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