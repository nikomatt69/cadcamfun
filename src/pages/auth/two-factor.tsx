import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useSession } from '@/src/lib/auth-client';

export default function TwoFactor() {
    const router = useRouter();
    const { data: session } = useSession();
    const user = session?.user;

    const [activeTab, setActiveTab] = useState<'setup' | 'verify' | 'manage'>('setup');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Setup 2FA states
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    // Verification states
    const [verificationCode, setVerificationCode] = useState('');
    const [otpSent, setOtpSent] = useState(false);

    // 2FA Status
    const [is2FAEnabled, setIs2FAEnabled] = useState(false);

    useEffect(() => {
        checkTwoFactorStatus();
    }, []);

    const checkTwoFactorStatus = async () => {
        try {
            // TODO: Implementare quando l'endpoint sarà disponibile
            // const status = await get2FAStatus();
            // setIs2FAEnabled(status.enabled);
            // if (status.enabled) {
            //     setActiveTab('manage');
            // }
            console.log('2FA status check - to be implemented');
        } catch (err) {
            console.error('Failed to check 2FA status:', err);
        }
    };

    // Placeholder functions - da implementare quando gli endpoint saranno disponibili
    const handleEnable2FAClick = async () => {
        setError('2FA functionality will be available soon');
    };

    const handleVerifySetup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('2FA functionality will be available soon');
    };

    const handleSendOTPClick = async () => {
        setError('2FA functionality will be available soon');
    };

    const handleVerifyOTPClick = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('2FA functionality will be available soon');
    };

    const handleDisable2FAClick = async () => {
        setError('2FA functionality will be available soon');
    };

    const handleRegenerateBackupCodes = async () => {
        setError('2FA functionality will be available soon');
    };

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <p className="text-gray-600">Please sign in to manage 2FA settings</p>
                    <Link href="/auth/signin" className="text-blue-600 hover:underline">
                        Sign in
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="max-w-2xl w-full space-y-8 p-6">
                <div>
                    <h2 className="text-3xl font-bold text-center">Two-Factor Authentication</h2>
                    <p className="mt-2 text-center text-gray-600">
                        Secure your account with an additional layer of protection
                    </p>
                </div>

                {/* Tab Navigation */}
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('setup')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'setup'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Setup TOTP
                        </button>
                        <button
                            onClick={() => setActiveTab('verify')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'verify'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Verify OTP
                        </button>
                        <button
                            onClick={() => setActiveTab('manage')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'manage'
                                ? 'border-blue-500 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            Manage 2FA
                        </button>
                    </nav>
                </div>

                {/* Messages */}
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                        {error}
                    </div>
                )}

                {success && (
                    <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                        {success}
                    </div>
                )}

                {/* Setup Tab */}
                {activeTab === 'setup' && (
                    <div className="space-y-6">
                        {!qrCode ? (
                            <div className="text-center">
                                <h3 className="text-lg font-medium mb-4">Enable Two-Factor Authentication</h3>
                                <p className="text-gray-600 mb-6">
                                    Add an extra layer of security to your account by enabling 2FA
                                </p>
                                <button
                                    onClick={handleEnable2FAClick}
                                    disabled={isLoading || is2FAEnabled}
                                    className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {isLoading ? 'Setting up...' : is2FAEnabled ? '2FA Already Enabled' : 'Enable 2FA'}
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="text-center">
                                    <h3 className="text-lg font-medium mb-4">Scan QR Code</h3>
                                    <div className="bg-white p-4 inline-block border rounded-lg">
                                        <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                                    </div>
                                    <p className="text-sm text-gray-600 mt-4">
                                        Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                    </p>
                                </div>

                                <form onSubmit={handleVerifySetup} className="space-y-4">
                                    <div>
                                        <label htmlFor="code" className="block text-sm font-medium">
                                            Verification Code
                                        </label>
                                        <input
                                            id="code"
                                            type="text"
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value)}
                                            placeholder="Enter 6-digit code"
                                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                            required
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Verifying...' : 'Verify and Enable 2FA'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                )}

                {/* Verify Tab */}
                {activeTab === 'verify' && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h3 className="text-lg font-medium mb-4">Verify with One-Time Password</h3>
                            <p className="text-gray-600 mb-6">
                                We'll send a verification code to your email address
                            </p>
                        </div>

                        {!otpSent ? (
                            <button
                                onClick={handleSendOTPClick}
                                disabled={isLoading}
                                className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isLoading ? 'Sending...' : 'Send OTP to Email'}
                            </button>
                        ) : (
                            <form onSubmit={handleVerifyOTPClick} className="space-y-4">
                                <div>
                                    <label htmlFor="otp" className="block text-sm font-medium">
                                        Email Verification Code
                                    </label>
                                    <input
                                        id="otp"
                                        type="text"
                                        value={verificationCode}
                                        onChange={(e) => setVerificationCode(e.target.value)}
                                        placeholder="Enter code from email"
                                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isLoading ? 'Verifying...' : 'Verify OTP'}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setOtpSent(false)}
                                    className="w-full text-gray-600 hover:underline"
                                >
                                    Send new code
                                </button>
                            </form>
                        )}
                    </div>
                )}

                {/* Manage Tab */}
                {activeTab === 'manage' && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <h3 className="text-lg font-medium mb-2">2FA Status</h3>
                            <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${is2FAEnabled
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                                }`}>
                                {is2FAEnabled ? '✅ Enabled' : '❌ Disabled'}
                            </div>
                        </div>

                        {is2FAEnabled && (
                            <div className="space-y-4">
                                <div className="bg-gray-50 p-4 rounded-lg">
                                    <h4 className="font-medium mb-2">Backup Codes</h4>
                                    {backupCodes.length > 0 ? (
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                                                {backupCodes.map((code, index) => (
                                                    <div key={index} className="bg-white p-2 rounded border">
                                                        {code}
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-600">
                                                Save these codes in a safe place. Each can only be used once.
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="text-gray-600">No backup codes generated yet.</p>
                                    )}
                                </div>

                                <div className="flex space-x-4">
                                    <button
                                        onClick={handleRegenerateBackupCodes}
                                        disabled={isLoading}
                                        className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Generating...' : 'Generate New Backup Codes'}
                                    </button>

                                    <button
                                        onClick={handleDisable2FAClick}
                                        disabled={isLoading}
                                        className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Disabling...' : 'Disable 2FA'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {!is2FAEnabled && (
                            <div className="text-center">
                                <p className="text-gray-600 mb-4">
                                    Two-factor authentication is not enabled for your account
                                </p>
                                <button
                                    onClick={() => setActiveTab('setup')}
                                    className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700"
                                >
                                    Enable 2FA
                                </button>
                            </div>
                        )}
                    </div>
                )}

                <div className="text-center">
                    <Link href="/" className="text-blue-600 hover:underline">
                        Back to dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
} 