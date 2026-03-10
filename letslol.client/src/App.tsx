import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Stack, useMediaQuery } from '@mui/material';
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { drawAvatarBody } from './avatar/avatarPixi';
import {
    PLAYER_APPEARANCE_STORAGE_KEY,
    createRandomAvatarAppearance,
    getFallbackAvatarAppearance,
    loadStoredAvatarAppearance,
    normalizeAvatarAppearance,
    type AvatarAppearance,
} from './avatar/model';
import { AvatarCustomizer } from './components/AvatarCustomizer';
import { FloatingControls } from './components/FloatingControls';
import { JoinDialog } from './components/JoinDialog';
import { RemoteScreenSharePanel } from './components/RemoteScreenSharePanel';
import { SettingsDialog } from './components/SettingsDialog';
import { VoiceOverlay } from './components/VoiceOverlay';
import { useRemoteScreenShareState } from './screenshare/useRemoteScreenShareState';
import { useConnectionStatusSubscription } from './signalr/useConnectionStatusSubscription';
import { usePlayerHubEventBindings, useRtcHubEventBindings } from './signalr/useHubEventBindings';
import { startHubConnection, getHubConnection } from './signalr/hubConnection';
import { useAudioDevices } from './voice/useAudioDevices';
import { type PeerVoiceStatus, useVoiceOverlay } from './voice/useVoiceOverlay';
import { usePixiWorld } from './world/usePixiWorld';
import {
    BREAK_QUIET_ZONE_RECT,
    CONFERENCE_ROOM_RECT,
    OFFICE_CUBICLE_PODS,
    PROXIMITY_RING_RADIUS,
} from './world/layout';
import { isInsideRect, isWalkablePosition } from './world/collision';
import './App.css';

type AvatarPosition = { x: number; y: number };
type AvatarVisual = { ring: Graphics; body: Container; label: Text; speakingBadge: Graphics; target: AvatarPosition; appearance: AvatarAppearance };
type RemoteScreenShare = { peerId: string; stream: MediaStream };
type RemoteScreenShareStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';
type ToastSeverity = 'info' | 'success' | 'warning' | 'error';
type ToastMessage = { id: string; message: string; severity: ToastSeverity };
type ScreenShareRegistrationResult = { accepted: boolean; activeSharerConnectionId: string | null; activeSessionId: string | null };
type SignalrStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
type VoiceStatus = 'idle' | 'joining' | 'ready' | 'error';
type SpeechMeter = { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; data: Uint8Array<ArrayBuffer> };
const PLAYER_NAME_STORAGE_KEY = 'letslol.playerName';
const PREFERRED_MIC_DEVICE_STORAGE_KEY = 'letslol.preferredMicDeviceId';
const PREFERRED_OUTPUT_DEVICE_STORAGE_KEY = 'letslol.preferredOutputDeviceId';
const PROXIMITY_CONNECT_THRESHOLD = 70;
const PROXIMITY_DISCONNECT_THRESHOLD = 85;
const PROXIMITY_CONNECT_DELAY_MS = 1200;
const MAX_ACTIVE_VOICE_PEERS = 5;
const PEER_RECONNECT_COOLDOWN_MS = 1500;
const PROXIMITY_DISCONNECT_GRACE_MS = 4000;
const PEER_DISCONNECTED_GRACE_MS = 7000;
const PEER_ICE_RESTART_INTERVAL_MS = 2500;
const SPEECH_ACTIVITY_THRESHOLD = 0.03;
const SPEECH_HOLD_MS = 220;

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
    const [remoteScreenShares, setRemoteScreenShares] = useState<RemoteScreenShare[]>([]);
    const [remoteScreenShareStatuses, setRemoteScreenShareStatuses] = useState<Record<string, RemoteScreenShareStatus>>({});
    const [selectedRemoteScreenSharePeerId, setSelectedRemoteScreenSharePeerId] = useState<string | null>(null);
    const [localScreenShareStatus, setLocalScreenShareStatus] = useState<RemoteScreenShareStatus>('idle');
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [activeCallPeerCount, setActiveCallPeerCount] = useState(0);
    const [peerVoiceStatuses, setPeerVoiceStatuses] = useState<Record<string, PeerVoiceStatus>>({});
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
    const playerNameRef = useRef<string>(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '');
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
    const makingOfferPeerIdsRef = useRef<Set<string>>(new Set());
    const ignoredOfferPeerIdsRef = useRef<Set<string>>(new Set());
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
    const outOfRangeSinceRef = useRef<Map<string, number>>(new Map());
    const nearbyIndicatorSinceRef = useRef<Map<string, number>>(new Map());
    const disconnectedSinceRef = useRef<Map<string, number>>(new Map());
    const lastIceRestartAtRef = useRef<Map<string, number>>(new Map());
    const lastVoiceSyncAtRef = useRef<number>(0);
    const wasInProximityRef = useRef(false);
    const hasCameraCenteredRef = useRef(false);

    const getPeerDisplayName = useCallback((peerId: string): string => {
        return avatarsRef.current.get(peerId)?.label.text?.toString() || pendingDisplayNamesRef.current.get(peerId) || 'Guest';
    }, []);

    const setPeerVoiceStatus = useCallback((peerId: string, status: PeerVoiceStatus) => {
        setPeerVoiceStatuses((current) => {
            if (current[peerId] === status) {
                return current;
            }

            return {
                ...current,
                [peerId]: status,
            };
        });
    }, []);

    const clearPeerVoiceStatus = useCallback((peerId: string) => {
        setPeerVoiceStatuses((current) => {
            if (!(peerId in current)) {
                return current;
            }

            const next = { ...current };
            delete next[peerId];
            return next;
        });
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

    const {
        applyOutputDeviceToAllRemoteAudio,
        applyPreferredMicDevice,
        loadAudioDevices,
        setAudioElementSinkId,
        toggleMute,
    } = useAudioDevices({
        isMutedRef,
        localMicStreamRef,
        peerConnectionsRef,
        remoteAudioElementsRef,
        selectedMicDeviceIdRef,
        selectedOutputDeviceIdRef,
        setMicDevices,
        setOutputDevices,
        setSelectedMicDeviceId,
        setSelectedOutputDeviceId,
        setSettingsError,
        setIsMuted,
    });

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
        const registration = await getHubConnection().invoke('RegisterScreenShareSession', peerId, sessionId, false) as ScreenShareRegistrationResult;
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

    const clearPeerConnectionTimers = useCallback((peerId: string) => {
        disconnectedSinceRef.current.delete(peerId);
        lastIceRestartAtRef.current.delete(peerId);
        outOfRangeSinceRef.current.delete(peerId);
        makingOfferPeerIdsRef.current.delete(peerId);
        ignoredOfferPeerIdsRef.current.delete(peerId);
    }, []);

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
        clearPeerConnectionTimers(peerId);
        clearPeerVoiceStatus(peerId);
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
    }, [clearPeerConnectionTimers, clearPeerVoiceStatus, closeIncomingScreenSharePeerConnection, closeOutgoingScreenSharePeerConnection, detachRemoteSpeechMeter, getPeerDisplayName, pushToast, removeRemoteAudioElement, stopScreenSharingForPeer]);

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
        setPeerVoiceStatus(peerId, 'connecting');
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
            if (state === 'connecting') {
                setPeerVoiceStatus(peerId, 'connecting');
                return;
            }

            if (state === 'connected') {
                disconnectedSinceRef.current.delete(peerId);
                setPeerVoiceStatus(peerId, 'connected');
                return;
            }

            if (state === 'disconnected') {
                setPeerVoiceStatus(peerId, 'recovering');
                return;
            }

            if (state === 'failed' || state === 'closed') {
                setPeerVoiceStatus(peerId, 'failed');
                closePeerConnection(peerId);
            }
        };

        return connection;
    }, [attachRemoteSpeechMeter, closePeerConnection, getPeerDisplayName, pushToast, setAudioElementSinkId, setPeerVoiceStatus]);

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

    const createAndSendOffer = useCallback(async (peerId: string, options?: { iceRestart?: boolean }) => {
        const localId = connectionIdRef.current;
        if (!localId || !shouldInitiateOffer(localId, peerId)) {
            return;
        }

        const connection = getOrCreatePeerConnection(peerId);
        if (connection?.signalingState !== 'stable') {
            return;
        }

        try {
            makingOfferPeerIdsRef.current.add(peerId);
            setPeerVoiceStatus(peerId, options?.iceRestart ? 'recovering' : 'connecting');
            const offer = options?.iceRestart
                ? await connection.createOffer({ iceRestart: true })
                : await connection.createOffer();
            await connection.setLocalDescription(offer);
            if (connection.localDescription?.sdp) {
                await getHubConnection().invoke('SendOffer', peerId, connection.localDescription.sdp);
            }
        } catch {
            closePeerConnection(peerId);
        } finally {
            makingOfferPeerIdsRef.current.delete(peerId);
        }
    }, [closePeerConnection, getOrCreatePeerConnection, setPeerVoiceStatus, shouldInitiateOffer]);

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

    const getNearbyPeerIds = useCallback((localId: string, localAvatar: AvatarVisual): Set<string> => {
        const nearbyPeers: Array<{ peerId: string; distance: number }> = [];
        if (isAvatarInQuietZone(localAvatar)) {
            return new Set<string>();
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

            const dx = localAvatar.body.x - avatar.body.x;
            const dy = localAvatar.body.y - avatar.body.y;
            const distance = Math.hypot(dx, dy);

            const remoteIsInConferenceRoom = isAvatarInConferenceRoom(avatar);
            if (localIsInConferenceRoom && remoteIsInConferenceRoom) {
                nearbyPeers.push({ peerId: playerId, distance });
                continue;
            }

            if (localIsInConferenceRoom || remoteIsInConferenceRoom) {
                continue;
            }

            const remoteOfficePodIndex = getAvatarOfficePodIndex(avatar);
            if (localOfficePodIndex >= 0 && remoteOfficePodIndex === localOfficePodIndex) {
                nearbyPeers.push({ peerId: playerId, distance });
                continue;
            }

            if (localOfficePodIndex >= 0 || remoteOfficePodIndex >= 0) {
                continue;
            }

            const isConnected = peerConnectionsRef.current.has(playerId);
            const threshold = isConnected ? PROXIMITY_DISCONNECT_THRESHOLD : PROXIMITY_CONNECT_THRESHOLD;

            if (distance <= threshold) {
                nearbyPeers.push({ peerId: playerId, distance });
            }
        }

        nearbyPeers.sort((a, b) => a.distance - b.distance);
        return new Set(nearbyPeers.slice(0, MAX_ACTIVE_VOICE_PEERS).map((peer) => peer.peerId));
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
            outOfRangeSinceRef.current.clear();
            disconnectedSinceRef.current.clear();
            lastIceRestartAtRef.current.clear();
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
            outOfRangeSinceRef.current.clear();
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
            const connection = peerConnectionsRef.current.get(peerId);
            if (!connection) {
                continue;
            }

            if (!nearbyPeerIds.has(peerId)) {
                const outOfRangeSince = outOfRangeSinceRef.current.get(peerId);
                if (typeof outOfRangeSince !== 'number') {
                    outOfRangeSinceRef.current.set(peerId, now);
                } else if (now - outOfRangeSince >= PROXIMITY_DISCONNECT_GRACE_MS) {
                    closePeerConnection(peerId);
                }
            } else {
                nearbySinceRef.current.delete(peerId);
                outOfRangeSinceRef.current.delete(peerId);
            }

            if (connection.connectionState === 'disconnected') {
                const disconnectedSince = disconnectedSinceRef.current.get(peerId);
                if (typeof disconnectedSince !== 'number') {
                    disconnectedSinceRef.current.set(peerId, now);
                } else if (now - disconnectedSince >= PEER_DISCONNECTED_GRACE_MS) {
                    closePeerConnection(peerId);
                    continue;
                }

                const shouldRestartIce = shouldInitiateOffer(localId, peerId)
                    && connection.signalingState === 'stable'
                    && connection.iceConnectionState !== 'checking';
                if (shouldRestartIce) {
                    const lastRestartAt = lastIceRestartAtRef.current.get(peerId) ?? 0;
                    if (now - lastRestartAt >= PEER_ICE_RESTART_INTERVAL_MS) {
                        lastIceRestartAtRef.current.set(peerId, now);
                        void createAndSendOffer(peerId, { iceRestart: true });
                    }
                }
            } else if (connection.connectionState === 'connected') {
                disconnectedSinceRef.current.delete(peerId);
                lastIceRestartAtRef.current.delete(peerId);
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

    const reconnectVoicePeers = useCallback(() => {
        closeAllPeerConnections();
        nearbySinceRef.current.clear();
        outOfRangeSinceRef.current.clear();
        disconnectedSinceRef.current.clear();
        lastIceRestartAtRef.current.clear();
        lastPeerDisconnectAtRef.current.clear();
        makingOfferPeerIdsRef.current.clear();
        ignoredOfferPeerIdsRef.current.clear();
        setPeerVoiceStatuses({});
        pushToast('Rebuilding nearby voice connections...', 'info', 'voice-reconnect');
    }, [closeAllPeerConnections, pushToast]);

    const {
        overlayChips,
        voicePeerStatusEntries,
        syncTalkableUsersIndicator,
        syncLoadingUsersIndicator,
        syncLeavingUsersIndicator,
    } = useVoiceOverlay({
        connectionIdRef,
        signalrStatusRef,
        voiceStatusRef,
        avatarsRef,
        pendingDisplayNamesRef,
        nearbyIndicatorSinceRef,
        outOfRangeSinceRef,
        peerConnectionsRef,
        getPeerDisplayName,
        getNearbyPeerIds,
        getDelayedNearbyPeerIds,
        peerVoiceStatuses,
        proximityDisconnectGraceMs: PROXIMITY_DISCONNECT_GRACE_MS,
        isInQuietZone,
    });

    const syncQuietZoneIndicator = useCallback(() => {
        const localId = connectionIdRef.current;
        const localAvatar = localId ? avatarsRef.current.get(localId) : null;
        const nextIsInQuietZone = Boolean(localAvatar && isAvatarInQuietZone(localAvatar));
        setIsInQuietZone((current) => (current === nextIsInQuietZone ? current : nextIsInQuietZone));
    }, [isAvatarInQuietZone]);

    useEffect(() => {
        signalrStatusRef.current = signalrStatus;
    }, [signalrStatus]);

    useEffect(() => {
        playerNameRef.current = playerName;
    }, [playerName]);

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
        setAvatarAppearance(createRandomAvatarAppearance());
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

        const localId = connectionIdRef.current;
        if (!localId) {
            return;
        }

        const peerConnection = getOrCreatePeerConnection(fromConnectionId);
        if (!peerConnection) {
            return;
        }

        try {
            const isPolite = !shouldInitiateOffer(localId, fromConnectionId);
            const offerCollision = makingOfferPeerIdsRef.current.has(fromConnectionId) || peerConnection.signalingState !== 'stable';
            if (offerCollision && !isPolite) {
                ignoredOfferPeerIdsRef.current.add(fromConnectionId);
                return;
            }

            ignoredOfferPeerIdsRef.current.delete(fromConnectionId);
            setPeerVoiceStatus(fromConnectionId, offerCollision ? 'recovering' : 'connecting');

            if (offerCollision) {
                await peerConnection.setLocalDescription({ type: 'rollback' });
            }

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
    }, [attachPendingIceCandidates, closePeerConnection, getOrCreatePeerConnection, setPeerVoiceStatus, shouldInitiateOffer, voiceStatus]);

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

        if (ignoredOfferPeerIdsRef.current.has(fromConnectionId)) {
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

    usePlayerHubEventBindings({
        closeAllPeerConnections,
        drawAvatarBody,
        getFallbackAvatarAppearance,
        normalizeAvatarAppearance,
        removeAvatar,
        upsertAvatar,
        pendingDisplayNamesRef,
        pendingAvatarAppearancesRef,
        avatarsRef,
        connectionIdRef,
    });

    useRtcHubEventBindings({
        handleReceiveOffer,
        handleReceiveAnswer,
        handleReceiveIceCandidate,
        handleReceiveScreenShareStarted,
        handleReceiveScreenShareOfferRequest,
        handleReceiveScreenShareOffer,
        handleReceiveScreenShareAnswer,
        handleReceiveScreenShareIceCandidate,
        handleReceiveScreenShareStopped,
        handleReceiveScreenShareReplaced,
    });

    useConnectionStatusSubscription({
        avatarAppearanceRef,
        closeAllPeerConnections,
        connectionIdRef,
        playerNameRef,
        pushToast,
        removeAvatar,
        setConnectionId,
        setSignalrError,
        setSignalrStatus,
        setVoiceError,
        signalrStatusRef,
    });

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

    usePixiWorld({
        appRef,
        avatarsRef,
        broadcastPosition,
        closeAllPeerConnections,
        connectionIdRef,
        detachRemoteSpeechMeter,
        flushPendingAvatars,
        hasCameraCenteredRef,
        isWalkablePosition,
        lastBroadcastAtRef,
        lastVoiceSyncAtRef,
        localPositionRef,
        localScreenShareSessionIdsRef,
        movementInputRef,
        nearbyIndicatorSinceRef,
        nearbySinceRef,
        pendingAvatarAppearancesRef,
        pendingAvatarsRef,
        pendingDisplayNamesRef,
        pixiContainerRef,
        remoteScreenShareSessionIdsRef,
        remoteScreenStreamsRef,
        remoteSpeechMetersRef,
        setIsInQuietZone,
        setRemoteScreenShareStatuses,
        setRemoteScreenShares,
        signalrStatusRef,
        syncLeavingUsersIndicator,
        syncLoadingUsersIndicator,
        syncProximityVoiceConnections,
        syncQuietZoneIndicator,
        syncRemoteSpeechIndicators,
        syncTalkableUsersIndicator,
        updateProximityIndicators,
        announcedRemoteScreenSharersRef,
    });

    const signalrStatusColors: Record<SignalrStatus, string> = {
        idle: 'text.secondary',
        connecting: 'text.secondary',
        reconnecting: 'warning.main',
        connected: 'success.main',
        disconnected: 'warning.main',
        error: 'error.main',
    };

    const signalrStatusColor = signalrStatusColors[signalrStatus];
    const connectionBannerConfig: Partial<Record<SignalrStatus, { severity: ToastSeverity; message: string }>> = {
        reconnecting: {
            severity: 'warning',
            message: 'Connection lost. Trying to reconnect to the server...',
        },
        disconnected: {
            severity: 'error',
            message: 'You are disconnected from the server.',
        },
    };
    const activeConnectionBanner = connectionBannerConfig[signalrStatus];

    const voiceStatusColors: Record<VoiceStatus, string> = {
        idle: 'text.secondary',
        joining: 'text.secondary',
        ready: 'success.main',
        error: 'error.main',
    };

    const voiceStatusColor = voiceStatusColors[voiceStatus];

    const {
        activeRemoteScreenShareCount,
        hasVisibleRemoteScreenShareState,
        remoteScreenShareNames,
        remoteScreenSharePeerIds,
        remoteScreenShareStatusLabel,
        selectedRemoteScreenShare,
    } = useRemoteScreenShareState({
        getPeerDisplayName,
        remoteScreenShares,
        remoteScreenShareStatuses,
        selectedRemoteScreenSharePeerId,
        setIsRemoteScreenPreviewMinimized,
        setSelectedRemoteScreenSharePeerId,
    });
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
    const avatarCustomization = (
        <AvatarCustomizer
            avatarAppearance={avatarAppearance}
            setAvatarAppearance={setAvatarAppearance}
            onRandomize={randomizeAvatarAppearance}
            showRandomize
        />
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

            <RemoteScreenSharePanel
                activeRemoteScreenShareCount={activeRemoteScreenShareCount}
                floatingInset={floatingInset}
                getPeerDisplayName={getPeerDisplayName}
                hasVisibleRemoteScreenShareState={hasVisibleRemoteScreenShareState}
                isMobile={isMobile}
                isRemoteScreenPreviewMinimized={isRemoteScreenPreviewMinimized}
                remoteScreenShareNames={remoteScreenShareNames}
                remoteScreenSharePeerIds={remoteScreenSharePeerIds}
                remoteScreenShareStatusLabel={remoteScreenShareStatusLabel}
                remoteScreenShareStatuses={remoteScreenShareStatuses}
                remoteScreenShares={remoteScreenShares}
                selectedRemoteScreenShare={selectedRemoteScreenShare}
                setIsRemoteScreenPreviewMinimized={setIsRemoteScreenPreviewMinimized}
                setSelectedRemoteScreenSharePeerId={setSelectedRemoteScreenSharePeerId}
            />

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

            {activeConnectionBanner && (
                <Alert
                    severity={activeConnectionBanner.severity}
                    action={signalrStatus === 'disconnected'
                        ? (
                            <Button
                                color="inherit"
                                size="small"
                                onClick={() => { connectToSignalR().catch(() => undefined); }}
                            >
                                Reconnect
                            </Button>
                        )
                        : undefined}
                    sx={{
                        position: 'absolute',
                        top: floatingInset,
                        left: isMobile ? 10 : 12,
                        right: isMobile ? 62 : 64,
                        zIndex: 7,
                        borderRadius: 2.5,
                        boxShadow: '0 18px 36px rgba(0, 0, 0, 0.22)',
                        alignItems: 'center',
                        '& .MuiAlert-message': {
                            fontWeight: 800,
                        },
                    }}
                >
                    {activeConnectionBanner.message}
                </Alert>
            )}

            <FloatingControls
                openSettings={openSettingsDialog}
                toggleScreenSharing={toggleScreenSharing}
                toggleMute={toggleMute}
                isScreenSharing={isScreenSharing}
                isMuted={isMuted}
                isMobile={isMobile}
                floatingInset={floatingInset}
                floatingBottomOffset={floatingBottomOffset}
                actionButtonSize={actionButtonSize}
                isLocalScreenShareTransitioning={isLocalScreenShareTransitioning}
                voiceStatus={voiceStatus}
                activeCallPeerCount={activeCallPeerCount}
                setVirtualMovement={setVirtualMovement}
            />

            <SettingsDialog
                open={isSettingsDialogOpen}
                isMobile={isMobile}
                isShortViewport={isShortViewport}
                onClose={() => setIsSettingsDialogOpen(false)}
                signalrStatus={signalrStatus}
                signalrStatusColor={signalrStatusColor}
                signalrError={signalrError}
                connectionId={connectionId}
                voiceStatus={voiceStatus}
                voiceStatusColor={voiceStatusColor}
                voiceError={voiceError}
                onReconnectVoice={reconnectVoicePeers}
                peerVoiceStatusEntries={voicePeerStatusEntries}
                selectedMicDeviceId={selectedMicDeviceId}
                setSelectedMicDeviceId={setSelectedMicDeviceId}
                selectedOutputDeviceId={selectedOutputDeviceId}
                setSelectedOutputDeviceId={setSelectedOutputDeviceId}
                micDevices={micDevices}
                outputDevices={outputDevices}
                settingsError={settingsError}
                onRefreshDevices={() => { loadAudioDevices().catch(() => undefined); }}
                onSave={() => { saveMicSettings().catch(() => undefined); }}
                avatarCustomization={avatarCustomization}
            />

            <VoiceOverlay chips={overlayChips} isMobile={isMobile} />

            <JoinDialog
                open={isNameDialogOpen}
                isMobile={isMobile}
                isShortViewport={isShortViewport}
                playerName={playerName}
                setPlayerName={setPlayerName}
                signalrStatus={signalrStatus}
                onConnect={() => { connectToSignalR().catch(() => undefined); }}
                onClearVirtualMovement={clearVirtualMovement}
                avatarCustomization={avatarCustomization}
            />
        </Box>
    );
}

export default App;