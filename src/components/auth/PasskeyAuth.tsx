import { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';

interface PasskeyAuthProps {
    mode: 'signin' | 'signup' | 'manage';
    className?: string;
    onSuccess?: () => void;
    onError?: (error: string) => void;
}

export default function PasskeyAuth({ mode, className = '', onSuccess, onError }: PasskeyAuthProps) {
    const {
        user,
        handleSignInWithPasskey,
        handleAddPasskey,
        handleListPasskeys,
        handleDeletePasskey
    } = useAuth();

    const [isLoading, setIsLoading] = useState(false);
    const [passkeys, setPasskeys] = useState<any[]>([]);
    const [showPasskeys, setShowPasskeys] = useState(false);
    const [passkeyName, setPasskeyName] = useState('');

    const handleSignInClick = async () => {
        setIsLoading(true);

        try {
            await handleSignInWithPasskey();
            onSuccess?.();
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to sign in with passkey';
            onError?.(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddPasskeyClick = async () => {
        if (!passkeyName.trim()) {
            onError?.('Please enter a name for your passkey');
            return;
        }

        setIsLoading(true);

        try {
            await handleAddPasskey(passkeyName);
            setPasskeyName('');
            onSuccess?.();
            loadPasskeys(); // Refresh the list
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to add passkey';
            onError?.(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const loadPasskeys = async () => {
        try {
            const userPasskeys = await handleListPasskeys();
            setPasskeys(userPasskeys);
        } catch (err) {
            console.error('Failed to load passkeys:', err);
        }
    };

    const handleDeletePasskeyClick = async (passkeyId: string) => {
        if (!window.confirm('Are you sure you want to delete this passkey?')) {
            return;
        }

        setIsLoading(true);

        try {
            await handleDeletePasskey(passkeyId);
            onSuccess?.();
            loadPasskeys(); // Refresh the list
        } catch (err: any) {
            const errorMessage = err.message || 'Failed to delete passkey';
            onError?.(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const togglePasskeysView = async () => {
        if (!showPasskeys) {
            await loadPasskeys();
        }
        setShowPasskeys(!showPasskeys);
    };

    if (mode === 'signin') {
        return (
            <div className={className}>
                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-white text-gray-500">Or</span>
                    </div>
                </div>

                <button
                    onClick={handleSignInClick}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                    {isLoading ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                    ) : (
                        <>
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Sign in with Passkey
                        </>
                    )}
                </button>
            </div>
        );
    }

    if (mode === 'signup') {
        return (
            <div className={className}>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <h3 className="text-sm font-medium text-blue-800">
                                Secure with Passkey
                            </h3>
                            <div className="mt-2 text-sm text-blue-700">
                                <p>After signing up, you can add a passkey for passwordless authentication using your device's biometrics or security key.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (mode === 'manage') {
        return (
            <div className={className}>
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">Passkeys</h3>
                        <button
                            onClick={togglePasskeysView}
                            className="text-blue-600 hover:underline text-sm"
                        >
                            {showPasskeys ? 'Hide' : 'Show'} Passkeys
                        </button>
                    </div>

                    {showPasskeys && (
                        <div className="space-y-4">
                            {/* Add new passkey */}
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h4 className="font-medium mb-2">Add New Passkey</h4>
                                <div className="flex space-x-2">
                                    <input
                                        type="text"
                                        placeholder="Passkey name (e.g., iPhone, YubiKey)"
                                        value={passkeyName}
                                        onChange={(e) => setPasskeyName(e.target.value)}
                                        className="flex-1 border border-gray-300 rounded-md px-3 py-2"
                                    />
                                    <button
                                        onClick={handleAddPasskeyClick}
                                        disabled={isLoading || !passkeyName.trim()}
                                        className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Adding...' : 'Add'}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-600 mt-2">
                                    Your device will prompt you to create a passkey using biometrics or a security key.
                                </p>
                            </div>

                            {/* Existing passkeys */}
                            <div>
                                <h4 className="font-medium mb-2">Your Passkeys</h4>
                                {passkeys.length === 0 ? (
                                    <div className="text-gray-500 text-sm bg-gray-50 p-4 rounded-lg text-center">
                                        <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        <p>No passkeys added yet</p>
                                        <p className="text-xs">Add a passkey above for secure, passwordless authentication</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {passkeys.map((passkey) => (
                                            <div
                                                key={passkey.id}
                                                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                                            >
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{passkey.name}</p>
                                                        <p className="text-xs text-gray-500">
                                                            Created {new Date(passkey.createdAt).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleDeletePasskeyClick(passkey.id)}
                                                    disabled={isLoading}
                                                    className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                                <div className="text-sm text-blue-700">
                                    <h4 className="font-medium mb-1">About Passkeys</h4>
                                    <ul className="space-y-1 text-xs">
                                        <li>• Passkeys use your device's built-in security (Face ID, Touch ID, Windows Hello)</li>
                                        <li>• They're more secure than passwords and can't be phished</li>
                                        <li>• You can have multiple passkeys for different devices</li>
                                        <li>• Passkeys sync across your Apple or Google account devices</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
} 