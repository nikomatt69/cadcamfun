// src/components/notifications/NotificationCenter.tsx
import { useState } from 'react';
import NotificationIcon from './NotificationIcon';
import NotificationDropdown from './NotificationDropdown';

const NotificationCenter: React.FC = () => {
  return (
    <div className="relative">
      <NotificationIcon />
      <NotificationDropdown />
    </div>
  );
};

export default NotificationCenter;