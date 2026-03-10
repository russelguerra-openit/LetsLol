import { Box, Button, Stack, Typography } from '@mui/material';
import type { Dispatch, SetStateAction } from 'react';

type RemoteScreenShare = { peerId: string; stream: MediaStream };
type RemoteScreenShareStatus = 'idle' | 'starting' | 'active' | 'stopping' | 'error';

type RemoteScreenSharePanelProps = {
    activeRemoteScreenShareCount: number;
    floatingInset: number;
    getPeerDisplayName: (peerId: string) => string;
    hasVisibleRemoteScreenShareState: boolean;
    isMobile: boolean;
    isRemoteScreenPreviewMinimized: boolean;
    remoteScreenShareNames: string;
    remoteScreenSharePeerIds: string[];
    remoteScreenShareStatusLabel: Record<RemoteScreenShareStatus, string>;
    remoteScreenShareStatuses: Record<string, RemoteScreenShareStatus>;
    remoteScreenShares: RemoteScreenShare[];
    selectedRemoteScreenShare: RemoteScreenShare | null;
    setIsRemoteScreenPreviewMinimized: Dispatch<SetStateAction<boolean>>;
    setSelectedRemoteScreenSharePeerId: (peerId: string) => void;
};

export function RemoteScreenSharePanel({
    activeRemoteScreenShareCount,
    floatingInset,
    getPeerDisplayName,
    hasVisibleRemoteScreenShareState,
    isMobile,
    isRemoteScreenPreviewMinimized,
    remoteScreenShareNames,
    remoteScreenSharePeerIds,
    remoteScreenShareStatusLabel,
    remoteScreenShareStatuses,
    remoteScreenShares,
    selectedRemoteScreenShare,
    setIsRemoteScreenPreviewMinimized,
    setSelectedRemoteScreenSharePeerId,
}: RemoteScreenSharePanelProps) {
    if (!hasVisibleRemoteScreenShareState) {
        return null;
    }

    return (
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

                {!isRemoteScreenPreviewMinimized && selectedRemoteScreenShare && (
                    <Stack spacing={1.1}>
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
                    </Stack>
                )}
            </Box>
        </Box>
    );
}
