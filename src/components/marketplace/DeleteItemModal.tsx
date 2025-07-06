import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'react-feather';

interface DeleteItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    itemTitle?: string;
}

export const DeleteItemModal: React.FC<DeleteItemModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isDeleting,
    itemTitle,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl"
            >
                <div className="flex items-center space-x-3 mb-4">
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Delete Item
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            This action cannot be undone
                        </p>
                    </div>
                </div>

                <div className="mb-6">
                    <p className="text-gray-700 dark:text-gray-300 mb-3">
                        Are you sure you want to delete{' '}
                        {itemTitle ? (
                            <span className="font-medium">&quot;{itemTitle}&quot;</span>
                        ) : (
                            'this item'
                        )}
                        ? This will permanently remove it from the marketplace.
                    </p>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                            <span className="font-medium">⚠️ Note:</span> Items with completed purchases cannot be deleted and will be marked as inactive instead.
                        </p>
                    </div>
                </div>

                <div className="flex space-x-3">
                    <button
                        onClick={onClose}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isDeleting}
                        className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isDeleting ? (
                            <div className="flex items-center justify-center space-x-2">
                                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                <span>Deleting...</span>
                            </div>
                        ) : (
                            'Delete'
                        )}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}; 