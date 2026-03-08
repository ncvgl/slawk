import { create } from 'zustand';
import { getSocket } from '@/lib/socket';

export interface HuddleParticipant {
  userId: number;
  name: string;
  avatar: string | null;
  isMuted: boolean;
  isVideoOn?: boolean;
  joinedAt: string;
}

interface PeerState {
  pc: RTCPeerConnection;
  audioElement: HTMLAudioElement | null;
  videoStream: MediaStream | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface HuddleState {
  userId: number | null;
  activeHuddles: Record<number, HuddleParticipant[]>;

  // Current user's active huddle
  currentChannelId: number | null;
  isMuted: boolean;
  isVideoOn: boolean;
  isJoining: boolean;
  localStream: MediaStream | null;
  peers: Map<number, PeerState>;
  error: string | null;

  // Actions
  joinHuddle: (channelId: number) => Promise<void>;
  leaveHuddle: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;

  // Socket event handlers
  onHuddleState: (data: { channelId: number; participants: HuddleParticipant[] }) => void;
  onHuddleActive: (data: { channelId: number; participantCount: number; participants: HuddleParticipant[] }) => void;
  onParticipantJoined: (data: { channelId: number; participant: HuddleParticipant }) => void;
  onParticipantLeft: (data: { channelId: number; userId: number }) => void;
  onMuteChanged: (data: { channelId: number; userId: number; isMuted: boolean }) => void;
  onVideoChanged: (data: { channelId: number; userId: number; isVideoOn: boolean }) => void;
  onSignal: (data: { channelId: number; fromUserId: number; signal: { type: string; sdp?: string; candidate?: unknown } }) => void;
  onHuddleEnded: (data: { channelId: number }) => void;
  cleanup: () => void;
}

export const useHuddleStore = create<HuddleState>((set, get) => ({
  userId: null,
  activeHuddles: {},
  currentChannelId: null,
  isMuted: false,
  isVideoOn: false,
  isJoining: false,
  localStream: null,
  peers: new Map(),
  error: null,

  joinHuddle: async (channelId: number) => {
    const state = get();
    if (state.isJoining) return;

    // Must leave current huddle first — don't silently switch
    if (state.currentChannelId && state.currentChannelId !== channelId) {
      set({ error: 'Leave your current huddle first' });
      return;
    }

    // Already in this huddle
    if (state.currentChannelId === channelId) return;

    set({ isJoining: true, error: null });

    try {
      // Start with audio only — camera is requested on-demand when user clicks video button
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      set({ localStream: stream, currentChannelId: channelId, isJoining: false, isMuted: false, isVideoOn: false });

      const socket = getSocket();
      if (socket) {
        socket.emit('huddle:join', { channelId });
      }
    } catch {
      set({ isJoining: false, error: 'Microphone access denied' });
    }
  },

  leaveHuddle: () => {
    const { currentChannelId } = get();
    if (!currentChannelId) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('huddle:leave', { channelId: currentChannelId });
    }

    get().cleanup();
  },

  toggleMute: () => {
    const { isMuted, localStream, currentChannelId } = get();
    if (!localStream || !currentChannelId) return;

    const newMuted = !isMuted;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !newMuted;
    });

    set({ isMuted: newMuted });

    const socket = getSocket();
    if (socket) {
      socket.emit('huddle:mute', { channelId: currentChannelId, isMuted: newMuted });
    }
  },

  toggleVideo: async () => {
    const { isVideoOn, localStream, currentChannelId } = get();
    if (!localStream || !currentChannelId) return;

    if (!isVideoOn) {
      // Turning video ON — check if we already have a video track
      const existingVideoTracks = localStream.getVideoTracks();
      if (existingVideoTracks.length > 0) {
        existingVideoTracks.forEach((t) => { t.enabled = true; });
      } else {
        // Request camera on-demand
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const videoTrack = videoStream.getVideoTracks()[0];
          localStream.addTrack(videoTrack);

          // Add video track to existing peer connections
          const { peers } = get();
          for (const [, peer] of peers) {
            peer.pc.addTrack(videoTrack, localStream);
          }
        } catch {
          set({ error: 'Camera access denied' });
          return;
        }
      }

      set({ isVideoOn: true });
      const socket = getSocket();
      if (socket) {
        socket.emit('huddle:video', { channelId: currentChannelId, isVideoOn: true });
      }
    } else {
      // Turning video OFF
      localStream.getVideoTracks().forEach((t) => { t.enabled = false; });
      set({ isVideoOn: false });
      const socket = getSocket();
      if (socket) {
        socket.emit('huddle:video', { channelId: currentChannelId, isVideoOn: false });
      }
    }
  },

  onHuddleState: (data) => {
    const { currentChannelId, localStream } = get();
    if (data.channelId !== currentChannelId || !localStream) return;

    set((s) => ({
      activeHuddles: { ...s.activeHuddles, [data.channelId]: data.participants },
    }));

    const myUserId = get().userId;
    if (!myUserId) return;

    for (const participant of data.participants) {
      if (participant.userId !== myUserId) {
        createPeerConnection(participant.userId, true);
      }
    }
  },

  onHuddleActive: (data) => {
    set((s) => ({
      activeHuddles: { ...s.activeHuddles, [data.channelId]: data.participants },
    }));
  },

  onParticipantJoined: (data) => {
    set((s) => {
      const existing = s.activeHuddles[data.channelId] || [];
      return {
        activeHuddles: {
          ...s.activeHuddles,
          [data.channelId]: [...existing.filter((p) => p.userId !== data.participant.userId), data.participant],
        },
      };
    });
  },

  onParticipantLeft: (data) => {
    set((s) => {
      const existing = s.activeHuddles[data.channelId] || [];
      return {
        activeHuddles: {
          ...s.activeHuddles,
          [data.channelId]: existing.filter((p) => p.userId !== data.userId),
        },
      };
    });

    const { peers } = get();
    const peer = peers.get(data.userId);
    if (peer) {
      peer.pc.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
      const newPeers = new Map(peers);
      newPeers.delete(data.userId);
      set({ peers: newPeers });
    }
  },

  onMuteChanged: (data) => {
    set((s) => {
      const existing = s.activeHuddles[data.channelId] || [];
      return {
        activeHuddles: {
          ...s.activeHuddles,
          [data.channelId]: existing.map((p) =>
            p.userId === data.userId ? { ...p, isMuted: data.isMuted } : p
          ),
        },
      };
    });
  },

  onVideoChanged: (data) => {
    set((s) => {
      const existing = s.activeHuddles[data.channelId] || [];
      return {
        activeHuddles: {
          ...s.activeHuddles,
          [data.channelId]: existing.map((p) =>
            p.userId === data.userId ? { ...p, isVideoOn: data.isVideoOn } : p
          ),
        },
      };
    });
  },

  onSignal: (data) => {
    const { currentChannelId, peers } = get();
    if (data.channelId !== currentChannelId) return;

    const { fromUserId, signal } = data;

    if (signal.type === 'offer') {
      const existingPeer = peers.get(fromUserId);
      if (existingPeer) {
        existingPeer.pc.close();
        if (existingPeer.audioElement) {
          existingPeer.audioElement.pause();
          existingPeer.audioElement.srcObject = null;
        }
      }
      const pc = createPeerConnection(fromUserId, false);
      if (!pc) return;

      const sdpDesc = new RTCSessionDescription({ type: 'offer', sdp: signal.sdp! });
      pc.setRemoteDescription(sdpDesc)
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          const socket = getSocket();
          if (socket && pc.localDescription) {
            socket.emit('huddle:signal', {
              channelId: currentChannelId,
              toUserId: fromUserId,
              signal: { type: 'answer', sdp: pc.localDescription.sdp },
            });
          }
        })
        .catch((err) => console.error('Huddle answer error:', err));
    } else if (signal.type === 'answer') {
      const peer = peers.get(fromUserId);
      if (peer) {
        const sdpDesc = new RTCSessionDescription({ type: 'answer', sdp: signal.sdp! });
        peer.pc.setRemoteDescription(sdpDesc).catch((err) => console.error('Huddle set answer error:', err));
      }
    } else if (signal.type === 'ice-candidate') {
      const peer = peers.get(fromUserId);
      if (peer && signal.candidate) {
        peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate as RTCIceCandidateInit))
          .catch((err) => console.error('Huddle ICE error:', err));
      }
    }
  },

  onHuddleEnded: (data) => {
    const { currentChannelId } = get();

    set((s) => {
      const updated = { ...s.activeHuddles };
      delete updated[data.channelId];
      return { activeHuddles: updated };
    });

    if (data.channelId === currentChannelId) {
      get().cleanup();
    }
  },

  cleanup: () => {
    const { peers, localStream } = get();

    for (const [, peer] of peers) {
      peer.pc.close();
      if (peer.audioElement) {
        peer.audioElement.pause();
        peer.audioElement.srcObject = null;
      }
    }

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }

    set({
      currentChannelId: null,
      isMuted: false,
      isVideoOn: false,
      localStream: null,
      peers: new Map(),
      error: null,
    });
  },
}));

function createPeerConnection(remoteUserId: number, isInitiator: boolean): RTCPeerConnection | null {
  const state = useHuddleStore.getState();
  const { localStream, currentChannelId, peers } = state;
  if (!localStream || !currentChannelId) return null;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  // Add all local tracks (audio + video)
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      const socket = getSocket();
      if (socket) {
        socket.emit('huddle:signal', {
          channelId: currentChannelId,
          toUserId: remoteUserId,
          signal: { type: 'ice-candidate', candidate: event.candidate.toJSON() },
        });
      }
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    const track = event.track;

    if (track.kind === 'audio') {
      const audio = document.createElement('audio');
      audio.srcObject = stream;
      audio.autoplay = true;
      audio.play().catch(() => {});

      const currentPeers = new Map(useHuddleStore.getState().peers);
      const existing = currentPeers.get(remoteUserId);
      if (existing) {
        existing.audioElement = audio;
      }
      useHuddleStore.setState({ peers: currentPeers });
    } else if (track.kind === 'video') {
      const currentPeers = new Map(useHuddleStore.getState().peers);
      const existing = currentPeers.get(remoteUserId);
      if (existing) {
        existing.videoStream = stream;
      }
      useHuddleStore.setState({ peers: currentPeers });
    }
  };

  const newPeers = new Map(peers);
  newPeers.set(remoteUserId, { pc, audioElement: null, videoStream: null });
  useHuddleStore.setState({ peers: newPeers });

  if (isInitiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        const socket = getSocket();
        if (socket && pc.localDescription) {
          socket.emit('huddle:signal', {
            channelId: currentChannelId,
            toUserId: remoteUserId,
            signal: { type: 'offer', sdp: pc.localDescription.sdp },
          });
        }
      })
      .catch((err) => console.error('Huddle offer error:', err));
  }

  return pc;
}

export function setHuddleUserId(userId: number): void {
  useHuddleStore.setState({ userId });
}
