import type { ReactNode } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { peerVoiceStatusColors, peerVoiceStatusLabels, type PeerVoiceStatus } from '../voice/useVoiceOverlay';

type SignalrStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
type VoiceStatus = 'idle' | 'joining' | 'ready' | 'error';

type PeerVoiceEntry = {
    peerId: string;
    displayName: string;
    status: PeerVoiceStatus;
};

type SettingsDialogProps = {
    open: boolean;
    isMobile: boolean;
    isShortViewport: boolean;
    onClose: () => void;
    signalrStatus: SignalrStatus;
    signalrStatusColor: string;
    signalrError: string | null;
    connectionId: string | null;
    voiceStatus: VoiceStatus;
    voiceStatusColor: string;
    voiceError: string | null;
    onReconnectVoice: () => void;
    peerVoiceStatusEntries: PeerVoiceEntry[];
    selectedMicDeviceId: string;
    setSelectedMicDeviceId: (value: string) => void;
    selectedOutputDeviceId: string;
    setSelectedOutputDeviceId: (value: string) => void;
    micDevices: MediaDeviceInfo[];
    outputDevices: MediaDeviceInfo[];
    settingsError: string | null;
    onRefreshDevices: () => void;
    onSave: () => void;
    avatarCustomization: ReactNode;
};

export function SettingsDialog({
    open,
    isMobile,
    isShortViewport,
    onClose,
    signalrStatus,
    signalrStatusColor,
    signalrError,
    connectionId,
    voiceStatus,
    voiceStatusColor,
    voiceError,
    onReconnectVoice,
    peerVoiceStatusEntries,
    selectedMicDeviceId,
    setSelectedMicDeviceId,
    selectedOutputDeviceId,
    setSelectedOutputDeviceId,
    micDevices,
    outputDevices,
    settingsError,
    onRefreshDevices,
    onSave,
    avatarCustomization,
}: SettingsDialogProps) {
    return (
        <Dialog open={open} fullWidth fullScreen={isMobile} maxWidth="sm" onClose={onClose}>
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
                                {signalrStatus === 'reconnecting' && 'Connection lost. Trying to reconnect to SignalR...'}
                                {signalrStatus === 'disconnected' && 'Disconnected from SignalR. Use reconnect to join again.'}
                                {signalrStatus === 'error' && `SignalR failed: ${signalrError ?? 'Unknown error'}`}
                            </Typography>

                            <Typography variant="body2" sx={{ color: voiceStatusColor }}>
                                {voiceStatus === 'idle' && 'Voice will start automatically after you connect.'}
                                {voiceStatus === 'joining' && 'Starting voice and requesting microphone permission...'}
                                {voiceStatus === 'ready' && 'Microphone ready for proximity voice chat.'}
                                {voiceStatus === 'error' && `Voice setup failed: ${voiceError ?? 'Unknown error'}`}
                            </Typography>

                            {(signalrStatus === 'connected' && voiceStatus === 'ready') && (
                                <Button type="button" variant="outlined" size="small" onClick={onReconnectVoice} sx={{ alignSelf: 'flex-start' }}>
                                    Reconnect Voice
                                </Button>
                            )}

                            {peerVoiceStatusEntries.length > 0 && (
                                <Stack spacing={0.6}>
                                    {peerVoiceStatusEntries.map(({ peerId, displayName, status }) => (
                                        <Typography key={peerId} variant="caption" sx={{ color: peerVoiceStatusColors[status], fontWeight: 700 }}>
                                            {displayName}: {peerVoiceStatusLabels[status]}
                                        </Typography>
                                    ))}
                                </Stack>
                            )}

                            {(signalrStatus === 'error' || signalrStatus === 'disconnected') && signalrError && (
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
                        {avatarCustomization}
                    </Box>

                    {settingsError && (
                        <Alert severity="error">{settingsError}</Alert>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button type="button" variant="outlined" onClick={onClose}>
                    Cancel
                </Button>
                <Button type="button" variant="text" onClick={onRefreshDevices}>
                    Refresh Devices
                </Button>
                <Button type="button" variant="contained" onClick={onSave}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}
