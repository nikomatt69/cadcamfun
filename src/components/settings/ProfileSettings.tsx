import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UserIcon,
  CameraIcon,
  MapPinIcon,
  CalendarIcon,
  GlobeIcon,
  CheckCircleIcon,
  XCircleIcon,
  LinkIcon,
  StarIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  PenToolIcon,
  SettingsIcon,
  ClockIcon
} from 'lucide-react';
import { useSession } from '@/src/lib/auth-client';
import { useAuthPreferences } from '@/src/store/authStore';
import toast from 'react-hot-toast';
import useUserProfileStore from '@/src/store/userProfileStore';
import ImageService from '@/src/lib/imageService';

interface ProfileData {
  name: string;
  email: string;
  bio: string;
  location: string;
  website: string;
  company: string;
  title: string;
  skills: string[];
  socialLinks: {
    github?: string;
    linkedin?: string;
    twitter?: string;
  };
  publicProfile: boolean;
  showEmail: boolean;
}

interface UserStats {
  projectsCount: number;
  drawingsCount: number;
  toolpathsCount: number;
  componentsCount: number;
  totalDesigns: number;
  memberSince: string;
}

const skillSuggestions = [
  'CAD Design', 'CAM Programming', '3D Modeling', 'CNC Machining',
  'SolidWorks', 'AutoCAD', 'Fusion 360', 'Mastercam',
  'Manufacturing', 'Product Design', 'Mechanical Engineering',
  'Prototyping', 'Quality Control', 'G-Code Programming'
];

export default function ProfileSettings() {
  const { data: session } = useSession();
  const { preferences, updatePreferences } = useAuthPreferences();
  const { profileImage, setProfileImage } = useUserProfileStore();

  const [profileData, setProfileData] = useState<ProfileData>({
    name: session?.user?.name || '',
    email: session?.user?.email || '',
    bio: '',
    location: '',
    website: '',
    company: '',
    title: '',
    skills: [],
    socialLinks: {},
    publicProfile: true,
    showEmail: false
  });

  const [userStats, setUserStats] = useState<UserStats>({
    projectsCount: 0,
    drawingsCount: 0,
    toolpathsCount: 0,
    componentsCount: 0,
    totalDesigns: 0,
    memberSince: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [errors, setErrors] = useState<Partial<ProfileData>>({});
  const [newSkill, setNewSkill] = useState('');
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session?.user) {
      loadProfileData();
      loadUserStats();
    }
  }, [session]);

  const loadProfileData = async () => {
    try {
      const response = await fetch('/api/user/profile');
      if (response.ok) {
        const userData = await response.json();
        setProfileData({
          name: userData.name || '',
          email: userData.email || '',
          bio: userData.bio || '',
          location: userData.location || '',
          website: userData.website || '',
          company: userData.company || '',
          title: userData.title || '',
          skills: [], // Will be loaded from a separate endpoint/field later
          socialLinks: {},
          publicProfile: userData.publicProfile ?? true,
          showEmail: userData.showEmail ?? false
        });
      }
    } catch (error) {
      console.error('Failed to load profile data:', error);
    }
  };

  const loadUserStats = async () => {
    setIsLoadingStats(true);
    try {
      const response = await fetch('/api/user/stats');
      if (response.ok) {
        const stats = await response.json();
        setUserStats(stats);
      }
    } catch (error) {
      console.error('Failed to load user stats:', error);
      // Keep default values if API fails
    } finally {
      setIsLoadingStats(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<ProfileData> = {};

    if (!profileData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (profileData.website && !isValidUrl(profileData.website)) {
      newErrors.website = 'Please enter a valid URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors before saving');
      return;
    }

    try {
      setIsUploading(true);

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: profileData.name,
          bio: profileData.bio,
          location: profileData.location,
          website: profileData.website,
          company: profileData.company,
          title: profileData.title,
          publicProfile: profileData.publicProfile,
          showEmail: profileData.showEmail
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Profile updated successfully');
        setIsEditing(false);
        await loadProfileData(); // Reload to get updated data
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
      toast.error('Please select a valid image file');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be smaller than 2MB');
      return;
    }

    try {
      setIsUploading(true);
      const userId = session?.user?.email || 'anonymous-user';
      const imageBase64 = await ImageService.saveImageToLocalStorage(file, userId);
      setProfileImage(imageBase64);
      toast.success('Image uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = () => {
    const userId = session?.user?.email || 'anonymous-user';
    ImageService.removeImageFromLocalStorage(userId);
    setProfileImage(null);
    toast.success('Image removed');
  };

  const addSkill = (skill: string) => {
    if (skill && !profileData.skills.includes(skill)) {
      setProfileData(prev => ({
        ...prev,
        skills: [...prev.skills, skill]
      }));
      setNewSkill('');
      setShowSkillSuggestions(false);
    }
  };

  const removeSkill = (skillToRemove: string) => {
    setProfileData(prev => ({
      ...prev,
      skills: prev.skills.filter(skill => skill !== skillToRemove)
    }));
  };

  const getProfileCompleteness = (): number => {
    const fields = [
      profileData.name,
      profileData.bio,
      profileData.location,
      profileData.title,
      profileData.skills.length > 0 ? 'skills' : '',
      profileImage
    ];
    const completedFields = fields.filter(field => field).length;
    return Math.round((completedFields / fields.length) * 100);
  };

  const formatMemberSince = (dateString: string): string => {
    if (!dateString) return 'Recently';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <UserIcon className="h-7 w-7 mr-3 text-blue-500" />
            Profile Information
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage your public profile and professional information
          </p>
        </div>

        <motion.button
          onClick={() => setIsEditing(!isEditing)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${isEditing
            ? 'bg-gray-600 hover:bg-gray-700 text-white'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
        >
          {isEditing ? 'Cancel' : 'Edit Profile'}
        </motion.button>
      </div>

      {/* Profile Completeness */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-blue-900 dark:text-blue-200">Profile Completeness</h3>
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{getProfileCompleteness()}%</span>
        </div>
        <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${getProfileCompleteness()}%` }}
          />
        </div>
        <p className="text-sm text-blue-700 dark:text-blue-300 mt-2">
          Complete your profile to help others connect with you
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Photo & Basic Info */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {/* Profile Photo */}
            <div className="text-center">
              <div className="relative inline-block">
                <div className="h-32 w-32 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-900 mx-auto">
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-full z-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white" />
                    </div>
                  )}
                  {profileImage ? (
                    <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <UserIcon className="h-16 w-16 text-gray-400" />
                    </div>
                  )}
                </div>

                {isEditing && (
                  <motion.button
                    onClick={() => fileInputRef.current?.click()}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="absolute bottom-2 right-2 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg"
                  >
                    <CameraIcon className="h-4 w-4" />
                  </motion.button>
                )}
              </div>

              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
              />

              {isEditing && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Upload Photo
                  </button>
                  {profileImage && (
                    <button
                      onClick={handleRemoveImage}
                      className="w-full py-2 px-4 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/40 text-red-700 dark:text-red-400 rounded-lg text-sm font-medium transition-colors"
                    >
                      Remove Photo
                    </button>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    JPG, PNG, or GIF. Max 2MB.
                  </p>
                </div>
              )}
            </div>

            {/* Profile Stats */}
            <div className="mt-6">
              {isLoadingStats ? (
                <div className="animate-pulse">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </div>
                    <div className="text-center">
                      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center">
                        <FolderIcon className="h-5 w-5 mr-1 text-blue-500" />
                        {userStats.projectsCount}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Projects</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 dark:text-white flex items-center justify-center">
                        <PenToolIcon className="h-5 w-5 mr-1 text-green-500" />
                        {userStats.totalDesigns}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">Designs</div>
                    </div>
                  </div>

                  {(userStats.drawingsCount > 0 || userStats.toolpathsCount > 0) && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="text-center">
                          <div className="font-semibold text-gray-900 dark:text-white">{userStats.drawingsCount}</div>
                          <div className="text-gray-500 dark:text-gray-400">Drawings</div>
                        </div>
                        <div className="text-center">
                          <div className="font-semibold text-gray-900 dark:text-white">{userStats.toolpathsCount}</div>
                          <div className="text-gray-500 dark:text-gray-400">Toolpaths</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                      <ClockIcon className="h-4 w-4 mr-1" />
                      Member since {formatMemberSince(userStats.memberSince)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Badges */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Achievements</h4>
              <div className="flex flex-wrap gap-2">
                {userStats.totalDesigns >= 10 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                    <StarIcon className="h-3 w-3 mr-1" />
                    Expert Designer
                  </span>
                )}
                {userStats.projectsCount >= 5 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                    <TrendingUpIcon className="h-3 w-3 mr-1" />
                    Active Creator
                  </span>
                )}
                {session?.user && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                    <ShieldCheckIcon className="h-3 w-3 mr-1" />
                    Verified User
                  </span>
                )}
                {userStats.toolpathsCount >= 3 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                    <SettingsIcon className="h-3 w-3 mr-1" />
                    CAM Expert
                  </span>
                )}
                {userStats.totalDesigns >= 50 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400">
                    <StarIcon className="h-3 w-3 mr-1" />
                    Master Designer
                  </span>
                )}
                {userStats.projectsCount === 0 && userStats.totalDesigns === 0 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    <UserIcon className="h-3 w-3 mr-1" />
                    New Member
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Profile Details */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                      disabled={!isEditing}
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!isEditing ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        } ${errors.name ? 'border-red-500' : ''}`}
                    />
                    {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Email cannot be changed</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Job Title
                    </label>
                    <input
                      type="text"
                      value={profileData.title}
                      onChange={(e) => setProfileData(prev => ({ ...prev, title: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="e.g., CAD Designer"
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!isEditing ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Company
                    </label>
                    <input
                      type="text"
                      value={profileData.company}
                      onChange={(e) => setProfileData(prev => ({ ...prev, company: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="Your company name"
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!isEditing ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <MapPinIcon className="h-4 w-4 inline mr-1" />
                      Location
                    </label>
                    <input
                      type="text"
                      value={profileData.location}
                      onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="City, Country"
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!isEditing ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        }`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      <GlobeIcon className="h-4 w-4 inline mr-1" />
                      Website
                    </label>
                    <input
                      type="url"
                      value={profileData.website}
                      onChange={(e) => setProfileData(prev => ({ ...prev, website: e.target.value }))}
                      disabled={!isEditing}
                      placeholder="https://yourwebsite.com"
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white ${!isEditing ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                        } ${errors.website ? 'border-red-500' : ''}`}
                    />
                    {errors.website && <p className="mt-1 text-sm text-red-600">{errors.website}</p>}
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Bio
                </label>
                <textarea
                  value={profileData.bio}
                  onChange={(e) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
                  disabled={!isEditing}
                  rows={4}
                  placeholder="Tell us about yourself, your experience, and what you're passionate about..."
                  className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none ${!isEditing ? 'cursor-not-allowed bg-gray-50 dark:bg-gray-800' : 'focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
                    }`}
                />
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {profileData.bio.length}/500 characters
                </p>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Skills & Expertise
                </label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {profileData.skills.map((skill) => (
                    <motion.span
                      key={skill}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400"
                    >
                      {skill}
                      {isEditing && (
                        <button
                          onClick={() => removeSkill(skill)}
                          className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                        >
                          <XCircleIcon className="h-4 w-4" />
                        </button>
                      )}
                    </motion.span>
                  ))}
                </div>

                {isEditing && (
                  <div className="relative">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onFocus={() => setShowSkillSuggestions(true)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSkill(newSkill);
                        }
                      }}
                      placeholder="Add a skill..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />

                    {showSkillSuggestions && (
                      <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {skillSuggestions
                          .filter(skill =>
                            skill.toLowerCase().includes(newSkill.toLowerCase()) &&
                            !profileData.skills.includes(skill)
                          )
                          .map(skill => (
                            <button
                              key={skill}
                              onClick={() => addSkill(skill)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm text-gray-900 dark:text-white"
                            >
                              {skill}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Privacy Settings */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Privacy Settings</h4>
                <div className="space-y-3">
                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      <EyeIcon className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-sm text-gray-900 dark:text-white">Public Profile</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData(prev => ({ ...prev, publicProfile: !prev.publicProfile }))}
                      disabled={!isEditing}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${profileData.publicProfile ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                        } ${!isEditing ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${profileData.publicProfile ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </label>

                  <label className="flex items-center justify-between">
                    <div className="flex items-center">
                      {profileData.showEmail ? <EyeIcon className="h-4 w-4 mr-2 text-gray-500" /> : <EyeOffIcon className="h-4 w-4 mr-2 text-gray-500" />}
                      <span className="text-sm text-gray-900 dark:text-white">Show Email</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileData(prev => ({ ...prev, showEmail: !prev.showEmail }))}
                      disabled={!isEditing}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${profileData.showEmail ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                        } ${!isEditing ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${profileData.showEmail ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex justify-end space-x-3"
          >
            <button
              onClick={() => setIsEditing(false)}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isUploading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center"
            >
              {isUploading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />}
              Save Changes
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
} 