import React, { useState, useEffect } from "react";
import { Button } from "@/src/components/ui/button"; // Corrected casing
import { Input } from "@/src/components/ui/input"; // Corrected casing
// Assuming Table components are exported individually, adjust if needed
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/src/components/ui/table'; // Commented out - Table component path/exports unknown
import * as DialogPrimitive from "@radix-ui/react-dialog"; // Common pattern for shadcn/ui
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogContent = DialogPrimitive.Content; // Adapt styling/wrapping if needed
// const DialogHeader = DialogPrimitive.Header; // Header is typically a styled div
// const DialogFooter = DialogPrimitive.Footer; // Footer is typically a styled div
const DialogTitle = DialogPrimitive.Title; // Adapt styling/wrapping if needed
const DialogDescription = DialogPrimitive.Description; // Adapt styling/wrapping if needed
const DialogClose = DialogPrimitive.Close; // Adapt styling/wrapping if needed
// import { useToast } from '@/src/components/ui/use-toast'; // Commenting out - Path needs verification
import { Loader2, Trash2, ClipboardCopy, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns"; // For formatting dates

interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsed?: string | null;
  expiresAt?: string | null;
}

interface NewApiKeyResponse {
  message: string;
  apiKey: string;
  name: string;
}

const ApiKeyManager: React.FC = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRevoking, setIsRevoking] = useState<string | null>(null); // Store ID of key being revoked
  const [keyName, setKeyName] = useState("");
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<NewApiKeyResponse | null>(null);
  const [showGeneratedKey, setShowGeneratedKey] = useState(false);
  // const { toast } = useToast(); // Commented out

  // Fetch keys on mount
  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/user/api-keys");
      if (!response.ok) {
        throw new Error("Failed to fetch API keys");
      }
      const data: ApiKey[] = await response.json();
      setKeys(data);
    } catch (error) {
      console.error(error);
      // toast({ // Commented out
      //   title: 'Error',
      //   description: 'Could not fetch API keys.',
      //   variant: 'destructive',
      // });
      alert("Error: Could not fetch API keys."); // Basic fallback alert
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      // toast({ title: 'Error', description: 'Please enter a name for the key.', variant: 'destructive' }); // Commented out
      alert("Error: Please enter a name for the key."); // Basic fallback alert
      return;
    }
    setIsGenerating(true);
    setNewlyGeneratedKey(null); // Clear previous generated key

    try {
      const response = await fetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to generate API key");
      }

      setNewlyGeneratedKey(data as NewApiKeyResponse);
      setShowGeneratedKey(true); // Show the key initially
      setKeyName(""); // Clear input
      fetchApiKeys(); // Refresh the list
      // toast({ // Commented out
      //   title: 'Success',
      //   description: 'API Key generated successfully. Store it securely!',
      // });
      // No alert here, success is shown in modal
    } catch (error: any) {
      console.error(error);
      // toast({ // Commented out
      //   title: 'Error Generating Key',
      //   description: error.message || 'Could not generate API key.',
      //   variant: 'destructive',
      // });
      alert(`Error Generating Key: ${error.message || "Could not generate API key."}`); // Basic fallback alert
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setIsRevoking(keyId);
    try {
      const response = await fetch(`/api/user/api-keys?keyId=${keyId}`, {
        method: "DELETE"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to revoke API key");
      }

      fetchApiKeys(); // Refresh the list
      // toast({ title: 'Success', description: 'API Key revoked.' }); // Commented out
      alert("API Key revoked."); // Basic fallback alert
    } catch (error: any) {
      console.error(error);
      // toast({ // Commented out
      //   title: 'Error Revoking Key',
      //   description: error.message || 'Could not revoke API key.',
      //   variant: 'destructive',
      // });
      alert(`Error Revoking Key: ${error.message || "Could not revoke API key."}`); // Basic fallback alert
    } finally {
      setIsRevoking(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        // toast({ title: 'Copied!', description: 'API key copied to clipboard.' }); // Commented out
        alert("API key copied to clipboard."); // Basic fallback alert
      })
      .catch(err => {
        console.error("Failed to copy text: ", err);
        // toast({ title: 'Copy Failed', description: 'Could not copy key.', variant: 'destructive' }); // Commented out
        alert("Copy Failed: Could not copy key."); // Basic fallback alert
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white">API Keys</h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Manage API keys for programmatic access. Remember to store generated keys securely, they will not be shown
          again.
        </p>
      </div>

      {/* Generate Key Form */}
      <form onSubmit={handleGenerateKey} className="flex items-end space-x-2">
        <div className="flex-grow">
          <label htmlFor="keyName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            New Key Name
          </label>
          <Input
            id="keyName"
            type="text"
            placeholder="e.g., My CLI Tool"
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            disabled={isGenerating}
            required
            className="w-full"
          />
        </div>
        <Button type="submit" disabled={isGenerating || !keyName.trim()}>
          {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Generate Key
        </Button>
      </form>

      {/* Display Newly Generated Key Modal */}
      {newlyGeneratedKey && (
        <Dialog open={!!newlyGeneratedKey} onOpenChange={() => setNewlyGeneratedKey(null)}>
          <DialogContent className="sm:max-w-[525px]">
            <div className="space-y-2 text-center sm:text-left">
              <DialogTitle>API Key Generated Successfully!</DialogTitle>
              <DialogDescription>
                {`Your new API key for "${newlyGeneratedKey.name}" has been generated.`}
                <span className="font-semibold text-red-600">
                  Please copy it now. You won&apos;t be able to see it again.
                </span>
              </DialogDescription>
            </div>
            <div className="my-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-md flex items-center justify-between space-x-2">
              <code className="text-sm font-mono break-all flex-grow">
                {showGeneratedKey ? newlyGeneratedKey.apiKey : "•".repeat(newlyGeneratedKey.apiKey.length)}
              </code>
              <div className="flex space-x-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  onClick={() => setShowGeneratedKey(!showGeneratedKey)}
                  title={showGeneratedKey ? "Hide Key" : "Show Key"}
                >
                  {showGeneratedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" onClick={() => copyToClipboard(newlyGeneratedKey.apiKey)} title="Copy Key">
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-4 flex justify-end space-x-2">
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* List Existing Keys */}
      <div className="mt-6">
        <h4 className="text-md font-medium leading-6 text-gray-900 dark:text-white mb-2">Existing Keys</h4>
        {isLoading ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
          </div>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">You haven&apos;t generated any API keys yet.</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            {/* Placeholder for Table */}
            {keys.map(key => (
              <div key={key.id} className="flex items-center justify-between p-3 border-b last:border-b-0">
                <div className="space-y-1">
                  <p className="font-medium">{key.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Created: {format(new Date(key.createdAt), "PPp")}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last Used: {key.lastUsed ? format(new Date(key.lastUsed), "PPp") : "Never"}
                  </p>
                </div>
                <div>
                  <Dialog>
                    {" "}
                    {/* Confirmation Dialog for Revoke */}
                    <DialogTrigger asChild>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={isRevoking === key.id}
                        aria-label={`Revoke key ${key.name}`}
                      >
                        {isRevoking === key.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <div className="space-y-2">
                        <DialogTitle>Revoke API Key?</DialogTitle>
                        <DialogDescription>
                          {`Are you sure you want to revoke the key "${key.name}"? This action cannot be undone.`}
                        </DialogDescription>
                      </div>
                      <div className="mt-4 flex justify-end space-x-2">
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button variant="danger" onClick={() => handleRevokeKey(key.id)} disabled={!!isRevoking}>
                          {isRevoking === key.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Revoke Key
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
          </div>
          /* Original Table Code Commented Out:
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell className="font-medium">{key.name}</TableCell>
                  <TableCell>{format(new Date(key.createdAt), 'PPpp')}</TableCell>
                  <TableCell>{key.lastUsed ? format(new Date(key.lastUsed), 'PPpp') : 'Never'}</TableCell>
                  <TableCell className="text-right">
                    <Dialog> 
                      <DialogTrigger asChild>
                        <Button
                           variant="destructive"
                           size="sm"
                           disabled={isRevoking === key.id}
                           aria-label={`Revoke key ${key.name}`}
                        >
                           {isRevoking === key.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Revoke API Key?</DialogTitle>
                          <DialogDescription>
                            {`Are you sure you want to revoke the key "${key.name}"? This action cannot be undone.`}
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                           <DialogClose asChild>
                             <Button variant="outline">Cancel</Button>
                           </DialogClose>
                           <Button variant="destructive" onClick={() => handleRevokeKey(key.id)} disabled={!!isRevoking}>
                             {isRevoking === key.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                             Revoke Key
                           </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          */
        )}
      </div>
    </div>
  );
};

export default ApiKeyManager;
