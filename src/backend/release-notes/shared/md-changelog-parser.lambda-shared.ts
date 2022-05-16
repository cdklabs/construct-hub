import { URL } from 'url';
import * as MarkdownIt from 'markdown-it';
export const getReleaseNotesMd = async (
  markdownString: string,
  version: string
): Promise<string | undefined> => {
  const changelogMd = markdownString.replace(
    /\n\s*<a name="[^"]*">.*?<\/a>\n/g,
    '\n'
  );
  for (const level of [1, 2, 3, 4, 5, 6]) {
    const changelogParsed = await getContentBySection(level, changelogMd);
    if (changelogParsed.length >= 2) {
      for (const section of changelogParsed) {
        try {
          // Remove the the links like changelog diff link
          const sectionsWithOutLink = section.replace(/\[(.+)\]\(.+\)/g, '$1');
          const [heading] = sectionsWithOutLink.split('\n');
          const title = heading
            .replace(/^\s*#*\s*/, '')
            .split(' ')
            .filter(Boolean);

          // remove the --- or ====  alterative heading h1 and h2
          let body = section.replace(/.*?\n([-|=]{3,}\n)?/, '').trim();
          for (const word of title) {
            if (word.includes(version) && !isUrl(word)) {
              if (body.trim().length > 0) {
                return body;
              }
            }
          }
        } catch (err) {
          console.error({ err }, 'Error parsing changelog');
        }
      }
    }
  }
  return undefined;
};

async function getContentBySection(
  headingLevel: number,
  text: string
): Promise<string[]> {
  // Using dynamic import to ensure JSII doesnot complain about esModuleInterop
  const markDownIt = await import('markdown-it');
  // Common JS module. So calling default. Jest does the esModule interops so no default
  const markdown: MarkdownIt = ((markDownIt as any).default || markDownIt)();

  markdown.enable(['heading', 'lheading']);
  const sections: [number, number][] = [];
  const lines = text.split('\n');
  const tokens = markdown.parse(text, undefined);
  tokens.forEach((token) => {
    if (token.type === 'heading_open') {
      const level = Number.parseInt(token.tag.substring(1), 10);
      if (level <= headingLevel) {
        sections.push([level, token.map![0]]);
      }
    }
  });
  sections.push([-1, lines.length]);
  const result: string[] = [];
  for (let i = 1; i < sections.length; i += 1) {
    const [lev, start] = sections[i - 1];
    const [, end] = sections[i];
    if (lev === headingLevel) {
      result.push(lines.slice(start, end).join('\n'));
    }
  }
  return result;
}

function isUrl(url: string): boolean {
  try {
    return !!new URL(url).hostname;
  } catch (err) {
    return false;
  }
}

export default getReleaseNotesMd;
