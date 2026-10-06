/**
 * Votes an entry needs before the home « best of » ranks it: a podium built on one or two 5.0
 * votes reads as placeholder data. `/rankings` keeps every vote. Client-safe constant shared
 * by the home loader (`getHomeCommunityTops`) and the view (`HomeView`).
 */
export const HOME_TOPS_MIN_ENTRY_VOTES = 3;
