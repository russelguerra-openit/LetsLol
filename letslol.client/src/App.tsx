import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack, TextField, Typography, useMediaQuery } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { startHubConnection, stopHubConnection, getHubConnection } from './signalr/hubConnection';
import './App.css';

type AvatarPosition = { x: number; y: number };
type AvatarBodyStyle = 'relaxed' | 'blazer' | 'hoodie';
type AvatarAccessory = 'none' | 'glasses' | 'headset';
type AvatarAppearance = {
    skinTone: string;
    bodyStyle: AvatarBodyStyle;
    topColor: string;
    bottomColor: string;
    accessory: AvatarAccessory;
    accentColor: string;
};
type AvatarVisual = { ring: Graphics; body: Container; label: Text; speakingBadge: Graphics; target: AvatarPosition; appearance: AvatarAppearance };
type RemoteScreenShare = { peerId: string; stream: MediaStream };
type RemoteScreenShareStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';
type ToastSeverity = 'info' | 'success' | 'warning' | 'error';
type ToastMessage = { id: string; message: string; severity: ToastSeverity };
type ScreenShareRegistrationResult = { accepted: boolean; activeSharerConnectionId: string | null; activeSessionId: string | null };
type SignalrStatus = 'idle' | 'connecting' | 'connected' | 'error';
type VoiceStatus = 'idle' | 'joining' | 'ready' | 'error';
type SpeechMeter = { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> };
type RectArea = { x: number; y: number; width: number; height: number };
const PLAYER_NAME_STORAGE_KEY = 'letslol.playerName';
const PLAYER_APPEARANCE_STORAGE_KEY = 'letslol.avatarAppearance';
const PREFERRED_MIC_DEVICE_STORAGE_KEY = 'letslol.preferredMicDeviceId';
const PREFERRED_OUTPUT_DEVICE_STORAGE_KEY = 'letslol.preferredOutputDeviceId';
const WORLD_WIDTH = 2140;
const WORLD_HEIGHT = 860;
const CAMERA_ZOOM = 1.35;
const CAMERA_EDGE_PADDING_RATIO = 0.24;
const PLAYER_SPEED_PX_PER_SEC = 210;
const PLAYER_SPRINT_MULTIPLIER = 2;
const POSITION_BROADCAST_INTERVAL_MS = 50;
const PROXIMITY_CONNECT_THRESHOLD = 70;
const PROXIMITY_DISCONNECT_THRESHOLD = 85;
const PROXIMITY_CONNECT_DELAY_MS = 1200;
const PROXIMITY_RING_RADIUS = 40;
const REMOTE_SMOOTHING_SPEED = 14;
const VOICE_SYNC_INTERVAL_MS = 120;
const PEER_RECONNECT_COOLDOWN_MS = 1500;
const SPEECH_ACTIVITY_THRESHOLD = 0.03;
const SPEECH_HOLD_MS = 220;
const AVATAR_COLLISION_RADIUS = 12;
const OFFICE_TABLE_RECTS: RectArea[] = [
    { x: 570, y: 110, width: 400, height: 280 },
];
const CONFERENCE_ROOM_RECT: RectArea = { x: WORLD_WIDTH - 596, y: 30, width: 568, height: 530 };
const CONFERENCE_TABLE_RECT: RectArea = {
    x: CONFERENCE_ROOM_RECT.x + ((CONFERENCE_ROOM_RECT.width - 300) / 2),
    y: 220,
    width: 300,
    height: 150,
};
const CONFERENCE_DOOR_RECT: RectArea = { x: CONFERENCE_ROOM_RECT.x, y: 220, width: 52, height: 110 };
const BREAK_QUIET_ZONE_RECT: RectArea = { x: 1268, y: 644, width: 360, height: 132 };
const OFFICE_CUBICLE_PODS: RectArea[] = [
    { x: 44, y: 54, width: 212, height: 138 },
    { x: 44, y: 218, width: 212, height: 138 },
    { x: 44, y: 382, width: 212, height: 138 },
];
const OFFICE_CUBICLE_BLOCKER_RECTS: RectArea[] = OFFICE_CUBICLE_PODS.flatMap(({ x, y, width, height }) => [
    { x, y, width, height: 12 },
    { x, y, width: 12, height },
    { x, y: y + height - 12, width, height: 12 },
    { x: x + width - 12, y, width: 12, height: 42 },
    { x: x + width - 12, y: y + 94, width: 12, height: height - 94 },
    { x: x + 30, y: y + 22, width: 116, height: 32 },
]);
const CONFERENCE_WALL_RECTS: RectArea[] = [
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_ROOM_RECT.y, width: CONFERENCE_ROOM_RECT.width, height: 18 },
    { x: CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 18, y: CONFERENCE_ROOM_RECT.y, width: 18, height: CONFERENCE_ROOM_RECT.height },
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_ROOM_RECT.y + CONFERENCE_ROOM_RECT.height - 18, width: CONFERENCE_ROOM_RECT.width, height: 18 },
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_ROOM_RECT.y, width: 18, height: 190 },
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_DOOR_RECT.y + CONFERENCE_DOOR_RECT.height, width: 18, height: 230 },
];
const OFFICE_BLOCKER_RECTS: RectArea[] = [
    ...OFFICE_TABLE_RECTS,
    ...OFFICE_CUBICLE_BLOCKER_RECTS,
    CONFERENCE_TABLE_RECT,
    ...CONFERENCE_WALL_RECTS,
];
const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = {
    skinTone: '#f0c8a0',
    bodyStyle: 'relaxed',
    topColor: '#e4572e',
    bottomColor: '#2f3b52',
    accessory: 'none',
    accentColor: '#66b0ff',
};
const AVATAR_SKIN_TONES = ['#f6d8bf', '#e8bc96', '#d39c72', '#b9734e', '#8a5638'];
const AVATAR_CLOTHING_COLORS = ['#e4572e', '#17bebb', '#ff9f1c', '#5f0f40', '#3a86ff', '#2a9d8f', '#6f8f42', '#a44a3f'];
const AVATAR_ACCENT_COLORS = ['#66b0ff', '#8fe388', '#f2be66', '#d59cff', '#ff8b94'];
const AVATAR_STYLE_OPTIONS: Array<{ value: AvatarBodyStyle; label: string }> = [
    { value: 'relaxed', label: 'Relaxed' },
    { value: 'blazer', label: 'Blazer' },
    { value: 'hoodie', label: 'Hoodie' },
];
const AVATAR_ACCESSORY_OPTIONS: Array<{ value: AvatarAccessory; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'glasses', label: 'Glasses' },
    { value: 'headset', label: 'Headset' },
];

const turnUrls = ((import.meta.env['VITE_TURN_URLS'] as string | undefined) ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
const turnUsername = (import.meta.env['VITE_TURN_USERNAME'] as string | undefined) ?? '';
const turnCredential = (import.meta.env['VITE_TURN_CREDENTIAL'] as string | undefined) ?? '';

const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

if (turnUrls.length > 0 && turnUsername && turnCredential) {
    iceServers.push({
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential,
    });
}

const WEBRTC_CONFIG: RTCConfiguration = { iceServers };

const isInsideExpandedRect = (x: number, y: number, rect: RectArea, expansion: number): boolean => {
    return x >= rect.x - expansion
        && x <= rect.x + rect.width + expansion
        && y >= rect.y - expansion
        && y <= rect.y + rect.height + expansion;
};

const isInsideRect = (x: number, y: number, rect: RectArea): boolean => {
    return x >= rect.x
        && x <= rect.x + rect.width
        && y >= rect.y
        && y <= rect.y + rect.height;
};

const normalizeAvatarAppearance = (value: unknown): AvatarAppearance => {
    if (!value || typeof value !== 'object') {
        return DEFAULT_AVATAR_APPEARANCE;
    }

    const candidate = value as Partial<AvatarAppearance>;
    return {
        skinTone: typeof candidate.skinTone === 'string' ? candidate.skinTone : DEFAULT_AVATAR_APPEARANCE.skinTone,
        bodyStyle: candidate.bodyStyle === 'blazer' || candidate.bodyStyle === 'hoodie' ? candidate.bodyStyle : DEFAULT_AVATAR_APPEARANCE.bodyStyle,
        topColor: typeof candidate.topColor === 'string' ? candidate.topColor : DEFAULT_AVATAR_APPEARANCE.topColor,
        bottomColor: typeof candidate.bottomColor === 'string' ? candidate.bottomColor : DEFAULT_AVATAR_APPEARANCE.bottomColor,
        accessory: candidate.accessory === 'glasses' || candidate.accessory === 'headset'
            ? candidate.accessory
            : DEFAULT_AVATAR_APPEARANCE.accessory,
        accentColor: typeof candidate.accentColor === 'string' ? candidate.accentColor : DEFAULT_AVATAR_APPEARANCE.accentColor,
    };
};

const loadStoredAvatarAppearance = (): AvatarAppearance => {
    try {
        const raw = localStorage.getItem(PLAYER_APPEARANCE_STORAGE_KEY);
        if (!raw) {
            return DEFAULT_AVATAR_APPEARANCE;
        }

        return normalizeAvatarAppearance(JSON.parse(raw));
    } catch {
        return DEFAULT_AVATAR_APPEARANCE;
    }
};

function App() {
    const [playerName, setPlayerName] = useState<string>(() => localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '');
    const [isNameDialogOpen, setIsNameDialogOpen] = useState<boolean>(true);
    const [connectionId, setConnectionId] = useState<string | null>(null);
    const [signalrStatus, setSignalrStatus] = useState<SignalrStatus>('idle');
    const [signalrError, setSignalrError] = useState<string | null>(null);
    const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [isMuted, setIsMuted] = useState<boolean>(true);
    const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState<boolean>(false);
    const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedMicDeviceId, setSelectedMicDeviceId] = useState<string>(() => localStorage.getItem(PREFERRED_MIC_DEVICE_STORAGE_KEY) ?? 'default');
    const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>(() => localStorage.getItem(PREFERRED_OUTPUT_DEVICE_STORAGE_KEY) ?? 'default');
    const [avatarAppearance, setAvatarAppearance] = useState<AvatarAppearance>(() => loadStoredAvatarAppearance());
    const [settingsError, setSettingsError] = useState<string | null>(null);
    const [talkableUserNames, setTalkableUserNames] = useState<string[]>([]);
    const [loadingUserNames, setLoadingUserNames] = useState<string[]>([]);
    const [remoteScreenShares, setRemoteScreenShares] = useState<RemoteScreenShare[]>([]);
    const [remoteScreenShareStatuses, setRemoteScreenShareStatuses] = useState<Record<string, RemoteScreenShareStatus>>({});
    const [selectedRemoteScreenSharePeerId, setSelectedRemoteScreenSharePeerId] = useState<string | null>(null);
    const [localScreenShareStatus, setLocalScreenShareStatus] = useState<RemoteScreenShareStatus>('idle');
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [activeCallPeerCount, setActiveCallPeerCount] = useState(0);
    const [isRemoteScreenPreviewMinimized, setIsRemoteScreenPreviewMinimized] = useState(false);
    const [isInQuietZone, setIsInQuietZone] = useState(false);
    const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
    const pixiContainerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const avatarsRef = useRef<Map<string, AvatarVisual>>(new Map());
    const pendingAvatarsRef = useRef<Map<string, AvatarPosition>>(new Map());
    const pendingDisplayNamesRef = useRef<Map<string, string>>(new Map());
    const pendingAvatarAppearancesRef = useRef<Map<string, AvatarAppearance>>(new Map());
    const signalrStatusRef = useRef<SignalrStatus>('idle');
    const voiceStatusRef = useRef<VoiceStatus>('idle');
    const isMutedRef = useRef<boolean>(true);
    const selectedMicDeviceIdRef = useRef<string>(localStorage.getItem(PREFERRED_MIC_DEVICE_STORAGE_KEY) ?? 'default');
    const selectedOutputDeviceIdRef = useRef<string>(localStorage.getItem(PREFERRED_OUTPUT_DEVICE_STORAGE_KEY) ?? 'default');
    const avatarAppearanceRef = useRef<AvatarAppearance>(loadStoredAvatarAppearance());
    const connectionIdRef = useRef<string | null>(null);
    const localPositionRef = useRef<AvatarPosition | null>(null);
    const lastBroadcastAtRef = useRef<number>(0);
    const movementInputRef = useRef({ up: false, down: false, left: false, right: false, sprint: false });
    const audioContextRef = useRef<AudioContext | null>(null);
    const localMicStreamRef = useRef<MediaStream | null>(null);
    const localScreenStreamRef = useRef<MediaStream | null>(null);
    const localScreenShareSessionIdsRef = useRef<Map<string, string>>(new Map());
    const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const outgoingScreenSharePeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const incomingScreenSharePeerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
    const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
    const remoteScreenStreamsRef = useRef<Map<string, MediaStream>>(new Map());
    const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const pendingOutgoingScreenShareIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const pendingIncomingScreenShareIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
    const announcedRemoteScreenSharersRef = useRef<Set<string>>(new Set());
    const remoteScreenShareSessionIdsRef = useRef<Map<string, string>>(new Map());
    const remoteSpeechMetersRef = useRef<Map<string, SpeechMeter>>(new Map());
    const speakingUntilRef = useRef<Map<string, number>>(new Map());
    const lastPeerDisconnectAtRef = useRef<Map<string, number>>(new Map());
    const stopScreenSharingRef = useRef<(() => Promise<void>) | null>(null);
    const toastTimeoutsRef = useRef<Map<string, number>>(new Map());
    const recentToastKeysRef = useRef<Map<string, number>>(new Map());
    const nearbySinceRef = useRef<Map<string, number>>(new Map());
    const nearbyIndicatorSinceRef = useRef<Map<string, number>>(new Map());
    const lastVoiceSyncAtRef = useRef<number>(0);
    const wasInProximityRef = useRef(false);
    const hasCameraCenteredRef = useRef(false);
    const talkableUsersSignatureRef = useRef('');
    const loadingUsersSignatureRef = useRef('');

    const getPeerDisplayName = useCallback((peerId: string): string => {
        return avatarsRef.current.get(peerId)?.label.text?.toString() || pendingDisplayNamesRef.current.get(peerId) || 'Guest';
    }, []);

    const removeToast = useCallback((toastId: string) => {
        const timeoutId = toastTimeoutsRef.current.get(toastId);
        if (typeof timeoutId === 'number') {
            globalThis.clearTimeout(timeoutId);
            toastTimeoutsRef.current.delete(toastId);
        }

        setToastMessages((current) => current.filter((toast) => toast.id !== toastId));
    }, []);

    const pushToast = useCallback((message: string, severity: ToastSeverity = 'info', dedupeKey?: string) => {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) {
            return;
        }

        const now = Date.now();
        const recentKey = dedupeKey ?? `${severity}:${trimmedMessage}`;
        const lastShownAt = recentToastKeysRef.current.get(recentKey) ?? 0;
        if (now - lastShownAt < 1600) {
            return;
        }
        recentToastKeysRef.current.set(recentKey, now);

        const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
        setToastMessages((current) => {
            const next = [...current, { id, message: trimmedMessage, severity }];
            return next.slice(-4);
        });

        const timeoutId = globalThis.setTimeout(() => {
            toastTimeoutsRef.current.delete(id);
            setToastMessages((current) => current.filter((toast) => toast.id !== id));
        }, 3600);
        toastTimeoutsRef.current.set(id, timeoutId);
    }, []);

    const setAvatarTalking = useCallback((playerId: string, isTalking: boolean) => {
        const avatar = avatarsRef.current.get(playerId);
        if (!avatar) {
            return;
        }

        avatar.speakingBadge.visible = isTalking;
    }, []);

    const computeSpeechRms = useCallback((analyser: AnalyserNode, data: Uint8Array<ArrayBuffer>): number => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (const value of data) {
            const sample = (value - 128) / 128;
            sumSquares += sample * sample;
        }
        return Math.sqrt(sumSquares / data.length);
    }, []);

    const ensureSpeechAudioContext = useCallback((): AudioContext => {
        const audioContext = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = audioContext;
        if (audioContext.state === 'suspended') {
            void audioContext.resume();
        }
        return audioContext;
    }, []);

    const detachRemoteSpeechMeter = useCallback((peerId: string) => {
        const meter = remoteSpeechMetersRef.current.get(peerId);
        if (meter) {
            meter.source.disconnect();
            remoteSpeechMetersRef.current.delete(peerId);
        }

        speakingUntilRef.current.delete(peerId);
        setAvatarTalking(peerId, false);
    }, [setAvatarTalking]);

    const attachRemoteSpeechMeter = useCallback((peerId: string, stream: MediaStream) => {
        detachRemoteSpeechMeter(peerId);

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            return;
        }

        try {
            const audioContext = ensureSpeechAudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);

            remoteSpeechMetersRef.current.set(peerId, {
                analyser,
                source,
                data: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
            });
        } catch {
            // Ignore analyzer setup issues on unsupported browsers.
        }
    }, [detachRemoteSpeechMeter, ensureSpeechAudioContext]);

    const syncRemoteSpeechIndicators = useCallback(() => {
        const now = performance.now();

        for (const [peerId, meter] of remoteSpeechMetersRef.current) {
            const rms = computeSpeechRms(meter.analyser, meter.data);
            if (rms >= SPEECH_ACTIVITY_THRESHOLD) {
                speakingUntilRef.current.set(peerId, now + SPEECH_HOLD_MS);
            }

            const speakingUntil = speakingUntilRef.current.get(peerId) ?? 0;
            setAvatarTalking(peerId, now <= speakingUntil);
        }
    }, [computeSpeechRms, setAvatarTalking]);

    const removeRemoteAudioElement = useCallback((peerId: string) => {
        const element = remoteAudioElementsRef.current.get(peerId);
        if (!element) {
            return;
        }

        element.srcObject = null;
        element.remove();
        remoteAudioElementsRef.current.delete(peerId);
    }, []);

    const setAudioElementSinkId = useCallback(async (audioElement: HTMLAudioElement, outputDeviceId: string) => {
        const sinkElement = audioElement as HTMLAudioElement & { setSinkId?: (sinkId: string) => Promise<void> };
        if (typeof sinkElement.setSinkId !== 'function') {
            return;
        }

        await sinkElement.setSinkId(outputDeviceId);
    }, []);

    const applyOutputDeviceToAllRemoteAudio = useCallback(async (outputDeviceId: string) => {
        const applyPromises: Promise<void>[] = [];
        for (const audioElement of remoteAudioElementsRef.current.values()) {
            applyPromises.push(setAudioElementSinkId(audioElement, outputDeviceId));
        }

        if (applyPromises.length > 0) {
            await Promise.allSettled(applyPromises);
        }
    }, [setAudioElementSinkId]);

    const setRemoteScreenShareStatus = useCallback((peerId: string, status: RemoteScreenShareStatus) => {
        setRemoteScreenShareStatuses((current) => {
            if (current[peerId] === status) {
                return current;
            }

            return {
                ...current,
                [peerId]: status,
            };
        });
    }, []);

    const clearRemoteScreenShareStatus = useCallback((peerId: string) => {
        setRemoteScreenShareStatuses((current) => {
            if (!(peerId in current)) {
                return current;
            }

            const next = { ...current };
            delete next[peerId];
            return next;
        });
    }, []);

    const createScreenShareSessionId = useCallback((): string => {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }

        return `share-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }, []);

    const removeRemoteScreenShare = useCallback((peerId: string) => {
        const stream = remoteScreenStreamsRef.current.get(peerId);
        if (!stream) {
            clearRemoteScreenShareStatus(peerId);
            return;
        }

        for (const track of stream.getTracks()) {
            stream.removeTrack(track);
        }

        remoteScreenStreamsRef.current.delete(peerId);
        setRemoteScreenShares((current) => current.filter((share) => share.peerId !== peerId));
        clearRemoteScreenShareStatus(peerId);
    }, [clearRemoteScreenShareStatus]);

    const upsertRemoteScreenShare = useCallback((peerId: string, stream: MediaStream) => {
        remoteScreenStreamsRef.current.set(peerId, stream);
        setRemoteScreenShareStatus(peerId, 'active');
        setRemoteScreenShares(Array.from(remoteScreenStreamsRef.current.entries()).map(([id, currentStream]) => ({
            peerId: id,
            stream: currentStream,
        })));
    }, [setRemoteScreenShareStatus]);

    const syncRemoteScreenSharePresentation = useCallback((peerId: string, stream: MediaStream) => {
        const wasExplicitlyStarted = announcedRemoteScreenSharersRef.current.has(peerId);
        const videoTracks = stream.getVideoTracks();
        const hasRenderableVideoTrack = videoTracks.some((videoTrack) => videoTrack.readyState === 'live' && !videoTrack.muted);
        if (hasRenderableVideoTrack && wasExplicitlyStarted) {
            upsertRemoteScreenShare(peerId, stream);
            return;
        }

        if (wasExplicitlyStarted) {
            setRemoteScreenShareStatus(peerId, 'starting');
            return;
        }

        const hasLiveVideoTrack = videoTracks.some((videoTrack) => videoTrack.readyState === 'live');
        if (!hasLiveVideoTrack) {
            removeRemoteScreenShare(peerId);
        }
    }, [removeRemoteScreenShare, setRemoteScreenShareStatus, upsertRemoteScreenShare]);

    const closeOutgoingScreenSharePeerConnection = useCallback((peerId: string) => {
        const connection = outgoingScreenSharePeerConnectionsRef.current.get(peerId);
        if (connection) {
            connection.onicecandidate = null;
            connection.ontrack = null;
            connection.onconnectionstatechange = null;
            connection.close();
            outgoingScreenSharePeerConnectionsRef.current.delete(peerId);
        }

        pendingOutgoingScreenShareIceCandidatesRef.current.delete(peerId);
    }, []);

    const closeIncomingScreenSharePeerConnection = useCallback((peerId: string) => {
        const connection = incomingScreenSharePeerConnectionsRef.current.get(peerId);
        if (connection) {
            connection.onicecandidate = null;
            connection.ontrack = null;
            connection.onconnectionstatechange = null;
            connection.close();
            incomingScreenSharePeerConnectionsRef.current.delete(peerId);
        }

        announcedRemoteScreenSharersRef.current.delete(peerId);
        remoteScreenShareSessionIdsRef.current.delete(peerId);
        pendingIncomingScreenShareIceCandidatesRef.current.delete(peerId);
        removeRemoteScreenShare(peerId);
    }, [removeRemoteScreenShare]);

    const closeAllScreenSharePeerConnections = useCallback(() => {
        const outgoingPeerIds = Array.from(outgoingScreenSharePeerConnectionsRef.current.keys());
        for (const peerId of outgoingPeerIds) {
            closeOutgoingScreenSharePeerConnection(peerId);
        }

        const incomingPeerIds = Array.from(incomingScreenSharePeerConnectionsRef.current.keys());
        for (const peerId of incomingPeerIds) {
            closeIncomingScreenSharePeerConnection(peerId);
        }

        pendingOutgoingScreenShareIceCandidatesRef.current.clear();
        pendingIncomingScreenShareIceCandidatesRef.current.clear();
    }, [closeIncomingScreenSharePeerConnection, closeOutgoingScreenSharePeerConnection]);

    const registerLocalScreenShareTarget = useCallback(async (peerId: string): Promise<string | null> => {
        const sessionId = createScreenShareSessionId();
        let registration = await getHubConnection().invoke('RegisterScreenShareSession', peerId, sessionId, false) as ScreenShareRegistrationResult;
        if (!registration.accepted) {
            return null;
        }

        localScreenShareSessionIdsRef.current.set(peerId, sessionId);
        return sessionId;
    }, [createScreenShareSessionId]);

    const stopScreenSharingForPeer = useCallback(async (peerId: string, notifyRemote = true) => {
        const sessionId = localScreenShareSessionIdsRef.current.get(peerId);
        localScreenShareSessionIdsRef.current.delete(peerId);

        if (sessionId) {
            if (notifyRemote) {
                await getHubConnection().invoke('SendScreenShareStopped', peerId, sessionId);
            }
            await getHubConnection().invoke('ClearScreenShareSession', peerId, sessionId);
        }

        closeOutgoingScreenSharePeerConnection(peerId);

        if (!localScreenStreamRef.current) {
            return;
        }

        if (localScreenShareSessionIdsRef.current.size === 0) {
            await stopScreenSharingRef.current?.();
        } else {
            setIsScreenSharing(true);
            setLocalScreenShareStatus('active');
        }
    }, [closeOutgoingScreenSharePeerConnection]);

    const closePeerConnection = useCallback((peerId: string) => {
        const connection = peerConnectionsRef.current.get(peerId);
        const didHaveConnection = !!connection;
        const peerName = getPeerDisplayName(peerId);
        if (connection) {
            connection.onicecandidate = null;
            connection.ontrack = null;
            connection.onconnectionstatechange = null;
            connection.close();
            peerConnectionsRef.current.delete(peerId);
            setActiveCallPeerCount(peerConnectionsRef.current.size);
        }

        pendingIceCandidatesRef.current.delete(peerId);
        nearbySinceRef.current.delete(peerId);
        nearbyIndicatorSinceRef.current.delete(peerId);
        removeRemoteAudioElement(peerId);
        if (localScreenShareSessionIdsRef.current.has(peerId)) {
            void stopScreenSharingForPeer(peerId);
        }
        closeOutgoingScreenSharePeerConnection(peerId);
        closeIncomingScreenSharePeerConnection(peerId);
        detachRemoteSpeechMeter(peerId);
        lastPeerDisconnectAtRef.current.set(peerId, performance.now());
        if (didHaveConnection) {
            pushToast(`${peerName} left your call`, 'info', `call-left:${peerId}`);
        }
    }, [closeIncomingScreenSharePeerConnection, closeOutgoingScreenSharePeerConnection, detachRemoteSpeechMeter, getPeerDisplayName, pushToast, removeRemoteAudioElement, stopScreenSharingForPeer]);

    const closeAllPeerConnections = useCallback(() => {
        const peerIds = Array.from(peerConnectionsRef.current.keys());
        for (const peerId of peerIds) {
            closePeerConnection(peerId);
        }
        pendingIceCandidatesRef.current.clear();
        closeAllScreenSharePeerConnections();
    }, [closeAllScreenSharePeerConnections, closePeerConnection]);

    const attachPendingIceCandidates = useCallback(async (peerId: string) => {
        const connection = peerConnectionsRef.current.get(peerId);
        if (!connection?.remoteDescription) {
            return;
        }

        const queued = pendingIceCandidatesRef.current.get(peerId);
        if (!queued || queued.length === 0) {
            return;
        }

        pendingIceCandidatesRef.current.delete(peerId);
        for (const candidate of queued) {
            try {
                await connection.addIceCandidate(candidate);
            } catch {
                // Ignore malformed or stale candidates.
            }
        }
    }, []);

    const attachPendingOutgoingScreenShareIceCandidates = useCallback(async (peerId: string) => {
        const connection = outgoingScreenSharePeerConnectionsRef.current.get(peerId);
        if (!connection?.remoteDescription) {
            return;
        }

        const queued = pendingOutgoingScreenShareIceCandidatesRef.current.get(peerId);
        if (!queued || queued.length === 0) {
            return;
        }

        pendingOutgoingScreenShareIceCandidatesRef.current.delete(peerId);
        for (const candidate of queued) {
            try {
                await connection.addIceCandidate(candidate);
            } catch {
                // Ignore malformed or stale candidates.
            }
        }
    }, []);

    const attachPendingIncomingScreenShareIceCandidates = useCallback(async (peerId: string) => {
        const connection = incomingScreenSharePeerConnectionsRef.current.get(peerId);
        if (!connection?.remoteDescription) {
            return;
        }

        const queued = pendingIncomingScreenShareIceCandidatesRef.current.get(peerId);
        if (!queued || queued.length === 0) {
            return;
        }

        pendingIncomingScreenShareIceCandidatesRef.current.delete(peerId);
        for (const candidate of queued) {
            try {
                await connection.addIceCandidate(candidate);
            } catch {
                // Ignore malformed or stale candidates.
            }
        }
    }, []);

    const getOrCreateOutgoingScreenSharePeerConnection = useCallback((peerId: string): RTCPeerConnection => {
        const existing = outgoingScreenSharePeerConnectionsRef.current.get(peerId);
        if (existing) {
            return existing;
        }

        const connection = new RTCPeerConnection(WEBRTC_CONFIG);
        outgoingScreenSharePeerConnectionsRef.current.set(peerId, connection);

        const localScreenStream = localScreenStreamRef.current;
        if (localScreenStream) {
            for (const track of localScreenStream.getVideoTracks()) {
                connection.addTrack(track, localScreenStream);
            }
        }

        connection.onicecandidate = ({ candidate }) => {
            if (!candidate) {
                return;
            }

            const sessionId = localScreenShareSessionIdsRef.current.get(peerId);
            if (!sessionId) {
                return;
            }

            const serializedCandidate = JSON.stringify(candidate.toJSON());
            void getHubConnection()
                .invoke('SendScreenShareIceCandidate', peerId, sessionId, serializedCandidate)
                .catch(() => undefined);
        };

        connection.onconnectionstatechange = () => {
            const state = connection.connectionState;
            if (state === 'failed' || state === 'closed') {
                closeOutgoingScreenSharePeerConnection(peerId);
            }
        };

        return connection;
    }, [closeOutgoingScreenSharePeerConnection]);

    const getOrCreateIncomingScreenSharePeerConnection = useCallback((peerId: string): RTCPeerConnection => {
        const existing = incomingScreenSharePeerConnectionsRef.current.get(peerId);
        if (existing) {
            return existing;
        }

        const connection = new RTCPeerConnection(WEBRTC_CONFIG);
        incomingScreenSharePeerConnectionsRef.current.set(peerId, connection);

        connection.onicecandidate = ({ candidate }) => {
            if (!candidate) {
                return;
            }

            const sessionId = remoteScreenShareSessionIdsRef.current.get(peerId);
            if (!sessionId) {
                return;
            }

            const serializedCandidate = JSON.stringify(candidate.toJSON());
            void getHubConnection()
                .invoke('SendScreenShareIceCandidate', peerId, sessionId, serializedCandidate)
                .catch(() => undefined);
        };

        connection.ontrack = ({ streams, transceiver }) => {
            if (transceiver.receiver.track.kind !== 'video') {
                return;
            }

            const remoteStream = streams[0] ?? remoteScreenStreamsRef.current.get(peerId) ?? new MediaStream();
            const track = transceiver.receiver.track;
            remoteScreenStreamsRef.current.set(peerId, remoteStream);

            for (const existingTrack of remoteStream.getVideoTracks()) {
                if (existingTrack.id !== track.id) {
                    remoteStream.removeTrack(existingTrack);
                }
            }

            if (!remoteStream.getVideoTracks().some((videoTrack) => videoTrack.id === track.id)) {
                remoteStream.addTrack(track);
            }

            const syncRemoteScreenShare = () => {
                syncRemoteScreenSharePresentation(peerId, remoteStream);
            };

            syncRemoteScreenShare();
            track.onmute = syncRemoteScreenShare;
            track.onunmute = syncRemoteScreenShare;
            track.onended = syncRemoteScreenShare;
            remoteStream.onaddtrack = syncRemoteScreenShare;
            remoteStream.onremovetrack = syncRemoteScreenShare;
        };

        connection.onconnectionstatechange = () => {
            const state = connection.connectionState;
            if (state === 'failed' || state === 'closed') {
                closeIncomingScreenSharePeerConnection(peerId);
            }
        };

        return connection;
    }, [closeIncomingScreenSharePeerConnection, syncRemoteScreenSharePresentation]);

    const getOrCreatePeerConnection = useCallback((peerId: string): RTCPeerConnection | null => {
        const existing = peerConnectionsRef.current.get(peerId);
        if (existing) {
            return existing;
        }

        const localStream = localMicStreamRef.current;
        if (!localStream) {
            return null;
        }

        const connection = new RTCPeerConnection(WEBRTC_CONFIG);
        peerConnectionsRef.current.set(peerId, connection);
        setActiveCallPeerCount(peerConnectionsRef.current.size);
        pushToast(`${getPeerDisplayName(peerId)} joined your call`, 'success', `call-joined:${peerId}`);

        for (const track of localStream.getAudioTracks()) {
            connection.addTrack(track, localStream);
        }

        connection.onicecandidate = ({ candidate }) => {
            if (!candidate) {
                return;
            }

            const serializedCandidate = JSON.stringify(candidate.toJSON());
            void getHubConnection()
                .invoke('SendIceCandidate', peerId, serializedCandidate)
                .catch(() => undefined);
        };

        connection.ontrack = ({ streams }) => {
            const [remoteStream] = streams;
            if (!remoteStream) {
                return;
            }

            let audioElement = remoteAudioElementsRef.current.get(peerId);
            if (!audioElement) {
                audioElement = document.createElement('audio');
                audioElement.autoplay = true;
                audioElement.dataset.peerId = peerId;
                audioElement.style.display = 'none';
                document.body.appendChild(audioElement);
                remoteAudioElementsRef.current.set(peerId, audioElement);
            }

            if (audioElement.srcObject !== remoteStream) {
                audioElement.srcObject = remoteStream;
                void audioElement.play().catch(() => undefined);
            }

            void setAudioElementSinkId(audioElement, selectedOutputDeviceIdRef.current).catch(() => undefined);

            attachRemoteSpeechMeter(peerId, remoteStream);
        };

        connection.onconnectionstatechange = () => {
            const state = connection.connectionState;
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                closePeerConnection(peerId);
            }
        };

        return connection;
    }, [attachRemoteSpeechMeter, closePeerConnection, getPeerDisplayName, pushToast, setAudioElementSinkId]);

    const shouldInitiateOffer = useCallback((localId: string, remoteId: string): boolean => {
        return localId.localeCompare(remoteId) < 0;
    }, []);

    const isAvatarInConferenceRoom = useCallback((avatar: AvatarVisual): boolean => {
        return isInsideRect(
            avatar.body.x,
            avatar.body.y,
            {
                x: CONFERENCE_ROOM_RECT.x + 24,
                y: CONFERENCE_ROOM_RECT.y + 24,
                width: CONFERENCE_ROOM_RECT.width - 48,
                height: CONFERENCE_ROOM_RECT.height - 48,
            },
        );
    }, []);

    const getAvatarOfficePodIndex = useCallback((avatar: AvatarVisual): number => {
        return OFFICE_CUBICLE_PODS.findIndex((pod) => isInsideRect(
            avatar.body.x,
            avatar.body.y,
            {
                x: pod.x + 12,
                y: pod.y + 12,
                width: pod.width - 24,
                height: pod.height - 24,
            },
        ));
    }, []);

    const isAvatarInQuietZone = useCallback((avatar: AvatarVisual): boolean => {
        return isInsideRect(avatar.body.x, avatar.body.y, BREAK_QUIET_ZONE_RECT);
    }, []);

    const createAndSendOffer = useCallback(async (peerId: string) => {
        const localId = connectionIdRef.current;
        if (!localId || !shouldInitiateOffer(localId, peerId)) {
            return;
        }

        const connection = getOrCreatePeerConnection(peerId);
        if (connection?.signalingState !== 'stable') {
            return;
        }

        try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            if (connection.localDescription?.sdp) {
                await getHubConnection().invoke('SendOffer', peerId, connection.localDescription.sdp);
            }
        } catch {
            closePeerConnection(peerId);
        }
    }, [closePeerConnection, getOrCreatePeerConnection, shouldInitiateOffer]);

    const createAndSendScreenShareOffer = useCallback(async (peerId: string) => {
        const sessionId = localScreenShareSessionIdsRef.current.get(peerId);
        if (!localScreenStreamRef.current || !sessionId) {
            return;
        }

        closeOutgoingScreenSharePeerConnection(peerId);
        const connection = getOrCreateOutgoingScreenSharePeerConnection(peerId);
        if (connection.signalingState !== 'stable') {
            return;
        }

        try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            if (connection.localDescription?.sdp) {
                await getHubConnection().invoke('SendScreenShareOffer', peerId, sessionId, connection.localDescription.sdp);
                if (localScreenStreamRef.current && localScreenShareSessionIdsRef.current.get(peerId) === sessionId) {
                    await getHubConnection().invoke('SendScreenShareStarted', peerId, sessionId);
                }
            }
        } catch {
            closeOutgoingScreenSharePeerConnection(peerId);
        }
    }, [closeOutgoingScreenSharePeerConnection, getOrCreateOutgoingScreenSharePeerConnection]);

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const getNearbyPeerIds = useCallback((localId: string, localAvatar: AvatarVisual): Set<string> => {
        const nearbyPeerIds = new Set<string>();
        if (isAvatarInQuietZone(localAvatar)) {
            return nearbyPeerIds;
        }

        const localIsInConferenceRoom = isAvatarInConferenceRoom(localAvatar);
        const localOfficePodIndex = getAvatarOfficePodIndex(localAvatar);

        for (const [playerId, avatar] of avatarsRef.current) {
            if (playerId === localId) {
                continue;
            }

            if (isAvatarInQuietZone(avatar)) {
                continue;
            }

            const remoteIsInConferenceRoom = isAvatarInConferenceRoom(avatar);
            if (localIsInConferenceRoom && remoteIsInConferenceRoom) {
                nearbyPeerIds.add(playerId);
                continue;
            }

            if (localIsInConferenceRoom || remoteIsInConferenceRoom) {
                continue;
            }

            const remoteOfficePodIndex = getAvatarOfficePodIndex(avatar);
            if (localOfficePodIndex >= 0 && remoteOfficePodIndex === localOfficePodIndex) {
                nearbyPeerIds.add(playerId);
                continue;
            }

            if (localOfficePodIndex >= 0 || remoteOfficePodIndex >= 0) {
                continue;
            }

            const dx = localAvatar.body.x - avatar.body.x;
            const dy = localAvatar.body.y - avatar.body.y;
            const distance = Math.hypot(dx, dy);
            const isConnected = peerConnectionsRef.current.has(playerId);
            const threshold = isConnected ? PROXIMITY_DISCONNECT_THRESHOLD : PROXIMITY_CONNECT_THRESHOLD;

            if (distance <= threshold) {
                nearbyPeerIds.add(playerId);
            }
        }

        return nearbyPeerIds;
    }, [getAvatarOfficePodIndex, isAvatarInConferenceRoom, isAvatarInQuietZone]);

    const getDelayedNearbyPeerIds = useCallback((localId: string, localAvatar: AvatarVisual, now: number): Set<string> => {
        const nearbyPeerIds = getNearbyPeerIds(localId, localAvatar);
        const delayedPeerIds = new Set<string>();

        for (const trackedPeerId of Array.from(nearbyIndicatorSinceRef.current.keys())) {
            if (!nearbyPeerIds.has(trackedPeerId)) {
                nearbyIndicatorSinceRef.current.delete(trackedPeerId);
            }
        }

        for (const peerId of nearbyPeerIds) {
            if (peerConnectionsRef.current.has(peerId)) {
                delayedPeerIds.add(peerId);
                continue;
            }

            const firstNearbyAt = nearbyIndicatorSinceRef.current.get(peerId);
            if (typeof firstNearbyAt !== 'number') {
                nearbyIndicatorSinceRef.current.set(peerId, now);
                continue;
            }

            if (now - firstNearbyAt >= PROXIMITY_CONNECT_DELAY_MS) {
                delayedPeerIds.add(peerId);
            }
        }

        return delayedPeerIds;
    }, [getNearbyPeerIds]);

    const isInReconnectCooldown = useCallback((peerId: string, now: number): boolean => {
        const lastDisconnectedAt = lastPeerDisconnectAtRef.current.get(peerId);
        if (typeof lastDisconnectedAt !== 'number') {
            return false;
        }

        return now - lastDisconnectedAt < PEER_RECONNECT_COOLDOWN_MS;
    }, []);

    const syncProximityVoiceConnections = useCallback(() => {
        if (voiceStatusRef.current !== 'ready' || signalrStatusRef.current !== 'connected') {
            nearbySinceRef.current.clear();
            closeAllPeerConnections();
            return;
        }

        const localId = connectionIdRef.current;
        if (!localId) {
            return;
        }

        const localAvatar = avatarsRef.current.get(localId);
        if (!localAvatar) {
            nearbySinceRef.current.clear();
            return;
        }

        const nearbyPeerIds = getNearbyPeerIds(localId, localAvatar);
        const now = performance.now();

        for (const trackedPeerId of Array.from(nearbySinceRef.current.keys())) {
            if (!nearbyPeerIds.has(trackedPeerId)) {
                nearbySinceRef.current.delete(trackedPeerId);
            }
        }

        const connectedPeerIds = Array.from(peerConnectionsRef.current.keys());
        for (const peerId of connectedPeerIds) {
            if (!nearbyPeerIds.has(peerId)) {
                closePeerConnection(peerId);
            } else {
                nearbySinceRef.current.delete(peerId);
            }
        }

        for (const peerId of nearbyPeerIds) {
            if (!peerConnectionsRef.current.has(peerId)) {
                if (isInReconnectCooldown(peerId, now)) {
                    continue;
                }

                const firstNearbyAt = nearbySinceRef.current.get(peerId);
                if (typeof firstNearbyAt !== 'number') {
                    nearbySinceRef.current.set(peerId, now);
                    continue;
                }

                if (now - firstNearbyAt < PROXIMITY_CONNECT_DELAY_MS) {
                    continue;
                }

                void createAndSendOffer(peerId);
                void getHubConnection().invoke('RequestScreenShareState', peerId).catch(() => undefined);
                if (localScreenStreamRef.current && !localScreenShareSessionIdsRef.current.has(peerId)) {
                    void registerLocalScreenShareTarget(peerId)
                        .then((sessionId) => {
                            if (sessionId) {
                                return createAndSendScreenShareOffer(peerId);
                            }

                            return undefined;
                        })
                        .catch(() => undefined);
                }
            }
        }
    }, [closeAllPeerConnections, closePeerConnection, createAndSendOffer, createAndSendScreenShareOffer, getNearbyPeerIds, isInReconnectCooldown, registerLocalScreenShareTarget]);

    const syncTalkableUsersIndicator = useCallback(() => {
        const localId = connectionIdRef.current;
        if (!localId || signalrStatusRef.current !== 'connected') {
            nearbyIndicatorSinceRef.current.clear();
            if (talkableUsersSignatureRef.current !== '') {
                talkableUsersSignatureRef.current = '';
                setTalkableUserNames([]);
            }
            return;
        }

        const localAvatar = avatarsRef.current.get(localId);
        if (!localAvatar) {
            nearbyIndicatorSinceRef.current.clear();
            if (talkableUsersSignatureRef.current !== '') {
                talkableUsersSignatureRef.current = '';
                setTalkableUserNames([]);
            }
            return;
        }

        const delayedNearbyPeerIds = getDelayedNearbyPeerIds(localId, localAvatar, performance.now());
        const nearbyNames: string[] = [];
        for (const playerId of delayedNearbyPeerIds) {
            const avatar = avatarsRef.current.get(playerId);
            if (!avatar) {
                continue;
            }

            const displayName = avatar.label.text || pendingDisplayNamesRef.current.get(playerId) || 'Guest';
            nearbyNames.push(displayName);
        }

        nearbyNames.sort((a, b) => a.localeCompare(b));
        const signature = nearbyNames.join('|');
        if (signature === talkableUsersSignatureRef.current) {
            return;
        }

        talkableUsersSignatureRef.current = signature;
        setTalkableUserNames(nearbyNames);
    }, [getDelayedNearbyPeerIds]);

    const syncLoadingUsersIndicator = useCallback(() => {
        const localId = connectionIdRef.current;
        if (!localId || signalrStatusRef.current !== 'connected') {
            if (loadingUsersSignatureRef.current !== '') {
                loadingUsersSignatureRef.current = '';
                setLoadingUserNames([]);
            }
            return;
        }

        const localAvatar = avatarsRef.current.get(localId);
        if (!localAvatar) {
            if (loadingUsersSignatureRef.current !== '') {
                loadingUsersSignatureRef.current = '';
                setLoadingUserNames([]);
            }
            return;
        }

        const now = performance.now();
        const nearbyPeerIds = getNearbyPeerIds(localId, localAvatar);
        const delayedNearbyPeerIds = getDelayedNearbyPeerIds(localId, localAvatar, now);
        const loadingNames: string[] = [];

        for (const peerId of nearbyPeerIds) {
            if (delayedNearbyPeerIds.has(peerId)) {
                continue;
            }

            const avatar = avatarsRef.current.get(peerId);
            if (!avatar) {
                continue;
            }

            const displayName = avatar.label.text || pendingDisplayNamesRef.current.get(peerId) || 'Guest';
            loadingNames.push(displayName);
        }

        loadingNames.sort((a, b) => a.localeCompare(b));
        const signature = loadingNames.join('|');
        if (signature === loadingUsersSignatureRef.current) {
            return;
        }

        loadingUsersSignatureRef.current = signature;
        setLoadingUserNames(loadingNames);
    }, [getDelayedNearbyPeerIds, getNearbyPeerIds]);

    const syncQuietZoneIndicator = useCallback(() => {
        const localId = connectionIdRef.current;
        const localAvatar = localId ? avatarsRef.current.get(localId) : null;
        const nextIsInQuietZone = Boolean(localAvatar && isAvatarInQuietZone(localAvatar));
        setIsInQuietZone((current) => (current === nextIsInQuietZone ? current : nextIsInQuietZone));
    }, [isAvatarInQuietZone]);

    const isWalkablePosition = useCallback((x: number, y: number): boolean => {
        const worldRightEdge = WORLD_WIDTH - 12;
        const inOffice = x >= 12 && x <= worldRightEdge && y >= 30 && y <= 560;
        const inBreakArea = x >= 12 && x <= worldRightEdge && y >= 610 && y <= 810;
        const inDoorPassage = x >= 780 && x <= 880 && y >= 560 && y <= 610;
        const insideFloor = inOffice || inBreakArea || inDoorPassage;
        if (!insideFloor) {
            return false;
        }

        if (!inOffice) {
            return true;
        }

        for (const desk of OFFICE_BLOCKER_RECTS) {
            if (isInsideExpandedRect(x, y, desk, AVATAR_COLLISION_RADIUS)) {
                return false;
            }
        }

        return true;
    }, []);

    useEffect(() => {
        signalrStatusRef.current = signalrStatus;
    }, [signalrStatus]);

    useEffect(() => {
        voiceStatusRef.current = voiceStatus;
    }, [voiceStatus]);

    useEffect(() => {
        isMutedRef.current = isMuted;

        const stream = localMicStreamRef.current;
        if (!stream) {
            return;
        }

        const enabled = !isMuted;
        for (const track of stream.getAudioTracks()) {
            track.enabled = enabled;
        }
    }, [isMuted]);

    useEffect(() => {
        selectedMicDeviceIdRef.current = selectedMicDeviceId;
    }, [selectedMicDeviceId]);

    useEffect(() => {
        selectedOutputDeviceIdRef.current = selectedOutputDeviceId;
    }, [selectedOutputDeviceId]);

    useEffect(() => {
        avatarAppearanceRef.current = avatarAppearance;
        localStorage.setItem(PLAYER_APPEARANCE_STORAGE_KEY, JSON.stringify(avatarAppearance));
    }, [avatarAppearance]);

    useEffect(() => {
        connectionIdRef.current = connectionId;
    }, [connectionId]);

    useEffect(() => {
        hasCameraCenteredRef.current = false;
    }, [connectionId]);

    const hashConnectionId = useCallback((id: string): number => {
        let hash = 0;
        for (const character of id) {
            const codePoint = character.codePointAt(0) ?? 0;
            hash = Math.trunc((hash * 31) + codePoint);
        }
        return Math.abs(hash);
    }, []);

    const getFallbackAvatarAppearance = useCallback((playerId: string): AvatarAppearance => {
        const hash = hashConnectionId(playerId);
        return {
            skinTone: AVATAR_SKIN_TONES[hash % AVATAR_SKIN_TONES.length],
            bodyStyle: (['relaxed', 'blazer', 'hoodie'] as AvatarBodyStyle[])[hash % 3],
            topColor: AVATAR_CLOTHING_COLORS[(hash >> 5) % AVATAR_CLOTHING_COLORS.length],
            bottomColor: AVATAR_CLOTHING_COLORS[(hash >> 7) % AVATAR_CLOTHING_COLORS.length],
            accessory: (['none', 'glasses', 'headset'] as AvatarAccessory[])[hash % 3],
            accentColor: AVATAR_ACCENT_COLORS[(hash >> 9) % AVATAR_ACCENT_COLORS.length],
        };
    }, [hashConnectionId]);

    const drawAvatarBody = useCallback((body: Container, appearance: AvatarAppearance, isLocalPlayer: boolean) => {
        body.removeChildren().forEach((child) => child.destroy());
        const shadow = new Graphics();
        shadow.ellipse(0, 18, 11, 4).fill({ color: 0x17212b, alpha: 0.18 });
        body.addChild(shadow);

        const avatar = new Graphics();
        avatar.roundRect(-7, 11, 14, 12, 4).fill(appearance.bottomColor);
        avatar.roundRect(-10, 18, 5, 9, 2).fill(appearance.bottomColor);
        avatar.roundRect(5, 18, 5, 9, 2).fill(appearance.bottomColor);
        avatar.roundRect(-10, 24, 5, 2.5, 1).fill(0x2c2f34);
        avatar.roundRect(5, 24, 5, 2.5, 1).fill(0x2c2f34);
        avatar.roundRect(-4, -7, 8, 6, 3).fill(appearance.skinTone);

        if (appearance.bodyStyle === 'relaxed') {
            avatar.roundRect(-12, -2, 24, 18, 9).fill(appearance.topColor).stroke({ color: isLocalPlayer ? 0xffffff : 0x1f2430, width: isLocalPlayer ? 2.4 : 1.6 });
            avatar.roundRect(-14, 0, 4, 14, 2).fill(appearance.topColor);
            avatar.roundRect(10, 0, 4, 14, 2).fill(appearance.topColor);
        } else if (appearance.bodyStyle === 'blazer') {
            avatar.roundRect(-11, -3, 22, 19, 7).fill(appearance.topColor).stroke({ color: isLocalPlayer ? 0xffffff : 0x1f2430, width: isLocalPlayer ? 2.4 : 1.6 });
            avatar.moveTo(-6, 5).lineTo(-2, -2).lineTo(0, 6).lineTo(2, -2).lineTo(6, 5).closePath().fill(0xf7f3ed);
            avatar.roundRect(-13, 0, 4, 14, 2).fill(appearance.topColor);
            avatar.roundRect(9, 0, 4, 14, 2).fill(appearance.topColor);
        } else {
            avatar.roundRect(-13, -2, 26, 19, 10).fill(appearance.topColor).stroke({ color: isLocalPlayer ? 0xffffff : 0x1f2430, width: isLocalPlayer ? 2.4 : 1.6 });
            avatar.roundRect(-7, -1, 14, 10, 7).fill({ color: 0xffffff, alpha: 0.16 });
            avatar.roundRect(-15, 1, 4, 13, 2).fill(appearance.topColor);
            avatar.roundRect(11, 1, 4, 13, 2).fill(appearance.topColor);
        }

        avatar.circle(0, -14, 8.8).fill(appearance.skinTone).stroke({ color: 0x8d6e63, width: 1 });
        avatar.circle(-3, -15, 0.8).fill(0x2b2b2b);
        avatar.circle(3, -15, 0.8).fill(0x2b2b2b);
        avatar.arc(0, -11.6, 2.6, 0.2, Math.PI - 0.2).stroke({ color: 0x9f5a52, width: 0.9 });

        if (appearance.accessory === 'glasses') {
            avatar.circle(-3.2, -15, 2.7).stroke({ color: 0x273142, width: 1 });
            avatar.circle(3.2, -15, 2.7).stroke({ color: 0x273142, width: 1 });
            avatar.rect(-0.9, -15.5, 1.8, 1).fill(0x273142);
        } else if (appearance.accessory === 'headset') {
            avatar.arc(0, -14.2, 10.2, Math.PI * 1.06, Math.PI * 1.94).stroke({ color: appearance.accentColor, width: 2 });
            avatar.circle(-9.2, -14.2, 2.4).fill(appearance.accentColor);
            avatar.circle(9.2, -14.2, 2.4).fill(appearance.accentColor);
            avatar.roundRect(6.6, -11, 5.2, 1.6, 0.8).fill(appearance.accentColor);
        }

        body.addChild(avatar);
    }, []);

    useEffect(() => {
        if (signalrStatus !== 'connected') {
            return;
        }

        void getHubConnection()
            .invoke('SetAvatarAppearance', JSON.stringify(avatarAppearance))
            .catch(() => undefined);

        const localId = connectionIdRef.current ?? getHubConnection().connectionId;
        if (localId) {
            pendingAvatarAppearancesRef.current.set(localId, avatarAppearance);
            const existing = avatarsRef.current.get(localId);
            if (existing) {
                existing.appearance = avatarAppearance;
                drawAvatarBody(existing.body, avatarAppearance, true);
            }
        }
    }, [avatarAppearance, drawAvatarBody, signalrStatus]);

    const removeAvatar = useCallback((playerId: string) => {
        pendingAvatarsRef.current.delete(playerId);
        pendingDisplayNamesRef.current.delete(playerId);
        pendingAvatarAppearancesRef.current.delete(playerId);
        closePeerConnection(playerId);

        const avatar = avatarsRef.current.get(playerId);
        if (!avatar) {
            return;
        }

        avatar.ring.removeFromParent();
        avatar.body.removeFromParent();
        avatar.label.removeFromParent();
        avatar.ring.destroy();
        avatar.body.destroy();
        avatar.label.destroy();
        avatar.speakingBadge.destroy();
        avatarsRef.current.delete(playerId);
    }, [closePeerConnection]);

    const playProximityDing = useCallback(() => {
        try {
            const audioContext = audioContextRef.current ?? new AudioContext();
            audioContextRef.current = audioContext;

            if (audioContext.state === 'suspended') {
                void audioContext.resume();
            }

            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(660, audioContext.currentTime + 0.18);

            gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.2);

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.21);

            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
            };
        } catch {
            // Ignore browsers that block audio before user activation.
        }
    }, []);

    const updateProximityIndicators = useCallback(() => {
        const localId = connectionIdRef.current;
        for (const avatar of avatarsRef.current.values()) {
            avatar.ring.visible = false;
        }

        if (!localId) {
            nearbyIndicatorSinceRef.current.clear();
            wasInProximityRef.current = false;
            return;
        }

        const localAvatar = avatarsRef.current.get(localId);
        if (!localAvatar) {
            nearbyIndicatorSinceRef.current.clear();
            wasInProximityRef.current = false;
            return;
        }

        const delayedNearbyPeerIds = getDelayedNearbyPeerIds(localId, localAvatar, performance.now());
        for (const peerId of delayedNearbyPeerIds) {
            const peerAvatar = avatarsRef.current.get(peerId);
            if (peerAvatar) {
                peerAvatar.ring.visible = true;
            }
        }
        localAvatar.ring.visible = delayedNearbyPeerIds.size > 0;

        const localHasNearbyPeer = delayedNearbyPeerIds.size > 0;

        if (localHasNearbyPeer && !wasInProximityRef.current) {
            playProximityDing();
        }

        wasInProximityRef.current = localHasNearbyPeer;
    }, [getDelayedNearbyPeerIds, playProximityDing]);

    useEffect(() => {
        return () => {
            const audioContext = audioContextRef.current;
            if (audioContext) {
                void audioContext.close();
                audioContextRef.current = null;
            }

            const localMicStream = localMicStreamRef.current;
            if (localMicStream) {
                for (const track of localMicStream.getTracks()) {
                    track.stop();
                }
                localMicStreamRef.current = null;
            }

            const localScreenStream = localScreenStreamRef.current;
            if (localScreenStream) {
                for (const track of localScreenStream.getTracks()) {
                    track.stop();
                }
                localScreenStreamRef.current = null;
            }

            closeAllPeerConnections();
        };
    }, [closeAllPeerConnections]);

    const upsertAvatar = useCallback((playerId: string, x: number, y: number, displayName?: string, appearance?: AvatarAppearance) => {
        const app = appRef.current;
        if (!app) {
            pendingAvatarsRef.current.set(playerId, { x, y });
            if (displayName) {
                pendingDisplayNamesRef.current.set(playerId, displayName);
            }
            if (appearance) {
                pendingAvatarAppearancesRef.current.set(playerId, appearance);
            }
            return;
        }

        pendingAvatarsRef.current.delete(playerId);
        if (displayName) {
            pendingDisplayNamesRef.current.set(playerId, displayName);
        }
        if (appearance) {
            pendingAvatarAppearancesRef.current.set(playerId, appearance);
        }

        const resolvedName = pendingDisplayNamesRef.current.get(playerId) ?? 'Guest';
        const resolvedAppearance = pendingAvatarAppearancesRef.current.get(playerId) ?? getFallbackAvatarAppearance(playerId);

        let avatarVisual = avatarsRef.current.get(playerId);
        if (!avatarVisual) {
            const isLocalPlayer = getHubConnection().connectionId === playerId;

            const ring = new Graphics();
            ring.circle(0, 0, PROXIMITY_RING_RADIUS).fill({ color: 0x66c2ff, alpha: 0.13 });
            ring.circle(0, 0, PROXIMITY_RING_RADIUS).stroke({ color: 0x4aaef8, width: 2, alpha: 0.35 });
            ring.visible = false;

            const speakingBadge = new Graphics();
            speakingBadge.roundRect(-8, -4, 16, 8, 3).fill(0x44d07d).stroke({ color: 0xbef2ce, width: 1.5, alpha: 0.9 });
            speakingBadge.visible = false;

            const body = new Container();
            drawAvatarBody(body, resolvedAppearance, isLocalPlayer);

            const label = new Text({
                text: resolvedName,
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 12,
                    fontWeight: '700',
                    fill: '#2d2d2d',
                    stroke: { color: '#ffffff', width: 3 },
                    align: 'center',
                }),
            });
            label.anchor.set(0.5, 1);

            avatarVisual = { ring, body, label, speakingBadge, target: { x, y }, appearance: resolvedAppearance };
            avatarsRef.current.set(playerId, avatarVisual);
            app.stage.addChild(ring);
            app.stage.addChild(body);
            app.stage.addChild(label);
            app.stage.addChild(speakingBadge);
        }

        avatarVisual.target = { x, y };
        avatarVisual.label.text = resolvedName;
        if (JSON.stringify(avatarVisual.appearance) !== JSON.stringify(resolvedAppearance)) {
            avatarVisual.appearance = resolvedAppearance;
            drawAvatarBody(avatarVisual.body, resolvedAppearance, (connectionIdRef.current ?? getHubConnection().connectionId) === playerId);
        }

        const localId = connectionIdRef.current ?? getHubConnection().connectionId;
        if (localId && playerId === localId) {
            avatarVisual.ring.position.set(x, y);
            avatarVisual.body.position.set(x, y);
            avatarVisual.label.position.set(x, y - 26);
            avatarVisual.speakingBadge.position.set(x, y - 38);
            localPositionRef.current = { x, y };
        } else if (!localId || playerId === getHubConnection().connectionId) {
            // Before local connectionId is known, keep initial spawn anchored.
            avatarVisual.ring.position.set(x, y);
            avatarVisual.body.position.set(x, y);
            avatarVisual.label.position.set(x, y - 26);
            avatarVisual.speakingBadge.position.set(x, y - 38);
        }
    }, [drawAvatarBody, getFallbackAvatarAppearance, updateProximityIndicators]);

    const flushPendingAvatars = useCallback(() => {
        for (const [playerId, position] of pendingAvatarsRef.current) {
            upsertAvatar(playerId, position.x, position.y, pendingDisplayNamesRef.current.get(playerId), pendingAvatarAppearancesRef.current.get(playerId));
        }
    }, [upsertAvatar]);

    const broadcastPosition = useCallback((x: number, y: number) => {
        void getHubConnection().invoke('BroadcastPosition', x, y).catch(() => undefined);
    }, []);

    const loadAudioDevices = useCallback(async () => {
        setSettingsError(null);

        let permissionProbeStream: MediaStream | null = null;
        try {
            let devices = await navigator.mediaDevices.enumerateDevices();
            let microphones = devices.filter((device) => device.kind === 'audioinput');
            let speakers = devices.filter((device) => device.kind === 'audiooutput');

            const hasLabels = microphones.some((device) => device.label.trim().length > 0);
            if (!hasLabels && !localMicStreamRef.current) {
                try {
                    permissionProbeStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                } catch {
                    // Ignore permission probe failures; we'll still show device IDs.
                }

                devices = await navigator.mediaDevices.enumerateDevices();
                microphones = devices.filter((device) => device.kind === 'audioinput');
                speakers = devices.filter((device) => device.kind === 'audiooutput');
            }

            setMicDevices(microphones);
            setOutputDevices(speakers);

            if (microphones.length === 0) {
                setSettingsError('No microphone devices found. Please connect a microphone and try again.');
            }

            const preferredId = selectedMicDeviceIdRef.current;
            const hasPreferred = preferredId === 'default' || microphones.some((device) => device.deviceId === preferredId);
            if (!hasPreferred && microphones.length > 0) {
                setSelectedMicDeviceId(microphones[0].deviceId);
            }

            const preferredOutputId = selectedOutputDeviceIdRef.current;
            const hasPreferredOutput = preferredOutputId === 'default' || speakers.some((device) => device.deviceId === preferredOutputId);
            if (!hasPreferredOutput && speakers.length > 0) {
                setSelectedOutputDeviceId(speakers[0].deviceId);
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unable to enumerate microphone devices.';
            setSettingsError(message);
        } finally {
            if (permissionProbeStream) {
                for (const track of permissionProbeStream.getTracks()) {
                    track.stop();
                }
            }
        }
    }, []);

    const applyPreferredMicDevice = useCallback(async (deviceId: string) => {
        const audioConstraint: MediaTrackConstraints | boolean = deviceId === 'default'
            ? true
            : { deviceId: { exact: deviceId } };

        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
        const previousStream = localMicStreamRef.current;
        localMicStreamRef.current = stream;

        const [newAudioTrack] = stream.getAudioTracks();
        if (newAudioTrack) {
            newAudioTrack.enabled = !isMutedRef.current;
            for (const peerConnection of peerConnectionsRef.current.values()) {
                const audioSender = peerConnection.getSenders().find((sender) => sender.track?.kind === 'audio');
                if (audioSender) {
                    await audioSender.replaceTrack(newAudioTrack);
                } else {
                    peerConnection.addTrack(newAudioTrack, stream);
                }
            }
        }

        if (previousStream) {
            for (const track of previousStream.getTracks()) {
                track.stop();
            }
        }
    }, []);

    const toggleMute = useCallback(() => {
        setIsMuted((previous) => !previous);
    }, []);

    const stopScreenSharing = useCallback(async () => {
        const screenStream = localScreenStreamRef.current;
        if (!screenStream) {
            return;
        }

        setLocalScreenShareStatus('stopping');
        localScreenStreamRef.current = null;
        setIsScreenSharing(false);
        const activeSessions = Array.from(localScreenShareSessionIdsRef.current.entries());
        localScreenShareSessionIdsRef.current.clear();

        void Promise.allSettled(activeSessions.map(async ([peerId, sessionId]) => {
            await getHubConnection().invoke('SendScreenShareStopped', peerId, sessionId);
            await getHubConnection().invoke('ClearScreenShareSession', peerId, sessionId);
            closeOutgoingScreenSharePeerConnection(peerId);
        }));

        for (const track of screenStream.getTracks()) {
            track.onended = null;
            track.stop();
        }

        setLocalScreenShareStatus('idle');
        pushToast('Screen share stopped', 'info', 'local-share-stopped');
    }, [closeOutgoingScreenSharePeerConnection, pushToast]);

    useEffect(() => {
        stopScreenSharingRef.current = stopScreenSharing;
        return () => {
            stopScreenSharingRef.current = null;
        };
    }, [stopScreenSharing]);

    useEffect(() => {
        return () => {
            for (const timeoutId of toastTimeoutsRef.current.values()) {
                globalThis.clearTimeout(timeoutId);
            }
            toastTimeoutsRef.current.clear();
            recentToastKeysRef.current.clear();
        };
    }, []);

    const startScreenSharing = useCallback(async () => {
        if (voiceStatusRef.current !== 'ready' || localScreenStreamRef.current || localScreenShareStatus === 'starting' || localScreenShareStatus === 'stopping') {
            return;
        }

        const connectedPeerIds = Array.from(peerConnectionsRef.current.keys());
        const acceptedPeerIds: string[] = [];
        const acceptedSessions: Array<[string, string]> = [];
        try {
            setLocalScreenShareStatus('starting');
            let screenStream: MediaStream | null = null;
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    frameRate: { ideal: 12, max: 15 },
                    width: { max: 1920 },
                    height: { max: 1080 },
                },
                audio: false,
            });
            const [screenTrack] = screenStream.getVideoTracks();
            if (!screenTrack) {
                for (const track of screenStream.getTracks()) {
                    track.stop();
                }
                setLocalScreenShareStatus('idle');
                return;
            }

            for (const peerId of connectedPeerIds) {
                const sessionId = await registerLocalScreenShareTarget(peerId);
                if (sessionId) {
                    acceptedPeerIds.push(peerId);
                    acceptedSessions.push([peerId, sessionId]);
                }
            }

            if (acceptedPeerIds.length === 0) {
                for (const track of screenStream.getTracks()) {
                    track.stop();
                }
                localScreenShareSessionIdsRef.current.clear();
                setLocalScreenShareStatus('idle');
                pushToast('No connected peers are available for screen sharing', 'warning', 'share-no-targets');
                return;
            }

            screenTrack.onended = () => {
                void stopScreenSharing();
            };

            localScreenStreamRef.current = screenStream;
            setIsScreenSharing(true);
            setLocalScreenShareStatus('active');
            screenTrack.contentHint = 'detail';
            pushToast(acceptedPeerIds.length > 1 ? `Sharing to ${acceptedPeerIds.length} peers` : 'Screen sharing started', 'success', 'local-share-started');

            void Promise.allSettled(acceptedPeerIds.map(async (peerId) => {
                await createAndSendScreenShareOffer(peerId);
            }));
        } catch {
            void Promise.allSettled(acceptedSessions.map(([peerId, sessionId]) => getHubConnection().invoke('ClearScreenShareSession', peerId, sessionId)));
            localScreenShareSessionIdsRef.current.clear();
            localScreenStreamRef.current = null;
            setIsScreenSharing(false);
            setLocalScreenShareStatus('idle');
            pushToast('Unable to start screen sharing', 'error', 'local-share-failed');
        }
    }, [createAndSendScreenShareOffer, localScreenShareStatus, pushToast, registerLocalScreenShareTarget, stopScreenSharing]);

    const toggleScreenSharing = useCallback(() => {
        if (localScreenStreamRef.current) {
            void stopScreenSharing();
            return;
        }

        void startScreenSharing();
    }, [startScreenSharing, stopScreenSharing]);

    const savePlayerName = useCallback((): string | null => {
        const trimmedName = playerName.trim();
        if (!trimmedName) {
            setSignalrStatus('error');
            setSignalrError('Please choose a name before continuing.');
            return null;
        }

        localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmedName);
        setPlayerName(trimmedName);
        setSignalrError(null);
        return trimmedName;
    }, [playerName]);

    const randomizeAvatarAppearance = useCallback(() => {
        const pick = <T,>(values: T[]): T => values[Math.floor(Math.random() * values.length)] ?? values[0];
        let topColor = pick(AVATAR_CLOTHING_COLORS);
        let bottomColor = pick(AVATAR_CLOTHING_COLORS);

        if (topColor === bottomColor) {
            bottomColor = AVATAR_CLOTHING_COLORS[(AVATAR_CLOTHING_COLORS.indexOf(topColor) + 3) % AVATAR_CLOTHING_COLORS.length] ?? bottomColor;
        }

        setAvatarAppearance({
            skinTone: pick(AVATAR_SKIN_TONES),
            bodyStyle: pick(AVATAR_STYLE_OPTIONS.map((option) => option.value)),
            topColor,
            bottomColor,
            accessory: pick(AVATAR_ACCESSORY_OPTIONS.map((option) => option.value)),
            accentColor: pick(AVATAR_ACCENT_COLORS),
        });
    }, []);

    const connectToSignalR = useCallback(async () => {
        const savedName = savePlayerName();
        if (!savedName) {
            return;
        }

        setSignalrStatus('connecting');
        setSignalrError(null);

        try {
            const connection = getHubConnection();
            await startHubConnection();
            await connection.invoke('SetDisplayName', savedName);
            await connection.invoke('SetAvatarAppearance', JSON.stringify(avatarAppearanceRef.current));

            const id = connection.connectionId;
            setConnectionId(id);
            setSignalrStatus(id ? 'connected' : 'error');
            setIsNameDialogOpen(false);

            if (id) {
                setVoiceStatus('joining');
                setVoiceError(null);
                try {
                    await applyPreferredMicDevice(selectedMicDeviceIdRef.current);
                    setVoiceStatus('ready');
                } catch (voiceSetupError: unknown) {
                    const voiceMessage = voiceSetupError instanceof Error
                        ? voiceSetupError.message
                        : 'Unable to access your microphone.';
                    setVoiceStatus('error');
                    setVoiceError(voiceMessage);
                }
            }

            if (!id) {
                setSignalrError('Connected but no connectionId was received.');
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown SignalR error';
            setSignalrStatus('error');
            setSignalrError(message);
        }
    }, [applyPreferredMicDevice, savePlayerName]);

    const openSettingsDialog = useCallback(() => {
        setSettingsError(null);
        setIsSettingsDialogOpen(true);
        void loadAudioDevices();
    }, [loadAudioDevices]);

    const saveMicSettings = useCallback(async () => {
        localStorage.setItem(PREFERRED_MIC_DEVICE_STORAGE_KEY, selectedMicDeviceId);
        localStorage.setItem(PREFERRED_OUTPUT_DEVICE_STORAGE_KEY, selectedOutputDeviceId);
        selectedMicDeviceIdRef.current = selectedMicDeviceId;
        selectedOutputDeviceIdRef.current = selectedOutputDeviceId;

        await applyOutputDeviceToAllRemoteAudio(selectedOutputDeviceId);

        if (voiceStatusRef.current === 'ready') {
            try {
                setVoiceStatus('joining');
                setVoiceError(null);
                await applyPreferredMicDevice(selectedMicDeviceId);
                setVoiceStatus('ready');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unable to switch microphone device.';
                setVoiceStatus('error');
                setVoiceError(message);
                setSettingsError(message);
                return;
            }
        }

        setIsSettingsDialogOpen(false);
    }, [applyOutputDeviceToAllRemoteAudio, applyPreferredMicDevice, selectedMicDeviceId, selectedOutputDeviceId]);

    const handleReceiveOffer = useCallback(async (fromConnectionId: string, sdp: string) => {
        if (!localMicStreamRef.current || voiceStatus !== 'ready') {
            return;
        }

        const peerConnection = getOrCreatePeerConnection(fromConnectionId);
        if (!peerConnection) {
            return;
        }

        try {
            await peerConnection.setRemoteDescription({ type: 'offer', sdp });
            await attachPendingIceCandidates(fromConnectionId);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            if (peerConnection.localDescription?.sdp) {
                await getHubConnection().invoke('SendAnswer', fromConnectionId, peerConnection.localDescription.sdp);
            }
        } catch {
            closePeerConnection(fromConnectionId);
        }
    }, [attachPendingIceCandidates, closePeerConnection, getOrCreatePeerConnection, voiceStatus]);

    const handleReceiveAnswer = useCallback(async (fromConnectionId: string, sdp: string) => {
        const peerConnection = peerConnectionsRef.current.get(fromConnectionId);
        if (!peerConnection) {
            return;
        }

        try {
            await peerConnection.setRemoteDescription({ type: 'answer', sdp });
            await attachPendingIceCandidates(fromConnectionId);
        } catch {
            closePeerConnection(fromConnectionId);
        }
    }, [attachPendingIceCandidates, closePeerConnection]);

    const handleReceiveIceCandidate = useCallback(async (fromConnectionId: string, candidateJson: string) => {
        let candidate: RTCIceCandidateInit;
        try {
            candidate = JSON.parse(candidateJson) as RTCIceCandidateInit;
        } catch {
            return;
        }

        const peerConnection = peerConnectionsRef.current.get(fromConnectionId);
            if (!peerConnection?.remoteDescription) {
            const queued = pendingIceCandidatesRef.current.get(fromConnectionId) ?? [];
            queued.push(candidate);
            pendingIceCandidatesRef.current.set(fromConnectionId, queued);
            return;
        }

        try {
            await peerConnection.addIceCandidate(candidate);
        } catch {
            // Ignore stale ICE candidates.
        }
    }, []);

    const handleReceiveScreenShareStarted = useCallback((fromConnectionId: string, sessionId: string) => {
        announcedRemoteScreenSharersRef.current.add(fromConnectionId);
        remoteScreenShareSessionIdsRef.current.set(fromConnectionId, sessionId);
        setSelectedRemoteScreenSharePeerId(fromConnectionId);
        setRemoteScreenShareStatus(fromConnectionId, 'starting');
        pushToast(`${getPeerDisplayName(fromConnectionId)} started sharing`, 'info', `remote-share-started:${fromConnectionId}`);
        const existingStream = remoteScreenStreamsRef.current.get(fromConnectionId);
        if (existingStream) {
            syncRemoteScreenSharePresentation(fromConnectionId, existingStream);
        }
    }, [getPeerDisplayName, pushToast, setRemoteScreenShareStatus, syncRemoteScreenSharePresentation]);

    const handleReceiveScreenShareOfferRequest = useCallback((fromConnectionId: string, sessionId: string) => {
        if (!localScreenStreamRef.current || localScreenShareSessionIdsRef.current.get(fromConnectionId) !== sessionId) {
            return;
        }

        void createAndSendScreenShareOffer(fromConnectionId);
    }, [createAndSendScreenShareOffer]);

    const handleReceiveScreenShareOffer = useCallback(async (fromConnectionId: string, sessionId: string, sdp: string) => {
        remoteScreenShareSessionIdsRef.current.set(fromConnectionId, sessionId);
        const peerConnection = getOrCreateIncomingScreenSharePeerConnection(fromConnectionId);

        try {
            await peerConnection.setRemoteDescription({ type: 'offer', sdp });
            await attachPendingIncomingScreenShareIceCandidates(fromConnectionId);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            if (peerConnection.localDescription?.sdp) {
                await getHubConnection().invoke('SendScreenShareAnswer', fromConnectionId, sessionId, peerConnection.localDescription.sdp);
            }
        } catch {
            setRemoteScreenShareStatus(fromConnectionId, 'error');
            closeIncomingScreenSharePeerConnection(fromConnectionId);
        }
    }, [attachPendingIncomingScreenShareIceCandidates, closeIncomingScreenSharePeerConnection, getOrCreateIncomingScreenSharePeerConnection, setRemoteScreenShareStatus]);

    const handleReceiveScreenShareAnswer = useCallback(async (fromConnectionId: string, sessionId: string, sdp: string) => {
        if (localScreenShareSessionIdsRef.current.get(fromConnectionId) !== sessionId) {
            return;
        }

        const peerConnection = outgoingScreenSharePeerConnectionsRef.current.get(fromConnectionId);
        if (!peerConnection) {
            return;
        }

        try {
            await peerConnection.setRemoteDescription({ type: 'answer', sdp });
            await attachPendingOutgoingScreenShareIceCandidates(fromConnectionId);
        } catch {
            closeOutgoingScreenSharePeerConnection(fromConnectionId);
        }
    }, [attachPendingOutgoingScreenShareIceCandidates, closeOutgoingScreenSharePeerConnection]);

    const handleReceiveScreenShareIceCandidate = useCallback(async (fromConnectionId: string, sessionId: string, candidateJson: string) => {
        let candidate: RTCIceCandidateInit;
        try {
            candidate = JSON.parse(candidateJson) as RTCIceCandidateInit;
        } catch {
            return;
        }

        const incomingPeerConnection = incomingScreenSharePeerConnectionsRef.current.get(fromConnectionId);
        if (incomingPeerConnection) {
            const remoteSessionId = remoteScreenShareSessionIdsRef.current.get(fromConnectionId);
            if (remoteSessionId && remoteSessionId !== sessionId) {
                return;
            }

            if (!incomingPeerConnection.remoteDescription) {
                const queued = pendingIncomingScreenShareIceCandidatesRef.current.get(fromConnectionId) ?? [];
                queued.push(candidate);
                pendingIncomingScreenShareIceCandidatesRef.current.set(fromConnectionId, queued);
                return;
            }

            try {
                await incomingPeerConnection.addIceCandidate(candidate);
            } catch {
                // Ignore stale ICE candidates.
            }
            return;
        }

        const outgoingPeerConnection = outgoingScreenSharePeerConnectionsRef.current.get(fromConnectionId);
        if (outgoingPeerConnection) {
            if (localScreenShareSessionIdsRef.current.get(fromConnectionId) !== sessionId) {
                return;
            }

            if (!outgoingPeerConnection.remoteDescription) {
                const queued = pendingOutgoingScreenShareIceCandidatesRef.current.get(fromConnectionId) ?? [];
                queued.push(candidate);
                pendingOutgoingScreenShareIceCandidatesRef.current.set(fromConnectionId, queued);
                return;
            }

            try {
                await outgoingPeerConnection.addIceCandidate(candidate);
            } catch {
                // Ignore stale ICE candidates.
            }
            return;
        }

        // If no screen-share connection exists yet, this candidate belongs to an incoming share
        // offer that has not been processed yet. Queue it on the incoming path.
        remoteScreenShareSessionIdsRef.current.set(fromConnectionId, sessionId);
        const queued = pendingIncomingScreenShareIceCandidatesRef.current.get(fromConnectionId) ?? [];
        queued.push(candidate);
        pendingIncomingScreenShareIceCandidatesRef.current.set(fromConnectionId, queued);
    }, []);

    const handleReceiveScreenShareStopped = useCallback((fromConnectionId: string, sessionId: string) => {
        const remoteSessionId = remoteScreenShareSessionIdsRef.current.get(fromConnectionId);
        if (remoteSessionId && remoteSessionId !== sessionId) {
            return;
        }

        setRemoteScreenShareStatus(fromConnectionId, 'stopping');
        closeIncomingScreenSharePeerConnection(fromConnectionId);
        pushToast(`${getPeerDisplayName(fromConnectionId)} stopped sharing`, 'info', `remote-share-stopped:${fromConnectionId}`);
    }, [closeIncomingScreenSharePeerConnection, getPeerDisplayName, pushToast, setRemoteScreenShareStatus]);

    const handleReceiveScreenShareReplaced = useCallback((replacingConnectionId: string, _targetConnectionId: string, _newSessionId: string, replacedSessionId: string) => {
        if (localScreenShareSessionIdsRef.current.get(replacingConnectionId) !== replacedSessionId) {
            return;
        }

        const replacingUserName = getPeerDisplayName(replacingConnectionId);
        void stopScreenSharingForPeer(replacingConnectionId, false);
        pushToast(`${replacingUserName} replaced your screen share`, 'warning', `share-replaced:${replacingConnectionId}`);
    }, [getPeerDisplayName, pushToast, stopScreenSharingForPeer]);

    useEffect(() => {
        const connection = getHubConnection();

        const onPlayerSpawned = (playerId: string, x: number, y: number, displayName: string, appearanceJson?: string) => {
            let appearance: AvatarAppearance | undefined;
            if (appearanceJson) {
                try {
                    appearance = normalizeAvatarAppearance(JSON.parse(appearanceJson));
                } catch {
                    appearance = undefined;
                }
            }

            upsertAvatar(playerId, x, y, displayName, appearance);
        };

        const onPlayerMoved = (playerId: string, x: number, y: number) => {
            upsertAvatar(playerId, x, y);
        };

        const onPlayerNameUpdated = (playerId: string, displayName: string) => {
            pendingDisplayNamesRef.current.set(playerId, displayName);
            const existing = avatarsRef.current.get(playerId);
            existing?.label && (existing.label.text = displayName);
        };

        const onPlayerAppearanceUpdated = (playerId: string, appearanceJson: string) => {
            let appearance: AvatarAppearance;
            try {
                appearance = normalizeAvatarAppearance(JSON.parse(appearanceJson));
            } catch {
                appearance = getFallbackAvatarAppearance(playerId);
            }

            pendingAvatarAppearancesRef.current.set(playerId, appearance);
            const existing = avatarsRef.current.get(playerId);
            if (existing) {
                existing.appearance = appearance;
                drawAvatarBody(existing.body, appearance, (connectionIdRef.current ?? getHubConnection().connectionId) === playerId);
            }
        };

        const onPlayerLeft = (playerId: string) => {
            removeAvatar(playerId);
        };

        connection.on('PlayerSpawned', onPlayerSpawned);
        connection.on('PlayerMoved', onPlayerMoved);
        connection.on('PlayerLeft', onPlayerLeft);
        connection.on('PlayerNameUpdated', onPlayerNameUpdated);
        connection.on('PlayerAppearanceUpdated', onPlayerAppearanceUpdated);

        return () => {
            connection.off('PlayerSpawned', onPlayerSpawned);
            connection.off('PlayerMoved', onPlayerMoved);
            connection.off('PlayerLeft', onPlayerLeft);
            connection.off('PlayerNameUpdated', onPlayerNameUpdated);
            connection.off('PlayerAppearanceUpdated', onPlayerAppearanceUpdated);
            closeAllPeerConnections();
            stopHubConnection();
        };
    }, [closeAllPeerConnections, drawAvatarBody, getFallbackAvatarAppearance, removeAvatar, upsertAvatar]);

    useEffect(() => {
        const connection = getHubConnection();
        connection.on('ReceiveOffer', handleReceiveOffer);
        connection.on('ReceiveAnswer', handleReceiveAnswer);
        connection.on('ReceiveIceCandidate', handleReceiveIceCandidate);
        connection.on('ReceiveScreenShareStarted', handleReceiveScreenShareStarted);
        connection.on('ReceiveScreenShareOfferRequest', handleReceiveScreenShareOfferRequest);
        connection.on('ReceiveScreenShareOffer', handleReceiveScreenShareOffer);
        connection.on('ReceiveScreenShareAnswer', handleReceiveScreenShareAnswer);
        connection.on('ReceiveScreenShareIceCandidate', handleReceiveScreenShareIceCandidate);
        connection.on('ReceiveScreenShareStopped', handleReceiveScreenShareStopped);
        connection.on('ReceiveScreenShareReplaced', handleReceiveScreenShareReplaced);

        return () => {
            connection.off('ReceiveOffer', handleReceiveOffer);
            connection.off('ReceiveAnswer', handleReceiveAnswer);
            connection.off('ReceiveIceCandidate', handleReceiveIceCandidate);
            connection.off('ReceiveScreenShareStarted', handleReceiveScreenShareStarted);
            connection.off('ReceiveScreenShareOfferRequest', handleReceiveScreenShareOfferRequest);
            connection.off('ReceiveScreenShareOffer', handleReceiveScreenShareOffer);
            connection.off('ReceiveScreenShareAnswer', handleReceiveScreenShareAnswer);
            connection.off('ReceiveScreenShareIceCandidate', handleReceiveScreenShareIceCandidate);
            connection.off('ReceiveScreenShareStopped', handleReceiveScreenShareStopped);
            connection.off('ReceiveScreenShareReplaced', handleReceiveScreenShareReplaced);
        };
    }, [handleReceiveAnswer, handleReceiveIceCandidate, handleReceiveOffer, handleReceiveScreenShareAnswer, handleReceiveScreenShareIceCandidate, handleReceiveScreenShareOffer, handleReceiveScreenShareOfferRequest, handleReceiveScreenShareReplaced, handleReceiveScreenShareStarted, handleReceiveScreenShareStopped]);

    useEffect(() => {
        if (voiceStatus !== 'ready') {
            void stopScreenSharing();
            closeAllPeerConnections();
        }
    }, [closeAllPeerConnections, stopScreenSharing, voiceStatus]);

    useEffect(() => {
        const isTextInputTarget = (target: EventTarget | null): boolean => {
            if (!(target instanceof HTMLElement)) {
                return false;
            }
            const tag = target.tagName.toLowerCase();
            return tag === 'input' || tag === 'textarea' || target.isContentEditable;
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (isTextInputTarget(event.target)) {
                return;
            }

            const key = event.key.toLowerCase();
            if (key === 'w') movementInputRef.current.up = true;
            if (key === 'a') movementInputRef.current.left = true;
            if (key === 's') movementInputRef.current.down = true;
            if (key === 'd') movementInputRef.current.right = true;
            if (key === 'shift') movementInputRef.current.sprint = true;
        };

        const onKeyUp = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (key === 'w') movementInputRef.current.up = false;
            if (key === 'a') movementInputRef.current.left = false;
            if (key === 's') movementInputRef.current.down = false;
            if (key === 'd') movementInputRef.current.right = false;
            if (key === 'shift') movementInputRef.current.sprint = false;
        };

        const onBlur = () => {
            movementInputRef.current = { up: false, down: false, left: false, right: false, sprint: false };
        };

        globalThis.addEventListener('keydown', onKeyDown);
        globalThis.addEventListener('keyup', onKeyUp);
        globalThis.addEventListener('blur', onBlur);

        return () => {
            globalThis.removeEventListener('keydown', onKeyDown);
            globalThis.removeEventListener('keyup', onKeyUp);
            globalThis.removeEventListener('blur', onBlur);
        };
    }, []);

    useEffect(() => {
        let initialized: Application | null = null;
        let cancelled = false;
        let resizeHandler: (() => void) | null = null;
        const app = new Application();

        // ── Single connected floor plan: Office (top) + Break Area (bottom) ─
        // World: 800 × 860. Camera pans by moving the stage in a fullscreen viewport.
        // eslint-disable-next-line sonarjs/cognitive-complexity
        app.init({ width: window.innerWidth, height: window.innerHeight, background: '#4e4236', antialias: true, autoDensity: true }).then(() => {
            if (cancelled) { app.destroy(true); return; }
            initialized = app;
            appRef.current = app;
            app.stage.scale.set(CAMERA_ZOOM, CAMERA_ZOOM);
            const clampCameraPosition = () => {
                const viewportWidth = app.renderer.width;
                const viewportHeight = app.renderer.height;
                const minX = Math.min(0, viewportWidth - (WORLD_WIDTH * CAMERA_ZOOM));
                const minY = Math.min(0, viewportHeight - (WORLD_HEIGHT * CAMERA_ZOOM));

                app.stage.x = Math.min(0, Math.max(minX, app.stage.x));
                app.stage.y = Math.min(0, Math.max(minY, app.stage.y));
            };

            const updateCameraForLocalAvatar = (avatar: AvatarVisual, hardCenter = false) => {
                const viewportWidth = app.renderer.width;
                const viewportHeight = app.renderer.height;
                const minX = Math.min(0, viewportWidth - (WORLD_WIDTH * CAMERA_ZOOM));
                const minY = Math.min(0, viewportHeight - (WORLD_HEIGHT * CAMERA_ZOOM));
                let nextX = app.stage.x;
                let nextY = app.stage.y;

                if (hardCenter) {
                    nextX = (viewportWidth * 0.5) - (avatar.body.x * CAMERA_ZOOM);
                    nextY = (viewportHeight * 0.5) - (avatar.body.y * CAMERA_ZOOM);
                } else {
                    const leftEdge = viewportWidth * CAMERA_EDGE_PADDING_RATIO;
                    const rightEdge = viewportWidth * (1 - CAMERA_EDGE_PADDING_RATIO);
                    const topEdge = viewportHeight * CAMERA_EDGE_PADDING_RATIO;
                    const bottomEdge = viewportHeight * (1 - CAMERA_EDGE_PADDING_RATIO);
                    const screenX = (avatar.body.x * CAMERA_ZOOM) + app.stage.x;
                    const screenY = (avatar.body.y * CAMERA_ZOOM) + app.stage.y;

                    if (screenX < leftEdge) {
                        nextX += leftEdge - screenX;
                    } else if (screenX > rightEdge) {
                        nextX -= screenX - rightEdge;
                    }

                    if (screenY < topEdge) {
                        nextY += topEdge - screenY;
                    } else if (screenY > bottomEdge) {
                        nextY -= screenY - bottomEdge;
                    }
                }

                app.stage.x = Math.min(0, Math.max(minX, nextX));
                app.stage.y = Math.min(0, Math.max(minY, nextY));
            };

            resizeHandler = () => {
                app.renderer.resize(window.innerWidth, window.innerHeight);
                clampCameraPosition();
            };

            window.addEventListener('resize', resizeHandler);

            const OFF_Y = 22, OFF_H = 538;
            const BRK_Y = 610, BRK_H = 200;
            const floors = new Graphics();
            const floorWidth = WORLD_WIDTH - 16;
            const floorRightEdge = WORLD_WIDTH - 8;
            floors.rect(8, OFF_Y, floorWidth, OFF_H).fill(0xf0e4cf);
            floors.rect(8, BRK_Y, floorWidth, BRK_H).fill(0xe8f4e8);
            for (let gx = 68; gx < floorRightEdge; gx += 60) floors.rect(gx, OFF_Y, 1, OFF_H).fill(0xe6d8c0);
            for (let gy = 82; gy < OFF_Y + OFF_H; gy += 60) floors.rect(8, gy, floorWidth, 1).fill(0xe6d8c0);
            for (let gx = 68; gx < floorRightEdge; gx += 60) floors.rect(gx, BRK_Y, 1, BRK_H).fill(0xd8e8d4);
            for (let gy = BRK_Y + 60; gy < BRK_Y + BRK_H; gy += 60) floors.rect(8, gy, floorWidth, 1).fill(0xd8e8d4);
            app.stage.addChild(floors);

            // ── Connecting door passage through shared wall ────────────────
            const conn = new Graphics();
            conn.rect(780, 560, 100, 50).fill(0xd4c9b0);
            conn.rect(774, 556, 6, 58).fill(0x6a5030);
            conn.rect(880, 556, 6, 58).fill(0x6a5030);
            app.stage.addChild(conn);

            // ── Office: wall decorations ───────────────────────────────────
            const offDeco = new Graphics();
            offDeco.roundRect(190, 22, 148, 18, 4).fill(0x88c8f4);
            offDeco.roundRect(772, 22, 148, 18, 4).fill(0x88c8f4);
            offDeco.roundRect(492, 22, 256, 20, 3).fill(0xf0f0ec);
            offDeco.roundRect(1206, 454, 472, 58, 24).fill({ color: 0x7d8f9f, alpha: 0.12 });
            offDeco.roundRect(1220, 464, 444, 38, 18).fill({ color: 0xffffff, alpha: 0.3 });
            offDeco.roundRect(146, 132, 18, 148, 9).fill(0xddd0b8);
            offDeco.roundRect(152, 142, 6, 128, 3).fill(0xf7f0df);
            offDeco.roundRect(948, 108, 18, 176, 9).fill(0xddd0b8);
            offDeco.roundRect(954, 118, 6, 156, 3).fill(0xf7f0df);
            app.stage.addChild(offDeco);

            const coffeeStation = new Graphics();
            coffeeStation.roundRect(320, 508, 138, 52, 12)
                .fill(0xf7f1e7)
                .stroke({ color: 0xc2b092, width: 3, alpha: 0.9 });
            coffeeStation.roundRect(332, 520, 114, 28, 8).fill(0xd2ab77).stroke({ color: 0x92653b, width: 2, alpha: 0.86 });
            coffeeStation.roundRect(342, 526, 36, 16, 5).fill(0x3a434d);
            coffeeStation.roundRect(348, 530, 24, 7, 3).fill(0x8fd0f8);
            coffeeStation.roundRect(384, 526, 18, 16, 5).fill(0xeee7dc).stroke({ color: 0xbda78a, width: 1.5, alpha: 0.82 });
            coffeeStation.roundRect(408, 526, 18, 16, 5).fill(0xeee7dc).stroke({ color: 0xbda78a, width: 1.5, alpha: 0.82 });
            coffeeStation.roundRect(387, 529, 3, 8, 1.5).fill(0xb88955);
            coffeeStation.roundRect(411, 529, 3, 8, 1.5).fill(0xb88955);
            coffeeStation.circle(436, 534, 6).fill(0x6f8d52);
            coffeeStation.circle(443, 536, 5).fill(0x5c7744);
            app.stage.addChild(coffeeStation);

            const conferenceRoom = new Graphics();
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x, CONFERENCE_ROOM_RECT.y, CONFERENCE_ROOM_RECT.width, CONFERENCE_ROOM_RECT.height, 22)
                .fill({ color: 0xf3efe7, alpha: 0.98 })
                .stroke({ color: 0x9b896d, width: 7, alpha: 0.98 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 24, CONFERENCE_ROOM_RECT.y + 22, CONFERENCE_ROOM_RECT.width - 48, CONFERENCE_ROOM_RECT.height - 44, 18)
                .fill({ color: 0xf9f8f2, alpha: 0.92 })
                .stroke({ color: 0xcbd4df, width: 3, alpha: 0.7 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 154, CONFERENCE_ROOM_RECT.y + 34, 260, 58, 12)
                .fill(0xf1f3f6)
                .stroke({ color: 0xc6ccd4, width: 3, alpha: 0.95 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 174, CONFERENCE_ROOM_RECT.y + 52, 220, 22, 8).fill(0xffffff);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 92, CONFERENCE_ROOM_RECT.y + 138, CONFERENCE_ROOM_RECT.width - 184, CONFERENCE_ROOM_RECT.height - 220, 24)
                .fill({ color: 0xe7edf3, alpha: 0.3 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 106, CONFERENCE_ROOM_RECT.y + 154, CONFERENCE_ROOM_RECT.width - 212, CONFERENCE_ROOM_RECT.height - 252, 28)
                .fill({ color: 0xb8c5d1, alpha: 0.12 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 124, CONFERENCE_ROOM_RECT.y + 44, 86, 124, 14).fill(0xf8f5ef).stroke({ color: 0xcfb999, width: 3, alpha: 0.82 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 136, CONFERENCE_ROOM_RECT.y + 56, 62, 42, 10).fill(0xe0c1a3);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + 136, CONFERENCE_ROOM_RECT.y + 108, 62, 42, 10).fill(0xb5cfb4);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 210, CONFERENCE_ROOM_RECT.y + 44, 86, 124, 14).fill(0xf8f5ef).stroke({ color: 0xcfb999, width: 3, alpha: 0.82 });
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 198, CONFERENCE_ROOM_RECT.y + 56, 62, 42, 10).fill(0xccd7e4);
            conferenceRoom.roundRect(CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 198, CONFERENCE_ROOM_RECT.y + 108, 62, 42, 10).fill(0xd9c1a5);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x, CONFERENCE_TABLE_RECT.y, CONFERENCE_TABLE_RECT.width, CONFERENCE_TABLE_RECT.height, 22)
                .fill(0xb78a54)
                .stroke({ color: 0x7f5f39, width: 6, alpha: 0.95 });
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 22, CONFERENCE_TABLE_RECT.y + 18, CONFERENCE_TABLE_RECT.width - 44, 26, 10).fill(0xd0a26a);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 24, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height - 42, CONFERENCE_TABLE_RECT.width - 48, 22, 10).fill(0x9f7443);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 60, CONFERENCE_TABLE_RECT.y - 34, 20).fill(0x8a4f7d);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 50, CONFERENCE_TABLE_RECT.y - 60, 20, 16, 6).fill(0x6f3b67);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 150, CONFERENCE_TABLE_RECT.y - 34, 20).fill(0x367eae);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 140, CONFERENCE_TABLE_RECT.y - 60, 20, 16, 6).fill(0x255d84);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 240, CONFERENCE_TABLE_RECT.y - 34, 20).fill(0x6e56a4);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 230, CONFERENCE_TABLE_RECT.y - 60, 20, 16, 6).fill(0x55407f);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 60, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 34, 20).fill(0xb07624);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 50, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 8, 20, 16, 6).fill(0x8a5a18);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 150, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 34, 20).fill(0x2c918d);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 140, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 8, 20, 16, 6).fill(0x1f6e6b);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + 240, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 34, 20).fill(0x4e8a3a);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + 230, CONFERENCE_TABLE_RECT.y + CONFERENCE_TABLE_RECT.height + 8, 20, 16, 6).fill(0x39672a);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x - 42, CONFERENCE_TABLE_RECT.y + 48, 20).fill(0xb05032);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x - 66, CONFERENCE_TABLE_RECT.y + 40, 16, 20, 6).fill(0x883b25);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x - 42, CONFERENCE_TABLE_RECT.y + 102, 20).fill(0x9b7440);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x - 66, CONFERENCE_TABLE_RECT.y + 94, 16, 20, 6).fill(0x78562e);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 42, CONFERENCE_TABLE_RECT.y + 48, 20).fill(0x7b8f30);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 50, CONFERENCE_TABLE_RECT.y + 40, 16, 20, 6).fill(0x617223);
            conferenceRoom.circle(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 42, CONFERENCE_TABLE_RECT.y + 102, 20).fill(0x4f8d54);
            conferenceRoom.roundRect(CONFERENCE_TABLE_RECT.x + CONFERENCE_TABLE_RECT.width + 50, CONFERENCE_TABLE_RECT.y + 94, 16, 20, 6).fill(0x39673d);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x + 6, CONFERENCE_DOOR_RECT.y, CONFERENCE_DOOR_RECT.width - 2, CONFERENCE_DOOR_RECT.height, 10).fill(0xd4c9b0);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x, CONFERENCE_DOOR_RECT.y - 6, CONFERENCE_DOOR_RECT.width + 8, 6, 3).fill(0x6a5030);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x, CONFERENCE_DOOR_RECT.y + CONFERENCE_DOOR_RECT.height, CONFERENCE_DOOR_RECT.width + 8, 6, 3).fill(0x6a5030);
            conferenceRoom.roundRect(CONFERENCE_DOOR_RECT.x + 18, CONFERENCE_DOOR_RECT.y + 18, 12, CONFERENCE_DOOR_RECT.height - 36, 6).fill(0xefdfb0);
            const conferenceLabel = new Text({
                text: 'CONFERENCE',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 24,
                    fontWeight: '900',
                    fill: '#596474',
                    letterSpacing: 3,
                }),
            });
            conferenceLabel.anchor.set(0.5);
            conferenceLabel.position.set(CONFERENCE_ROOM_RECT.x + (CONFERENCE_ROOM_RECT.width * 0.5), CONFERENCE_ROOM_RECT.y + 124);
            conferenceRoom.addChild(conferenceLabel);
            app.stage.addChild(conferenceRoom);

            const cubicles = new Graphics();
            OFFICE_CUBICLE_PODS.forEach((pod) => {
                cubicles.roundRect(pod.x + 6, pod.y + 6, pod.width - 12, pod.height - 12, 16)
                    .fill({ color: 0xf8f5ee, alpha: 0.98 });

                // Walls in top view, with an office-facing doorway on the right.
                cubicles.roundRect(pod.x, pod.y, pod.width, 12, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x, pod.y + pod.height - 12, pod.width, 12, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x, pod.y, 12, pod.height, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x + pod.width - 12, pod.y, 12, 42, 8).fill(0xb39f84);
                cubicles.roundRect(pod.x + pod.width - 12, pod.y + 94, 12, pod.height - 94, 8).fill(0xb39f84);

                // Door leaf shown open into the booth.
                cubicles.roundRect(pod.x + pod.width - 28, pod.y + 50, 12, 34, 6)
                    .fill(0xe4d4bb)
                    .stroke({ color: 0xb99668, width: 2, alpha: 0.9 });

                // Desk fixed against the back wall.
                cubicles.roundRect(pod.x + 30, pod.y + 22, 116, 32, 8)
                    .fill(0xc99658)
                    .stroke({ color: 0x8d6636, width: 2, alpha: 0.9 });
                cubicles.roundRect(pod.x + 42, pod.y + 28, 92, 10, 5).fill(0xe6bb82);

                // Laptop sitting on the desk in top view.
                cubicles.roundRect(pod.x + 82, pod.y + 30, 28, 16, 4).fill(0x2f3843);
                cubicles.roundRect(pod.x + 86, pod.y + 33, 20, 9, 3).fill(0x79b9ee);

                // Desk chair in top view, facing the desk.
                cubicles.circle(pod.x + 98, pod.y + 86, 16).fill(0x287a9f);
                cubicles.roundRect(pod.x + 90, pod.y + 92, 16, 14, 5).fill(0x1f5f7b);
            });
            app.stage.addChild(cubicles);

            const podLabels = ['Pod A', 'Pod B', 'Pod C'];
            OFFICE_CUBICLE_PODS.forEach((pod, index) => {
                const label = new Text({
                    text: podLabels[index] ?? `Pod ${index + 1}`,
                    style: new TextStyle({
                        fontFamily: 'Verdana',
                        fontSize: 11,
                        fontWeight: '900',
                        fill: '#6a7582',
                        letterSpacing: 0.6,
                    }),
                });
                label.anchor.set(0.5, 0.5);
                label.position.set(pod.x + (pod.width * 0.5), pod.y + 112);
                app.stage.addChild(label);
            });

            // ── Office: central collaboration table with laptops/chairs ───
            const officeCore = new Graphics();
            const officeClusterOffsetX = 320;
            officeCore.roundRect(224 + officeClusterOffsetX, 92, 452, 318, 34).fill({ color: 0x8f6c49, alpha: 0.12 });
            officeCore.roundRect(236 + officeClusterOffsetX, 102, 428, 298, 30).fill({ color: 0xd8c1a0, alpha: 0.46 });
            officeCore.rect(250 + officeClusterOffsetX, 110, 400, 280).fill(0xc89a5a).stroke({ color: 0x8d6636, width: 5 });
            officeCore.rect(264 + officeClusterOffsetX, 122, 372, 24).fill(0xdab074);
            officeCore.rect(264 + officeClusterOffsetX, 346, 372, 24).fill(0xb7884e);
            officeCore.rect(268 + officeClusterOffsetX, 150, 20, 200).fill(0xb5864e);
            officeCore.rect(612 + officeClusterOffsetX, 150, 20, 200).fill(0xb5864e);

            const chairFill = [
                0x2968b4, 0xb02e2e, 0x2e8a4a, 0x8040b4,
                0xb07820, 0x2e9898, 0x6a4c93, 0x4d8f41,
                0xa14578, 0x287a9f, 0x7b8f30, 0xa35f2b,
            ];
            const chairBack = [
                0x184898, 0x8a1a1a, 0x1a6832, 0x602890,
                0x8a5c10, 0x1e7070, 0x4d376f, 0x346e2f,
                0x7a2f5a, 0x1f5f7b, 0x60701f, 0x7d4620,
            ];

            const northSeats = [280, 400, 520, 640].map((x) => x + officeClusterOffsetX);
            northSeats.forEach((x, i) => {
                officeCore.circle(x, 66, 20).fill(chairFill[i]);
                officeCore.roundRect(x - 10, 40, 20, 16, 6).fill(chairBack[i]);
                officeCore.roundRect(x - 19, 122, 38, 18, 4).fill(0x303741);
                officeCore.roundRect(x - 16, 106, 32, 18, 4).fill(0x1b2330);
                officeCore.roundRect(x - 13, 109, 26, 12, 3).fill(0x5ca3e8);
            });

            const southSeats = [280, 400, 520, 640].map((x) => x + officeClusterOffsetX);
            southSeats.forEach((x, i) => {
                officeCore.circle(x, 430, 20).fill(chairFill[i + 4]);
                officeCore.roundRect(x - 10, 440, 20, 16, 6).fill(chairBack[i + 4]);
                officeCore.roundRect(x - 19, 370, 38, 18, 4).fill(0x303741);
                officeCore.roundRect(x - 16, 370, 32, 18, 4).fill(0x1b2330);
                officeCore.roundRect(x - 13, 373, 26, 12, 3).fill(0x5ca3e8);
            });

            const westSeats = [230, 390];
            westSeats.forEach((y, i) => {
                officeCore.circle(200 + officeClusterOffsetX, y - 60, 20).fill(chairFill[8 + i]);
                officeCore.roundRect(176 + officeClusterOffsetX, y - 68, 16, 20, 6).fill(chairBack[8 + i]);
                officeCore.roundRect(270 + officeClusterOffsetX, y - 79, 18, 38, 4).fill(0x303741);
                officeCore.roundRect(270 + officeClusterOffsetX, y - 76, 18, 32, 4).fill(0x1b2330);
                officeCore.roundRect(273 + officeClusterOffsetX, y - 73, 12, 26, 3).fill(0x5ca3e8);
            });

            const eastSeats = [230, 390];
            eastSeats.forEach((y, i) => {
                officeCore.circle(700 + officeClusterOffsetX, y - 60, 20).fill(chairFill[10 + i]);
                officeCore.roundRect(708 + officeClusterOffsetX, y - 68, 16, 20, 6).fill(chairBack[10 + i]);
                officeCore.roundRect(612 + officeClusterOffsetX, y - 79, 18, 38, 4).fill(0x303741);
                officeCore.roundRect(612 + officeClusterOffsetX, y - 76, 18, 32, 4).fill(0x1b2330);
                officeCore.roundRect(615 + officeClusterOffsetX, y - 73, 12, 26, 3).fill(0x5ca3e8);
            });

            app.stage.addChild(officeCore);

            const quotePlaque = new Graphics();
            quotePlaque.roundRect(1164, 214, 260, 108, 18)
                .fill({ color: 0xf8f3e7, alpha: 0.96 })
                .stroke({ color: 0xc6ab7e, width: 4, alpha: 0.9 });
            quotePlaque.roundRect(1180, 230, 228, 76, 14)
                .fill({ color: 0xfffcf5, alpha: 0.92 })
                .stroke({ color: 0xd9ccb6, width: 2, alpha: 0.7 });
            quotePlaque.circle(1188, 268, 5).fill(0xd9b96a);
            quotePlaque.circle(1400, 268, 5).fill(0xd9b96a);
            app.stage.addChild(quotePlaque);

            const quoteText = new Text({
                text: '"Ideas grow when shared."',
                style: new TextStyle({
                    fontFamily: 'Georgia',
                    fontSize: 20,
                    fontStyle: 'italic',
                    fontWeight: '700',
                    fill: '#5f5b63',
                    align: 'center',
                }),
            });
            quoteText.anchor.set(0.5);
            quoteText.position.set(1294, 258);
            app.stage.addChild(quoteText);

            const quoteAuthor = new Text({
                text: 'TEAM WALL',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 11,
                    fontWeight: '900',
                    fill: '#907f68',
                    letterSpacing: 1.6,
                }),
            });
            quoteAuthor.anchor.set(0.5);
            quoteAuthor.position.set(1294, 287);
            app.stage.addChild(quoteAuthor);

            // ── Break area: outside office yard details ───────────────────
            const outdoorDeco = new Graphics();
            outdoorDeco.roundRect(184, 822, 126, 16, 4).fill(0x85bfd8);
            outdoorDeco.roundRect(874, 822, 126, 16, 4).fill(0x85bfd8);
            outdoorDeco.roundRect(8, 610, floorWidth, 200, 26).fill({ color: 0xecf5eb, alpha: 0.22 });
            outdoorDeco.roundRect(14, 618, floorWidth - 12, 184, 22).fill({ color: 0xf7fbf5, alpha: 0.18 });

            // Ground texture patches.
            outdoorDeco.ellipse(244, 640, 88, 34).fill(0xd9efcf);
            outdoorDeco.ellipse(930, 760, 70, 30).fill(0xd4ecc8);
            outdoorDeco.ellipse(980, 610, 64, 24).fill(0xcbe7bf);
            outdoorDeco.ellipse(438, 752, 98, 34).fill({ color: 0xe3f1d8, alpha: 0.84 });
            outdoorDeco.ellipse(1406, 748, 104, 34).fill({ color: 0xe3f1d8, alpha: 0.8 });
            outdoorDeco.ellipse(1608, 652, 82, 28).fill({ color: 0xd7edcf, alpha: 0.76 });

            // Walking path from the door into the yard.
            outdoorDeco.roundRect(754, 608, 152, 90, 18).fill(0xcab894);
            outdoorDeco.roundRect(770, 682, 120, 116, 20).fill(0xd4c3a0);
            outdoorDeco.roundRect(510, 694, 102, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(640, 694, 108, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(772, 694, 104, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(902, 694, 108, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(1032, 694, 102, 26, 13).fill(0xe1d5bf).stroke({ color: 0xbeae91, width: 2, alpha: 0.52 });
            outdoorDeco.roundRect(1302, 702, 128, 14, 7).fill({ color: 0x90b48b, alpha: 0.5 });
            outdoorDeco.roundRect(1296, 696, 14, 28, 7).fill({ color: 0x90b48b, alpha: 0.5 });
            outdoorDeco.roundRect(1422, 696, 14, 28, 7).fill({ color: 0x90b48b, alpha: 0.5 });
            const breakAreaWipX = WORLD_WIDTH - 352;
            outdoorDeco.roundRect(breakAreaWipX, 636, 344, 166, 24)
                .fill({ color: 0xf7fbf4, alpha: 0.3 })
                .stroke({ color: 0xc2d7ba, width: 3, alpha: 0.38 });
            outdoorDeco.roundRect(breakAreaWipX + 28, 664, 290, 92, 18)
                .fill({ color: 0xebdfba, alpha: 0.72 })
                .stroke({ color: 0xc2ac73, width: 3, alpha: 0.7 });
            outdoorDeco.roundRect(breakAreaWipX + 42, 678, 262, 16, 8).fill({ color: 0xf2c95b, alpha: 0.96 });
            outdoorDeco.roundRect(breakAreaWipX + 52, 708, 100, 10, 5).fill({ color: 0xffffff, alpha: 0.58 });
            outdoorDeco.roundRect(breakAreaWipX + 52, 726, 136, 10, 5).fill({ color: 0xffffff, alpha: 0.48 });
            outdoorDeco.roundRect(breakAreaWipX + 10, 770, 324, 16, 8).fill({ color: 0x3f4744, alpha: 0.95 });
            outdoorDeco.roundRect(breakAreaWipX + 8, 768, 78, 20, 10).fill({ color: 0xf2c95b, alpha: 0.98 });
            outdoorDeco.roundRect(breakAreaWipX + 132, 768, 78, 20, 10).fill({ color: 0xf2c95b, alpha: 0.98 });
            outdoorDeco.roundRect(breakAreaWipX + 256, 768, 78, 20, 10).fill({ color: 0xf2c95b, alpha: 0.98 });
            outdoorDeco.roundRect(breakAreaWipX + 38, 710, 44, 44, 10)
                .fill({ color: 0xd3b285, alpha: 0.95 })
                .stroke({ color: 0xaa8257, width: 2.5, alpha: 0.8 });
            outdoorDeco.roundRect(breakAreaWipX + 96, 710, 58, 44, 10)
                .fill({ color: 0xe0c599, alpha: 0.95 })
                .stroke({ color: 0xb58d5e, width: 2.5, alpha: 0.82 });
            outdoorDeco.roundRect(breakAreaWipX + 240, 706, 60, 54, 12)
                .fill({ color: 0xbc7d5b, alpha: 0.92 })
                .stroke({ color: 0x8c5539, width: 2.5, alpha: 0.84 });
            outdoorDeco.circle(breakAreaWipX + 270, 728, 14).fill(0x8fc17a);
            outdoorDeco.circle(breakAreaWipX + 286, 728, 14).fill(0x74a860);
            outdoorDeco.circle(breakAreaWipX + 278, 712, 12).fill(0x5e8f4a);
            app.stage.addChild(outdoorDeco);

            const rulesBoard = new Graphics();
            rulesBoard.roundRect(42, 628, 284, 154, 20)
                .fill({ color: 0xf7f1e4, alpha: 0.97 })
                .stroke({ color: 0xb89664, width: 4, alpha: 0.92 });
            rulesBoard.roundRect(56, 646, 256, 120, 16)
                .fill({ color: 0xfffcf6, alpha: 0.95 })
                .stroke({ color: 0xd8ccba, width: 2, alpha: 0.72 });
            rulesBoard.roundRect(68, 658, 120, 16, 8).fill({ color: 0x7fb1c6, alpha: 0.92 });
            rulesBoard.circle(292, 642, 10).fill(0x78ab72);
            rulesBoard.circle(304, 642, 10).fill(0x5f8f5c);
            app.stage.addChild(rulesBoard);

            const rulesBoardTitle = new Text({
                text: 'HOW TO USE LETSLOL',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 16,
                    fontWeight: '900',
                    fill: '#5a6d7c',
                    letterSpacing: 1.2,
                }),
            });
            rulesBoardTitle.anchor.set(0.5);
            rulesBoardTitle.position.set(184, 682);
            app.stage.addChild(rulesBoardTitle);

            const rulesBoardText = new Text({
                text: 'Move close to people to join calls\nStay in Quiet Zone to pause audio\nUse mic and screen-share buttons above\nOpen settings to change name and devices',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 11,
                    fontWeight: '700',
                    fill: '#6a6258',
                    lineHeight: 17,
                    align: 'center',
                }),
            });
            rulesBoardText.anchor.set(0.5);
            rulesBoardText.position.set(184, 724);
            app.stage.addChild(rulesBoardText);

            const vibeWarning = new Graphics();
            vibeWarning.roundRect(360, 648, 188, 86, 18)
                .fill({ color: 0x4f4032, alpha: 0.94 })
                .stroke({ color: 0xe9c15b, width: 4, alpha: 0.95 });
            vibeWarning.roundRect(378, 664, 38, 38, 10).fill({ color: 0xe9c15b, alpha: 0.98 });
            app.stage.addChild(vibeWarning);

            const vibeWarningIcon = new Text({
                text: '!',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 26,
                    fontWeight: '900',
                    fill: '#5a452b',
                }),
            });
            vibeWarningIcon.anchor.set(0.5);
            vibeWarningIcon.position.set(397, 683);
            app.stage.addChild(vibeWarningIcon);

            const vibeWarningLabel = new Text({
                text: 'WARNING',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 12,
                    fontWeight: '900',
                    fill: '#f6d98f',
                    letterSpacing: 1.4,
                }),
            });
            vibeWarningLabel.anchor.set(0, 0.5);
            vibeWarningLabel.position.set(430, 670);
            app.stage.addChild(vibeWarningLabel);

            const vibeWarningText = new Text({
                text: 'This app was\nvibe coded',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 14,
                    fontWeight: '800',
                    fill: '#fff6df',
                    lineHeight: 16,
                }),
            });
            vibeWarningText.anchor.set(0, 0.5);
            vibeWarningText.position.set(430, 694);
            app.stage.addChild(vibeWarningText);

            const quietZone = new Graphics();
            quietZone.roundRect(BREAK_QUIET_ZONE_RECT.x, BREAK_QUIET_ZONE_RECT.y, BREAK_QUIET_ZONE_RECT.width, BREAK_QUIET_ZONE_RECT.height, 22)
                .fill({ color: 0xa76872, alpha: 0.16 })
                .stroke({ color: 0xd89fa7, width: 3, alpha: 0.68 });
            quietZone.roundRect(BREAK_QUIET_ZONE_RECT.x + 14, BREAK_QUIET_ZONE_RECT.y + 14, BREAK_QUIET_ZONE_RECT.width - 28, BREAK_QUIET_ZONE_RECT.height - 28, 16)
                .fill({ color: 0xe8c9ce, alpha: 0.22 })
                .stroke({ color: 0xffeef0, width: 1.5, alpha: 0.22 });
            app.stage.addChild(quietZone);

            const quietZoneLabel = new Text({
                text: 'QUIET ZONE',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 26,
                    fontWeight: '900',
                    fill: '#fff2f3',
                    letterSpacing: 2,
                }),
            });
            quietZoneLabel.anchor.set(0.5);
            quietZoneLabel.position.set(BREAK_QUIET_ZONE_RECT.x + (BREAK_QUIET_ZONE_RECT.width * 0.5), BREAK_QUIET_ZONE_RECT.y + 42);
            app.stage.addChild(quietZoneLabel);

            const quietZoneHint = new Text({
                text: 'No proximity calls here',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 14,
                    fontWeight: '700',
                    fill: '#fff2f3',
                    letterSpacing: 0.8,
                }),
            });
            quietZoneHint.anchor.set(0.5);
            quietZoneHint.position.set(BREAK_QUIET_ZONE_RECT.x + (BREAK_QUIET_ZONE_RECT.width * 0.5), BREAK_QUIET_ZONE_RECT.y + 76);
            app.stage.addChild(quietZoneHint);

            const breakChair = new Graphics();
            breakChair.roundRect(584, 700, 92, 34, 14).fill(0xd2a451);
            breakChair.roundRect(594, 680, 72, 24, 12).fill(0xb9812f);
            breakChair.roundRect(598, 706, 26, 16, 8).fill(0xe3c27f);
            breakChair.roundRect(636, 706, 26, 16, 8).fill(0xe3c27f);
            breakChair.roundRect(596, 732, 8, 24, 4).fill(0x7a5030);
            breakChair.roundRect(656, 732, 8, 24, 4).fill(0x7a5030);
            app.stage.addChild(breakChair);

            const courtyardPlanters = new Graphics();
            ([[1188, 642], [1246, 652], [1512, 620], [1584, 618]] as [number, number][]).forEach(([px, py], index) => {
                const leaf = index % 2 === 0 ? 0x66995e : 0x78ab72;
                const leafDark = index % 2 === 0 ? 0x426f3e : 0x517f4a;
                courtyardPlanters.roundRect(px, py + 18, 34, 22, 7).fill(0x8b5d39);
                courtyardPlanters.circle(px + 9, py + 8, 13).fill(leaf);
                courtyardPlanters.circle(px + 24, py + 7, 12).fill(leafDark);
                courtyardPlanters.circle(px + 18, py - 2, 12).fill(leaf);
            });
            app.stage.addChild(courtyardPlanters);

            // Big tree at the right side of the yard.
            const bigTree = new Graphics();
            bigTree.roundRect(1002, 640, 48, 150, 16).fill(0x7a5030);
            bigTree.roundRect(1018, 620, 16, 28, 8).fill(0x6d4728);
            bigTree.circle(1026, 600, 82).fill(0x3f9247);
            bigTree.circle(972, 620, 56).fill(0x4eaa56);
            bigTree.circle(1084, 620, 54).fill(0x4ca754);
            bigTree.circle(1024, 548, 52).fill(0x5cbf64);
            bigTree.circle(996, 560, 34).fill(0x2f7d3a);
            bigTree.circle(1062, 564, 32).fill(0x2f7d3a);
            app.stage.addChild(bigTree);

            // Floor marking text.
            const breakAreaLabel = new Text({
                text: 'BREAK AREA',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 42,
                    fontWeight: '900',
                    fill: '#6f8852',
                    stroke: { color: '#eff6df', width: 5 },
                    letterSpacing: 3,
                }),
            });
            breakAreaLabel.anchor.set(0.5);
            breakAreaLabel.position.set(600, 775);
            breakAreaLabel.alpha = 0.9;
            app.stage.addChild(breakAreaLabel);
            const breakAreaWipLabel = new Text({
                text: 'WORK IN PROGRESS',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 21,
                    fontWeight: '900',
                    fill: '#64503b',
                    letterSpacing: 2,
                }),
            });
            breakAreaWipLabel.anchor.set(1, 0.5);
            breakAreaWipLabel.position.set(WORLD_WIDTH - 34, 686);
            breakAreaWipLabel.alpha = 0.95;
            app.stage.addChild(breakAreaWipLabel);

            const breakAreaWipHint = new Text({
                text: 'Patio expansion coming soon',
                style: new TextStyle({
                    fontFamily: 'Verdana',
                    fontSize: 12,
                    fontWeight: '700',
                    fill: '#6d7f61',
                    letterSpacing: 1,
                }),
            });
            breakAreaWipHint.anchor.set(1, 0.5);
            breakAreaWipHint.position.set(WORLD_WIDTH - 34, 714);
            breakAreaWipHint.alpha = 0.96;
            app.stage.addChild(breakAreaWipHint);

            app.canvas.style.width = '100%';
            app.canvas.style.height = '100%';
            app.canvas.style.display = 'block';
            pixiContainerRef.current?.appendChild(app.canvas);
            flushPendingAvatars();

            // eslint-disable-next-line sonarjs/cognitive-complexity
            app.ticker.add(() => {
                const dtSeconds = app.ticker.deltaMS / 1000;
                const smoothingAlpha = 1 - Math.exp(-REMOTE_SMOOTHING_SPEED * dtSeconds);
                const localId = connectionIdRef.current;

                for (const [playerId, avatar] of avatarsRef.current) {
                    if (localId && playerId === localId) {
                        continue;
                    }

                    const dx = avatar.target.x - avatar.body.x;
                    const dy = avatar.target.y - avatar.body.y;
                    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
                        avatar.body.position.set(avatar.target.x, avatar.target.y);
                    } else {
                        avatar.body.position.set(
                            avatar.body.x + (dx * smoothingAlpha),
                            avatar.body.y + (dy * smoothingAlpha),
                        );
                    }

                    avatar.ring.position.set(avatar.body.x, avatar.body.y);
                    avatar.label.position.set(avatar.body.x, avatar.body.y - 26);
                    avatar.speakingBadge.position.set(avatar.body.x, avatar.body.y - 38);
                }

                updateProximityIndicators();

                const nowForVoice = performance.now();
                if (nowForVoice - lastVoiceSyncAtRef.current >= VOICE_SYNC_INTERVAL_MS) {
                    lastVoiceSyncAtRef.current = nowForVoice;
                    syncQuietZoneIndicator();
                    syncProximityVoiceConnections();
                    syncTalkableUsersIndicator();
                    syncLoadingUsersIndicator();
                    syncRemoteSpeechIndicators();
                }

                if (localId) {
                    const localAvatarForCamera = avatarsRef.current.get(localId);
                    if (localAvatarForCamera) {
                        const shouldHardCenter = !hasCameraCenteredRef.current;
                        updateCameraForLocalAvatar(localAvatarForCamera, shouldHardCenter);
                        if (shouldHardCenter) {
                            hasCameraCenteredRef.current = true;
                        }
                    }
                }

                if (!localId || signalrStatusRef.current !== 'connected') {
                    return;
                }

                const avatarVisual = avatarsRef.current.get(localId);
                if (!avatarVisual) {
                    return;
                }

                localPositionRef.current ??= { x: avatarVisual.body.x, y: avatarVisual.body.y };

                const input = movementInputRef.current;
                let dirX = 0;
                let dirY = 0;
                if (input.left) dirX -= 1;
                if (input.right) dirX += 1;
                if (input.up) dirY -= 1;
                if (input.down) dirY += 1;

                if (dirX === 0 && dirY === 0) {
                    return;
                }

                const magnitude = Math.hypot(dirX, dirY);
                const normalizedX = dirX / magnitude;
                const normalizedY = dirY / magnitude;
                const deltaSeconds = app.ticker.deltaMS / 1000;
                const speedMultiplier = input.sprint ? PLAYER_SPRINT_MULTIPLIER : 1;
                const distance = PLAYER_SPEED_PX_PER_SEC * speedMultiplier * deltaSeconds;

                const current = localPositionRef.current;
                const tryX = current.x + normalizedX * distance;
                const tryY = current.y + normalizedY * distance;
                let nextX = current.x;
                let nextY = current.y;

                if (isWalkablePosition(tryX, current.y)) {
                    nextX = tryX;
                }
                if (isWalkablePosition(nextX, tryY)) {
                    nextY = tryY;
                }

                if (nextX === current.x && nextY === current.y) {
                    return;
                }

                localPositionRef.current = { x: nextX, y: nextY };
                avatarVisual.target = { x: nextX, y: nextY };
                avatarVisual.ring.position.set(nextX, nextY);
                avatarVisual.body.position.set(nextX, nextY);
                avatarVisual.label.position.set(nextX, nextY - 26);
                avatarVisual.speakingBadge.position.set(nextX, nextY - 38);

                const now = performance.now();
                if (now - lastBroadcastAtRef.current >= POSITION_BROADCAST_INTERVAL_MS) {
                    lastBroadcastAtRef.current = now;
                    broadcastPosition(nextX, nextY);
                }
            });
        });
        return () => {
            cancelled = true;
            appRef.current = null;
            localPositionRef.current = null;
            movementInputRef.current = { up: false, down: false, left: false, right: false, sprint: false };
            avatarsRef.current.clear();
            pendingAvatarsRef.current.clear();
            pendingDisplayNamesRef.current.clear();
            pendingAvatarAppearancesRef.current.clear();
            for (const peerId of Array.from(remoteSpeechMetersRef.current.keys())) {
                detachRemoteSpeechMeter(peerId);
            }
            talkableUsersSignatureRef.current = '';
            loadingUsersSignatureRef.current = '';
            localScreenShareSessionIdsRef.current.clear();
            announcedRemoteScreenSharersRef.current.clear();
            remoteScreenShareSessionIdsRef.current.clear();
            remoteScreenStreamsRef.current.clear();
            setRemoteScreenShares([]);
            setRemoteScreenShareStatuses({});
            setIsInQuietZone(false);
            closeAllPeerConnections();
            nearbySinceRef.current.clear();
            nearbyIndicatorSinceRef.current.clear();
            if (resizeHandler) {
                window.removeEventListener('resize', resizeHandler);
            }
            if (initialized) {
                initialized.destroy(true);
                initialized = null;
            }
        };
    }, [broadcastPosition, closeAllPeerConnections, detachRemoteSpeechMeter, flushPendingAvatars, isWalkablePosition, syncLoadingUsersIndicator, syncProximityVoiceConnections, syncQuietZoneIndicator, syncRemoteSpeechIndicators, syncTalkableUsersIndicator, updateProximityIndicators]);

    const signalrStatusColors: Record<SignalrStatus, string> = {
        idle: 'text.secondary',
        connecting: 'text.secondary',
        connected: 'success.main',
        error: 'error.main',
    };

    const signalrStatusColor = signalrStatusColors[signalrStatus];

    const voiceStatusColors: Record<VoiceStatus, string> = {
        idle: 'text.secondary',
        joining: 'text.secondary',
        ready: 'success.main',
        error: 'error.main',
    };

    const voiceStatusColor = voiceStatusColors[voiceStatus];
    useEffect(() => {
        const hasVisibleRemoteScreenShareState = remoteScreenShares.length > 0
            || Object.values(remoteScreenShareStatuses).some((status) => status !== 'idle');
        if (!hasVisibleRemoteScreenShareState) {
            setIsRemoteScreenPreviewMinimized(false);
        }
    }, [remoteScreenShareStatuses, remoteScreenShares.length]);

    useEffect(() => {
        if (remoteScreenShares.length === 0) {
            if (selectedRemoteScreenSharePeerId !== null) {
                setSelectedRemoteScreenSharePeerId(null);
            }
            return;
        }

        const hasSelectedShare = selectedRemoteScreenSharePeerId
            ? remoteScreenShares.some((share) => share.peerId === selectedRemoteScreenSharePeerId)
            : false;

        if (!hasSelectedShare) {
            setSelectedRemoteScreenSharePeerId(remoteScreenShares[0]?.peerId ?? null);
        }
    }, [remoteScreenShares, selectedRemoteScreenSharePeerId]);

    const remoteScreenSharePeerIds = Array.from(new Set([
        ...Object.keys(remoteScreenShareStatuses),
        ...remoteScreenShares.map(({ peerId }) => peerId),
    ]));
    const remoteScreenShareNames = remoteScreenSharePeerIds.map((peerId) => getPeerDisplayName(peerId)).join(', ');
    const hasVisibleRemoteScreenShareState = remoteScreenSharePeerIds.length > 0;
    const activeRemoteScreenShareCount = remoteScreenShares.length;
    const selectedRemoteScreenShare = remoteScreenShares.find((share) => share.peerId === selectedRemoteScreenSharePeerId) ?? remoteScreenShares[0] ?? null;
    const remoteScreenShareStatusLabel: Record<RemoteScreenShareStatus, string> = {
        idle: 'Not sharing',
        starting: 'Starting screen share...',
        active: 'Sharing now',
        stopping: 'Stopping screen share...',
        error: 'Screen share error',
    };
    const isLocalScreenShareTransitioning = localScreenShareStatus === 'starting' || localScreenShareStatus === 'stopping';
    const isMobile = useMediaQuery('(max-width:600px)');
    const isShortViewport = useMediaQuery('(max-height:760px)');
    const floatingInset = isMobile ? 10 : 12;
    const actionButtonSize = isMobile ? 44 : 40;
    const floatingBottomOffset = isMobile ? 14 : 12;
    const setVirtualMovement = (direction: 'up' | 'down' | 'left' | 'right', isPressed: boolean) => {
        movementInputRef.current[direction] = isPressed;
    };
    const clearVirtualMovement = () => {
        movementInputRef.current.up = false;
        movementInputRef.current.down = false;
        movementInputRef.current.left = false;
        movementInputRef.current.right = false;
    };
    const renderAvatarCustomization = (showRandomize: boolean) => (
        <Stack spacing={1.5}>
            <Box
                sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: '1px solid rgba(24, 36, 52, 0.1)',
                    background: 'linear-gradient(180deg, rgba(247, 249, 252, 0.96) 0%, rgba(241, 244, 248, 0.96) 100%)',
                }}
            >
                <Stack direction="row" spacing={1.4} alignItems="center">
                    <Box
                        sx={{
                            width: 68,
                            height: 82,
                            borderRadius: 3,
                            background: `linear-gradient(180deg, ${avatarAppearance.skinTone} 0 34%, ${avatarAppearance.topColor} 34% 75%, ${avatarAppearance.bottomColor} 75% 100%)`,
                            border: '2px solid rgba(28, 38, 54, 0.14)',
                            boxShadow: 'inset 0 -14px 0 rgba(0, 0, 0, 0.08)',
                            flexShrink: 0,
                        }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 900, color: '#213043' }}>
                            Avatar preview
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Style: {AVATAR_STYLE_OPTIONS.find((option) => option.value === avatarAppearance.bodyStyle)?.label}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Accessory: {AVATAR_ACCESSORY_OPTIONS.find((option) => option.value === avatarAppearance.accessory)?.label}
                        </Typography>
                    </Box>
                </Stack>
            </Box>

            {showRandomize && (
                <Button type="button" variant="outlined" onClick={randomizeAvatarAppearance}>
                    Randomize Avatar
                </Button>
            )}

            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 0.7 }}>
                    Outfit
                </Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    {AVATAR_STYLE_OPTIONS.map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            variant={avatarAppearance.bodyStyle === option.value ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setAvatarAppearance((current) => ({ ...current, bodyStyle: option.value }))}
                        >
                            {option.label}
                        </Button>
                    ))}
                </Stack>
            </Box>

            <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 0.7 }}>
                    Accessory
                </Typography>
                <Stack direction="row" spacing={0.8} flexWrap="wrap" useFlexGap>
                    {AVATAR_ACCESSORY_OPTIONS.map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            variant={avatarAppearance.accessory === option.value ? 'contained' : 'outlined'}
                            size="small"
                            onClick={() => setAvatarAppearance((current) => ({ ...current, accessory: option.value }))}
                        >
                            {option.label}
                        </Button>
                    ))}
                </Stack>
            </Box>

            {([
                { label: 'Skin tone', values: AVATAR_SKIN_TONES, selected: avatarAppearance.skinTone, shape: 'circle' },
                { label: 'Top color', values: AVATAR_CLOTHING_COLORS, selected: avatarAppearance.topColor, shape: 'rounded' },
                { label: 'Bottom color', values: AVATAR_CLOTHING_COLORS, selected: avatarAppearance.bottomColor, shape: 'rounded' },
                { label: 'Accent color', values: AVATAR_ACCENT_COLORS, selected: avatarAppearance.accentColor, shape: 'circle' },
            ] as const).map((group) => (
                <Box key={group.label}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800, display: 'block', mb: 0.7 }}>
                        {group.label}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {group.values.map((tone) => (
                            <Box
                                key={`${group.label}-${tone}`}
                                component="button"
                                type="button"
                                onClick={() => {
                                    setAvatarAppearance((current) => ({
                                        ...current,
                                        skinTone: group.label === 'Skin tone' ? tone : current.skinTone,
                                        topColor: group.label === 'Top color' ? tone : current.topColor,
                                        bottomColor: group.label === 'Bottom color' ? tone : current.bottomColor,
                                        accentColor: group.label === 'Accent color' ? tone : current.accentColor,
                                    }));
                                }}
                                sx={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: group.shape === 'circle' ? '50%' : 1.2,
                                    border: group.selected === tone ? '3px solid #223246' : '1px solid rgba(34, 50, 70, 0.18)',
                                    backgroundColor: tone,
                                    cursor: 'pointer',
                                }}
                            />
                        ))}
                    </Stack>
                </Box>
            ))}
        </Stack>
    );

    return (
        <Box sx={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#3d3228' }}>
            <Box
                ref={pixiContainerRef}
                sx={{
                    position: 'absolute',
                    inset: 0,
                    overflow: 'hidden',
                }}
            />

            {hasVisibleRemoteScreenShareState && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: floatingInset,
                        left: isRemoteScreenPreviewMinimized ? floatingInset : '50%',
                        transform: isRemoteScreenPreviewMinimized ? 'none' : 'translateX(-50%)',
                        zIndex: 7,
                        width: isRemoteScreenPreviewMinimized
                            ? (isMobile ? 'calc(100vw - 20px)' : 'min(360px, calc(100vw - 92px))')
                            : (isMobile ? 'calc(100vw - 20px)' : 'min(94vw, 1680px)'),
                        maxWidth: isMobile ? 'calc(100vw - 20px)' : 'calc(100vw - 92px)',
                    }}
                >
                    <Box
                        sx={{
                            p: isRemoteScreenPreviewMinimized ? (isMobile ? 0.9 : 1.1) : (isMobile ? 1 : 1.4),
                            borderRadius: isMobile ? 3 : 4,
                            background: 'linear-gradient(180deg, rgba(18, 24, 30, 0.95) 0%, rgba(8, 12, 17, 0.93) 100%)',
                            border: '1px solid rgba(207, 230, 255, 0.18)',
                            backdropFilter: 'blur(14px)',
                            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
                            overflow: 'hidden',
                        }}
                    >
                        <Stack
                            direction="row"
                            spacing={isMobile ? 1 : 1.5}
                            alignItems="center"
                            justifyContent="space-between"
                            sx={{ mb: isRemoteScreenPreviewMinimized ? 0 : (isMobile ? 0.8 : 1.2), px: 0.25 }}
                        >
                            <Stack direction="row" spacing={0.9} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                                <Box
                                    sx={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        background: activeRemoteScreenShareCount > 0
                                            ? 'radial-gradient(circle at 35% 35%, #f7ffd7 0%, #71da90 44%, #1e7b49 100%)'
                                            : 'radial-gradient(circle at 35% 35%, #f2dac4 0%, #9d846d 44%, #5a4a3a 100%)',
                                        boxShadow: activeRemoteScreenShareCount > 0 ? '0 0 14px rgba(113, 218, 144, 0.45)' : 'none',
                                    }}
                                />
                                {!isRemoteScreenPreviewMinimized && (
                                    <Stack direction="row" spacing={0.9} useFlexGap flexWrap="wrap" sx={{ minWidth: 0, flex: 1, maxHeight: isMobile ? 112 : 'none', overflowY: isMobile ? 'auto' : 'visible' }}>
                                        {remoteScreenSharePeerIds.map((peerId) => {
                                            const share = remoteScreenShares.find((currentShare) => currentShare.peerId === peerId);
                                            const status = remoteScreenShareStatuses[peerId] ?? (share ? 'active' : 'idle');
                                            const isSelected = selectedRemoteScreenShare?.peerId === peerId;
                                            const isLive = status === 'active' && !!share;

                                            return (
                                                <Button
                                                    key={`header-${peerId}`}
                                                    type="button"
                                                    variant="outlined"
                                                    onClick={() => {
                                                        if (share) {
                                                            setSelectedRemoteScreenSharePeerId(peerId);
                                                        }
                                                    }}
                                                    disabled={!share}
                                                    sx={{
                                                        justifyContent: 'flex-start',
                                                        textAlign: 'left',
                                                        px: isMobile ? 0.9 : 1.1,
                                                        py: isMobile ? 0.7 : 0.8,
                                                        minWidth: isMobile ? 128 : 150,
                                                        borderRadius: isMobile ? 2 : 2.4,
                                                        color: isSelected ? '#f8fcff' : '#d1dfed',
                                                        borderColor: isSelected ? 'rgba(112, 228, 162, 0.34)' : 'rgba(191, 220, 255, 0.14)',
                                                        background: isSelected
                                                            ? 'linear-gradient(180deg, rgba(21, 54, 44, 0.62) 0%, rgba(16, 34, 28, 0.56) 100%)'
                                                            : 'linear-gradient(180deg, rgba(255, 255, 255, 0.035) 0%, rgba(255, 255, 255, 0.015) 100%)',
                                                        '&:hover': {
                                                            borderColor: isSelected ? 'rgba(127, 228, 163, 0.5)' : 'rgba(214, 232, 255, 0.28)',
                                                            backgroundColor: isSelected ? 'rgba(21, 54, 44, 0.72)' : 'rgba(255, 255, 255, 0.05)',
                                                        },
                                                        '&.Mui-disabled': {
                                                            color: 'rgba(205, 222, 240, 0.52)',
                                                            borderColor: 'rgba(191, 220, 255, 0.08)',
                                                        },
                                                    }}
                                                >
                                                    <Box sx={{ minWidth: 0 }}>
                                                        <Typography variant="caption" sx={{ display: 'block', fontWeight: 900, color: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: isMobile ? 0.2 : 0.35, textTransform: 'uppercase', fontSize: isMobile ? '0.68rem' : undefined }}>
                                                            {getPeerDisplayName(peerId)}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ display: 'block', color: isLive ? '#96e5b3' : '#9eb6cf', fontWeight: 800, fontSize: isMobile ? '0.67rem' : undefined }}>
                                                            {isLive ? 'Live now' : remoteScreenShareStatusLabel[status]}
                                                        </Typography>
                                                    </Box>
                                                </Button>
                                            );
                                        })}
                                    </Stack>
                                )}
                                {isRemoteScreenPreviewMinimized && (
                                    <Typography variant="caption" sx={{ color: '#b6c9df', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {remoteScreenShareNames || 'Waiting for share state'}
                                    </Typography>
                                )}
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Box
                                    sx={{
                                        px: 1.05,
                                        py: 0.42,
                                        borderRadius: 999,
                                        backgroundColor: activeRemoteScreenShareCount > 0
                                            ? 'rgba(73, 154, 108, 0.16)'
                                            : 'rgba(125, 143, 163, 0.14)',
                                        border: activeRemoteScreenShareCount > 0
                                            ? '1px solid rgba(127, 228, 163, 0.24)'
                                            : '1px solid rgba(194, 208, 224, 0.15)',
                                    }}
                                >
                                    <Typography variant="caption" sx={{ color: '#edf6ff', fontWeight: 800 }}>
                                        {activeRemoteScreenShareCount > 0 ? `${activeRemoteScreenShareCount} live` : 'Stand by'}
                                    </Typography>
                                </Box>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => setIsRemoteScreenPreviewMinimized((current) => !current)}
                                    sx={{
                                        minWidth: 0,
                                        px: isMobile ? 1.1 : 1.45,
                                        py: isMobile ? 0.5 : 0.58,
                                        color: '#dbe9f7',
                                        borderColor: 'rgba(191, 220, 255, 0.22)',
                                        backgroundColor: 'rgba(255, 255, 255, 0.02)',
                                        fontWeight: 800,
                                        letterSpacing: 0.2,
                                        '&:hover': {
                                            borderColor: 'rgba(214, 232, 255, 0.46)',
                                            backgroundColor: 'rgba(215, 231, 255, 0.08)',
                                        },
                                    }}
                                >
                                    {isRemoteScreenPreviewMinimized ? 'Expand' : 'Minimize'}
                                </Button>
                            </Stack>
                        </Stack>

                        {!isRemoteScreenPreviewMinimized && (
                            <Stack spacing={1.1}>
                                {selectedRemoteScreenShare && (
                                    <Box
                                        sx={{
                                            p: isMobile ? 0.8 : 1,
                                            borderRadius: isMobile ? 2.4 : 3,
                                            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.02) 100%)',
                                            border: '1px solid rgba(191, 220, 255, 0.12)',
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                p: 0.55,
                                                borderRadius: 2.5,
                                                background: 'linear-gradient(180deg, rgba(8, 14, 18, 0.92) 0%, rgba(4, 8, 12, 0.98) 100%)',
                                                border: '1px solid rgba(191, 220, 255, 0.12)',
                                                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
                                            }}
                                        >
                                            <Box
                                                component="video"
                                                autoPlay
                                                playsInline
                                                muted
                                                ref={(node: HTMLVideoElement | null) => {
                                                    if (!node || node.srcObject === selectedRemoteScreenShare.stream) {
                                                        return;
                                                    }

                                                    node.srcObject = selectedRemoteScreenShare.stream;
                                                    void node.play().catch(() => undefined);
                                                }}
                                                sx={{
                                                    width: '100%',
                                                    display: 'block',
                                                    maxHeight: isMobile ? 'calc(100vh - 250px)' : 'calc(100vh - 220px)',
                                                    borderRadius: 2,
                                                    backgroundColor: '#091018',
                                                    objectFit: 'contain',
                                                }}
                                            />
                                        </Box>
                                    </Box>
                                )}

                            </Stack>
                        )}
                    </Box>
                </Box>
            )}

            {toastMessages.length > 0 && (
                <Stack
                    spacing={1}
                    sx={{
                        position: 'absolute',
                        top: isMobile ? 64 : 72,
                        right: floatingInset,
                        zIndex: 8,
                        width: isMobile ? 'calc(100vw - 20px)' : 'min(340px, calc(100vw - 24px))',
                        pointerEvents: 'none',
                    }}
                >
                    {toastMessages.map((toast) => (
                        <Alert
                            key={toast.id}
                            severity={toast.severity}
                            onClose={() => removeToast(toast.id)}
                            sx={{
                                pointerEvents: 'auto',
                                borderRadius: 2.5,
                                boxShadow: '0 18px 36px rgba(0, 0, 0, 0.22)',
                                alignItems: 'center',
                                '& .MuiAlert-message': {
                                    fontWeight: 700,
                                },
                            }}
                        >
                            {toast.message}
                        </Alert>
                    ))}
                </Stack>
            )}

            <IconButton
                aria-label="Open settings"
                onClick={openSettingsDialog}
                sx={{
                    position: 'absolute',
                    top: floatingInset,
                    right: floatingInset,
                    zIndex: 6,
                    color: '#f3efe6',
                    backgroundColor: 'rgba(24, 21, 18, 0.68)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    width: actionButtonSize,
                    height: actionButtonSize,
                    '&:hover': {
                        backgroundColor: 'rgba(40, 35, 30, 0.82)',
                    },
                }}
            >
                <SettingsIcon fontSize="small" />
            </IconButton>

            <Dialog open={isSettingsDialogOpen} fullWidth fullScreen={isMobile} maxWidth="sm" onClose={() => setIsSettingsDialogOpen(false)}>
                <DialogTitle>Settings</DialogTitle>
                <DialogContent sx={{ pb: isMobile ? 1.5 : 2, maxHeight: isMobile || isShortViewport ? 'calc(100vh - 120px)' : 'none' }}>
                    <Stack spacing={2}>
                        <Box
                            sx={{
                                p: 1.6,
                                borderRadius: 3,
                                background: 'linear-gradient(180deg, rgba(246, 248, 251, 0.98) 0%, rgba(239, 243, 248, 0.98) 100%)',
                                border: '1px solid rgba(25, 37, 54, 0.08)',
                            }}
                        >
                            <Typography variant="overline" sx={{ display: 'block', color: '#5e6d7e', fontWeight: 900, letterSpacing: 1.1, mb: 0.6 }}>
                                Connection
                            </Typography>
                            <Stack spacing={1}>
                                <Typography variant="body2" sx={{ color: signalrStatusColor }}>
                                    {signalrStatus === 'idle' && 'Choose your name and connect to SignalR.'}
                                    {signalrStatus === 'connected' && connectionId && `SignalR connected - ID: ${connectionId}`}
                                    {signalrStatus === 'connecting' && 'Connecting to SignalR...'}
                                    {signalrStatus === 'error' && `SignalR failed: ${signalrError ?? 'Unknown error'}`}
                                </Typography>

                                <Typography variant="body2" sx={{ color: voiceStatusColor }}>
                                    {voiceStatus === 'idle' && 'Voice will start automatically after you connect.'}
                                    {voiceStatus === 'joining' && 'Starting voice and requesting microphone permission...'}
                                    {voiceStatus === 'ready' && 'Microphone ready for proximity voice chat.'}
                                    {voiceStatus === 'error' && `Voice setup failed: ${voiceError ?? 'Unknown error'}`}
                                </Typography>

                                {signalrStatus === 'error' && signalrError && (
                                    <Alert severity="error">{signalrError}</Alert>
                                )}

                                {voiceStatus === 'error' && voiceError && (
                                    <Alert severity="error">{voiceError}</Alert>
                                )}
                            </Stack>
                        </Box>

                        <Box
                            sx={{
                                p: 1.6,
                                borderRadius: 3,
                                background: 'linear-gradient(180deg, rgba(246, 248, 251, 0.98) 0%, rgba(239, 243, 248, 0.98) 100%)',
                                border: '1px solid rgba(25, 37, 54, 0.08)',
                            }}
                        >
                            <Typography variant="overline" sx={{ display: 'block', color: '#5e6d7e', fontWeight: 900, letterSpacing: 1.1, mb: 0.25 }}>
                                Audio
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                Choose your preferred microphone and speaker devices.
                            </Typography>

                            <TextField
                                fullWidth
                                select
                                label="Microphone"
                                value={selectedMicDeviceId}
                                onChange={(event) => setSelectedMicDeviceId(event.target.value)}
                                helperText={micDevices.length === 0 ? 'No microphone devices detected yet.' : 'This will be used automatically on connect, or immediately if voice is active.'}
                            >
                                <MenuItem value="default">System Default</MenuItem>
                                {micDevices.map((device) => (
                                    <MenuItem key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Microphone (${device.deviceId.slice(0, 8)})`}
                                    </MenuItem>
                                ))}
                            </TextField>

                            <TextField
                                fullWidth
                                select
                                label="Speaker / Output"
                                value={selectedOutputDeviceId}
                                onChange={(event) => setSelectedOutputDeviceId(event.target.value)}
                                sx={{ mt: 1.5 }}
                                helperText={outputDevices.length === 0 ? 'No output devices detected, or browser does not expose them yet.' : 'Used for remote voice playback when supported by the browser.'}
                            >
                                <MenuItem value="default">System Default</MenuItem>
                                {outputDevices.map((device) => (
                                    <MenuItem key={device.deviceId} value={device.deviceId}>
                                        {device.label || `Output (${device.deviceId.slice(0, 8)})`}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Box>

                        <Box
                            sx={{
                                p: 1.6,
                                borderRadius: 3,
                                background: 'linear-gradient(180deg, rgba(246, 248, 251, 0.98) 0%, rgba(239, 243, 248, 0.98) 100%)',
                                border: '1px solid rgba(25, 37, 54, 0.08)',
                            }}
                        >
                            <Typography variant="overline" sx={{ display: 'block', color: '#5e6d7e', fontWeight: 900, letterSpacing: 1.1, mb: 0.25 }}>
                                Avatar
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.2 }}>
                                Build a simple office avatar with a preset silhouette, a hairstyle, and a few color swatches.
                            </Typography>
                    {renderAvatarCustomization(true)}
                        </Box>

                        {settingsError && (
                            <Alert severity="error">{settingsError}</Alert>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button type="button" variant="outlined" onClick={() => setIsSettingsDialogOpen(false)}>
                        Cancel
                    </Button>
                    <Button type="button" variant="text" onClick={() => { loadAudioDevices().catch(() => undefined); }}>
                        Refresh Devices
                    </Button>
                    <Button type="button" variant="contained" onClick={() => { saveMicSettings().catch(() => undefined); }}>
                        Save
                    </Button>
                </DialogActions>
            </Dialog>

            <IconButton
                aria-label={isScreenSharing ? 'Stop screen sharing' : 'Start screen sharing'}
                onClick={toggleScreenSharing}
                disabled={voiceStatus !== 'ready' || activeCallPeerCount === 0 || isLocalScreenShareTransitioning}
                sx={{
                    position: 'absolute',
                    right: isMobile ? 58 : 64,
                    bottom: floatingBottomOffset,
                    zIndex: 6,
                    color: isScreenSharing ? '#fff7d6' : '#e1edff',
                    backgroundColor: isScreenSharing ? 'rgba(132, 90, 18, 0.82)' : 'rgba(24, 44, 72, 0.78)',
                    border: '1px solid rgba(255, 255, 255, 0.24)',
                    width: actionButtonSize,
                    height: actionButtonSize,
                    '&:hover': {
                        backgroundColor: isScreenSharing ? 'rgba(156, 108, 24, 0.9)' : 'rgba(30, 56, 92, 0.9)',
                    },
                    '&.Mui-disabled': {
                        color: 'rgba(255, 255, 255, 0.38)',
                        backgroundColor: 'rgba(32, 32, 32, 0.42)',
                    },
                }}
            >
                {isScreenSharing ? <StopScreenShareIcon fontSize="small" /> : <ScreenShareIcon fontSize="small" />}
            </IconButton>

            <IconButton
                aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                onClick={toggleMute}
                sx={{
                    position: 'absolute',
                    right: floatingInset,
                    bottom: floatingBottomOffset,
                    zIndex: 6,
                    color: isMuted ? '#ffe8e8' : '#e8fff2',
                    backgroundColor: isMuted ? 'rgba(90, 24, 24, 0.78)' : 'rgba(20, 72, 42, 0.78)',
                    border: '1px solid rgba(255, 255, 255, 0.24)',
                    width: actionButtonSize,
                    height: actionButtonSize,
                    '&:hover': {
                        backgroundColor: isMuted ? 'rgba(112, 30, 30, 0.86)' : 'rgba(24, 92, 52, 0.86)',
                    },
                }}
            >
                {isMuted ? <MicOffIcon fontSize="small" /> : <MicIcon fontSize="small" />}
            </IconButton>

            {isMobile && (
                <Box
                    sx={{
                        position: 'absolute',
                        left: floatingInset,
                        bottom: floatingBottomOffset,
                        zIndex: 6,
                        width: 124,
                        height: 124,
                        touchAction: 'none',
                    }}
                >
                    {([
                        { key: 'up', label: '▲', left: 40, top: 0 },
                        { key: 'left', label: '◀', left: 0, top: 40 },
                        { key: 'right', label: '▶', left: 80, top: 40 },
                        { key: 'down', label: '▼', left: 40, top: 80 },
                    ] as const).map((control) => (
                        <Box
                            key={control.key}
                            component="button"
                            type="button"
                            onPointerDown={(event) => {
                                event.preventDefault();
                                setVirtualMovement(control.key, true);
                            }}
                            onPointerUp={(event) => {
                                event.preventDefault();
                                setVirtualMovement(control.key, false);
                            }}
                            onPointerLeave={() => setVirtualMovement(control.key, false)}
                            onPointerCancel={() => setVirtualMovement(control.key, false)}
                            onContextMenu={(event) => event.preventDefault()}
                            sx={{
                                position: 'absolute',
                                left: control.left,
                                top: control.top,
                                width: 44,
                                height: 44,
                                border: '1px solid rgba(255, 255, 255, 0.24)',
                                borderRadius: 2.5,
                                background: 'linear-gradient(180deg, rgba(24, 30, 38, 0.86) 0%, rgba(15, 19, 26, 0.92) 100%)',
                                color: '#eef6ff',
                                fontSize: '1.05rem',
                                fontWeight: 900,
                                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.24)',
                                backdropFilter: 'blur(10px)',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                touchAction: 'none',
                                '&:active': {
                                    background: 'linear-gradient(180deg, rgba(42, 68, 94, 0.92) 0%, rgba(20, 35, 50, 0.96) 100%)',
                                    transform: 'scale(0.98)',
                                },
                            }}
                        >
                            {control.label}
                        </Box>
                    ))}
                    <Box
                        sx={{
                            position: 'absolute',
                            inset: 40,
                            borderRadius: '50%',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            backdropFilter: 'blur(8px)',
                            pointerEvents: 'none',
                        }}
                    />
                </Box>
            )}

            {(isInQuietZone || loadingUserNames.length > 0 || talkableUserNames.length > 0) && (
                <Stack
                    spacing={0.75}
                    sx={{
                        position: 'absolute',
                        left: '50%',
                        bottom: isMobile ? 68 : 16,
                        transform: 'translateX(-50%)',
                        zIndex: 6,
                        width: isMobile ? 'calc(100vw - 20px)' : 'min(460px, calc(100vw - 32px))',
                        alignItems: 'center',
                    }}
                >
                    {isInQuietZone && (
                        <Box
                            sx={{
                                px: 1.2,
                                py: 0.6,
                                borderRadius: 999,
                                backgroundColor: 'rgba(78, 12, 25, 0.88)',
                                border: '1px solid rgba(255, 160, 176, 0.24)',
                                backdropFilter: 'blur(8px)',
                            }}
                        >
                            <Typography variant="caption" sx={{ color: '#ffe3e8', fontWeight: 900 }}>
                                Quiet zone: calls paused
                            </Typography>
                        </Box>
                    )}

                    {loadingUserNames.length > 0 && (
                        <Box
                            sx={{
                                px: 1.2,
                                py: 0.6,
                                borderRadius: 999,
                                backgroundColor: 'rgba(20, 26, 32, 0.82)',
                                border: '1px solid rgba(194, 212, 234, 0.16)',
                                backdropFilter: 'blur(8px)',
                            }}
                        >
                            <Typography variant="caption" sx={{ color: '#d9e6f5', fontWeight: 800 }}>
                                Connecting call: {loadingUserNames.join(', ')}
                            </Typography>
                        </Box>
                    )}

                    {talkableUserNames.length > 0 && (
                        <Box
                            sx={{
                                px: 1.35,
                                py: 0.68,
                                borderRadius: 999,
                                backgroundColor: 'rgba(18, 34, 24, 0.86)',
                                border: '1px solid rgba(144, 230, 178, 0.18)',
                                backdropFilter: 'blur(8px)',
                            }}
                        >
                            <Typography variant="caption" sx={{ color: '#e4f8ea', fontWeight: 900 }}>
                                In call with: {talkableUserNames.join(', ')}
                            </Typography>
                        </Box>
                    )}
                </Stack>
            )}

            <Dialog open={isNameDialogOpen} fullWidth fullScreen={isMobile} maxWidth="sm">
                <DialogTitle>Choose your name and avatar</DialogTitle>
                <DialogContent sx={{ pb: isMobile ? 1.5 : 2, maxHeight: isMobile || isShortViewport ? 'calc(100vh - 112px)' : 'none' }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        Your name and avatar are saved in your browser and prefilled next time.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Name"
                        placeholder="Enter your name"
                        value={playerName}
                        onChange={(event) => setPlayerName(event.target.value)}
                        disabled={signalrStatus === 'connecting'}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                connectToSignalR().catch(() => undefined);
                            }
                        }}
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2.25, mb: 1.2 }}>
                        Personalize your avatar now, or randomize one and jump straight in.
                    </Typography>
                    {renderAvatarCustomization(true)}
                </DialogContent>
                <DialogActions>
                    <Button
                        type="button"
                        onPointerUp={clearVirtualMovement}
                        onClick={() => { connectToSignalR().catch(() => undefined); }}
                        disabled={signalrStatus === 'connecting'}
                        variant="contained"
                    >
                        Connect
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default App;

































