import { useEffect, useMemo } from 'react';

type RemoteScreenShare = { peerId: string; stream: MediaStream };
type RemoteScreenShareStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

type UseRemoteScreenShareStateParams = {
    getPeerDisplayName: (peerId: string) => string;
    remoteScreenShares: RemoteScreenShare[];
    remoteScreenShareStatuses: Record<string, RemoteScreenShareStatus>;
    selectedRemoteScreenSharePeerId: string | null;
    setIsRemoteScreenPreviewMinimized: (value: boolean) => void;
    setSelectedRemoteScreenSharePeerId: (value: string | null) => void;
};

export function useRemoteScreenShareState({
    getPeerDisplayName,
    remoteScreenShares,
    remoteScreenShareStatuses,
    selectedRemoteScreenSharePeerId,
    setIsRemoteScreenPreviewMinimized,
    setSelectedRemoteScreenSharePeerId,
}: UseRemoteScreenShareStateParams) {
    useEffect(() => {
        const hasVisibleRemoteScreenShareState = remoteScreenShares.length > 0
            || Object.values(remoteScreenShareStatuses).some((status) => status !== 'idle');
        if (!hasVisibleRemoteScreenShareState) {
            setIsRemoteScreenPreviewMinimized(false);
        }
    }, [remoteScreenShareStatuses, remoteScreenShares.length, setIsRemoteScreenPreviewMinimized]);

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
    }, [remoteScreenShares, selectedRemoteScreenSharePeerId, setSelectedRemoteScreenSharePeerId]);

    return useMemo(() => {
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

        return {
            activeRemoteScreenShareCount,
            hasVisibleRemoteScreenShareState,
            remoteScreenShareNames,
            remoteScreenSharePeerIds,
            remoteScreenShareStatusLabel,
            selectedRemoteScreenShare,
        };
    }, [getPeerDisplayName, remoteScreenShareStatuses, remoteScreenShares, selectedRemoteScreenSharePeerId]);
}
