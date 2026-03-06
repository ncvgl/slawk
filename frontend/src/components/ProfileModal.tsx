import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MessageSquare, Camera } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getMyProfile, getUserProfile, updateMyProfile, uploadAvatar, type UserProfile } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { AvatarCropModal } from './AvatarCropModal';
import { format } from 'date-fns';

interface ProfileModalProps {
  userId?: number; // If provided, view another user's profile; otherwise view own
  onClose: () => void;
}

export function ProfileModal({ userId, onClose }: ProfileModalProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isOwnProfile = !userId || userId === currentUser?.id;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsLoading(true);
    const fetcher = isOwnProfile ? getMyProfile() : getUserProfile(userId!);
    setLoadError(null);
    fetcher
      .then((data) => {
        setProfile(data);
        setEditName(data.name);
        setEditBio(data.bio || '');
      })
      .catch(() => setLoadError('Failed to load profile.'))
      .finally(() => setIsLoading(false));
  }, [userId, isOwnProfile]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await updateMyProfile({
        name: editName.trim() || profile.name,
        bio: editBio.trim() || null,
      });
      setProfile(updated);
      setIsEditing(false);
      // Propagate name change to auth store and cached messages
      useAuthStore.getState().updateUser({ name: updated.name });
      useMessageStore.getState().updateUserInMessages(updated.id, { name: updated.name });
    } catch {
      setSaveError('Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate client-side
    if (!file.type.startsWith('image/')) {
      setSaveError('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSaveError('Image must be under 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  const handleCropDone = async (croppedBlob: Blob) => {
    setCropImageSrc(null);
    setIsUploadingAvatar(true);
    setSaveError(null);
    try {
      const updated = await uploadAvatar(croppedBlob);
      setProfile(updated);
      useAuthStore.getState().updateUser({ avatar: updated.avatar });
      useMessageStore.getState().updateUserInMessages(updated.id, { avatar: updated.avatar ?? undefined });
    } catch {
      setSaveError('Failed to upload photo. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
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
        <div className="flex items-center justify-between border-b border-slack-border-light px-5 py-4">
          <h2 className="text-[17px] font-bold text-slack-primary">Profile</h2>
          <Button variant="toolbar" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4 text-slack-hint" />
          </Button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slack-hint">Loading...</div>
        ) : loadError ? (
          <div className="p-8 text-center text-sm text-slack-error">{loadError}</div>
        ) : profile ? (
          <div className="p-5">
            {/* Avatar and name */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative group">
                <Avatar
                  src={profile.avatar}
                  alt={profile.name}
                  fallback={profile.name}
                  size="lg"
                  status={profile.status as any}
                />
                {isOwnProfile && isEditing && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Camera className="h-5 w-5 text-white" />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              <div>
                <p className="text-[18px] font-bold text-slack-primary">{profile.name}</p>
                <p className="text-[13px] text-slack-hint">{profile.email}</p>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-3">
                {/* Upload photo button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="text-[13px] text-slack-link hover:underline cursor-pointer"
                >
                  {isUploadingAvatar ? 'Uploading...' : 'Upload photo'}
                </button>

                <div>
                  <label className="text-[13px] font-medium text-slack-muted">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="mt-1 w-full rounded border border-slack-input-border px-3 py-2 text-[14px] outline-none focus:border-slack-link"
                  />
                </div>
                <div>
                  <label className="text-[13px] font-medium text-slack-muted">Bio</label>
                  <textarea
                    name="bio"
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell people about yourself"
                    rows={3}
                    className="mt-1 w-full rounded border border-slack-input-border px-3 py-2 text-[14px] outline-none focus:border-slack-link resize-none"
                  />
                </div>
                {saveError && (
                  <p className="text-[13px] text-slack-error">{saveError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                      setIsEditing(false);
                      setSaveError(null);
                      setEditName(profile.name);
                      setEditBio(profile.bio || '');
                    }}>
                    Cancel
                  </Button>
                  <Button size="sm" disabled={isSaving} onClick={handleSave}>
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Bio */}
                {profile.bio && (
                  <div className="mb-4">
                    <p className="text-[13px] font-medium text-slack-hint mb-1">Bio</p>
                    <p className="text-[14px] text-slack-primary">{profile.bio}</p>
                  </div>
                )}

                {/* Status */}
                <div className="mb-4">
                  <p className="text-[13px] font-medium text-slack-hint mb-1">Status</p>
                  <p className="text-[14px] text-slack-primary capitalize">{profile.status || 'offline'}</p>
                </div>

                {/* Joined date */}
                <div className="mb-4">
                  <p className="text-[13px] font-medium text-slack-hint mb-1">Joined</p>
                  <p className="text-[14px] text-slack-primary">
                    {format(new Date(profile.createdAt), 'MMMM d, yyyy')}
                  </p>
                </div>

                {/* Message button for other users */}
                {!isOwnProfile && profile && (
                  <Button
                    data-testid="profile-message-btn"
                    variant="outline"
                    className="w-full mb-2"
                    onClick={() => {
                      useChannelStore.getState().startDM(profile.id, profile.name, profile.avatar ?? undefined);
                      navigate(`/d/${profile.id}`);
                      onClose();
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Message
                  </Button>
                )}

                {/* Edit button for own profile */}
                {isOwnProfile && (
                  <Button variant="outline" className="w-full" onClick={() => setIsEditing(true)}>
                    Edit Profile
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slack-hint">Profile not found</div>
        )}
      </div>

      {/* Avatar crop modal */}
      {cropImageSrc && (
        <AvatarCropModal
          imageSrc={cropImageSrc}
          onCrop={handleCropDone}
          onClose={() => setCropImageSrc(null)}
        />
      )}
    </div>
  );
}
