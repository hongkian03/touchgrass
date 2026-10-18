/** Fixed chrome surfaces — also asserted in tests. */
export const POPUP_WIDTH = 360;
/** Brand wordmark row at the top of the popup, and the flex gap below it (gap-2.5). */
export const WORDMARK_HEIGHT = 28;
export const WORDMARK_GAP = 10;
/** Content area (520) + wordmark row: the title adds height, it never squeezes content. */
export const POPUP_CONTENT_HEIGHT = 520;
export const POPUP_HEIGHT = POPUP_CONTENT_HEIGHT + WORDMARK_HEIGHT + WORDMARK_GAP;
/** Setup screens are shorter: drops the empty space above Continue. */
export const ONBOARDING_POPUP_HEIGHT = POPUP_HEIGHT - 70;
export const ONBOARDING_MAX_WIDTH = 460;
export const POPUP_WIDTH_TOLERANCE = 4;
/** Dashboard column — issue #6: 720–880. Recorded walk width: 800. */
export const DASHBOARD_MIN_WIDTH = 720;
export const DASHBOARD_MAX_WIDTH = 880;
export const DASHBOARD_COLUMN_WIDTH = 800;
