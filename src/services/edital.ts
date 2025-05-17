import axios from 'axios';
import cheerio from 'cheerio';

export async function buscarEditais(urlEditais: string, seletor: string): Promise<string[]> {
  try {
    const response = await axios.get(urlEditais, { timeout: 10000 });
    const html = response.data as string; // <-- Cast resolve erro do Cheerio
    const $ = cheerio.load(html);

    const links: string[] = [];
    $(seletor).each((_, elem) => {
      const link = $(elem).attr('href');
      if (link && !link.startsWith('http')) {
        links.push(new URL(link, urlEditais).href);
      } else if (link) {
        links.push(link);
      }
    });

    return links;
  } catch (err) {
    console.error("Erro ao buscar editais:", err);
    return [];
  }
}
