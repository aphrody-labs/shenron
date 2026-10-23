// SPDX-License-Identifier: Apache-2.0
/**
 * Components V2 UI kit of the bot: the grammar every command answers with.
 *
 *   card()        a Container with a domain accent: title, lines, thumbnail, media, blocks, actions
 *   section()     lines beside a thumbnail or a button      text() separator() media()
 *   actions()     one row of buttons (button(), link()) or one select (select())
 *   notice()      one-line success / error / info, ephemeral
 *   paginate()    previous / go to / next, state in the custom id      registerPager()
 *   confirm()     confirm / cancel for a destructive action            registerConfirm()
 *   shareButton() ephemeral answer -> public message, on purpose        registerShare()
 *   reply() edit() followUp() defer()   ephemeral by default, V2 flag, no pings, validated
 *   validate()    the Discord limits (40 components, 4 000 characters of text, depth, ids)
 *
 * Commands import from `~/ui`; they never call the discord.js V2 builders directly.
 */
export * from "./accent";
export * from "./actions";
export * from "./blocks";
export * from "./card";
export * from "./confirm";
export * from "./custom-id";
export * from "./errors";
export * from "./limits";
export * from "./noise-meter";
export * from "./notice";
export * from "./pager";
export * from "./respond";
export * from "./share";
export * from "./state";
export * from "./validate";
