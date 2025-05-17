import { bot, SITES_EDITAIS } from '../bot';
import { buscarEditais } from '../services/edital';

export class HandlersAdicionais {
  static async listarSitesParaBusca(chatId: number): Promise<void> {
    const sites = Object.keys(SITES_EDITAIS);
    const keyboard = sites.map(site => [{ text: site }]);
    await bot.sendMessage(chatId, '🔍 Selecione um site:', {
      reply_markup: {
        keyboard,
        resize_keyboard: true
      }
    });
  }

  static async buscarEditaisDoSite(site: string): Promise<string[]> {
    const siteData = SITES_EDITAIS[site];
    if (!siteData) return [];
    return await buscarEditais(siteData.url, siteData.seletor);
  }
}
