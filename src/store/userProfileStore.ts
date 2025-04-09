import create from 'zustand';
import { persist } from 'zustand/middleware';

interface UserProfileState {
  profileImage: string | null;
  setProfileImage: (image: string | null) => void;
}

// Store to share the profile image state between components
// with persistence in localStorage
const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      profileImage: null,
      setProfileImage: (image) => set({ profileImage: image }),
    }),
    {
      name: 'user-profile-storage', // name of the key in localStorage
      getStorage: () => localStorage, // use localStorage as storage
    }
  )
);

export default useUserProfileStore;
