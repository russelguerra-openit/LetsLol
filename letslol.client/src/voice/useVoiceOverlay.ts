import { useCallback, useRef, useState, type MutableRefObject } from 'react';

export type PeerVoiceStatus = 'connecting' | 'connected' | 'recovering' | 'failed';
export type SignalrStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
export type VoiceStatus = 'idle' | 'joining' | 'ready' | 'error';

type VoiceOverlayAvatar = {
    label?: {
        text?: unknown;
    };
};

type LeavingVoicePeer = {
    displayName: string;
    progress: number;
    remainingMs: number;
};

export type VoiceOverlayChip = {
    key: string;
    label: string;
    tone: 'quiet' | 'loading' | 'connected' | 'holding' | 'issue';
    progress?: number;
};

export const peerVoiceStatusLabels: Record<PeerVoiceStatus, string> = {
    connecting: 'Connecting',
    connected: 'Connected',
    recovering: 'Recovering',
    failed: 'Failed',
};

export const peerVoiceStatusColors: Record<PeerVoiceStatus, string> = {
    connecting: '#d9e6f5',
    connected: '#a7f0ba',
    recovering: '#ffd98f',
    failed: '#ffb5b5',
};

type UseVoiceOverlayArgs = {
    connectionIdRef: MutableRefObject<string | null>;
    signalrStatusRef: MutableRefObject<SignalrStatus>;
    voiceStatusRef: MutableRefObject<VoiceStatus>;
    avatarsRef: MutableRefObject<Map<string, VoiceOverlayAvatar>>;
    pendingDisplayNamesRef: MutableRefObject<Map<string, string>>;
    nearbyIndicatorSinceRef: MutableRefObject<Map<string, number>>;
    outOfRangeSinceRef: MutableRefObject<Map<string, number>>;
    peerConnectionsRef: MutableRefObject<Map<string, RTCPeerConnection>>;
    getPeerDisplayName: (peerId: string) => string;
    getNearbyPeerIds: (localId: string, localAvatar: any) => Set<string>;
    getDelayedNearbyPeerIds: (localId: string, localAvatar: any, now: number) => Set<string>;
    peerVoiceStatuses: Record<string, PeerVoiceStatus>;
    proximityDisconnectGraceMs: number;
    isInQuietZone: boolean;
};

export function useVoiceOverlay({
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
    proximityDisconnectGraceMs,
    isInQuietZone,
}: UseVoiceOverlayArgs) {
    const [talkableUserNames, setTalkableUserNames] = useState<string[]>([]);
    const [loadingUserNames, setLoadingUserNames] = useState<string[]>([]);
    const [leavingPeers, setLeavingPeers] = useState<LeavingVoicePeer[]>([]);
    const talkableUsersSignatureRef = useRef('');
    const loadingUsersSignatureRef = useRef('');
    const leavingUsersSignatureRef = useRef('');

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

            const displayName = (avatar.label?.text?.toString?.() ?? '') || pendingDisplayNamesRef.current.get(playerId) || 'Guest';
            nearbyNames.push(displayName);
        }

        nearbyNames.sort((a, b) => a.localeCompare(b));
        const signature = nearbyNames.join('|');
        if (signature === talkableUsersSignatureRef.current) {
            return;
        }

        talkableUsersSignatureRef.current = signature;
        setTalkableUserNames(nearbyNames);
    }, [avatarsRef, connectionIdRef, getDelayedNearbyPeerIds, nearbyIndicatorSinceRef, pendingDisplayNamesRef, signalrStatusRef]);

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

            const displayName = (avatar.label?.text?.toString?.() ?? '') || pendingDisplayNamesRef.current.get(peerId) || 'Guest';
            loadingNames.push(displayName);
        }

        loadingNames.sort((a, b) => a.localeCompare(b));
        const signature = loadingNames.join('|');
        if (signature === loadingUsersSignatureRef.current) {
            return;
        }

        loadingUsersSignatureRef.current = signature;
        setLoadingUserNames(loadingNames);
    }, [avatarsRef, connectionIdRef, getDelayedNearbyPeerIds, getNearbyPeerIds, pendingDisplayNamesRef, signalrStatusRef]);

    const syncLeavingUsersIndicator = useCallback(() => {
        if (signalrStatusRef.current !== 'connected' || voiceStatusRef.current !== 'ready') {
            if (leavingUsersSignatureRef.current !== '') {
                leavingUsersSignatureRef.current = '';
                setLeavingPeers([]);
            }
            return;
        }

        const now = performance.now();
        const nextLeavingPeers: LeavingVoicePeer[] = [];
        for (const [peerId, outOfRangeSince] of outOfRangeSinceRef.current) {
            if (!peerConnectionsRef.current.has(peerId)) {
                continue;
            }

            const remainingMs = Math.max(0, proximityDisconnectGraceMs - (now - outOfRangeSince));
            nextLeavingPeers.push({
                displayName: getPeerDisplayName(peerId),
                remainingMs,
                progress: proximityDisconnectGraceMs <= 0 ? 0 : remainingMs / proximityDisconnectGraceMs,
            });
        }

        nextLeavingPeers.sort((a, b) => a.displayName.localeCompare(b.displayName));
        const signature = nextLeavingPeers
            .map((peer) => `${peer.displayName}:${Math.ceil(peer.remainingMs / 100)}`)
            .join('|');
        if (signature === leavingUsersSignatureRef.current) {
            return;
        }

        leavingUsersSignatureRef.current = signature;
        setLeavingPeers(nextLeavingPeers);
    }, [getPeerDisplayName, outOfRangeSinceRef, peerConnectionsRef, proximityDisconnectGraceMs, signalrStatusRef, voiceStatusRef]);

    const voicePeerStatusEntries = Object.entries(peerVoiceStatuses)
        .map(([peerId, status]) => ({
            peerId,
            status,
            displayName: getPeerDisplayName(peerId),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

    const issueEntries = voicePeerStatusEntries.filter(({ status }) => status !== 'connected');
    const issueNames = new Set(issueEntries.map(({ displayName }) => displayName));
    const connectingNames = loadingUserNames.filter((name) => !issueNames.has(name));
    const connectingNameSet = new Set(connectingNames);
    const holdingPeers = leavingPeers.filter((peer) => !issueNames.has(peer.displayName) && !connectingNameSet.has(peer.displayName));
    const holdingNameSet = new Set(holdingPeers.map((peer) => peer.displayName));
    const connectedNames = talkableUserNames.filter((name) => !issueNames.has(name) && !connectingNameSet.has(name) && !holdingNameSet.has(name));

    const overlayChips: VoiceOverlayChip[] = [];
    if (isInQuietZone) {
        overlayChips.push({
            key: 'quiet',
            label: 'Quiet zone: calls paused',
            tone: 'quiet',
        });
    }

    if (issueEntries.length > 0) {
        overlayChips.push({
            key: 'voice-issues',
            label: `Voice: ${issueEntries.map(({ displayName, status }) => `${displayName} ${peerVoiceStatusLabels[status].toLowerCase()}`).join(', ')}`,
            tone: 'issue',
        });
    }

    if (connectingNames.length > 0) {
        overlayChips.push({
            key: 'connecting',
            label: `Connecting: ${connectingNames.join(', ')}`,
            tone: 'loading',
        });
    }

    if (holdingPeers.length > 0) {
        const maxRemainingMs = Math.max(...holdingPeers.map((peer) => peer.remainingMs));
        const progress = Math.max(...holdingPeers.map((peer) => peer.progress));
        overlayChips.push({
            key: 'holding',
            label: `Disconnecting in ${Math.max(0.1, maxRemainingMs / 1000).toFixed(1)}s if apart: ${holdingPeers.map((peer) => peer.displayName).join(', ')}`,
            tone: 'holding',
            progress,
        });
    }

    if (connectedNames.length > 0) {
        overlayChips.push({
            key: 'in-call',
            label: `In call: ${connectedNames.join(', ')}`,
            tone: 'connected',
        });
    }

    return {
        overlayChips,
        voicePeerStatusEntries,
        syncTalkableUsersIndicator,
        syncLoadingUsersIndicator,
        syncLeavingUsersIndicator,
    };
}
