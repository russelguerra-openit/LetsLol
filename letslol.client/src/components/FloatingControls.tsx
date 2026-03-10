import { Box, IconButton } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';

type MovementKey = 'up' | 'down' | 'left' | 'right';

type FloatingControlsProps = {
    openSettings: () => void;
    toggleScreenSharing: () => void;
    toggleMute: () => void;
    isScreenSharing: boolean;
    isMuted: boolean;
    isMobile: boolean;
    floatingInset: number;
    floatingBottomOffset: number;
    actionButtonSize: number;
    isLocalScreenShareTransitioning: boolean;
    voiceStatus: 'idle' | 'joining' | 'ready' | 'error';
    activeCallPeerCount: number;
    setVirtualMovement: (direction: MovementKey, isPressed: boolean) => void;
};

export function FloatingControls({
    openSettings,
    toggleScreenSharing,
    toggleMute,
    isScreenSharing,
    isMuted,
    isMobile,
    floatingInset,
    floatingBottomOffset,
    actionButtonSize,
    isLocalScreenShareTransitioning,
    voiceStatus,
    activeCallPeerCount,
    setVirtualMovement,
}: FloatingControlsProps) {
    return (
        <>
            <IconButton
                aria-label="Open settings"
                onClick={openSettings}
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
        </>
    );
}
