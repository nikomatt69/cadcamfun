import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { DynamicLayout } from 'src/components/dynamic-imports';
import { 
  User, 
  Mail, 
  Key, 
  Upload, 
  Save, 
  AlertTriangle,
  CheckCircle 
} from 'react-feather';
import Loading from '@/src/components/ui/Loading';
import MetaTags from '@/src/components/layout/Metatags';
import useUserProfileStore from '@/src/store/userProfileStore';
import ImageService from '@/src/lib/imageService';
import toast from 'react-hot-toast';

interface ProfileSettingsForm {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  profileImage?: File | null;
}

export default function ProfileSettingsPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const { profileImage: storeProfileImage, setProfileImage: setStoreProfileImage } = useUserProfileStore();
  
  const [formData, setFormData] = useState<ProfileSettingsForm>({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    profileImage: null
  });
  
  const [message, setMessage] = useState<{ 
    type: 'success' | 'error'; 
    text: string 
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
      } else if (session?.user?.image) {
        // Use user profile image if available
        setProfileImage(session.user.image);
        setStoreProfileImage(session.user.image);
      }
    }
  }, [session, storeProfileImage, setStoreProfileImage]);

  // Load initial user data
  useEffect(() => {
    if (session?.user) {
      setFormData(prev => ({
        ...prev,
        name: session.user?.name || '',
        email: session.user?.email || ''
      }));
    }
  }, [session]);

  // Handle image upload
  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file
    if (!file.type.match('image.*')) {
      toast.error('Please select a valid image file');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be less than 2MB');
      return;
    }

    try {
      setIsUploading(true);
      
      // Get user ID or email as unique identifier
      const userId = session?.user?.email || 'anonymous-user';
      
      // Save image to localStorage as Base64
      const imageBase64 = await ImageService.saveImageToLocalStorage(file, userId);
      
      setProfileImage(imageBase64);
      setStoreProfileImage(imageBase64);
      
      // Also update form data for server upload
      setFormData(prev => ({
        ...prev,
        profileImage: file
      }));
      
      toast.success('Image uploaded successfully');
    } catch (error) {
      console.error('Error during upload:', error);
      toast.error('Error uploading image');
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle image removal
  const handleRemoveImage = () => {
    // Get user ID or email as unique identifier
    const userId = session?.user?.email || 'anonymous-user';
    
    // Remove image from localStorage
    ImageService.removeImageFromLocalStorage(userId);
    
    setProfileImage(null);
    setStoreProfileImage(null);
    
    // Also update form data
    setFormData(prev => ({
      ...prev,
      profileImage: null
    }));
    
    toast.success('Image removed');
  };

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle profile update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    // Validate form
    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setMessage({
        type: 'error', 
        text: 'New passwords do not match'
      });
      setIsLoading(false);
      return;
    }

    try {
      // Prepare form data
      const updateData = new FormData();
      updateData.append('name', formData.name);
      updateData.append('email', formData.email);
      
      // Add password fields if provided
      if (formData.currentPassword) {
        updateData.append('currentPassword', formData.currentPassword);
      }
      if (formData.newPassword) {
        updateData.append('newPassword', formData.newPassword);
      }

      // Add profile image if selected
      if (formData.profileImage) {
        updateData.append('profileImage', formData.profileImage);
      }

      // Send update request
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        body: updateData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to update profile');
      }

      // Update session with new data
      await update({
        name: result.name,
        email: result.email,
        image: result.image
      });

      // Show success message
      setMessage({
        type: 'success', 
        text: 'Profile updated successfully'
      });

      // Reset password fields
      setFormData(prev => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      }));
    } catch (error: any) {
      // Show error message
      setMessage({
        type: 'error', 
        text: error.message || 'An unexpected error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Redirect if not authenticated
  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center"><Loading/></div>;
  }

  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return null;
  }

  return (
    <>
      <MetaTags 
        title="Profile Settings" 
      />
      <DynamicLayout>
        <div className="p-6 max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile Settings</h1>
          
          {/* Message Banner */}
          {message && (
            <div 
              className={`mb-6 p-4 rounded-md ${
                message.type === 'success' 
                  ? 'bg-green-50 text-green-800' 
                  : 'bg-red-50 text-red-800'
              }`}
            >
              <div className="flex items-center">
                {message.type === 'success' ? (
                  <CheckCircle className="mr-2" size={20} />
                ) : (
                  <AlertTriangle className="mr-2" size={20} />
                )}
                {message.text}
              </div>
            </div>
          )}
          
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            {/* Profile Image */}
            <div className="col-span-full">
              <label htmlFor="photo" className="block text-sm font-medium text-gray-700">
                Profile Photo
              </label>
              <div className="mt-1 flex flex-col sm:flex-row items-start sm:items-center">
                <div className="relative group">
                  <span className="h-24 w-24 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                    {isUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white"></div>
                      </div>
                    ) : null}
                    {profileImage ? (
                      <img 
                        src={profileImage} 
                        alt="Profile" 
                        className="h-20 w-20 rounded-full object-cover"
                      />
                    ) : (
                      <svg className="h-20 w-20 rounded-full text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    )}
                  </span>
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 rounded-full bg-black bg-opacity-0 hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
                       onClick={() => fileInputRef.current?.click()}>
                    <div className="text-white text-xs font-medium">Change photo</div>
                  </div>
                </div>
                
                <div className="mt-4 sm:mt-0 sm:ml-5 flex flex-col space-y-2">
                  <input
                    type="file"
                    id="photo-upload"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto"
                  >
                    Upload new photo
                  </button>
                  {profileImage && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 w-full sm:w-auto"
                    >
                      Remove photo
                    </button>
                  )}
                  <p className="text-xs text-gray-500">
                    JPG, PNG or GIF. Max 2MB.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Personal Information */}
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Full Name
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    name="name"
                    id="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
              </div>
              
              <div className="sm:col-span-3">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <div className="mt-1">
                  <input
                    type="email"
                    name="email"
                    id="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  />
                </div>
              </div>
            </div>
            
            {/* Security Section */}
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Security Settings
              </h2>
              <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                <div className="sm:col-span-3">
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                    Current Password
                  </label>
                  <div className="mt-1">
                    <input
                      type="password"
                      name="currentPassword"
                      id="currentPassword"
                      value={formData.currentPassword}
                      onChange={handleChange}
                      placeholder="Enter current password to make changes"
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                <div className="sm:col-span-3">
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                    New Password
                  </label>
                  <div className="mt-1">
                    <input
                      type="password"
                      name="newPassword"
                      id="newPassword"
                      value={formData.newPassword}
                      onChange={handleChange}
                      placeholder="Leave blank if no change"
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>
                
                <div className="sm:col-span-3">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                    Confirm New Password
                  </label>
                  <div className="mt-1">
                    <input
                      type="password"
                      name="confirmPassword"
                      id="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm new password"
                      className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="pt-6">
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <Save className="mr-2 h-4 w-4" />
                {isLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </DynamicLayout>
    </>
  );
}