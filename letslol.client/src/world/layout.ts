export type RectArea = { x: number; y: number; width: number; height: number };

export const WORLD_WIDTH = 2140;
export const WORLD_HEIGHT = 860;
export const CAMERA_ZOOM = 1.35;
export const CAMERA_EDGE_PADDING_RATIO = 0.24;
export const PLAYER_SPEED_PX_PER_SEC = 210;
export const PLAYER_SPRINT_MULTIPLIER = 2;
export const AVATAR_COLLISION_RADIUS = 12;
export const PROXIMITY_RING_RADIUS = 40;

export const OFFICE_TABLE_RECTS: RectArea[] = [
    { x: 570, y: 110, width: 400, height: 280 },
];

export const CONFERENCE_ROOM_RECT: RectArea = { x: WORLD_WIDTH - 596, y: 30, width: 568, height: 530 };
export const CONFERENCE_TABLE_RECT: RectArea = {
    x: CONFERENCE_ROOM_RECT.x + ((CONFERENCE_ROOM_RECT.width - 300) / 2),
    y: 220,
    width: 300,
    height: 150,
};
export const CONFERENCE_DOOR_RECT: RectArea = { x: CONFERENCE_ROOM_RECT.x, y: 220, width: 52, height: 110 };
export const BREAK_QUIET_ZONE_RECT: RectArea = { x: 1268, y: 644, width: 360, height: 132 };
export const OFFICE_CUBICLE_PODS: RectArea[] = [
    { x: 44, y: 54, width: 212, height: 138 },
    { x: 44, y: 218, width: 212, height: 138 },
    { x: 44, y: 382, width: 212, height: 138 },
];

export const OFFICE_CUBICLE_BLOCKER_RECTS: RectArea[] = OFFICE_CUBICLE_PODS.flatMap(({ x, y, width, height }) => [
    { x, y, width, height: 12 },
    { x, y, width: 12, height },
    { x, y: y + height - 12, width, height: 12 },
    { x: x + width - 12, y, width: 12, height: 42 },
    { x: x + width - 12, y: y + 94, width: 12, height: height - 94 },
    { x: x + 30, y: y + 22, width: 116, height: 32 },
]);

export const CONFERENCE_WALL_RECTS: RectArea[] = [
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_ROOM_RECT.y, width: CONFERENCE_ROOM_RECT.width, height: 18 },
    { x: CONFERENCE_ROOM_RECT.x + CONFERENCE_ROOM_RECT.width - 18, y: CONFERENCE_ROOM_RECT.y, width: 18, height: CONFERENCE_ROOM_RECT.height },
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_ROOM_RECT.y + CONFERENCE_ROOM_RECT.height - 18, width: CONFERENCE_ROOM_RECT.width, height: 18 },
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_ROOM_RECT.y, width: 18, height: 190 },
    { x: CONFERENCE_ROOM_RECT.x, y: CONFERENCE_DOOR_RECT.y + CONFERENCE_DOOR_RECT.height, width: 18, height: 230 },
];

export const OFFICE_BLOCKER_RECTS: RectArea[] = [
    ...OFFICE_TABLE_RECTS,
    ...OFFICE_CUBICLE_BLOCKER_RECTS,
    CONFERENCE_TABLE_RECT,
    ...CONFERENCE_WALL_RECTS,
];
