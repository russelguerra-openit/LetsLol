import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type JoinDialogProps = {
    open: boolean;
    isMobile: boolean;
    isShortViewport: boolean;
    playerName: string;
    setPlayerName: (value: string) => void;
    signalrStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';
    onConnect: () => void;
    onClearVirtualMovement: () => void;
    avatarCustomization: ReactNode;
};

export function JoinDialog({
    open,
    isMobile,
    isShortViewport,
    playerName,
    setPlayerName,
    signalrStatus,
    onConnect,
    onClearVirtualMovement,
    avatarCustomization,
}: JoinDialogProps) {
    return (
        <Dialog open={open} fullWidth fullScreen={isMobile} maxWidth="sm">
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
                            onConnect();
                        }
                    }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2.25, mb: 1.2 }}>
                    Personalize your avatar now, or randomize one and jump straight in.
                </Typography>
                {avatarCustomization}
            </DialogContent>
            <DialogActions>
                <Button
                    type="button"
                    onPointerUp={onClearVirtualMovement}
                    onClick={onConnect}
                    disabled={signalrStatus === 'connecting'}
                    variant="contained"
                >
                    Connect
                </Button>
            </DialogActions>
        </Dialog>
    );
}
