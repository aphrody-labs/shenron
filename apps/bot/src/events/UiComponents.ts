// SPDX-License-Identifier: Apache-2.0
import { Bot, ButtonComponent, Discord, ModalComponent } from "discordx";
import type { ButtonInteraction, ModalSubmitInteraction } from "discord.js";
import { CONFIRM_NS, handleConfirmButton } from "~/ui/confirm";
import { customIdPattern } from "~/ui/custom-id";
import { PAGER_NS, handlePagerButton, handlePagerModal } from "~/ui/pager";
import { SHARE_NS, handleShareButton } from "~/ui/share";

/**
 * Routes the clicks of the stateless UI-kit components (pager, confirmation, share button) to
 * their handlers in `~/ui`. The handlers answer the member themselves (an expired or foreign
 * click gets an ephemeral notice), so nothing here is a fallback path.
 */
@Discord()
@Bot("shenron")
export class UiComponentsEvent {
  @ButtonComponent({ id: customIdPattern(PAGER_NS) })
  async pager(interaction: ButtonInteraction) {
    await handlePagerButton(interaction);
  }

  @ModalComponent({ id: customIdPattern(PAGER_NS) })
  async pagerGoTo(interaction: ModalSubmitInteraction) {
    await handlePagerModal(interaction);
  }

  @ButtonComponent({ id: customIdPattern(CONFIRM_NS) })
  async confirm(interaction: ButtonInteraction) {
    await handleConfirmButton(interaction);
  }

  @ButtonComponent({ id: customIdPattern(SHARE_NS) })
  async share(interaction: ButtonInteraction) {
    await handleShareButton(interaction);
  }
}
