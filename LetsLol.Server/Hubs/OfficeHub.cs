using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;

namespace LetsLol.Server.Hubs
{
    public sealed record ScreenShareRegistrationResult(bool Accepted, string? ActiveSharerConnectionId, string? ActiveSessionId);

    public class OfficeHub : Hub
    {
        private sealed record ActiveScreenShare(string SharerConnectionId, string TargetConnectionId, string SessionId);

        // In-memory player positions: connectionId -> (x, y)
        private static readonly ConcurrentDictionary<string, (double X, double Y)> _positions = new();
        private static readonly ConcurrentDictionary<string, string> _displayNames = new();
        private static readonly ConcurrentDictionary<string, string> _avatarAppearances = new();
        private static readonly object _activeScreenShareLock = new();
        private static readonly Dictionary<string, ActiveScreenShare> _activeScreenSharesByDirectionId = new();

        private static string CreateScreenShareDirectionId(string sharerConnectionId, string targetConnectionId)
        {
            return $"{sharerConnectionId}|{targetConnectionId}";
        }

        private static bool TryGetActiveScreenShare(string sharerConnectionId, string targetConnectionId, out ActiveScreenShare? activeShare)
        {
            return _activeScreenSharesByDirectionId.TryGetValue(CreateScreenShareDirectionId(sharerConnectionId, targetConnectionId), out activeShare);
        }

        public override async Task OnConnectedAsync()
        {
            var spawn = GenerateBreakAreaSpawn(Context.ConnectionId);
            _positions[Context.ConnectionId] = spawn;
            _displayNames[Context.ConnectionId] = "Guest";
            _avatarAppearances[Context.ConnectionId] = string.Empty;

            // Spawn existing players for the new joiner first.
            foreach (var entry in _positions)
            {
                var displayName = _displayNames.TryGetValue(entry.Key, out var foundName) ? foundName : "Guest";
                var appearanceJson = _avatarAppearances.TryGetValue(entry.Key, out var foundAppearance) ? foundAppearance : string.Empty;
                await Clients.Caller.SendAsync("PlayerSpawned", entry.Key, entry.Value.X, entry.Value.Y, displayName, appearanceJson);
            }

            // Tell everyone else to create the new avatar.
            await Clients.Others.SendAsync("PlayerSpawned", Context.ConnectionId, spawn.X, spawn.Y, "Guest", string.Empty);

            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _positions.TryRemove(Context.ConnectionId, out _);
            _displayNames.TryRemove(Context.ConnectionId, out _);
            _avatarAppearances.TryRemove(Context.ConnectionId, out _);
            List<(string TargetConnectionId, string SessionId)> stoppedScreenShares = new();
            lock (_activeScreenShareLock)
            {
                foreach (var directionId in _activeScreenSharesByDirectionId.Keys.ToArray())
                {
                    var activeShare = _activeScreenSharesByDirectionId[directionId];
                    if (string.Equals(activeShare.SharerConnectionId, Context.ConnectionId, StringComparison.Ordinal))
                    {
                        stoppedScreenShares.Add((activeShare.TargetConnectionId, activeShare.SessionId));
                        _activeScreenSharesByDirectionId.Remove(directionId);
                        continue;
                    }

                    if (string.Equals(activeShare.TargetConnectionId, Context.ConnectionId, StringComparison.Ordinal))
                    {
                        _activeScreenSharesByDirectionId.Remove(directionId);
                    }
                }
            }

            foreach (var stoppedScreenShare in stoppedScreenShares)
            {
                await Clients.Client(stoppedScreenShare.TargetConnectionId)
                    .SendAsync("ReceiveScreenShareStopped", Context.ConnectionId, stoppedScreenShare.SessionId);
            }
            await Clients.Others.SendAsync("PlayerLeft", Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
        }

        public async Task SetDisplayName(string displayName)
        {
            var normalizedName = (displayName ?? string.Empty).Trim();
            if (normalizedName.Length == 0)
            {
                normalizedName = "Guest";
            }
            else if (normalizedName.Length > 24)
            {
                normalizedName = normalizedName[..24];
            }

            _displayNames[Context.ConnectionId] = normalizedName;
            await Clients.All.SendAsync("PlayerNameUpdated", Context.ConnectionId, normalizedName);
        }

        public async Task SetAvatarAppearance(string appearanceJson)
        {
            _avatarAppearances[Context.ConnectionId] = appearanceJson ?? string.Empty;
            await Clients.All.SendAsync("PlayerAppearanceUpdated", Context.ConnectionId, _avatarAppearances[Context.ConnectionId]);
        }

        /// <summary>Called by a client to broadcast its position to all other clients.</summary>
        public async Task BroadcastPosition(double x, double y)
        {
            _positions[Context.ConnectionId] = (x, y);
            await Clients.Others.SendAsync("PlayerMoved", Context.ConnectionId, x, y);
        }

        private static (double X, double Y) GenerateBreakAreaSpawn(string connectionId)
        {
            // Keep spawns inside the break-area floor (x: 22->778, y: 610->810) with margins.
            var hash = Math.Abs(connectionId.GetHashCode());
            var x = 80 + (hash % 640);   // 80 -> 719
            var y = 660 + ((hash / 17) % 120); // 660 -> 779
            return (x, y);
        }

        /// <summary>Relay a WebRTC offer SDP to a specific peer.</summary>
        public async Task SendOffer(string targetConnectionId, string sdp)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveOffer", Context.ConnectionId, sdp);
        }

        /// <summary>Relay a WebRTC answer SDP to a specific peer.</summary>
        public async Task SendAnswer(string targetConnectionId, string sdp)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveAnswer", Context.ConnectionId, sdp);
        }

        /// <summary>Relay a WebRTC ICE candidate to a specific peer.</summary>
        public async Task SendIceCandidate(string targetConnectionId, string candidateJson)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveIceCandidate", Context.ConnectionId, candidateJson);
        }

        /// <summary>Notify a specific peer that the sender started screen sharing.</summary>
        public async Task<ScreenShareRegistrationResult> RegisterScreenShareSession(string targetConnectionId, string sessionId, bool forceReplace = false)
        {
            if (string.IsNullOrWhiteSpace(targetConnectionId) || string.IsNullOrWhiteSpace(sessionId))
            {
                return new ScreenShareRegistrationResult(false, null, null);
            }

            lock (_activeScreenShareLock)
            {
                _activeScreenSharesByDirectionId[CreateScreenShareDirectionId(Context.ConnectionId, targetConnectionId)] =
                    new ActiveScreenShare(Context.ConnectionId, targetConnectionId, sessionId);
            }

            return new ScreenShareRegistrationResult(true, Context.ConnectionId, sessionId);
        }

        public Task ClearScreenShareSession(string targetConnectionId, string sessionId)
        {
            var directionId = CreateScreenShareDirectionId(Context.ConnectionId, targetConnectionId);
            lock (_activeScreenShareLock)
            {
                if (_activeScreenSharesByDirectionId.TryGetValue(directionId, out var activeShare)
                    && string.Equals(activeShare.SharerConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.TargetConnectionId, targetConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.SessionId, sessionId, StringComparison.Ordinal))
                {
                    _activeScreenSharesByDirectionId.Remove(directionId);
                }
            }

            return Task.CompletedTask;
        }

        public async Task RequestScreenShareState(string targetConnectionId)
        {
            ActiveScreenShare? activeShare = null;
            lock (_activeScreenShareLock)
            {
                TryGetActiveScreenShare(targetConnectionId, Context.ConnectionId, out activeShare);
            }

            if (activeShare is not null
                && string.Equals(activeShare.SharerConnectionId, targetConnectionId, StringComparison.Ordinal)
                && string.Equals(activeShare.TargetConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                && !string.IsNullOrWhiteSpace(activeShare.SessionId))
            {
                await Clients.Caller.SendAsync("ReceiveScreenShareStarted", targetConnectionId, activeShare.SessionId);
            }
        }

        public async Task RequestScreenShareOffer(string targetConnectionId, string sessionId)
        {
            bool shouldForward;
            lock (_activeScreenShareLock)
            {
                shouldForward = TryGetActiveScreenShare(targetConnectionId, Context.ConnectionId, out var activeShare)
                    && string.Equals(activeShare.SharerConnectionId, targetConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.TargetConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.SessionId, sessionId, StringComparison.Ordinal);
            }

            if (!shouldForward)
            {
                return;
            }

            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenShareOfferRequest", Context.ConnectionId, sessionId);
        }

        public async Task SendScreenShareStarted(string targetConnectionId, string sessionId)
        {
            bool shouldForward;
            lock (_activeScreenShareLock)
            {
                shouldForward = TryGetActiveScreenShare(Context.ConnectionId, targetConnectionId, out var activeShare)
                    && string.Equals(activeShare.SharerConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.TargetConnectionId, targetConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.SessionId, sessionId, StringComparison.Ordinal);
            }

            if (!shouldForward)
            {
                return;
            }

            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenShareStarted", Context.ConnectionId, sessionId);
        }

        /// <summary>Relay a dedicated screen-share WebRTC offer SDP to a specific peer.</summary>
        public async Task SendScreenShareOffer(string targetConnectionId, string sessionId, string sdp)
        {
            bool shouldForward;
            lock (_activeScreenShareLock)
            {
                shouldForward = TryGetActiveScreenShare(Context.ConnectionId, targetConnectionId, out var activeShare)
                    && string.Equals(activeShare.SharerConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.TargetConnectionId, targetConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.SessionId, sessionId, StringComparison.Ordinal);
            }

            if (!shouldForward)
            {
                return;
            }

            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenShareOffer", Context.ConnectionId, sessionId, sdp);
        }

        /// <summary>Relay a dedicated screen-share WebRTC answer SDP to a specific peer.</summary>
        public async Task SendScreenShareAnswer(string targetConnectionId, string sessionId, string sdp)
        {
            bool shouldForward;
            lock (_activeScreenShareLock)
            {
                shouldForward = TryGetActiveScreenShare(targetConnectionId, Context.ConnectionId, out var activeShare)
                    && string.Equals(activeShare.SharerConnectionId, targetConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.TargetConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.SessionId, sessionId, StringComparison.Ordinal);
            }

            if (!shouldForward)
            {
                return;
            }

            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenShareAnswer", Context.ConnectionId, sessionId, sdp);
        }

        /// <summary>Relay a dedicated screen-share WebRTC ICE candidate to a specific peer.</summary>
        public async Task SendScreenShareIceCandidate(string targetConnectionId, string sessionId, string candidateJson)
        {
            bool shouldForward;
            lock (_activeScreenShareLock)
            {
                shouldForward =
                    (TryGetActiveScreenShare(Context.ConnectionId, targetConnectionId, out var outgoingShare)
                        && string.Equals(outgoingShare.SessionId, sessionId, StringComparison.Ordinal))
                    || (TryGetActiveScreenShare(targetConnectionId, Context.ConnectionId, out var incomingShare)
                        && string.Equals(incomingShare.SessionId, sessionId, StringComparison.Ordinal));
            }

            if (!shouldForward)
            {
                return;
            }

            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenShareIceCandidate", Context.ConnectionId, sessionId, candidateJson);
        }

        /// <summary>Notify a specific peer that the sender stopped screen sharing.</summary>
        public async Task SendScreenShareStopped(string targetConnectionId, string sessionId)
        {
            bool shouldForward;
            var directionId = CreateScreenShareDirectionId(Context.ConnectionId, targetConnectionId);
            lock (_activeScreenShareLock)
            {
                shouldForward = _activeScreenSharesByDirectionId.TryGetValue(directionId, out var activeShare)
                    && string.Equals(activeShare.SharerConnectionId, Context.ConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.TargetConnectionId, targetConnectionId, StringComparison.Ordinal)
                    && string.Equals(activeShare.SessionId, sessionId, StringComparison.Ordinal);
                if (shouldForward)
                {
                    _activeScreenSharesByDirectionId.Remove(directionId);
                }
            }

            if (!shouldForward)
            {
                return;
            }

            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveScreenShareStopped", Context.ConnectionId, sessionId);
        }
    }
}
