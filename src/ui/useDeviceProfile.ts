import { useEffect, useState } from 'react';
import { getDeviceProfile, type DeviceProfile } from './deviceProfile';

export function useDeviceProfile(): DeviceProfile {
  const [profile, setProfile] = useState<DeviceProfile>(() => getDeviceProfile());

  useEffect(() => {
    const onResize = () => setProfile(getDeviceProfile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return profile;
}
