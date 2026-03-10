import { Container, Graphics } from 'pixi.js';
import type { AvatarAppearance } from './model';

export const drawAvatarBody = (body: Container, appearance: AvatarAppearance, isLocalPlayer: boolean): void => {
    body.removeChildren().forEach((child) => child.destroy());

    const shadow = new Graphics();
    shadow.ellipse(0, 18, 11, 4).fill({ color: 0x17212b, alpha: 0.18 });
    body.addChild(shadow);

    const avatar = new Graphics();
    avatar.roundRect(-7, 11, 14, 12, 4).fill(appearance.bottomColor);
    avatar.roundRect(-10, 18, 5, 9, 2).fill(appearance.bottomColor);
    avatar.roundRect(5, 18, 5, 9, 2).fill(appearance.bottomColor);
    avatar.roundRect(-10, 24, 5, 2.5, 1).fill(0x2c2f34);
    avatar.roundRect(5, 24, 5, 2.5, 1).fill(0x2c2f34);
    avatar.roundRect(-4, -7, 8, 6, 3).fill(appearance.skinTone);

    if (appearance.bodyStyle === 'relaxed') {
        avatar.roundRect(-12, -2, 24, 18, 9).fill(appearance.topColor).stroke({ color: isLocalPlayer ? 0xffffff : 0x1f2430, width: isLocalPlayer ? 2.4 : 1.6 });
        avatar.roundRect(-14, 0, 4, 14, 2).fill(appearance.topColor);
        avatar.roundRect(10, 0, 4, 14, 2).fill(appearance.topColor);
    } else if (appearance.bodyStyle === 'blazer') {
        avatar.roundRect(-11, -3, 22, 19, 7).fill(appearance.topColor).stroke({ color: isLocalPlayer ? 0xffffff : 0x1f2430, width: isLocalPlayer ? 2.4 : 1.6 });
        avatar.moveTo(-6, 5).lineTo(-2, -2).lineTo(0, 6).lineTo(2, -2).lineTo(6, 5).closePath().fill(0xf7f3ed);
        avatar.roundRect(-13, 0, 4, 14, 2).fill(appearance.topColor);
        avatar.roundRect(9, 0, 4, 14, 2).fill(appearance.topColor);
    } else {
        avatar.roundRect(-13, -2, 26, 19, 10).fill(appearance.topColor).stroke({ color: isLocalPlayer ? 0xffffff : 0x1f2430, width: isLocalPlayer ? 2.4 : 1.6 });
        avatar.roundRect(-7, -1, 14, 10, 7).fill({ color: 0xffffff, alpha: 0.16 });
        avatar.roundRect(-15, 1, 4, 13, 2).fill(appearance.topColor);
        avatar.roundRect(11, 1, 4, 13, 2).fill(appearance.topColor);
    }

    avatar.circle(0, -14, 8.8).fill(appearance.skinTone).stroke({ color: 0x8d6e63, width: 1 });
    avatar.circle(-3, -15, 0.8).fill(0x2b2b2b);
    avatar.circle(3, -15, 0.8).fill(0x2b2b2b);
    avatar.arc(0, -11.6, 2.6, 0.2, Math.PI - 0.2).stroke({ color: 0x9f5a52, width: 0.9 });

    if (appearance.accessory === 'glasses') {
        avatar.circle(-3.2, -15, 2.7).stroke({ color: 0x273142, width: 1 });
        avatar.circle(3.2, -15, 2.7).stroke({ color: 0x273142, width: 1 });
        avatar.rect(-0.9, -15.5, 1.8, 1).fill(0x273142);
    } else if (appearance.accessory === 'headset') {
        avatar.arc(0, -14.2, 10.2, Math.PI * 1.06, Math.PI * 1.94).stroke({ color: appearance.accentColor, width: 2 });
        avatar.circle(-9.2, -14.2, 2.4).fill(appearance.accentColor);
        avatar.circle(9.2, -14.2, 2.4).fill(appearance.accentColor);
        avatar.roundRect(6.6, -11, 5.2, 1.6, 0.8).fill(appearance.accentColor);
    }

    body.addChild(avatar);
};
