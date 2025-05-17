import { bot, mainMenu, loggedInUsers, userSessions } from '../bot';

export class HandlersLogin {
  static async iniciar(chatId: number): Promise<void> {
    if (loggedInUsers.has(chatId)) {
      await bot.sendMessage(chatId, '⚠️ Você já está logado.', mainMenu);
      return;
    }

    userSessions.set(chatId, {
      etapa: 1,
      lastActivity: Date.now()
    });

    await bot.sendMessage(chatId, '🔑 *Login*\n\nDigite seu e-mail:', {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true }
    });
  }
}