import type { Context, SessionFlavor } from "grammy";
import type { ConversationFlavor } from "@grammyjs/conversations";
import type { SessionData } from "./session";

export type BotContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
