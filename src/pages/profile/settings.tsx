import { useState, useEffect, useRef, ChangeEvent } from "react";

import { useRouter } from "next/router";
import { DynamicLayout } from "src/components/dynamic-imports";
import { User, Mail, Key, Upload, Save, AlertTriangle, CheckCircle, Camera, X } from "react-feather";
import Loading from "@/src/components/ui/Loading";
import MetaTags from "@/src/components/layout/Metatags";
import useUserProfileStore from "@/src/store/userProfileStore";
import ImageService from "@/src/lib/imageService";
import toast from "react-hot-toast";
import Layout from "@/src/components/layout/Layout";
import ApiKeyManager from "@/src/components/settings/ApiKeyManager";
import { useSession } from "@/src/lib/auth-client";

interface ProfileSettingsForm {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  profileImage?: File | null;
}

export default function ProfileSettingsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const { profileImage: storeProfileImage, setProfileImage: setStoreProfileImage } = useUserProfileStore();

  const [formData, setFormData] = useState<ProfileSettingsForm>({
    name: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    profileImage: null
  });

  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load profile image from store or localStorage
  useEffect(() => {
    if (storeProfileImage) {
      setProfileImage(storeProfileImage);
    } else if (session?.user?.email) {
      // Check if image exists in localStorage
      const savedImage = ImageService.getImageFromLocalStorage(session.user.email);
      if (savedImage) {
        setProfileImage(savedImage);
        setStoreProfileImage(savedImage);
      } else if (session?.user?.name) {
        // Use user profile image if available
        setProfileImage("https://ui-avatars.com/api/?name=" + session.user.name.charAt(0));
        setStoreProfileImage("https://ui-avatars.com/api/?name=" + session.user.name.charAt(0));
      }
    }
  }, [session, storeProfileImage, setStoreProfileImage]);

  // Load initial user data
  useEffect(() => {
    if (session?.user) {
      setFormData(prev => ({
        ...prev,
        name: session.user?.name || "",
        email: session.user?.email || ""
      }));
    }
  }, [session]);

  // Handle image upload
  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.match("image.*")) {
      toast.error("Please select a valid image file");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be less than 2MB");
      return;
    }

    try {
      setIsUploading(true);

      // Get user ID or email as unique identifier
      const userId = session?.user?.email || "anonymous-user";

      // Save image to localStorage as Base64
      const imageBase64 = await ImageService.saveImageToLocalStorage(file, userId);

      setProfileImage(imageBase64);
      setStoreProfileImage(imageBase64);

      // Also update form data for server upload
      setFormData(prev => ({
        ...prev,
        profileImage: file
      }));

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error("Error during upload:", error);
      toast.error("Error uploading image");
    } finally {
      setIsUploading(false);
    }
  };

  // Handle image removal
  const handleRemoveImage = () => {
    // Get user ID or email as unique identifier
    const userId = session?.user?.email || "anonymous-user";

    // Remove image from localStorage
    ImageService.removeImageFromLocalStorage(userId);

    setProfileImage(null);
    setStoreProfileImage(null);

    // Also update form data
    setFormData(prev => ({
      ...prev,
      profileImage: null
    }));

    toast.success("Image removed");
  };

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle profile update (separato da password)
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      // Prepare form data (solo per profilo, non password)
      const updateData = new FormData();
      updateData.append("name", formData.name);
      updateData.append("email", formData.email);

      // Add profile image if selected
      if (formData.profileImage) {
        updateData.append("profileImage", formData.profileImage);
      }

      // Send update request
      const response = await fetch("/api/user/profile", {
        method: "PUT",
        body: updateData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update profile");
      }
      // Update session with new data
      if (session?.user) {
        ({
          name: result.name,
          email: result.email,
          image: result.image || undefined
        });
      }

      // Show success message
      setMessage({
        type: "success",
        text: "Profile updated successfully"
      });
    } catch (error: any) {
      // Show error message
      setMessage({
        type: "error",
        text: error.message || "An unexpected error occurred"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle password update (separato dal profilo)
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Validate form
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage({
        type: "error",
        text: "New passwords do not match"
      });
      setIsLoading(false);
      return;
    }

    if (!formData.currentPassword || !formData.newPassword) {
      setMessage({
        type: "error",
        text: "Please fill in all password fields"
      });
      setIsLoading(false);
      return;
    }

    try {
      // Send password update request to the correct endpoint
      const response = await fetch("/api/user/password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to update password");
      }

      // Show success message
      setMessage({
        type: "success",
        text: "Password updated successfully"
      });

      // Reset password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      }));
    } catch (error: any) {
      // Show error message
      setMessage({
        type: "error",
        text: error.message || "An unexpected error occurred"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Redirect if not authenticated
  if (!session) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loading />
      </div>
    );
  }

  return (
    <>
      <MetaTags ogImage="/og-image.png" title="Profile Settings" />
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile Settings</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Manage your account settings and preferences
              </p>
            </div>

            {/* Message Banner */}
            {message && (
              <div
                className={`mb-6 p-4 rounded-lg border transition-all duration-300 ${message.type === "success"
                  ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
                  : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
                  }`}
              >
                <div className="flex items-center">
                  {message.type === "success" ? (
                    <CheckCircle className="mr-3 h-5 w-5" />
                  ) : (
                    <AlertTriangle className="mr-3 h-5 w-5" />
                  )}
                  <span className="font-medium">{message.text}</span>
                </div>
              </div>
            )}

            <div className="space-y-8">
              {/* Profile Information Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Profile Information</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Update your personal information and profile photo
                  </p>
                </div>

                <form onSubmit={handleUpdateProfile} className="p-6">
                  {/* Profile Image Section */}
                  <div className="mb-8">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                      Profile Photo
                    </label>
                    <div className="flex items-center space-x-6">
                      <div className="relative group">
                        <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-r from-blue-500 to-purple-600 p-0.5">
                          <div className="w-full h-full rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            {profileImage ? (
                              <img
                                src={profileImage}
                                alt="Profile"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-8 h-8 text-gray-400" />
                            )}
                          </div>
                        </div>
                        {/* Upload overlay */}
                        <div className="absolute inset-0 rounded-full bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          onClick={() => fileInputRef.current?.click()}>
                          <Camera className="w-6 h-6 text-white" />
                        </div>
                      </div>

                      <div className="flex flex-col space-y-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isUploading}
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          {isUploading ? "Uploading..." : "Change Photo"}
                        </button>
                        {profileImage && (
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="inline-flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isUploading}
                          >
                            <X className="w-4 h-4 mr-2" />
                            Remove Photo
                          </button>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          JPG, PNG or GIF. Max size 2MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Personal Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Full Name
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="text"
                          name="name"
                          id="name"
                          className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
                          placeholder="Enter your full name"
                          value={formData.name}
                          onChange={handleChange}
                          disabled={isLoading}
                          required
                        />
                      </div>
                      {!formData.name.trim() && (
                        <p className="mt-1 text-xs text-red-500">Name is required</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="email"
                          name="email"
                          id="email"
                          className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 cursor-not-allowed"
                          placeholder="Email address"
                          value={formData.email}
                          onChange={handleChange}
                          disabled
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Email cannot be changed for security reasons
                      </p>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={isLoading || !formData.name.trim()}
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Security Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Security</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Update your password to keep your account secure
                  </p>
                </div>

                <form onSubmit={handleUpdatePassword} className="p-6">
                  <div className="space-y-6">
                    <div>
                      <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Current Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Key className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                          type="password"
                          name="currentPassword"
                          id="currentPassword"
                          className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
                          placeholder="Enter current password"
                          value={formData.currentPassword}
                          onChange={handleChange}
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          New Password
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Key className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="password"
                            name="newPassword"
                            id="newPassword"
                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
                            placeholder="Enter new password"
                            value={formData.newPassword}
                            onChange={handleChange}
                            disabled={isLoading}
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Key className="h-5 w-5 text-gray-400" />
                          </div>
                          <input
                            type="password"
                            name="confirmPassword"
                            id="confirmPassword"
                            className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors duration-200"
                            placeholder="Confirm new password"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                      <div className="flex">
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5 mr-3" />
                        <div>
                          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Password Requirements
                          </h3>
                          <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
                            <ul className="list-disc list-inside space-y-1">
                              <li>At least 8 characters long</li>
                              <li>Include uppercase and lowercase letters</li>
                              <li>Include at least one number</li>
                              <li>Include at least one special character</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isLoading || !formData.currentPassword || !formData.newPassword}
                      >
                        {isLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Updating Password...
                          </>
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Update Password
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* API Key Manager Card */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Keys</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage your API keys for external integrations
                  </p>
                </div>
                <div className="p-6">
                  <ApiKeyManager />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    </>
  );
}
