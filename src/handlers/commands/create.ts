import type { BotContext } from "../../types";

export async function createCommand(ctx: BotContext) {
  const chatType = ctx.chat?.type;

  if (chatType === "private") {
    await ctx.reply(
      "⚠️ Команда /create работает только в групповых чатах.\n\n" +
        "Добавьте бота в группу и выполните команду там."
    );
    return;
  }

  // Start the challenge setup conversation
  await ctx.conversation.enter("challengeSetupConversation");
}
