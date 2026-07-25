import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { verifyEmail, useSession } from '@/src/lib/auth-client';
import { useAuth } from "@/src/contexts/AuthContext"; // Import useAuth
import { toast } from "react-hot-toast";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/Card";
import { Loader2, MailCheck, AlertTriangle, Send } from "lucide-react";
import Link from "next/link";

const VerifyEmailPage = () => {
    const router = useRouter();
    const { token } = router.query;
    const { data: session, isPending: isSessionLoading } = useSession();
    const { handleSendEmailVerification } = useAuth(); // Get handler from context
    const [verificationStatus, setVerificationStatus] = useState<"pending" | "success" | "error">("pending");
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Cooldown timer effect
    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => {
                setResendCooldown(resendCooldown - 1);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    // Handle email verification from token
    useEffect(() => {
        const verifyToken = async () => {
            if (token && typeof token === 'string') {
                setIsLoading(true);
                try {
                    await verifyEmail(token);
                    setVerificationStatus("success");
                    toast.success("Email verified successfully! Redirecting...");
                    setTimeout(() => router.push('/'), 2000);
                } catch (err: any) {
                    setVerificationStatus("error");
                    setError(err.message || "Invalid or expired verification link.");
                    toast.error(err.message || "Verification failed.");
                } finally {
                    setIsLoading(false);
                }
            }
        };
        verifyToken();
    }, [token, router]);

    // Handle resending verification email
    const handleResendVerification = async () => {
        if (!session?.user?.email) {
            setError('No email address found. Please sign in again.');
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            await handleSendEmailVerification(session.user.email);
            toast.success("Verification email sent successfully!");
            setResendCooldown(60); // 60 second cooldown
        } catch (err: any) {
            setError(err.message || 'Failed to send verification email');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSessionLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="max-w-md w-full text-center space-y-8">
                    <div>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <h2 className="text-2xl font-bold mt-4">Verifying Email...</h2>
                        <p className="text-gray-600 mt-2">
                            Please wait while we verify your email address.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (verificationStatus === "success" && token) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="max-w-md w-full text-center space-y-8">
                    <div>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-bold text-green-600 mt-4">Email Verified!</h2>
                        <p className="text-gray-600 mt-2">
                            Your email has been successfully verified. You now have full access to your account.
                        </p>
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="text-sm text-green-700">
                            <p>Redirecting to dashboard in a few seconds...</p>
                        </div>
                    </div>

                    <div className="text-center">
                        <Link href="/" className="text-blue-600 hover:underline">
                            Go to Dashboard
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (verificationStatus === "error" && token) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="max-w-md w-full text-center space-y-8">
                    <div>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-bold text-red-600 mt-4">Verification Failed</h2>
                        <p className="text-gray-600 mt-2">
                            {error}
                        </p>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                        <div className="text-sm text-red-700">
                            <p>The verification link may have expired or been used already.</p>
                            <p className="mt-1">You can request a new verification email below.</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {session && (
                            <Button
                                onClick={handleResendVerification}
                                disabled={isLoading || resendCooldown > 0}
                                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isLoading
                                    ? 'Sending...'
                                    : resendCooldown > 0
                                        ? `Resend in ${resendCooldown}s`
                                        : 'Send New Verification Email'
                                }
                            </Button>
                        )}

                        <Link href="/auth/signin" className="block text-blue-600 hover:underline">
                            Back to Sign In
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Default verification page (when user needs to verify)
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-bold mt-4">Verify Your Email</h2>
                    <p className="text-gray-600 mt-2">
                        We've sent a verification link to {session?.user?.email || 'your email address'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        {error}
                    </div>
                )}

                {verificationStatus === "success" && (
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                        <MailCheck className="h-5 w-5 inline-block mr-2" /> Email verified!
                    </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="text-sm text-blue-700">
                        <h3 className="font-medium mb-2">Check your email</h3>
                        <div className="space-y-1">
                            <p>1. Check your inbox (and spam folder)</p>
                            <p>2. Click the verification link in the email</p>
                            <p>3. Return here to access your account</p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {session && (
                        <Button
                            onClick={handleResendVerification}
                            disabled={isLoading || resendCooldown > 0}
                            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                            {isLoading
                                ? 'Sending...'
                                : resendCooldown > 0
                                    ? `Resend in ${resendCooldown}s`
                                    : 'Send New Verification Email'
                            }
                        </Button>
                    )}

                    <Link href="/auth/signin" className="block text-blue-600 hover:underline">
                        Back to Sign In
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default VerifyEmailPage; 