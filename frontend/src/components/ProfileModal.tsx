import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { getMyProfile, getUserProfile, updateMyProfile, type UserProfile } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { format } from 'date-fns';

interface ProfileModalProps {
  userId?: number; // If provided, view another user's profile; otherwise view own
  onClose: () => void;
}

export function ProfileModal({ userId, onClose }: ProfileModalProps) {
  const currentUser = useAuthStore((s) => s.user);
  const isOwnProfile = !userId || userId === currentUser?.id;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    const fetcher = isOwnProfile ? getMyProfile() : getUserProfile(userId!);
    fetcher
      .then((data) => {
        setProfile(data);
        setEditName(data.name);
        setEditBio(data.bio || '');
      })
      .catch((err) => console.error('Failed to load profile:', err))
      .finally(() => setIsLoading(false));
  }, [userId, isOwnProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const updated = await updateMyProfile({
        name: editName.trim() || profile.name,
        bio: editBio.trim() || null,
      });
      setProfile(updated);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        data-testid="profile-modal"
        className="relative w-[400px] rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[17px] font-bold text-[#1D1C1D]">Profile</h2>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading...</div>
        ) : profile ? (
          <div className="p-5">
            {/* Avatar and name */}
            <div className="flex items-center gap-4 mb-4">
              <Avatar
                src={profile.avatar}
                alt={profile.name}
                fallback={profile.name}
                size="lg"
                status={profile.status as any}
              />
              <div>
                <p className="text-[18px] font-bold text-[#1D1C1D]">{profile.name}</p>
                <p className="text-[13px] text-gray-500">{profile.email}</p>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[13px] font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-[14px] outline-none focus:border-[#1264A3]"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-medium text-gray-700">Bio</label>
                  <textarea
                    name="bio"
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell people about yourself"
                    rows={3}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-[14px] outline-none focus:border-[#1264A3] resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditName(profile.name);
                      setEditBio(profile.bio || '');
                    }}
                    className="rounded px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="rounded bg-[#007a5a] px-4 py-1.5 text-[13px] text-white hover:bg-[#005e46] disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Bio */}
                {profile.bio && (
                  <div className="mb-4">
                    <p className="text-[13px] font-medium text-gray-500 mb-1">Bio</p>
                    <p className="text-[14px] text-[#1D1C1D]">{profile.bio}</p>
                  </div>
                )}

                {/* Status */}
                <div className="mb-4">
                  <p className="text-[13px] font-medium text-gray-500 mb-1">Status</p>
                  <p className="text-[14px] text-[#1D1C1D] capitalize">{profile.status || 'offline'}</p>
                </div>

                {/* Joined date */}
                <div className="mb-4">
                  <p className="text-[13px] font-medium text-gray-500 mb-1">Joined</p>
                  <p className="text-[14px] text-[#1D1C1D]">
                    {format(new Date(profile.createdAt), 'MMMM d, yyyy')}
                  </p>
                </div>

                {/* Edit button for own profile */}
                {isOwnProfile && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full rounded border border-gray-300 py-2 text-[13px] font-medium text-[#1D1C1D] hover:bg-gray-50"
                  >
                    Edit Profile
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-gray-500">Profile not found</div>
        )}
      </div>
    </div>
  );
}
