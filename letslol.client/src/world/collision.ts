import { AVATAR_COLLISION_RADIUS, OFFICE_BLOCKER_RECTS, type RectArea, WORLD_WIDTH } from './layout';

export const isInsideExpandedRect = (x: number, y: number, rect: RectArea, expansion: number): boolean => {
    return x >= rect.x - expansion
        && x <= rect.x + rect.width + expansion
        && y >= rect.y - expansion
        && y <= rect.y + rect.height + expansion;
};

export const isInsideRect = (x: number, y: number, rect: RectArea): boolean => {
    return x >= rect.x
        && x <= rect.x + rect.width
        && y >= rect.y
        && y <= rect.y + rect.height;
};

export const isWalkablePosition = (x: number, y: number): boolean => {
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
};
